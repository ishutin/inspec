// The summary screen (spec rows S30, S31, S32), driven in Chromium against a real server.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { mkRepo, docPath, stateDir, iar, prepare, readJSON } from './helpers.mjs';

const row = (id) => /^S\d+$/.test(id);
const blockDisplay = (b) => ({
  section: b.section,
  title: row(b.id) || /^D\d+$/.test(b.id) ? `${b.id} · Row ${b.id}` : `Name of ${b.id}`,
  tldr: `Summary of ${b.id}.`,
  body: `Body of ${b.id}.`,
  check: null,
  flag: null,
  covers: [],
  diagram: null,
});
const SUMMARY = {
  tldr: 'The document is for the review of a spec.',
  body: 'It splits the document into **blocks** and stops at the page.\n\n- one point\n- another point',
  diagram: { type: 'flow', steps: [{ label: 'Read', text: 'the summary' }, { label: 'Review', text: 'each block', actor: 'you' }] },
};
const write = (e) => {
  fs.mkdirSync(path.dirname(e.display), { recursive: true });
  fs.writeFileSync(e.display, JSON.stringify(e.id === 'summary' ? SUMMARY : blockDisplay(e)));
};

const docs = [];
test.afterEach(() => {
  for (const d of docs.splice(0)) {
    iar(['stop'], { cwd: d.repo });
    fs.rmSync(d.repo, { recursive: true, force: true });
  }
});

function setup(kind) {
  const repo = mkRepo();
  for (const e of prepare(repo, kind)) write(e);
  const r = iar(['open', '--id', `demo/${kind}`, '--no-open'], { cwd: repo });
  expect(r.code, r.err).toBe(0);
  const url = /^inspec-read: (\S+)$/m.exec(r.out)[1];
  const d = { repo, kind, url, api: url.replace(`/demo/${kind}`, `/api/demo/${kind}`) };
  docs.push(d);
  return d;
}

// The next round: edits the document with `edit`, writes replies.json, prepares and writes the displays asked for.
function nextRound(d, edit, replies) {
  const file = docPath(d.repo, d.kind);
  fs.writeFileSync(file, edit(fs.readFileSync(file, 'utf8')));
  if (replies) fs.writeFileSync(path.join(stateDir(d.repo, d.kind), 'replies.json'), JSON.stringify(replies));
  for (const e of prepare(d.repo, d.kind)) write(e);
  // The tab shows the new round once `open` publishes it (S34).
  const r = iar(['open', '--id', `demo/${d.kind}`, '--no-open'], { cwd: d.repo });
  expect(r.code, r.err).toBe(0);
}

const put = (d, body) => fetch(`${d.api}/review`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const serverDoc = async (d) => (await fetch(`${d.api}/doc`)).json();
const card = (page) => page.locator('.card');
const sumTopic = (page) => page.locator('.F .toc a.sum');

test('S30 the page opens on the summary; Start review and Enter go to the first block not approved; it counts nowhere', async ({ page }) => {
  const d = setup('spec');
  const ids = fs.readFileSync(new URL('./fixtures/spec.ids', import.meta.url), 'utf8').trim().split('\n');
  await page.goto(d.url);

  // The summary screen: "About this document", summary, body and diagram, a Start review button.
  await expect(card(page).locator('h2')).toHaveText('About this document');
  await expect(card(page).locator('.tldr')).toHaveText(SUMMARY.tldr);
  await expect(card(page).locator('.body strong')).toHaveText('blocks');
  await expect(card(page).locator('.body li')).toHaveText(['one point', 'another point']);
  await expect(card(page).locator('figure.dia[data-type="flow"] li')).toHaveCount(2);
  await expect(card(page).locator('.tag')).not.toContainText(' of ');
  await expect(card(page).locator('button[data-act="approve"]')).toHaveCount(0);
  await expect(card(page).getByRole('button', { name: /Start review/ })).toBeVisible();

  // The topic list: "Summary" first, with no status dot, focused; the blocks after it.
  const first = page.locator('.F .toc a').first();
  await expect(first).toHaveText('Summary');
  await expect(first).toHaveClass(/\bsum\b/);
  await expect(first).toHaveClass(/\bcur\b/);
  await expect(first.locator('.dot')).toHaveCount(0);
  expect(await page.locator('.F .toc a.topic').evaluateAll((as) => as.map((a) => a.dataset.id))).toEqual(ids);

  // Progress, n of N and the submit counts leave it out.
  await expect(page.locator('#ptext')).toHaveText(`0/${ids.length} approved`);
  await expect(page.locator('#submit')).toHaveText(`${ids.length} to review`);

  // Start review: the first block not approved, "1 of N".
  await card(page).getByRole('button', { name: /Start review/ }).click();
  await expect(card(page).locator('.tag')).toHaveText(`Overview · 1 of ${ids.length}`);
  await expect(sumTopic(page)).not.toHaveClass(/\bcur\b/);

  // With overview and S1 approved, back on the summary (click, then ↑ from the first block), Enter goes to S2.
  expect((await put(d, { round: 1, blocks: { overview: { status: 'ok' }, S1: { status: 'ok' } } })).status).toBe(204);
  await page.reload();
  await expect(card(page).locator('h2')).toHaveText('About this document');
  await page.keyboard.press('Enter');
  await expect(card(page).locator('h2')).toHaveText('S2 · Row S2');
  await expect(card(page).locator('.tag')).toHaveText(`Contract · 3 of ${ids.length}`);
  await page.locator('.F .toc a.topic').first().click();
  await page.keyboard.press('ArrowUp');
  await expect(card(page).locator('h2')).toHaveText('About this document');
  await expect(page.locator('#ptext')).toHaveText(`2/${ids.length} approved`);
  await expect(page.locator('#submit')).toHaveText(`${ids.length - 2} to review`);
  await sumTopic(page).click();
  await page.keyboard.press('ArrowDown');
  await expect(card(page).locator('.tag')).toHaveText(`Overview · 1 of ${ids.length}`);
  // The summary's texts sit inside [data-content] (S21).
  await sumTopic(page).click();
  expect(await card(page).evaluate((c) => [...c.querySelectorAll('.tldr, .body, figure.dia')].every((e) => e.closest('[data-content]')))).toBe(true);
});

test('S31 a comment on the summary is kept, counts, never blocks a submit, reaches the result, and shows read-only next round', async ({ page }) => {
  const d = setup('plan');
  await page.goto(d.url);
  await expect(card(page).locator('h2')).toHaveText('About this document');

  // By selection: the "Comment" button, a kind, saved; the quote highlighted.
  await card(page).locator('.tldr').evaluate((el) => {
    const n = el.firstChild;
    const at = n.data.indexOf('review');
    const r = document.createRange();
    r.setStart(n, at);
    r.setEnd(n, at + 'review'.length);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await page.locator('.pop').getByRole('button', { name: 'Comment', exact: true }).click();
  await page.locator('.pop .kinds button[data-k="change"]').click();
  await page.locator('.pop textarea').fill('Say which review.');
  await page.locator('.pop').getByRole('button', { name: 'Save' }).click();
  await expect(card(page).locator('.tldr mark.cm')).toHaveText('review');
  // As a whole: C on the summary screen.
  await page.keyboard.press('c');
  await page.locator('.pop .kinds button[data-k="question"]').click();
  await page.locator('.pop textarea').fill('Where does it stop?');
  await page.locator('.pop').getByRole('button', { name: 'Save' }).click();
  await expect(card(page).locator('.cmts .cmt')).toHaveCount(2);
  await expect(page.locator('.F .toc a.sum .dot')).toHaveCount(0);

  // Kept like a block comment: on the server and after a reload.
  await expect.poll(async () => (await serverDoc(d)).review.summary.comments.length).toBe(2);
  await page.reload();
  await expect(card(page).locator('.cmts .cmt')).toHaveCount(2);
  await expect(card(page).locator('.tldr mark.cm')).toHaveText('review');

  // It counts in "Send N comments" and never blocks: approving both blocks makes the review sendable.
  await expect(page.locator('#submit')).toHaveText('2 to review');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('#submit')).toHaveText('Send 2 comments');
  await expect(page.locator('#submit')).toBeEnabled();
  await page.locator('#submit').click();
  await expect(page.locator('#notice')).toContainText('Review sent');

  const result = readJSON(path.join(stateDir(d.repo, 'plan'), 'result.json'));
  const hash = readJSON(path.join(stateDir(d.repo, 'plan'), 'blocks.json')).summary.hash;
  expect(result).toMatchObject({ result: 'changes_requested', round: 1, approved: ['D1', 'D2'] });
  const [c1, c2] = result.feedback[0].comments.map((c) => c.id);
  for (const id of [c1, c2]) expect(id).toMatch(/^c1-\d+$/);
  expect(c1).not.toBe(c2);
  expect(result.feedback).toEqual([
    {
      block: 'summary',
      hash,
      comments: [
        { id: c1, quote: 'review', kind: 'change', text: 'Say which review.' },
        { id: c2, quote: '', kind: 'question', text: 'Where does it stop?' },
      ],
    },
  ]);

  // Round 2: read-only on the summary, with the agent's reply; nothing of this round counts them.
  nextRound(d, (t) => `${t}\nOne more line.\n`, { [c2]: 'It stops at the page.' });
  await expect(page.locator('#round')).toHaveText('Round 2', { timeout: 5000 });
  await expect(card(page).locator('h2')).toHaveText('About this document');
  const old = card(page).locator('.cmts .cmt');
  await expect(old).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await expect(old.nth(i)).toHaveClass(/\bold\b/);
    await expect(old.nth(i).getByRole('button', { name: 'remove' })).toHaveCount(0);
  }
  await expect(old.nth(1).locator('.reply')).toHaveText('Agent It stops at the page.');
  await expect(card(page).locator('.tldr mark.cm.old')).toHaveText('review');
  const r2 = (await serverDoc(d)).review.summary.comments;
  expect(r2.map((c) => [c.id, c.round, c.reply])).toEqual([[c1, 1, null], [c2, 1, 'It stops at the page.']]);
});

test('S32 from round 2 the summary lists "Changed since round K": changed blocks and answered comments, each a link to its block', async ({ page }) => {
  const d = setup('spec');
  await page.goto(d.url);
  await expect(card(page).locator('h2')).toHaveText('About this document');
  await expect(card(page).locator('.changes')).toHaveCount(0);

  // Round 1: everything approved but S2 (a question) and S5 (a change); sent.
  const all = (await serverDoc(d)).blocks.map((b) => b.id);
  const r1 = Object.fromEntries(all.map((id) => [id, { status: 'ok' }]));
  r1.S2 = { status: 'cm', comments: [{ quote: '', kind: 'question', text: 'Why two?' }] };
  r1.S5 = { status: 'cm', comments: [{ quote: '', kind: 'change', text: 'Say five.' }] };
  expect((await put(d, { round: 1, blocks: r1 })).status).toBe(204);
  expect((await fetch(`${d.api}/submit`, { method: 'POST' })).status).toBe(200);
  const sent = readJSON(path.join(stateDir(d.repo, 'spec'), 'result.json'));
  const q = sent.feedback.find((f) => f.block === 'S2').comments[0].id;

  // Round 2: S1 (approved) and S5 (commented) edited, S2's question answered.
  nextRound(
    d,
    (t) => t.replace('- **S1** `prepare <md>', '- **S1** Edited: `prepare <md>').replace('- **S5** `open --id …`', '- **S5** Edited: `open --id …`'),
    { [q]: 'Because two was asked for.' },
  );
  await expect(page.locator('#round')).toHaveText('Round 2', { timeout: 5000 });
  await expect(card(page).locator('h2')).toHaveText('About this document');
  const list = card(page).locator('.changes');
  await expect(list.locator('.lab')).toHaveText('Changed since round 1');
  const items = list.locator('li');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('S1 · Row S1');
  await expect(items.nth(0)).toContainText('Changed after approval');
  await expect(items.nth(1)).toContainText('S2 · Row S2');
  await expect(items.nth(1)).toContainText('Why two?');
  await expect(items.nth(1)).toContainText('Because two was asked for.');
  await expect(items.nth(2)).toContainText('S5 · Row S5');
  await expect(items.nth(2)).toContainText('Changed');

  // Each is a link to its block.
  for (const [i, id] of [[0, 'S1'], [1, 'S2'], [2, 'S5']]) {
    await sumTopic(page).click();
    await card(page).locator('.changes li a').nth(i).click();
    await expect(card(page).locator('h2')).toHaveText(`${id} · Row ${id}`);
    await expect(page.locator(`.F .toc a.topic[data-id="${id}"]`)).toHaveClass(/\bcur\b/);
  }
  // The list stays as the round started, also after S5 is approved.
  await page.keyboard.press('Enter');
  await sumTopic(page).click();
  await expect(card(page).locator('.changes li')).toHaveCount(3);
});
