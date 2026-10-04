// The document summary entry: prepare prints it, open checks it (spec row S29).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { mkRepo, docPath, stateDir, stateRoot, iar, prepare, writeDisplays, readJSON } from './helpers.mjs';

function setup(t) {
  const repo = mkRepo();
  t.after(() => {
    iar(['stop'], { cwd: repo });
    fs.rmSync(repo, { recursive: true, force: true });
  });
  return repo;
}

const blocksOf = (repo) => readJSON(path.join(stateDir(repo, 'spec'), 'blocks.json')).blocks;
const want = (repo) => createHash('sha256').update(blocksOf(repo).map((b) => b.hash).join('\n')).digest('hex').slice(0, 12);

test('S29 prepare prints the summary entry while display/summary.<hash>.<lang>.json is missing', (t) => {
  const repo = setup(t);
  const out = prepare(repo, 'spec');
  const sum = out.filter((e) => e.id === 'summary');
  assert.equal(sum.length, 1, 'one summary entry');
  const h = want(repo);
  assert.equal(sum[0].hash, h, 'sha256 over the block hashes in order, 12 hex');
  assert.equal(sum[0].display, path.join(stateDir(repo, 'spec'), 'display', `summary.${h}.en.json`));
  assert.equal(blocksOf(repo).some((b) => b.id === 'summary'), false, 'not a block of blocks.json');
  assert.equal(out.filter((e) => e.id !== 'summary').length, 53);

  // Written: a rerun prints nothing; another language asks for its own summary.
  writeDisplays(out);
  assert.deepEqual(prepare(repo, 'spec'), []);
  assert.deepEqual(prepare(repo, 'spec', 'ru').filter((e) => e.id === 'summary').map((e) => e.display), [
    path.join(stateDir(repo, 'spec'), 'display', `summary.${h}.ru.json`),
  ]);

  // Any block edit gives a new summary hash, so the summary is asked for again with that block.
  const file = docPath(repo, 'spec');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('- **S3** prepare prints exactly', '- **S3** prepare prints precisely'));
  const again = prepare(repo, 'spec');
  assert.deepEqual(again.map((e) => e.id), ['S3', 'summary']);
  assert.notEqual(again[1].hash, h);
  assert.equal(again[1].hash, want(repo));
});

test('S29 open refuses a missing or schema-breaking summary, naming summary', async (t) => {
  const repo = setup(t);
  const out = prepare(repo, 'spec');
  writeDisplays(out.filter((e) => e.id !== 'summary'));
  const file = out.find((e) => e.id === 'summary').display;
  const refused = (why) => {
    const r = iar(['open', '--id', 'demo/spec', '--no-open'], { cwd: repo });
    assert.equal(r.code, 2, `${why}: ${r.out}${r.err}`);
    assert.equal(r.out, '', `${why}: no url`);
    assert.match(r.err, /\bsummary\b/, why);
    assert.doesNotMatch(r.err, /\bS1\b|\boverview\b/, `${why}: only summary named`);
    assert.equal(fs.existsSync(path.join(stateRoot(repo), 'server.json')), false, `${why}: no server`);
  };
  refused('missing');
  const bad = {
    'no tldr': { body: 'b', diagram: null },
    'no body': { tldr: 't', diagram: null },
    'no diagram': { tldr: 't', body: 'b' },
    'body not text': { tldr: 't', body: 3, diagram: null },
    'unknown diagram type': { tldr: 't', body: 'b', diagram: { type: 'pie' } },
    'matrix cells off': { tldr: 't', body: 'b', diagram: { type: 'matrix', cols: ['a', 'b'], rows: [{ label: 'r', cells: [{ text: '1' }] }] } },
    'not JSON': '{nope',
  };
  for (const [why, v] of Object.entries(bad)) {
    fs.writeFileSync(file, typeof v === 'string' ? v : JSON.stringify(v));
    refused(why);
  }
  fs.writeFileSync(file, JSON.stringify({ tldr: 'What it is for.', body: 'Main points.', diagram: { type: 'flow', steps: [{ label: 'a', text: 'b' }] } }));
  const r = iar(['open', '--id', 'demo/spec', '--no-open'], { cwd: repo });
  assert.equal(r.code, 0, r.err);
  const api = /inspec-read: (\S+)/.exec(r.out)[1].replace('/demo/spec', '/api/demo/spec/doc');
  const doc = await (await fetch(api)).json();
  assert.equal(doc.blocks.length, 53);
  assert.deepEqual(doc.summary.display, readJSON(file));
});
