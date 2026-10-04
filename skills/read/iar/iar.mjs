#!/usr/bin/env node
// inspec-read CLI: prepare | put | open | wait | drop | stop. Node >= 18, built-ins only.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UsageError, parseId, checkLang, rootDir, ensureRoot, docDir, prepare, put, load, badDisplays, publish, drop, readJSON } from './lib/state.mjs';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'server.mjs');
const USAGE = `usage:
  iar.mjs prepare <md> --id <slug>/<kind> --lang <tag>
  iar.mjs put <batch.json> --id <slug>/<kind>
  iar.mjs open --id <slug>/<kind> [--no-open]
  iar.mjs wait --id <slug>/<kind>
  iar.mjs drop --id <slug>/<kind>
  iar.mjs stop`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function args(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-open') opt.noOpen = true;
    else if (a === '--id' || a === '--lang') opt[a.slice(2)] = argv[++i];
    else if (a.startsWith('--')) throw new UsageError(`unknown option ${a}`);
    else pos.push(a);
  }
  return { pos, opt };
}

function request(port, method, p, timeout = 1000) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, timeout }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ code: res.statusCode, body }));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function running(root) {
  const s = readJSON(path.join(root, 'server.json'));
  if (!s || !s.port || !s.token) return null;
  const r = await request(s.port, 'GET', `/${s.token}/api/ping`);
  if (!r || r.code !== 200) return null;
  return { ...s, pid: JSON.parse(r.body).pid };
}

async function ensureServer(root) {
  const live = await running(root);
  if (live) return live;
  ensureRoot(root);
  const log = fs.openSync(path.join(root, 'server.log'), 'a', 0o600);
  const child = spawn(process.execPath, [SERVER, root], { detached: true, stdio: ['ignore', log, log], windowsHide: true });
  child.unref();
  fs.closeSync(log);
  for (let i = 0; i < 100; i++) {
    await sleep(50);
    const s = readJSON(path.join(root, 'server.json'));
    if (s && s.pid === child.pid) {
      const up = await running(root);
      if (up) return up;
    }
    if (child.exitCode !== null) break;
  }
  throw new Error(`the server did not start; see ${path.join(root, 'server.log')}`);
}

function openBrowser(url) {
  const [cmd, argv] =
    process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : ['xdg-open', [url]];
  try {
    const p = spawn(cmd, argv, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: process.platform === 'win32' });
    p.on('error', () => {});
    p.unref();
  } catch {
    // no opener: the url is printed
  }
}

function state(opt) {
  const { slug, kind } = parseId(opt.id);
  const root = rootDir();
  const dir = docDir(root, slug, kind);
  const s = load(dir);
  if (!s) throw new UsageError(`no review prepared for ${slug}/${kind}: run prepare first`);
  return { slug, kind, root, dir, s };
}

const commands = {
  prepare({ pos, opt }) {
    if (pos.length !== 1) throw new UsageError('prepare takes one markdown file');
    const { slug, kind } = parseId(opt.id);
    const lang = checkLang(opt.lang);
    const out = prepare(path.resolve(pos[0]), { slug, kind, lang, cwd: process.cwd() });
    process.stdout.write(out.length ? `[\n${out.map((b) => JSON.stringify(b)).join(',\n')}\n]\n` : '[]\n');
  },

  put({ pos, opt }) {
    if (pos.length !== 1) throw new UsageError('put takes one JSON file');
    const { dir } = state(opt);
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(path.resolve(pos[0]), 'utf8'));
    } catch (e) {
      throw new UsageError(`${pos[0]} is not a readable JSON file: ${e.message}`);
    }
    if (!batch || typeof batch !== 'object' || Array.isArray(batch)) throw new UsageError(`${pos[0]} must hold a JSON object of {id: entry}`);
    const r = put(dir, batch);
    process.stdout.write(`${JSON.stringify(r)}\n`);
    if (r.refused.length) process.exitCode = 2;
  },

  async open({ opt }) {
    const { slug, kind, root, dir } = state(opt);
    const bad = badDisplays(dir);
    if (bad.length) {
      throw new UsageError(`display entries missing or breaking the schema, nothing opened:\n${bad.map((b) => `  ${b.id}: ${b.reason}`).join('\n')}`);
    }
    const srv = await ensureServer(root);
    publish(dir);
    const url = `http://127.0.0.1:${srv.port}/${srv.token}/${slug}/${kind}`;
    process.stdout.write(`inspec-read: ${url}\n`);
    if (!opt.noOpen) openBrowser(url);
  },

  async wait({ opt }) {
    const { dir, s } = state(opt);
    const file = path.join(dir, 'result.json');
    for (;;) {
      const r = readJSON(file);
      if (r && r.round === s.round) {
        process.stdout.write(`${JSON.stringify(r)}\n`);
        return;
      }
      await sleep(250);
    }
  },

  drop({ opt }) {
    const { slug, kind, dir } = state(opt);
    const done = drop(dir);
    process.stdout.write(done ? `inspec-read: dropped the unsent review of ${slug}/${kind}\n` : `inspec-read: ${slug}/${kind} has nothing unsent\n`);
  },

  async stop() {
    const root = rootDir();
    const live = await running(root);
    if (!live) return void process.stdout.write('inspec-read: not running\n');
    await request(live.port, 'POST', `/${live.token}/api/stop`);
    const alive = () => {
      try {
        process.kill(live.pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 100 && alive(); i++) await sleep(30);
    process.stdout.write('inspec-read: stopped\n');
  },
};

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!commands[cmd]) throw new UsageError(USAGE);
  await commands[cmd](args(rest));
}

main().catch((e) => {
  process.stderr.write(`inspec-read: ${e instanceof UsageError ? e.message : e.stack || e}\n`);
  process.exit(e instanceof UsageError ? 2 : 1);
});
