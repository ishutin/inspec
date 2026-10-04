// The repository's review server (spec: Architecture › Server and HTTP).
// Run as `node server.mjs <inspec-read dir>`; `open` starts it detached.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, writeJSON, ensureRoot, docDir, load, displayPath, applyReview, submit, KINDS } from './state.mjs';

export const BASE_PORT = 47100;
// The server exits after this long with no request (S28); INSPEC_READ_IDLE_MS overrides it for tests.
export const IDLE_MS = 8 * 60 * 60 * 1000;
const SLUG = /^[a-z0-9][a-z0-9._-]*$/i;

function send(res, code, body, type = 'application/json; charset=utf-8') {
  const data = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  // No keep-alive: a client must never reuse a socket of a server that was stopped and started again.
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', connection: 'close' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 5e6) reject(new Error('body too large'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function docPayload(dir) {
  const s = load(dir);
  return {
    doc: s.doc,
    kind: s.kind,
    lang: s.lang,
    round: s.round,
    blocks: s.blocks.map((b) => {
      const prev = s.review.blocks[b.id]?.prevHash;
      return {
        id: b.id,
        section: b.section,
        group: b.group,
        source: b.source,
        hash: b.hash,
        display: readJSON(displayPath(dir, b.hash, s.lang)),
        // The display at the last submit, for a block whose hash changed since (S13).
        prevDisplay: prev && prev !== b.hash ? readJSON(displayPath(dir, prev, s.lang)) : null,
      };
    }),
    review: s.review,
    submitted: !!(s.result && s.result.round === s.round),
  };
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Every prepared document under root: [{slug, kind, round, status}].
function documents(root) {
  const out = [];
  const dirs = (p) => {
    try {
      return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    } catch {
      return [];
    }
  };
  for (const slug of dirs(root)) {
    if (!SLUG.test(slug)) continue;
    for (const kind of KINDS) {
      const s = dirs(path.join(root, slug)).includes(kind) ? load(docDir(root, slug, kind)) : null;
      if (!s) continue;
      const sent = s.result && s.result.round === s.round ? s.result.result : null;
      out.push({ slug, kind, round: s.round, status: sent === 'approved' ? 'approved' : sent ? 'changes requested' : 'in review' });
    }
  }
  return out;
}

const listPage = (root, token) => {
  const docs = documents(root);
  const items = docs
    .map((d) => `<li><a href="/${token}/${esc(d.slug)}/${d.kind}"><b>${esc(d.slug)}</b> ${d.kind} · round ${d.round} · ${d.status}</a></li>`)
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>inspec-read</title>
<h1>inspec-read</h1>
${docs.length ? `<ul>\n${items}\n</ul>` : '<p>No documents prepared.</p>'}
`;
};

// The page (skills/read/iar/ui/), served as is: it reads its slug and kind from its own url.
const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const ASSETS = { 'app.js': 'text/javascript', 'md.js': 'text/javascript', 'diff.js': 'text/javascript', 'app.css': 'text/css' };
// Display text is untrusted: no inline script, no other origin, and no token in a Referer.
const PAGE_HEADERS = {
  'content-security-policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

function sendFile(res, file, type) {
  res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store', connection: 'close', ...PAGE_HEADERS });
  res.end(fs.readFileSync(file));
}

export function handler(root, token, onStop, onRequest = () => {}) {
  return async (req, res) => {
    onRequest();
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const parts = url.pathname.split('/').slice(1);
      if (parts[0] !== token) return send(res, 404, { error: 'not found' });
      const rest = parts.slice(1);
      const m = req.method;

      if (rest.length <= 1 && !rest[0] && m === 'GET') return send(res, 200, listPage(root, token), 'text/html; charset=utf-8');

      if (rest[0] === 'api' && rest[1] === 'ping' && rest.length === 2 && m === 'GET') return send(res, 200, { pid: process.pid });
      if (rest[0] === 'api' && rest[1] === 'stop' && rest.length === 2 && m === 'POST') {
        res.writeHead(204, { connection: 'close' });
        return res.end(onStop);
      }

      if (rest[0] === 'ui' && rest.length === 2 && Object.hasOwn(ASSETS, rest[1]) && m === 'GET') {
        return sendFile(res, path.join(UI, rest[1]), ASSETS[rest[1]]);
      }

      const api = rest[0] === 'api';
      const [slug, kind, action] = api ? rest.slice(1) : rest;
      if (!slug || !SLUG.test(slug) || !KINDS.includes(kind)) return send(res, 404, { error: 'not found' });
      const dir = docDir(root, slug, kind);
      if (!load(dir)) return send(res, 404, { error: `no review prepared for ${slug}/${kind}` });

      if (!api && rest.length === 2 && m === 'GET') return sendFile(res, path.join(UI, 'index.html'), 'text/html');
      if (api && rest.length === 4) {
        if (action === 'doc' && m === 'GET') return send(res, 200, docPayload(dir));
        if (action === 'review' && m === 'PUT') {
          let body;
          try {
            body = JSON.parse(await readBody(req));
          } catch {
            return send(res, 400, { error: 'body is not JSON' });
          }
          try {
            applyReview(dir, body);
          } catch (e) {
            if (typeof e === 'string') return send(res, e.startsWith('review is for round') ? 409 : 400, { error: e });
            throw e;
          }
          return send(res, 204);
        }
        if (action === 'submit' && m === 'POST') {
          const r = submit(dir);
          return send(res, r.code, r.code === 200 ? r.result : { error: r.error });
        }
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, 500, { error: String(e && e.message) });
    }
  };
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const fail = (e) => {
      server.off('listening', ok);
      reject(e);
    };
    const ok = () => {
      server.off('error', fail);
      resolve(port);
    };
    server.once('error', fail);
    server.once('listening', ok);
    server.listen(port, '127.0.0.1');
  });
}

// Listens on the stored port, or the first free one from BASE_PORT up; writes server.json.
export async function serve(root) {
  ensureRoot(root);
  const file = path.join(root, 'server.json');
  const saved = readJSON(file) || {};
  const token = /^[0-9a-f]{32}$/.test(saved.token || '') ? saved.token : randomBytes(16).toString('hex');
  let server;
  let idle;
  const stop = () => {
    clearTimeout(idle);
    server.close();
    server.closeAllConnections?.();
    setTimeout(() => process.exit(0), 20);
  };
  const idleMs = Number(process.env.INSPEC_READ_IDLE_MS) > 0 ? Number(process.env.INSPEC_READ_IDLE_MS) : IDLE_MS;
  const touch = () => {
    clearTimeout(idle);
    idle = setTimeout(stop, idleMs);
  };
  server = http.createServer(handler(root, token, stop, touch));
  const tries = saved.port ? [saved.port] : [];
  for (let p = BASE_PORT; p < BASE_PORT + 200; p++) if (p !== saved.port) tries.push(p);
  let port = null;
  for (const p of tries) {
    try {
      port = await listen(server, p);
      break;
    } catch (e) {
      if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') throw e;
    }
  }
  if (port === null) throw new Error(`no free port from ${BASE_PORT}`);
  writeJSON(file, { port, token, pid: process.pid });
  touch();
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  serve(process.argv[2]).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
