import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkRepo, docPath, stateDir, stateRoot, iar, iarAsync, prepare, writeDisplays, readJSON, sleep } from './helpers.mjs';

// A prepared repository with displays written; stops its server and removes it after the test.
function setup(t, kind = 'plan') {
  const repo = mkRepo();
  t.after(() => {
    iar(['stop'], { cwd: repo });
    fs.rmSync(repo, { recursive: true, force: true });
  });
  writeDisplays(prepare(repo, kind));
  return repo;
}

function open(repo, kind = 'plan', extra = ['--no-open'], env) {
  const r = iar(['open', '--id', `demo/${kind}`, ...extra], { cwd: repo, env });
  assert.equal(r.code, 0, r.err);
  const m = /^inspec-read: (http:\/\/127\.0\.0\.1:(\d+)\/([0-9a-f]{32})\/demo\/(\w+))$/m.exec(r.out);
  assert.ok(m, `url printed: ${r.out}`);
  return { url: m[1], port: Number(m[2]), token: m[3], api: `http://127.0.0.1:${m[2]}/${m[3]}/api/demo/${kind}` };
}

const json = (body) => ({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const review = (api, blocks, round = 1) => fetch(`${api}/review`, json({ round, blocks }));
const submit = (api) => fetch(`${api}/submit`, { method: 'POST' });

test('S6 open starts the server once, prints the url, and guards it with the token', async (t) => {
  const repo = setup(t);
  const a = open(repo);
  assert.match(a.url, /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\/demo\/plan$/);
  const saved = readJSON(path.join(stateRoot(repo), 'server.json'));
  assert.deepEqual([saved.port, saved.token], [a.port, a.token]);
  assert.equal((await fetch(a.url)).status, 200);
  assert.equal((await fetch(`${a.api}/doc`)).status, 200);

  const b = open(repo);
  assert.equal(b.url, a.url);
  assert.equal(readJSON(path.join(stateRoot(repo), 'server.json')).pid, saved.pid, 'running server reused');

  for (const p of ['/demo/plan', '/api/demo/plan/doc', `/${'0'.repeat(32)}/demo/plan`, `/${a.token.slice(1)}/api/demo/plan/doc`, '/']) {
    assert.equal((await fetch(`http://127.0.0.1:${a.port}${p}`)).status, 404, p);
  }

  const outside = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  const hosts = ['::1', ...(outside ? [outside.address] : [])];
  for (const host of hosts) {
    const reached = await new Promise((res) => {
      const s = net.connect({ host, port: a.port, timeout: 1000 }, () => (s.destroy(), res(true)));
      s.on('error', () => res(false));
      s.on('timeout', () => (s.destroy(), res(false)));
    });
    assert.equal(reached, false, `not listening on ${host}`);
  }
});

test('S6 open runs the platform opener, and only prints the url without one', async (t) => {
  const repo = setup(t);
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'iar-bin-'));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  const log = path.join(bin, 'opened.log');
  for (const name of ['open', 'xdg-open']) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${log}"\n`, { mode: 0o755 });
  }
  const a = open(repo, 'plan', [], { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  for (let i = 0; i < 40 && !fs.existsSync(log); i++) await sleep(50);
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  assert.equal(fs.readFileSync(log, 'utf8'), `${opener} ${a.url}\n`);

  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'iar-path-'));
  t.after(() => fs.rmSync(bare, { recursive: true, force: true }));
  fs.symlinkSync(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim(), path.join(bare, 'git'));
  const b = open(repo, 'plan', [], { ...process.env, PATH: bare });
  assert.equal(b.url, a.url);
});

test('S7 the url stays the same across rounds, prepare, stop and open', async (t) => {
  const repo = setup(t);
  const a = open(repo);
  iar(['stop'], { cwd: repo });
  assert.equal(await fetch(a.url).then(() => true, () => false), false, 'stopped');
  assert.equal(open(repo).url, a.url);
  assert.deepEqual(prepare(repo, 'plan'), []);
  assert.equal(open(repo).url, a.url);

  await review(a.api, { D1: { status: 'ok' }, D2: { status: 'ok' } });
  assert.equal((await submit(a.api)).status, 200);
  writeDisplays(prepare(repo, 'plan'));
  assert.equal(readJSON(path.join(stateDir(repo, 'plan'), 'blocks.json')).round, 2);
  assert.equal(open(repo).url, a.url);
  assert.equal((await (await fetch(`${a.api}/doc`)).json()).round, 2);

  iar(['stop'], { cwd: repo });
  const squatter = net.createServer().listen(a.port, '127.0.0.1');
  await new Promise((r) => squatter.once('listening', r));
  t.after(() => squatter.close());
  const r = iar(['open', '--id', 'demo/plan', '--no-open'], { cwd: repo });
  assert.equal(r.code, 0, r.err);
  const b = /inspec-read: (\S+)/.exec(r.out)[1];
  const u = new URL(b);
  assert.notEqual(Number(u.port), a.port);
  assert.equal(b, a.url.replace(`:${a.port}/`, `:${u.port}/`), 'same token and path, new port');
  assert.equal(readJSON(path.join(stateRoot(repo), 'server.json')).port, Number(u.port));
});

test('S8 wait returns the approved result within 2 s of the submit', async (t) => {
  const repo = setup(t);
  const a = open(repo);
  const w = iarAsync(['wait', '--id', 'demo/plan'], { cwd: repo });
  await sleep(500);
  assert.equal(w.proc.exitCode, null, 'wait blocks before the submit');
  assert.equal((await review(a.api, { D1: { status: 'ok' }, D2: { status: 'ok' } })).status, 204);
  const t0 = Date.now();
  assert.equal((await submit(a.api)).status, 200);
  const r = await w.done;
  assert.ok(Date.now() - t0 < 2000, `wait took ${Date.now() - t0} ms`);
  assert.equal(r.code, 0, r.err);
  const last = r.out.trim().split('\n').pop();
  assert.deepEqual(JSON.parse(last), { result: 'approved', round: 1 });
  assert.deepEqual(readJSON(path.join(stateDir(repo, 'plan'), 'result.json')), { result: 'approved', round: 1 });
  assert.equal((await fetch(`${a.api}/doc`)).status, 200, 'server keeps running');
});

test('S8 changes requested carries this round\'s comments only, and a late wait returns at once', async (t) => {
  const repo = setup(t);
  const a = open(repo);
  await review(a.api, { D1: { status: 'ok' }, D2: { status: 'cm', comments: [{ quote: '', kind: 'question', text: 'old' }] } });
  assert.equal((await submit(a.api)).status, 200);
  writeDisplays(prepare(repo, 'plan'));

  const file = path.join(stateDir(repo, 'plan'), 'review.json');
  const rv = readJSON(file);
  assert.equal(rv.round, 2);
  rv.blocks.D2.comments = [{ id: 'c1-1', quote: '', kind: 'question', text: 'old', reply: null, round: 1 }];
  fs.writeFileSync(file, JSON.stringify(rv));

  const comments = [
    { quote: '', kind: 'question', text: 'why 10 000?' },
    { quote: 'comma', kind: 'change', text: 'use a semicolon' },
    { quote: 'export', kind: 'unclear', text: 'which one?' },
  ];
  assert.equal((await review(a.api, { D1: { status: 'ok' }, D2: { status: 'cm', comments } }, 2)).status, 204);
  assert.equal((await submit(a.api)).status, 200);

  const t0 = Date.now();
  const r = await iarAsync(['wait', '--id', 'demo/plan'], { cwd: repo }).done;
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(r.code, 0, r.err);
  const hash = readJSON(path.join(stateDir(repo, 'plan'), 'blocks.json')).blocks[1].hash;
  const want = {
    result: 'changes_requested',
    round: 2,
    approved: ['D1'],
    feedback: [{ block: 'D2', hash, comments: comments.map((c, i) => ({ id: `c2-${i + 1}`, ...c })) }],
  };
  assert.equal(r.out.trim().split('\n').pop(), JSON.stringify(want));
  assert.deepEqual(readJSON(path.join(stateDir(repo, 'plan'), 'result.json')), want);
});

test('S9 submit with pending blocks gets 409; a bad review update gets 400 and changes nothing', async (t) => {
  const repo = setup(t);
  const a = open(repo);
  const dir = stateDir(repo, 'plan');
  assert.equal((await submit(a.api)).status, 409);
  await review(a.api, { D1: { status: 'ok' } });
  assert.equal((await submit(a.api)).status, 409, 'D2 not reviewed');
  await review(a.api, { D2: { status: 'chg' } });
  assert.equal((await submit(a.api)).status, 409, 'D2 changed');
  assert.equal(fs.existsSync(path.join(dir, 'result.json')), false);

  const before = fs.readFileSync(path.join(dir, 'review.json'), 'utf8');
  const bad = [
    { D1: { status: 'cm' }, D9: { status: 'ok' } },
    { D1: { status: 'cm', comments: [{ quote: '', kind: 'praise', text: 'nice' }] } },
  ];
  for (const blocks of bad) {
    assert.equal((await review(a.api, blocks)).status, 400, JSON.stringify(blocks));
    assert.equal(fs.readFileSync(path.join(dir, 'review.json'), 'utf8'), before);
  }
  assert.equal(fs.readFileSync(docPath(repo, 'plan'), 'utf8').length > 0, true);
});

// open must refuse before it starts anything: no server.json, nothing listening, no opener run.
async function refused(t, repo, ids) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'iar-bin-'));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  const log = path.join(bin, 'opened.log');
  for (const name of ['open', 'xdg-open']) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${log}"\n`, { mode: 0o755 });
  }
  const t0 = Date.now();
  const r = iar(['open', '--id', 'demo/spec'], { cwd: repo, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
  const ms = Date.now() - t0;
  assert.equal(r.code, 2, r.out + r.err);
  assert.ok(ms < 2000, `open took ${ms} ms`);
  assert.equal(r.out, '', 'no url printed');
  const named = new Set(r.err.match(/\b[A-Za-z][\w/-]*\b/g));
  for (const id of ids) assert.ok(named.has(id), `${id} named in: ${r.err}`);
  for (const id of ['S1', 'S2', 'overview'].filter((x) => !ids.includes(x))) assert.ok(!named.has(id), `${id} not named in: ${r.err}`);
  await sleep(300);
  assert.equal(fs.existsSync(log), false, 'no opener run');
  assert.equal(fs.existsSync(path.join(stateRoot(repo), 'server.json')), false, 'no server started');
}

function editDisplay(repo, id, fn) {
  const dir = stateDir(repo, 'spec');
  const s = readJSON(path.join(dir, 'blocks.json'));
  const b = s.blocks.find((x) => x.id === id);
  const file = path.join(dir, 'display', `${b.hash}.${s.lang}.json`);
  const d = readJSON(file);
  fn(d);
  fs.writeFileSync(file, JSON.stringify(d));
  return file;
}

test('S5 open refuses missing and schema-breaking display entries, naming every one', async (t) => {
  const repo = mkRepo();
  t.after(() => {
    iar(['stop'], { cwd: repo });
    fs.rmSync(repo, { recursive: true, force: true });
  });
  const blocks = prepare(repo, 'spec');
  writeDisplays(blocks.filter((b) => !['S3', 'S4'].includes(b.id)));
  await refused(t, repo, ['S3', 'S4']);
  writeDisplays(blocks.filter((b) => ['S3', 'S4'].includes(b.id)));

  const good = {
    flow: { type: 'flow', steps: [{ label: 'a', text: 'b', actor: 'you' }, { label: 'c', text: 'd' }], loop: 'again' },
    matrix: { type: 'matrix', caption: 'c', cols: ['x', 'y'], rows: [{ label: 'r', cells: [{ text: '1', tag: 't', tone: 'ok' }, { text: '2' }] }] },
    states: { type: 'states', transitions: [{ from: 'a', to: 'b', on: 'go' }], note: 'n' },
    compare: { type: 'compare', before: { label: 'old', text: 'x' }, after: { label: 'new', text: 'y' } },
  };
  editDisplay(repo, 'S6', (d) => (d.diagram = good.flow));
  editDisplay(repo, 'S7', (d) => (d.diagram = good.matrix));
  editDisplay(repo, 'S8', (d) => (d.diagram = good.states));
  editDisplay(repo, 'S9', (d) => ((d.diagram = good.compare), (d.covers = [{ id: 'O1', text: 'x' }]), (d.check = 'run `x`'), (d.flag = 'chosen')));

  const bad = {
    S1: (d) => delete d.tldr,
    S2: (d) => delete d.covers,
    S3: (d) => (d.diagram = { type: 'pie', slices: [] }),
    S4: (d) => (d.diagram = { ...good.matrix, rows: [{ label: 'r', cells: [{ text: '1' }] }] }),
    S10: (d) => (d.diagram = { ...good.matrix, rows: [...good.matrix.rows, { label: 's', cells: [{ text: '1' }, { text: '2' }, { text: '3' }] }] }),
    S11: (d) => (d.diagram = { type: 'flow' }),
    overview: (d) => (d.title = 42),
  };
  for (const [id, fn] of Object.entries(bad)) editDisplay(repo, id, fn);
  const s12 = editDisplay(repo, 'S12', () => {});
  fs.writeFileSync(s12, '{not json');
  await refused(t, repo, [...Object.keys(bad), 'S12']);

  for (const id of [...Object.keys(bad), 'S12']) writeDisplays(blocks.filter((b) => b.id === id));
  const r = iar(['open', '--id', 'demo/spec', '--no-open'], { cwd: repo });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^inspec-read: http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\/demo\/spec$/m);
});

test('S11 drop discards the round\'s unsent statuses and comments, leaving it as prepare did', async (t) => {
  const repo = mkRepo();
  t.after(() => {
    iar(['stop'], { cwd: repo });
    fs.rmSync(repo, { recursive: true, force: true });
  });
  const dir = stateDir(repo, 'plan');
  writeDisplays(prepare(repo, 'plan'));
  const fresh = readJSON(path.join(dir, 'review.json'));
  const a = open(repo);
  const doc = async () => (await (await fetch(`${a.api}/doc`)).json()).review;
  assert.deepEqual(await doc(), fresh);

  await review(a.api, { D1: { status: 'ok' }, D2: { status: 'cm', comments: [{ quote: 'x', kind: 'change', text: 'y' }] } });
  assert.notDeepEqual(await doc(), fresh);
  const r = iar(['drop', '--id', 'demo/plan'], { cwd: repo });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(await doc(), fresh, 'the page gets the round as prepare left it');
  assert.equal(fs.existsSync(path.join(dir, 'result.json')), false);

  // A prepare rerun in the same round keeps the edits (S10); drop still goes back to the round's start.
  await review(a.api, { D1: { status: 'ok' } });
  assert.deepEqual(prepare(repo, 'plan'), []);
  assert.equal((await doc()).blocks.D1.status, 'ok');
  assert.equal(iar(['drop', '--id', 'demo/plan'], { cwd: repo }).code, 0);
  assert.deepEqual(await doc(), fresh);

  // A sent round has nothing unsent: drop changes nothing.
  await review(a.api, { D1: { status: 'ok' }, D2: { status: 'ok' } });
  assert.equal((await submit(a.api)).status, 200);
  const sent = fs.readFileSync(path.join(dir, 'review.json'), 'utf8');
  assert.equal(iar(['drop', '--id', 'demo/plan'], { cwd: repo }).code, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'review.json'), 'utf8'), sent);
  assert.deepEqual(readJSON(path.join(dir, 'result.json')), { result: 'approved', round: 1 });

  assert.equal(iar(['drop', '--id', 'demo/intent'], { cwd: repo }).code, 2, 'nothing prepared');
});
