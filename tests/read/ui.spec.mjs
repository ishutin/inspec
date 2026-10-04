// The review page (spec rows S10, S15, S16, S17, S18, S19, S20, S21, S22, S23), driven in Chromium against a real server.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { mkRepo, docPath, stateDir, iar, prepare, readJSON } from './helpers.mjs';

const CYR = /[Ѐ-ӿ]/;
const SECTIONS_RU = { Overview: 'Обзор', Contract: 'Контракт', Architecture: 'Архитектура', Touches: 'Затрагивает', States: 'Состояния', References: 'Ссылки', 'Not in scope': 'Вне рамок', Open: 'Открытые вопросы' };
const row = (id) => /^S\d+$/.test(id);

const en = (b) => ({
  section: b.section,
  title: row(b.id) ? `${b.id} · Row ${b.id}` : `Name of ${b.id}`,
  tldr: `Summary of ${b.id}.`,
  body: `Body of ${b.id}.`,
  check: row(b.id) ? `Proved by \`npm test\` for ${b.id}.` : null,
  flag: b.id === 'S3' ? 'Chosen without the operator.' : null,
  covers: row(b.id) ? [{ id: 'O1', text: 'Offered at the right moment' }] : [],
  diagram: null,
});

const ru = (b) => ({
  section: SECTIONS_RU[b.section] || 'Раздел',
  title: row(b.id) ? `${b.id} · Строка ${b.id}` : `Блок ${b.id}`,
  tldr: `Кратко о блоке ${b.id}.`,
  body: `Текст блока **${b.id}**:\n\n- пункт один\n- пункт два с \`кодом\``,
  check: row(b.id) ? `Проверка: \`npm test\` для ${b.id}.` : null,
  flag: b.id === 'S3' ? 'Решение агента без оператора.' : null,
  covers: row(b.id) ? [{ id: 'O2', text: 'Читается короткими блоками' }] : [],
  diagram: b.id === 'S3' ? { type: 'matrix', caption: 'Подпись', note: 'Заметка', cols: ['До', 'После'], rows: [{ label: 'Строка', cells: [{ text: 'было', tag: 'Метка', tone: 'ok' }, { text: '`код`' }] }] } : null,
});

// Writes a display entry as the session's subagent does.
function writeDisplay(b, value) {
  fs.mkdirSync(path.dirname(b.display), { recursive: true });
  fs.writeFileSync(b.display, JSON.stringify(value));
}

const docs = [];
test.afterEach(() => {
  for (const d of docs.splice(0)) {
    iar(['stop'], { cwd: d.repo });
    fs.rmSync(d.repo, { recursive: true, force: true });
  }
});

function openUrl(repo, kind) {
  const r = iar(['open', '--id', `demo/${kind}`, '--no-open'], { cwd: repo });
  expect(r.code, r.err).toBe(0);
  return /^inspec-read: (\S+)$/m.exec(r.out)[1];
}

// A prepared document with display entries from `make`, opened; returns {repo, url, api, blocks}.
function setup(kind, make = en) {
  const repo = mkRepo();
  const blocks = prepare(repo, kind);
  for (const b of blocks) writeDisplay(b, make(b));
  const url = openUrl(repo, kind);
  const d = { repo, kind, url, api: url.replace(`/demo/${kind}`, `/api/demo/${kind}`), blocks };
  docs.push(d);
  return d;
}

const put = (d, blocks, round = 1) =>
  fetch(`${d.api}/review`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ round, blocks }) });
const serverReview = async (d) => (await (await fetch(`${d.api}/doc`)).json()).review;
const statusOf = (d, id) => expect.poll(async () => (await serverReview(d)).blocks[id].status);

const topic = (page, id) => page.locator(`.toc a.topic[data-id="${id}"]`);
const card = (page) => page.locator('.card');

// Selects `text` inside `loc` with the mouse, from its first character to its last (it may span elements).
async function selectText(page, loc, text) {
  const pts = await loc.evaluate((el, t) => {
    const nodes = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode()); ) nodes.push(n);
    const all = nodes.map((n) => n.data).join('');
    const at = all.indexOf(t);
    if (at < 0) throw new Error(`no "${t}" in "${all}"`);
    const pos = (k) => {
      for (const n of nodes) {
        if (k < n.data.length) return [n, k];
        k -= n.data.length;
      }
    };
    const rect = (k) => {
      const [n, o] = pos(k);
      const r = document.createRange();
      r.setStart(n, o);
      r.setEnd(n, o + 1);
      return r.getBoundingClientRect();
    };
    const a = rect(at);
    const b = rect(at + t.length - 1);
    return { x0: a.left + 1, y0: a.top + a.height / 2, x1: b.right - 1, y1: b.top + b.height / 2 };
  }, text);
  await page.mouse.move(pts.x0, pts.y0);
  await page.mouse.down();
  await page.mouse.move((pts.x0 + pts.x1) / 2, (pts.y0 + pts.y1) / 2, { steps: 3 });
  await page.mouse.move(pts.x1, pts.y1, { steps: 3 });
  await page.mouse.up();
  expect(await page.evaluate(() => getSelection().toString())).toBe(text);
}

// Clicks "Comment" on the selection, picks the kind, writes and saves.
async function commentOnSelection(page, kind, text) {
  await page.locator('.pop').getByRole('button', { name: 'Comment', exact: true }).click();
  await page.locator(`.pop .kinds button[data-k="${kind}"]`).click();
  await page.locator('.pop textarea').fill(text);
  await page.locator('.pop').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.pop')).toHaveCount(0);
}

test('S15 the topic list, the focus card, clicks and the keyboard', async ({ page }) => {
  const d = setup('spec');
  const ids = fs.readFileSync(new URL('./fixtures/spec.ids', import.meta.url), 'utf8').trim().split('\n');
  expect((await put(d, { S1: { status: 'ok' }, S2: { status: 'cm', comments: [{ quote: '', kind: 'change', text: 'Fix the wording.' }] }, S4: { status: 'chg' } })).status).toBe(204);
  await page.goto(d.url);

  // Every block, in order, grouped under its section name, with its title and a ⚑ only where flagged.
  await expect(page.locator('.toc a.topic')).toHaveCount(42);
  expect(await page.locator('.toc a.topic').evaluateAll((as) => as.map((a) => a.dataset.id))).toEqual(ids);
  const sections = d.blocks.map((b) => b.section).filter((s, i, a) => s !== a[i - 1]);
  await expect(page.locator('.toc .tg')).toHaveText(sections);
  for (const b of d.blocks) await expect(topic(page, b.id)).toContainText(en(b).title);
  expect(await page.locator('.toc a.topic:has(.fl)').evaluateAll((as) => as.map((a) => a.dataset.id))).toEqual(['S3']);
  await expect(page.locator('.toc a.topic[data-id="S3"] .fl')).toHaveText('⚑');

  // One dot colour per status.
  const colour = (id) => topic(page, id).locator('.dot').evaluate((e) => getComputedStyle(e).backgroundColor);
  const colours = await Promise.all(['overview', 'S1', 'S2', 'S4'].map(colour));
  expect(new Set(colours).size).toBe(4);

  // The first block: section, n of N, title, summary, body; empty fields are not shown.
  await expect(card(page).locator('.tag')).toHaveText('Overview · 1 of 42');
  await expect(card(page).locator('h2')).toHaveText('Name of overview');
  await expect(card(page).locator('.tldr')).toHaveText('Summary of overview.');
  await expect(card(page).locator('.body')).toHaveText('Body of overview.');
  await expect(card(page).locator('.flag, .meta, .cmts')).toHaveCount(0);
  await expect(card(page).locator('.hd .st')).toHaveText('Not reviewed');

  // A flagged row: flag, and one quiet line with the check and the covered ids, each with its text on hover.
  await topic(page, 'S3').click();
  await expect(card(page).locator('.tag')).toHaveText('Contract · 4 of 42');
  await expect(card(page).locator('h2')).toHaveText('S3 · Row S3');
  await expect(card(page).locator('.flag')).toContainText('Chosen without the operator.');
  await expect(card(page).locator('.meta')).toHaveCount(1);
  await expect(card(page).locator('.meta .ck code')).toHaveText('npm test');
  await expect(card(page).locator('.meta b')).toHaveText('O1');
  await expect(card(page).locator('.meta b')).toHaveAttribute('title', 'Offered at the right moment');
  await expect(topic(page, 'S3')).toHaveClass(/cur/);

  await topic(page, 'S2').click();
  await expect(card(page).locator('.hd .st')).toHaveText('Has comments');
  await expect(card(page).locator('.cmts .cmt')).toContainText('Fix the wording.');
  await topic(page, 'S1').click();
  await expect(card(page).locator('.hd .st')).toHaveText('Approved');
  await topic(page, 'S4').click();
  await expect(card(page).locator('.hd .st')).toHaveText('Changed');

  // Every block of the fixture renders when focused.
  for (const b of d.blocks) {
    await topic(page, b.id).click();
    await expect(card(page).locator('h2')).toHaveText(en(b).title);
  }

  // ↑/↓ and j/k move.
  await topic(page, 'overview').click();
  const h2 = card(page).locator('h2');
  await page.keyboard.press('ArrowDown');
  await expect(h2).toHaveText('S1 · Row S1');
  await page.keyboard.press('j');
  await expect(h2).toHaveText('S2 · Row S2');
  await page.keyboard.press('k');
  await expect(h2).toHaveText('S1 · Row S1');
  await page.keyboard.press('ArrowUp');
  await expect(h2).toHaveText('Name of overview');

  // Enter approves and moves to the next block that is not approved (S1 is approved: S2).
  await page.keyboard.press('Enter');
  await expect(h2).toHaveText('S2 · Row S2');
  await expect(topic(page, 'overview').locator('.dot')).toHaveClass(/\bok\b/);
  await statusOf(d, 'overview').toBe('ok');
  // On an approved block, Enter makes it "Not reviewed".
  await page.keyboard.press('k');
  await page.keyboard.press('k');
  await expect(h2).toHaveText('Name of overview');
  await page.keyboard.press('Enter');
  await expect(card(page).locator('.hd .st')).toHaveText('Not reviewed');
  await expect(h2).toHaveText('Name of overview');
  await statusOf(d, 'overview').toBe('new');

  // Enter right after clicking a topic approves that block too.
  await topic(page, 'S5').click();
  await page.keyboard.press('Enter');
  await expect(h2).toHaveText('S6 · Row S6');
  await statusOf(d, 'S5').toBe('ok');

  // C opens a comment on the block; Enter inside the comment box does not approve.
  await page.keyboard.press('c');
  const box = page.locator('.pop textarea');
  await expect(box).toBeFocused();
  await box.type('a note');
  await page.keyboard.press('Enter');
  await expect(box).toBeVisible();
  await expect(card(page).locator('.hd .st')).toHaveText('Not reviewed');
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
  await expect(h2).toHaveText('S6 · Row S6');
  expect((await serverReview(d)).blocks.S6.status).toBe('new');
});

test('S10 approvals stay after a reload, a server stop and open, and a prepare rerun', async ({ page }) => {
  const d = setup('plan');
  await page.goto(d.url);
  await expect(card(page).locator('h2')).toHaveText('Name of D1');
  await page.keyboard.press('Enter');
  await expect(card(page).locator('h2')).toHaveText('Name of D2');
  await statusOf(d, 'D1').toBe('ok');
  // A comment on D2 by selection (S16).
  await selectText(page, card(page).locator('.tldr'), 'of D2');
  await commentOnSelection(page, 'unclear', 'Which D2?');
  await statusOf(d, 'D2').toBe('cm');

  const holds = async () => {
    await expect(topic(page, 'D1').locator('.dot')).toHaveClass(/\bok\b/);
    await expect(topic(page, 'D2').locator('.dot')).toHaveClass(/\bcm\b/);
    await topic(page, 'D2').click();
    await expect(card(page).locator('.cmts .cmt')).toHaveCount(1);
    await expect(card(page).locator('.cmts .cmt')).toContainText('Which D2?');
    await expect(card(page).locator('.tldr mark.cm')).toHaveText('of D2');
    await topic(page, 'D1').click();
    await expect(card(page).locator('.hd .st')).toHaveText('Approved');
    await expect(page.locator('#submit')).toHaveText('Send 1 comment');
  };
  await page.reload();
  await holds();

  expect(iar(['stop'], { cwd: d.repo }).code).toBe(0);
  expect(openUrl(d.repo, 'plan')).toBe(d.url);
  await page.goto(d.url);
  await holds();

  expect(prepare(d.repo, 'plan')).toEqual([]);
  await page.reload();
  await holds();
  await expect(page.locator('#round')).toHaveText('Round 1');
});

test('S11 (page) an open tab follows a drop and does not send its old review again', async ({ page }) => {
  const d = setup('plan');
  await page.goto(d.url);
  await expect(card(page).locator('h2')).toHaveText('Name of D1');
  await page.keyboard.press('Enter');
  await statusOf(d, 'D1').toBe('ok');
  expect(iar(['drop', '--id', 'demo/plan'], { cwd: d.repo }).code).toBe(0);
  await expect(topic(page, 'D1').locator('.dot')).toHaveClass(/\bnew\b/, { timeout: 5000 });
  await expect(page.locator('#submit')).toHaveText('2 to review');
  await page.waitForTimeout(3500);
  expect((await serverReview(d)).blocks.D1.status).toBe('new');
  // The next action sends the dropped round plus that action only.
  await topic(page, 'D2').click();
  await page.keyboard.press('Enter');
  await statusOf(d, 'D2').toBe('ok');
  expect((await serverReview(d)).blocks.D1.status).toBe('new');
});

test('S17 Show source renders the original markdown with the same renderer as the fields', async ({ page }) => {
  const d = setup('spec');
  await page.goto(d.url);
  // md.js's output for a source, as the browser serializes it.
  const renderer = (src) =>
    page.evaluate(async (s) => {
      const t = document.createElement('div');
      t.innerHTML = (await import(new URL('../ui/md.js', location.href).href)).block(s);
      return t.innerHTML;
    }, src);

  for (const id of ['S1', 'architecture/files']) {
    const src = d.blocks.find((b) => b.id === id).source;
    await topic(page, id).click();
    await expect(card(page).locator('.src')).toHaveCount(0);
    await card(page).getByRole('button', { name: 'Show source' }).click();
    const view = card(page).locator('.src[data-content] .md');
    await expect(view).toHaveCount(1);
    expect(await view.innerHTML()).toBe(await renderer(src));
    await expect(card(page).getByRole('button', { name: 'Hide source' })).toBeVisible();
  }
  // S1's source: its heading, list item, bold id and code spans read as formatted text.
  await topic(page, 'S1').click();
  const s1 = card(page).locator('.src .md');
  await expect(s1.locator('h3, h4')).toHaveText('Contract');
  await expect(s1.locator('li strong').first()).toHaveText('S1');
  await expect(s1.locator('li code').first()).toHaveText('prepare <md> --id <slug>/<kind> --lang <tag>');
  expect(await s1.innerText()).not.toContain('**');
  // The Architecture block's fenced tree is a code block.
  await topic(page, 'architecture/files').click();
  await expect(card(page).locator('.src .md pre code')).toContainText('skills/read/iar/iar.mjs');
  await card(page).getByRole('button', { name: 'Hide source' }).click();
  await expect(card(page).locator('.src')).toHaveCount(0);
});

test('S18 the submit button, the sent state, the next round and Reconnecting…', async ({ page }) => {
  const d = setup('plan');
  await page.goto(d.url);
  const submit = page.locator('#submit');
  await expect(submit).toHaveText('2 to review');
  await expect(submit).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(submit).toHaveText('1 to review');
  await expect(submit).toBeDisabled();

  // Two comments on D2, one a question.
  for (const [kind, text] of [['change', 'First comment'], ['question', 'Second comment']]) {
    await page.keyboard.press('c');
    await page.locator(`.pop .kinds button[data-k="${kind}"]`).click();
    await page.locator('.pop textarea').fill(text);
    await page.locator('.pop').getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.pop')).toHaveCount(0);
  }
  await expect(card(page).locator('.hd .st')).toHaveText('Has comments');
  await expect(card(page).locator('.cmts .cmt')).toHaveCount(2);
  await expect(submit).toHaveText('Send 2 comments');
  await expect(submit).toBeEnabled();
  await expect.poll(async () => (await serverReview(d)).blocks.D2.comments.length).toBe(2);

  await page.evaluate(() => (window.__sameTab = true));
  await submit.click();
  await expect(page.locator('#notice')).toContainText('Review sent');
  await expect(page.locator('#notice')).toContainText('Waiting for the session');
  await expect(submit).toBeDisabled();
  const sent = readJSON(`${stateDir(d.repo, 'plan')}/result.json`);
  expect(sent).toMatchObject({ result: 'changes_requested', round: 1, approved: ['D1'] });
  expect(sent.feedback[0].comments.map((c) => [c.kind, c.text])).toEqual([['change', 'First comment'], ['question', 'Second comment']]);

  // The next round: the same tab switches within 5 s, with no reload.
  fs.appendFileSync(docPath(d.repo, 'plan'), '\nOne more line.\n');
  for (const b of prepare(d.repo, 'plan')) writeDisplay(b, en(b));
  await expect(page.locator('#round')).toHaveText('Round 2', { timeout: 5000 });
  expect(await page.evaluate(() => window.__sameTab)).toBe(true);
  await expect(page.locator('#notice')).toBeHidden();
  await expect(submit).toHaveText('2 to review');
  await topic(page, 'D1').click();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(submit).toHaveText('Approve document');
  await expect(submit).toBeEnabled();
  await statusOf(d, 'D2').toBe('ok');

  // The server goes away: Reconnecting… with the command, controls disabled; back within 5 s of its return.
  expect(iar(['stop'], { cwd: d.repo }).code).toBe(0);
  const banner = page.locator('#banner');
  await expect(banner).toContainText('Reconnecting…', { timeout: 5000 });
  await expect(banner).toContainText('/inspec:read demo plan');
  await expect(submit).toBeDisabled();
  await expect(card(page).locator('button[data-act="approve"]')).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(topic(page, 'D2').locator('.dot')).toHaveClass(/\bok\b/);
  expect(openUrl(d.repo, 'plan')).toBe(d.url);
  await expect(banner).toBeHidden({ timeout: 5000 });
  await expect(submit).toBeEnabled();
  await expect(card(page).locator('button[data-act="approve"]')).toBeEnabled();
  await submit.click();
  await expect(page.locator('#notice')).toContainText('Review sent');
  expect(readJSON(`${stateDir(d.repo, 'plan')}/result.json`)).toEqual({ result: 'approved', round: 2 });
});

test('S21 with Russian display text, no Cyrillic outside [data-content]; the interface is English', async ({ page }) => {
  const d = setup('spec', ru);
  expect((await put(d, { S2: { status: 'cm', comments: [{ quote: 'Кратко', kind: 'change', text: 'Поправить формулировку.' }] } })).status).toBe(204);
  await page.goto(d.url);
  const outside = () =>
    page.evaluate((re) => {
      const cyr = new RegExp(re);
      const bad = [];
      if (cyr.test(document.title)) bad.push(`title: ${document.title}`);
      for (const el of document.querySelectorAll('*')) {
        if (el.closest('[data-content]')) continue;
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join('');
        const attrs = [...el.attributes].map((a) => a.value).join(' ');
        const value = 'value' in el && typeof el.value === 'string' ? el.value : '';
        if (cyr.test(own + attrs + value)) bad.push(el.outerHTML.slice(0, 160));
      }
      return bad;
    }, CYR.source);

  await expect(card(page).locator('h2')).toHaveText('Блок overview');
  expect(await page.locator('body').innerText()).toMatch(CYR);
  expect(await outside()).toEqual([]);
  for (const id of ['S3', 'S2', 'architecture/state']) {
    await topic(page, id).click();
    await expect(card(page).locator('.tldr')).toHaveText(`Кратко о блоке ${id}.`);
    expect(await outside(), id).toEqual([]);
  }
  await topic(page, 'S3').click();
  await expect(card(page).locator('.flag')).toContainText('Решение агента');
  await expect(card(page).locator('.dia')).toContainText('Подпись');
  await expect(card(page).locator('.meta b')).toHaveAttribute('title', 'Читается короткими блоками');
  await card(page).getByRole('button', { name: 'Show source' }).click();
  await page.keyboard.press('c');
  await page.locator('.pop textarea').fill('Комментарий в процессе');
  expect(await outside()).toEqual([]);
  await page.keyboard.press('Escape');

  // The chrome is English.
  for (const name of ['Approve', 'Comment on block', 'Hide source']) await expect(card(page).getByRole('button', { name })).toBeVisible();
  await expect(page.locator('#submit')).toHaveText('41 to review');
  await expect(page.locator('#themeSeg button')).toHaveText(['System', 'Light', 'Dark']);
});

test('S22 display markdown renders as elements; raw HTML, scripts and javascript: links stay inert', async ({ page }) => {
  const repo = mkRepo();
  const blocks = prepare(repo, 'plan');
  const d = { repo, blocks };
  docs.push(d);
  const hostile = {
    section: 'Deliveries',
    title: 'D1 · **Bold** *it* `code` <b>raw</b>',
    tldr: 'Has **bold**, *italic*, `- **O<n>**` and <script>window.__x=1</script> <img src=x onerror="window.__x=2">',
    body: [
      'First paragraph with **bold**, _italic_ and `code`.',
      'Its second line <em>raw</em>.',
      '',
      'Second [site](https://example.com/a?b=1&c=2), [bad](javascript:window.__x=3), <a href="javascript:window.__x=4">raw link</a> and <https://example.org>.',
      '',
      '- one',
      '- two with `x`',
      '  - nested',
      '',
      '1. first',
      '2. second',
      '',
      '```js',
      'const a = "<b>";',
      '```',
      '',
      '| A | B |',
      '|---|---|',
      '| `a` cell | **b** |',
      '',
      '<script>window.__x=5</script>',
      '<div onclick="window.__x=6">div</div>',
    ].join('\n'),
    check: 'Run `npm test` and **all** pass <i>x</i>.',
    flag: 'Picked *alone* <u>u</u>.',
    covers: [],
    diagram: null,
  };
  for (const b of blocks) writeDisplay(b, b.id === 'D1' ? hostile : en(b));
  const url = openUrl(repo, 'plan');
  await page.goto(url);
  const c = card(page);
  await expect(c.locator('h2')).toContainText('D1 · Bold');

  // Inline fields: bold, italic and code as elements, the rest as text.
  await expect(c.locator('h2 strong')).toHaveText('Bold');
  await expect(c.locator('h2 em')).toHaveText('it');
  await expect(c.locator('h2 code')).toHaveText('code');
  await expect(c.locator('h2')).toContainText('<b>raw</b>');
  await expect(c.locator('.tldr strong')).toHaveText('bold');
  await expect(c.locator('.tldr em')).toHaveText('italic');
  await expect(c.locator('.tldr code')).toHaveText('- **O<n>**');
  await expect(c.locator('.tldr')).toContainText('<script>window.__x=1</script> <img src=x onerror="window.__x=2">');
  await expect(c.locator('.meta .ck code')).toHaveText('npm test');
  await expect(c.locator('.meta .ck strong')).toHaveText('all');
  await expect(c.locator('.meta .ck')).toContainText('<i>x</i>');
  await expect(c.locator('.flag em')).toHaveText('alone');
  await expect(c.locator('.flag')).toContainText('<u>u</u>');

  // The body: paragraphs, lists, code, a table and http(s) links.
  const body = c.locator('.body');
  await expect(body.locator(':scope > p')).toHaveCount(3);
  await expect(body.locator('p').first()).toContainText('<em>raw</em>');
  await expect(body.locator('p strong').first()).toHaveText('bold');
  await expect(body.locator('p em').first()).toHaveText('italic');
  await expect(body.locator('p code').first()).toHaveText('code');
  await expect(body.locator(':scope > ul > li')).toHaveCount(2);
  await expect(body.locator('ul ul > li')).toHaveText('nested');
  await expect(body.locator(':scope > ol > li')).toHaveText(['first', 'second']);
  await expect(body.locator('pre code')).toHaveText('const a = "<b>";');
  await expect(body.locator('table th')).toHaveText(['A', 'B']);
  await expect(body.locator('table td code')).toHaveText('a');
  await expect(body.locator('table td strong')).toHaveText('b');
  const links = await body.locator('a').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.textContent]));
  expect(links).toEqual([['https://example.com/a?b=1&c=2', 'site']]);
  await expect(body).toContainText('[bad](javascript:window.__x=3)');
  await expect(body).toContainText('<a href="javascript:window.__x=4">raw link</a>');
  await expect(body).toContainText('<https://example.org>');
  await expect(body).toContainText('<script>window.__x=5</script>');
  await expect(body).toContainText('<div onclick="window.__x=6">div</div>');

  // Nothing of it became live markup.
  const live = await c.evaluate((el) => ({
    tags: [...el.querySelectorAll('script, img, u, i, b, div[onclick], iframe, style')].map((e) => e.tagName),
    handlers: [...el.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => a.name.startsWith('on'))).length,
    x: window.__x,
  }));
  expect(live).toEqual({ tags: [], handlers: 0, x: undefined });
});

test('S16 comment on a selection with a kind, its highlight, and approve asking to delete this round\'s comments', async ({ page }) => {
  const d = setup('plan', (b) => ({
    ...en(b),
    tldr: `The server keeps **running** after a submit of ${b.id}.`,
    body: `First line of ${b.id}.\n\nThe page reads \`result.json\` again.`,
    check: `Proved by \`npm test\` for ${b.id}.`,
  }));
  await page.goto(d.url);
  await expect(card(page).locator('h2')).toHaveText('Name of D1');
  const c = card(page);

  // A selection across the bold word shows "Comment"; saving with a kind stores the quote, highlights it, marks the block.
  await selectText(page, c.locator('.tldr'), 'keeps running after');
  await expect(page.locator('.pop').getByRole('button', { name: 'Comment', exact: true })).toBeVisible();
  await commentOnSelection(page, 'question', 'Why keep it running?');
  await expect(c.locator('.hd .st')).toHaveText('Has comments');
  await expect(topic(page, 'D1').locator('.dot')).toHaveClass(/\bcm\b/);
  expect((await c.locator('.tldr mark.cm').allTextContents()).join('')).toBe('keeps running after');
  await expect(c.locator('.cmts .cmt').first()).toContainText('keeps running after');
  await expect(c.locator('.cmts .cmt').first()).toContainText('question');

  // The other two kinds, in the body and the check.
  await selectText(page, c.locator('.body'), 'reads result.json');
  await commentOnSelection(page, 'change', 'Say which file.');
  await selectText(page, c.locator('.meta .ck'), 'npm test');
  await commentOnSelection(page, 'unclear', 'Which tests?');
  await expect(c.locator('.body mark.cm')).toHaveText(['reads ', 'result.json']);
  await expect(c.locator('.meta .ck mark.cm')).toHaveText('npm test');
  await expect.poll(async () => (await serverReview(d)).blocks.D1.comments.map((x) => [x.kind, x.quote, x.text])).toEqual([
    ['question', 'keeps running after', 'Why keep it running?'],
    ['change', 'reads result.json', 'Say which file.'],
    ['unclear', 'npm test', 'Which tests?'],
  ]);
  expect((await serverReview(d)).blocks.D1.status).toBe('cm');
  await expect(page.locator('#submit')).toHaveText('1 to review');

  // A whole-block comment has an empty quote.
  await page.keyboard.press('c');
  await page.locator('.pop textarea').fill('The whole block.');
  await page.locator('.pop').getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await serverReview(d)).blocks.D1.comments.at(-1).quote).toBe('');

  // The highlight is still there after a reload.
  await page.reload();
  expect((await c.locator('.tldr mark.cm').allTextContents()).join('')).toBe('keeps running after');

  // Approve asks; No changes nothing.
  const dialog = page.getByRole('dialog');
  await c.getByRole('button', { name: 'Approve' }).click();
  await expect(dialog).toContainText('Delete 4 comments and approve?');
  await dialog.getByRole('button', { name: 'No' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(c.locator('.hd .st')).toHaveText('Has comments');
  await expect(c.locator('.cmts .cmt')).toHaveCount(4);
  expect((await serverReview(d)).blocks.D1.comments).toHaveLength(4);
  // Enter asks too; Escape is No.
  await page.keyboard.press('Enter');
  await expect(dialog).toContainText('Delete 4 comments and approve?');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(c.locator('h2')).toHaveText('Name of D1');
  // Yes deletes them and approves.
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Yes' }).click();
  await expect(dialog).toHaveCount(0);
  await statusOf(d, 'D1').toBe('ok');
  expect((await serverReview(d)).blocks.D1.comments).toEqual([]);
  await topic(page, 'D1').click();
  await expect(c.locator('.hd .st')).toHaveText('Approved');
  await expect(c.locator('.cmts, mark.cm')).toHaveCount(0);

  // Earlier rounds' comments and replies stay.
  await topic(page, 'D2').click();
  await page.keyboard.press('Enter');
  await statusOf(d, 'D2').toBe('ok');
  expect((await fetch(`${d.api}/submit`, { method: 'POST' })).status).toBe(200);
  fs.appendFileSync(docPath(d.repo, 'plan'), '\nOne more line.\n');
  for (const b of prepare(d.repo, 'plan')) writeDisplay(b, en(b));
  const file = `${stateDir(d.repo, 'plan')}/review.json`;
  const rv = readJSON(file);
  expect(rv.round).toBe(2);
  rv.blocks.D1.comments = [{ id: 'c1-1', quote: 'keeps running after', kind: 'question', text: 'Why keep it running?', reply: 'So the tab can reconnect.', round: 1 }];
  fs.writeFileSync(file, JSON.stringify(rv));
  await page.reload();
  await expect(page.locator('#round')).toHaveText('Round 2');
  await topic(page, 'D1').click();
  const old = c.locator('.cmts .cmt.old');
  await expect(old).toContainText('Why keep it running?');
  await expect(old.locator('.reply')).toContainText('Agent');
  await expect(old.locator('.reply')).toContainText('So the tab can reconnect.');
  await expect(old.getByRole('button', { name: 'remove' })).toHaveCount(0);
  await selectText(page, c.locator('.tldr'), 'running after');
  await commentOnSelection(page, 'change', 'A new one.');
  await expect(c.locator('.cmts .cmt')).toHaveCount(2);
  await c.getByRole('button', { name: 'Approve' }).click();
  await expect(dialog).toContainText('Delete 1 comment and approve?');
  await dialog.getByRole('button', { name: 'Yes' }).click();
  await statusOf(d, 'D1').toBe('ok');
  const kept = (await serverReview(d)).blocks.D1.comments;
  expect(kept.map((x) => [x.id, x.reply])).toEqual([['c1-1', 'So the tab can reconnect.']]);
  await topic(page, 'D1').click();
  await expect(c.locator('.cmts .cmt')).toHaveCount(1);
  await expect(c.locator('.cmts .cmt.old .reply')).toContainText('So the tab can reconnect.');
});

const DIAGRAMS = {
  S1: { type: 'flow', caption: 'Flow `cap`', note: 'Flow note', steps: [{ label: 'Prepare', text: 'runs `iar prepare`', actor: 'you' }, { label: 'Open', text: 'a **bold** <b>raw</b> step' }, { label: 'Wait', text: 'until <script>window.__x=1</script> submit' }], loop: 'Again from `prepare`' },
  S2: { type: 'matrix', caption: 'Matrix cap', cols: ['Before', 'After `now`'], rows: [{ label: 'Hash *it*', cells: [{ text: 'same' }, { text: 'kept `ok`', tag: 'Approved', tone: 'ok' }] }, { label: 'Row two', cells: [{ text: '<img src=x onerror="window.__x=2">', tag: 'Changed', tone: 'changed' }, { text: 'new cell', tone: 'warn' }] }] },
  S3: { type: 'states', note: 'States note', transitions: [{ from: 'new', to: 'ok', on: 'Approve `↵`' }, { from: 'ok', to: 'chg', on: 'an [edit](javascript:window.__x=3)' }] },
  S4: { type: 'compare', caption: 'Compare cap', before: { label: 'Before', text: 'one `tab`' }, after: { label: 'After', text: 'same <u>tab</u>' } },
};

// Every text an entry holds, as written (backticks stripped where they make code).
function texts(g) {
  const out = [];
  const walk = (v, k) => {
    if (typeof v === 'string' && !['type', 'tone', 'actor'].includes(k)) out.push(v);
    else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) walk(x, Array.isArray(v) ? k : kk);
  };
  walk(g);
  return out;
}

test('S23 each diagram type renders every text, code spans as code, other markup inert; narrow forms', async ({ page }) => {
  const d = setup('spec', (b) => ({ ...en(b), diagram: DIAGRAMS[b.id] || null }));
  await page.goto(d.url);
  const c = card(page);
  for (const [id, g] of Object.entries(DIAGRAMS)) {
    await topic(page, id).click();
    const fig = c.locator('.dia[data-content]');
    await expect(fig).toHaveCount(1);
    await expect(fig).toHaveAttribute('data-type', g.type);
    const text = (await fig.textContent()).replace(/\s+/g, ' ');
    for (const t of texts(g)) expect(text, `${id}: ${t}`).toContain(t.replace(/`([^`]+)`/g, '$1'));
    // Backtick spans are code; nothing else became an element of its own.
    const codes = texts(g).flatMap((t) => [...t.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
    expect(await fig.locator('code').allTextContents()).toEqual(codes);
    const live = await fig.evaluate((el) => [...el.querySelectorAll('strong, em, a, b:not(.lb), u, img, script')].map((e) => e.tagName));
    expect(live, id).toEqual([]);
  }
  await topic(page, 'S1').click();
  await expect(c.locator('.dia')).toContainText('a **bold** <b>raw</b> step');
  await expect(c.locator('.dia')).toContainText('<script>window.__x=1</script>');
  expect(await page.evaluate(() => window.__x)).toBeUndefined();
  // The diagram sits between the body and the meta line.
  expect(await c.evaluate((el) => [...el.children].map((e) => e.className.split(' ')[0]).filter((k) => ['body', 'dia', 'meta'].includes(k)))).toEqual(['body', 'dia', 'meta']);

  const geometry = () =>
    page.evaluate(() => {
      const steps = [...document.querySelectorAll('.card .flow .n')].map((e) => e.getBoundingClientRect());
      return { lefts: steps.map((r) => Math.round(r.left)), tops: steps.map((r) => Math.round(r.top)), wide: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
  const matrixCols = () => c.locator('.mx').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);

  // Wide: the flow runs left to right, the matrix has a label column plus one per column.
  let g = await geometry();
  expect(new Set(g.tops).size).toBe(1);
  expect(g.lefts).toEqual([...g.lefts].sort((a, b) => a - b));
  await topic(page, 'S2').click();
  expect(await matrixCols()).toBe(3);

  // 760 px and less: the flow stacks, the matrix shows one column, no horizontal scroll.
  for (const width of [760, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await topic(page, 'S1').click();
    g = await geometry();
    expect(new Set(g.lefts).size, `${width}`).toBe(1);
    expect(g.tops).toEqual([...g.tops].sort((a, b) => a - b));
    expect(new Set(g.tops).size).toBe(3);
    expect(g.wide).toBe(false);
    for (const id of ['S2', 'S3', 'S4']) {
      await topic(page, id).click();
      if (id === 'S2') expect(await matrixCols()).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), `${id} at ${width}`).toBe(false);
    }
  }
});

test('S19 theme: System follows the scheme, Light and Dark override it and survive a reload, throwing storage renders System', async ({ page, browser }) => {
  const d = setup('plan');
  const colours = (p) => p.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.body).color }));
  const on = (p) => p.locator('#themeSeg button.on');

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(d.url);
  await expect(card(page).locator('h2')).toHaveText('Name of D1');
  await expect(on(page)).toHaveText('System');
  const light = await colours(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await colours(page);
  expect(dark.bg).not.toBe(light.bg);
  expect(dark.ink).not.toBe(light.ink);

  // Light overrides a dark scheme, and survives a reload.
  await page.locator('#themeSeg').getByRole('button', { name: 'Light' }).click();
  expect(await colours(page)).toEqual(light);
  await page.reload();
  await expect(on(page)).toHaveText('Light');
  expect(await colours(page)).toEqual(light);
  // Dark overrides a light scheme, and survives a reload.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.locator('#themeSeg').getByRole('button', { name: 'Dark' }).click();
  expect(await colours(page)).toEqual(dark);
  await page.reload();
  await expect(on(page)).toHaveText('Dark');
  expect(await colours(page)).toEqual(dark);
  // System follows the scheme again.
  await page.locator('#themeSeg').getByRole('button', { name: 'System' }).click();
  expect(await colours(page)).toEqual(light);
  await page.reload();
  await expect(on(page)).toHaveText('System');
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await colours(page)).toEqual(dark);

  // Storage that throws: the page still renders, in System.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => {
    localStorage.setItem('iar.theme', 'light');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
  });
  const errors = [];
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(d.url);
  await expect(p2.locator('.toc a.topic')).toHaveCount(2);
  await expect(p2.locator('.card h2')).toHaveText('Name of D1');
  await expect(on(p2)).toHaveText('System');
  expect(await colours(p2)).toEqual(dark);
  await p2.locator('#themeSeg').getByRole('button', { name: 'Light' }).click();
  expect(await colours(p2)).toEqual(light);
  await p2.reload();
  await expect(on(p2)).toHaveText('System');
  expect(await colours(p2)).toEqual(dark);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('S20 at 760 px or less the topic list is one scrolling row, the focused topic is in view, no horizontal scroll', async ({ page }) => {
  const long = 'skills/read/iar/lib/a-very-long-path-without-any-break/that-keeps-going/and-going/until-it-is-wider-than-a-phone.mjs';
  const d = setup('spec', (b) => ({ ...en(b), title: `${en(b).title} with a longer name`, tldr: `Uses \`${long}\` here.`, body: `See ${long} and \`${long}\`.\n\n| A | B |\n|---|---|\n| \`${long}\` | ${long} |` }));
  for (const width of [760, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(d.url);
    await expect(card(page).locator('h2')).toContainText('Name of overview');
    const layout = () =>
      page.evaluate(() => {
        const toc = document.querySelector('.F .toc');
        const r = toc.getBoundingClientRect();
        const tops = [...toc.querySelectorAll('a.topic')].map((a) => Math.round(a.getBoundingClientRect().top));
        const c = toc.querySelector('a.cur').getBoundingClientRect();
        const de = document.documentElement;
        return {
          height: r.height,
          rows: new Set(tops).size,
          scrolls: toc.scrollWidth > toc.clientWidth && ['auto', 'scroll'].includes(getComputedStyle(toc).overflowX),
          inView: c.left >= 0 && c.right <= de.clientWidth && c.top >= 0 && c.bottom <= innerHeight,
          pageWide: de.scrollWidth > de.clientWidth,
        };
      });
    const holds = async (what) => {
      const l = await layout();
      expect(l.height, `${what} at ${width}`).toBeLessThanOrEqual(56);
      expect(l.rows, `${what} at ${width}`).toBe(1);
      expect(l.scrolls, `${what} at ${width}`).toBe(true);
      expect(l.inView, `${what} at ${width}`).toBe(true);
      expect(l.pageWide, `${what} at ${width}`).toBe(false);
    };
    await holds('first block');
    // Far along by keyboard, then by a click at the row's end, then back to the start.
    for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowDown');
    await expect(card(page).locator('.tag')).toContainText('26 of 42');
    await holds('block 26');
    await page.locator('.F .toc').evaluate((t) => (t.scrollLeft = t.scrollWidth));
    await topic(page, 'open').click();
    await expect(card(page).locator('.tag')).toContainText('42 of 42');
    await holds('last block');
    await card(page).getByRole('button', { name: 'Show source' }).click();
    await holds('source shown');
    for (let i = 0; i < 41; i++) await page.keyboard.press('k');
    await expect(card(page).locator('.tag')).toContainText('1 of 42');
    await holds('back at the first');
  }
});
