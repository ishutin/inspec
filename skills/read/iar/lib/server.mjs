// The repository's review server (spec: Architecture › Server and HTTP).
// Run as `node server.mjs <inspec-read dir>`; `open` starts it detached.
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, writeJSON, docDir, load, displayPath, applyReview, submit, KINDS } from './state.mjs';

export const BASE_PORT = 47100;
const SLUG = /^[a-z0-9][a-z0-9._-]*$/i;

function send(res, code, body, type = 'application/json; charset=utf-8') {
  const data = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
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
    blocks: s.blocks.map((b) => ({
      id: b.id,
      section: b.section,
      group: b.group,
      source: b.source,
      hash: b.hash,
      display: readJSON(displayPath(dir, b.hash, s.lang)),
      prevDisplay: null,
    })),
    review: s.review,
    submitted: !!(s.result && s.result.round === s.round),
  };
}

const placeholder = (slug, kind) =>
  `<!doctype html><meta charset="utf-8"><title>inspec-read</title><p>inspec-read: ${slug}/${kind}</p>\n`;

export function handler(root, token, onStop) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const parts = url.pathname.split('/').slice(1);
      if (parts[0] !== token) return send(res, 404, { error: 'not found' });
      const rest = parts.slice(1);
      const m = req.method;

      if (rest[0] === 'api' && rest[1] === 'ping' && rest.length === 2 && m === 'GET') return send(res, 200, { pid: process.pid });
      if (rest[0] === 'api' && rest[1] === 'stop' && rest.length === 2 && m === 'POST') {
        send(res, 204);
        return onStop();
      }

      const api = rest[0] === 'api';
      const [slug, kind, action] = api ? rest.slice(1) : rest;
      if (!slug || !SLUG.test(slug) || !KINDS.includes(kind)) return send(res, 404, { error: 'not found' });
      const dir = docDir(root, slug, kind);
      if (!load(dir)) return send(res, 404, { error: `no review prepared for ${slug}/${kind}` });

      if (!api && rest.length === 2 && m === 'GET') return send(res, 200, placeholder(slug, kind), 'text/html; charset=utf-8');
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
  const file = path.join(root, 'server.json');
  const saved = readJSON(file) || {};
  const token = /^[0-9a-f]{32}$/.test(saved.token || '') ? saved.token : randomBytes(16).toString('hex');
  let server;
  const stop = () => {
    server.close();
    setTimeout(() => process.exit(0), 50);
  };
  server = http.createServer(handler(root, token, stop));
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
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  serve(process.argv[2]).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
