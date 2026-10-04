// Fixes from the live run, over HTTP (spec row S34).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkRepo, docPath, iar, prepare, writeDisplays } from './helpers.mjs';

function open(repo, kind = 'plan') {
  const r = iar(['open', '--id', `demo/${kind}`, '--no-open'], { cwd: repo });
  return { ...r, url: (/^inspec-read: (\S+)$/m.exec(r.out) || [])[1] };
}

const doc = async (api) => (await fetch(`${api}/doc`)).json();

test('S34 an open tab switches to round N+1 only once open has accepted its display entries', async (t) => {
  const repo = mkRepo();
  t.after(() => {
    iar(['stop'], { cwd: repo });
    fs.rmSync(repo, { recursive: true, force: true });
  });
  writeDisplays(prepare(repo, 'plan'));
  const a = open(repo);
  assert.equal(a.code, 0, a.err);
  const api = a.url.replace('/demo/plan', '/api/demo/plan');
  const put = (blocks) => fetch(`${api}/review`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ round: 1, blocks }) });
  assert.equal((await put({ D1: { status: 'ok' }, D2: { status: 'cm', comments: [{ quote: '', kind: 'change', text: 'Split D2.' }] } })).status, 204);
  assert.equal((await fetch(`${api}/submit`, { method: 'POST' })).status, 200);
  const sent = await doc(api);
  assert.equal(sent.round, 1);
  assert.equal(sent.submitted, true);

  // The session edits D2 and prepares round 2; the subagent has not written the new display yet.
  const file = docPath(repo, 'plan');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^## D2.*$/m, (h) => `${h}\n\nSplit as asked.`));
  const asked = prepare(repo, 'plan');
  assert.ok(asked.some((b) => b.id === 'D2'), 'D2 needs a new display');
  const between = await doc(api);
  assert.equal(between.round, 1, 'after prepare, the doc route still serves round 1');
  assert.equal(between.submitted, true, 'as submitted: the page keeps "sent, waiting"');
  assert.deepEqual(between.review, sent.review);
  assert.deepEqual(between.blocks.map((b) => b.hash), sent.blocks.map((b) => b.hash));

  // open refuses (D2 has no display): still round 1.
  assert.equal(open(repo).code, 2);
  assert.equal((await doc(api)).round, 1, 'a refused open publishes nothing');

  // The displays are written, prepare runs again in the round: still round 1 until open accepts.
  writeDisplays(asked);
  assert.deepEqual(prepare(repo, 'plan'), []);
  assert.equal((await doc(api)).round, 1, 'a prepare rerun publishes nothing');
  const list = await (await fetch(a.url.replace('/demo/plan', '/'))).text();
  assert.match(list, /round 1|>1</, 'the document list shows the published round');

  const b = open(repo);
  assert.equal(b.code, 0, b.err);
  const next = await doc(api);
  assert.equal(next.round, 2, 'open accepted round 2');
  assert.equal(next.submitted, false);
  assert.equal(next.review.blocks.D1.status, 'ok');
  assert.equal(next.review.blocks.D2.status, 'chg');
});
