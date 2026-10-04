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
