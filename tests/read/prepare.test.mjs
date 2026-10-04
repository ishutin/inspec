import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkRepo, docPath, stateDir, stateRoot, iar, prepare, writeDisplays, readJSON, FIXTURES } from './helpers.mjs';

const repos = [];
const repo = () => {
  const r = mkRepo();
  repos.push(r);
  return r;
};
after(() => {
  for (const r of repos) {
    iar(['stop'], { cwd: r });
    fs.rmSync(r, { recursive: true, force: true });
  }
});

// prepare also prints the summary entry (S29), which is no block: these rows look at the blocks only.
const only = (out) => out.filter((b) => b.id !== 'summary');
const ids = (blocks) => only(blocks).map((b) => b.id);
const byId = (blocks) => Object.fromEntries(only(blocks).map((b) => [b.id, b.hash]));

test('S1 intent splits into its sections and outcomes', () => {
  const o = Array.from({ length: 14 }, (_, i) => `O${i + 1}`);
  assert.deepEqual(ids(prepare(repo(), 'intent')), ['problem', 'who', ...o, 'headline-scenario', 'references', 'not-in-scope']);
});

test('S1 plan splits into its deliveries', () => {
  assert.deepEqual(ids(prepare(repo(), 'plan')), ['D1', 'D2']);
});

test('S1 spec splits into the ids of spec.ids', () => {
  const want = fs.readFileSync(path.join(FIXTURES, 'spec.ids'), 'utf8').trim().split('\n');
  const r = repo();
  assert.deepEqual(ids(prepare(r, 'spec')), want);
  const state = readJSON(path.join(stateDir(r, 'spec'), 'blocks.json'));
  assert.deepEqual(ids(state.blocks), want);
  assert.equal(state.blocks.find((b) => b.id === 'S5').group, 'Server and waiting (CLI and HTTP)');
});

test('S1 a one-block document gives one block', () => {
  const r = repo();
  fs.writeFileSync(docPath(r, 'intent'), '# One\n\n## Only section\n\nSome text.\n');
  const blocks = prepare(r, 'intent');
  assert.deepEqual(ids(blocks), ['only-section']);
  assert.equal(blocks[0].source, '## Only section\n\nSome text.');
});

test('S2 hashes are stable and depend only on the block source', () => {
  const r = repo();
  const a = byId(prepare(r, 'spec'));
  const b = byId(prepare(r, 'spec'));
  assert.deepEqual(a, b);
  for (const h of Object.values(a)) assert.match(h, /^[0-9a-f]{12}$/);

  const file = docPath(r, 'spec');
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, text.replace('- **S3** prepare prints exactly', '- **S3** prepare prints precisely'));
  const c = byId(prepare(r, 'spec'));
  const changed = Object.keys(a).filter((id) => a[id] !== c[id]);
  assert.deepEqual(changed, ['S3']);

  fs.writeFileSync(file, text.replace(/\n/g, '  \n').replace('## Touches', '\n\n\n## Touches'));
  assert.deepEqual(byId(prepare(r, 'spec')), a);

  fs.writeFileSync(file, text.replace('## Touches', '## What it touches'));
  const d = Object.fromEntries(only(prepare(r, 'spec')).map((x) => [x.section === 'What it touches' ? 'touches' : x.id, x.hash]));
  assert.deepEqual(Object.keys(a).filter((id) => a[id] !== d[id]), ['touches']);
});

test('S3 prepare prints only blocks without a display entry for the language', async () => {
  const r = repo();
  const all = only(prepare(r, 'spec'));
  assert.equal(all.length, 53);
  writeDisplays(all.slice(0, 10));
  assert.deepEqual(ids(prepare(r, 'spec')), ids(all.slice(10)));
  writeDisplays(prepare(r, 'spec'));
  assert.deepEqual(prepare(r, 'spec'), []);
  assert.equal(only(prepare(r, 'spec', 'ru')).length, 53);
  assert.deepEqual(prepare(r, 'spec'), []);

  const written = Object.fromEntries(all.map((b) => [b.id, readJSON(b.display)]));
  const open = iar(['open', '--id', 'demo/spec', '--no-open'], { cwd: r });
  assert.equal(open.code, 0, open.err);
  const url = /inspec-read: (\S+)/.exec(open.out)[1];
  const u = new URL(url);
  const api = `${u.origin}${u.pathname.replace(/\/demo\/spec$/, '/api/demo/spec/doc')}`;
  const doc = await (await fetch(api)).json();
  assert.equal(doc.blocks.length, 53);
  for (const b of doc.blocks) assert.deepEqual(b.display, written[b.id]);
});

test('S4 prepare refuses bad input with exit 2 and writes no state', () => {
  const r = repo();
  const spec = docPath(r, 'spec');
  const noSection = path.join(r, 'docs', 'features', 'demo', 'nosec', 'spec.md');
  fs.mkdirSync(path.dirname(noSection), { recursive: true });
  fs.writeFileSync(noSection, '# Spec\n\nNo sections here.\n### Not a section\n');
  const cases = [
    ['missing file', [path.join(r, 'nope', 'spec.md'), '--id', 'demo/spec']],
    ['no ## section', [noSection, '--id', 'demo/spec']],
    ['id without kind', [spec, '--id', 'demo']],
    ['unknown kind', [spec, '--id', 'demo/notes']],
    ['bad slug', [spec, '--id', '../x/spec']],
    ['kind differs from file', [spec, '--id', 'demo/plan']],
  ];
  for (const [why, args] of cases) {
    const res = iar(['prepare', ...args, '--lang', 'en'], { cwd: r });
    assert.equal(res.code, 2, why);
    assert.ok(res.err.trim().length > 0, `${why}: reason on stderr`);
    assert.equal(fs.existsSync(stateRoot(r)), false, `${why}: no state written`);
  }
  const bare = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'iar-nogit-')));
  repos.push(bare);
  fs.copyFileSync(path.join(FIXTURES, 'spec.md'), path.join(bare, 'spec.md'));
  const res = iar(['prepare', path.join(bare, 'spec.md'), '--id', 'demo/spec', '--lang', 'en'], {
    cwd: bare,
    env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(bare) },
  });
  assert.equal(res.code, 2, 'outside git');
  assert.match(res.err, /git/);
  assert.equal(fs.existsSync(path.join(bare, '.git')), false);
});
