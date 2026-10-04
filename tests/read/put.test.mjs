// `put`: every display entry of a round in one file, one call (spec row S40).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkRepo, iar, prepare, display, readJSON } from './helpers.mjs';

function setup(t) {
  const repo = mkRepo();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iar-put-'));
  t.after(() => {
    iar(['stop'], { cwd: repo });
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  return { repo, batch: path.join(tmp, 'batch.json') };
}

const summary = { tldr: 'What it is for.', body: 'Main points.', diagram: null };

function batchOf(printed) {
  const b = {};
  for (const e of printed) b[e.id] = e.id === 'summary' ? summary : display(e.id, e.group ?? null);
  return b;
}

test('S40 put writes every entry of the batch to its cache path, and open then accepts the round', (t) => {
  const { repo, batch } = setup(t);
  const printed = prepare(repo, 'plan');
  fs.writeFileSync(batch, JSON.stringify(batchOf(printed)));

  const r = iar(['put', batch, '--id', 'demo/plan'], { cwd: repo });
  assert.equal(r.code, 0, r.err);
  const out = JSON.parse(r.out);
  assert.deepEqual(out.written.sort(), printed.map((e) => e.id).sort());
  assert.deepEqual(out.refused, []);
  for (const e of printed) assert.deepEqual(readJSON(e.display), e.id === 'summary' ? summary : display(e.id, e.group ?? null));

  assert.deepEqual(prepare(repo, 'plan'), [], 'nothing left to write');
  const o = iar(['open', '--id', 'demo/plan', '--no-open'], { cwd: repo });
  assert.equal(o.code, 0, o.err);
});

test('S40 put refuses entries that break the schema or name no block, writes the rest, and exits 2', (t) => {
  const { repo, batch } = setup(t);
  const printed = prepare(repo, 'plan');
  const b = batchOf(printed);
  const bad = printed.find((e) => e.id !== 'summary').id;
  b[bad] = { ...b[bad], diagram: { type: 'pie' } };
  b.nope = display('nope');
  fs.writeFileSync(batch, JSON.stringify(b));

  const r = iar(['put', batch, '--id', 'demo/plan'], { cwd: repo });
  assert.equal(r.code, 2);
  const out = JSON.parse(r.out);
  assert.deepEqual(out.refused.map((x) => x.id).sort(), [bad, 'nope'].sort());
  assert.ok(out.refused.every((x) => typeof x.reason === 'string' && x.reason.length));
  assert.ok(out.written.includes('summary'));
  assert.equal(fs.existsSync(printed.find((e) => e.id === bad).display), false, 'a refused entry is not written');
  assert.deepEqual(prepare(repo, 'plan').map((e) => e.id), [bad], 'only the refused block is asked for again');
});

test('S40 put refuses a file that is not a JSON object, writing nothing', (t) => {
  const { repo, batch } = setup(t);
  const printed = prepare(repo, 'plan');
  fs.writeFileSync(batch, '[1, 2');
  const r = iar(['put', batch, '--id', 'demo/plan'], { cwd: repo });
  assert.equal(r.code, 2);
  assert.match(r.err, /JSON/);
  for (const e of printed) assert.equal(fs.existsSync(e.display), false);
});
