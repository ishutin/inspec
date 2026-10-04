import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(here, 'fixtures');
export const IAR = path.resolve(here, '../../skills/read/iar/iar.mjs');

// A temporary git repository holding the fixtures as docs/features/demo/<kind>.md.
export function mkRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'iar-')));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  const docs = path.join(dir, 'docs', 'features', 'demo');
  fs.mkdirSync(docs, { recursive: true });
  for (const k of ['intent', 'spec', 'plan']) fs.copyFileSync(path.join(FIXTURES, `${k}.md`), path.join(docs, `${k}.md`));
  return dir;
}

export const docPath = (repo, kind) => path.join(repo, 'docs', 'features', 'demo', `${kind}.md`);
export const stateRoot = (repo) => path.join(repo, '.git', 'inspec-read');
export const stateDir = (repo, kind, slug = 'demo') => path.join(stateRoot(repo), slug, kind);

export function iar(args, { cwd, env } = {}) {
  const r = spawnSync(process.execPath, [IAR, ...args], { cwd, env: env || process.env, encoding: 'utf8', timeout: 20000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

// Runs iar in the background (for `wait`), resolving with {code, out, err, ms}.
export function iarAsync(args, { cwd } = {}) {
  const t0 = Date.now();
  const p = spawn(process.execPath, [IAR, ...args], { cwd });
  let out = '';
  let err = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (err += d));
  const done = new Promise((res) => p.on('close', (code) => res({ code, out, err, ms: Date.now() - t0 })));
  return { proc: p, done };
}

export function prepare(repo, kind, lang = 'en') {
  const r = iar(['prepare', docPath(repo, kind), '--id', `demo/${kind}`, '--lang', lang], { cwd: repo });
  if (r.code !== 0) throw new Error(`prepare failed: ${r.err}`);
  return JSON.parse(r.out);
}

export function display(id, group = null) {
  return { section: 'Section', group, title: `${id} · Name`, tldr: 'One line.', body: 'Body.', check: null, flag: null, covers: [], diagram: null };
}

// Writes a display entry for each printed block, as the session's subagent does.
export function writeDisplays(blocks) {
  for (const b of blocks) {
    fs.mkdirSync(path.dirname(b.display), { recursive: true });
    fs.writeFileSync(b.display, JSON.stringify(display(b.id, b.group ?? null)));
  }
}

export const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
