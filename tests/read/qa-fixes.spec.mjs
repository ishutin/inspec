// Fixes from the live run, on the page (spec rows S35, S36, S37, S38), driven in Chromium against a real server.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { mkRepo, docPath, iar, prepare } from './helpers.mjs';

const row = (id) => /^S\d+$/.test(id);
const en = (b) => ({
  section: b.section,
  group: b.group ?? null,
  title: row(b.id) ? `${b.id} · Row ${b.id}` : `Name of ${b.id}`,
  tldr: `Summary of ${b.id}.`,
  body: `Body of ${b.id}.`,
  check: null,
  flag: null,
  covers: [],
  diagram: null,
});
const SUMMARY = { tldr: 'The document.', body: 'Its points.', diagram: null };

const write = (e, value) => {
  fs.mkdirSync(path.dirname(e.display), { recursive: true });
  fs.writeFileSync(e.display, JSON.stringify(value));
};

const docs = [];
test.afterEach(() => {
  for (const d of docs.splice(0)) {
    iar(['stop'], { cwd: d.repo });
    fs.rmSync(d.repo, { recursive: true, force: true });
  }
});

function open(repo, kind) {
  const r = iar(['open', '--id', `demo/${kind}`, '--no-open'], { cwd: repo });
  expect(r.code, r.err).toBe(0);
  return /^inspec-read: (\S+)$/m.exec(r.out)[1];
}

// A prepared and opened document whose block displays come from `make`; returns {repo, url, api, blocks}.
function setup(kind, make = en, repo = mkRepo()) {
  const printed = prepare(repo, kind);
  for (const e of printed) write(e, e.id === 'summary' ? SUMMARY : make(e));
  const url = open(repo, kind);
  const d = { repo, kind, url, api: url.replace(`/demo/${kind}`, `/api/demo/${kind}`), blocks: printed.filter((e) => e.id !== 'summary') };
  docs.push(d);
  return d;
}

const topic = (page, id) => page.locator(`.toc a.topic[data-id="${id}"]`);
const card = (page) => page.locator('.card');

test('S35 topic-list group labels are the display entry\'s translated group, never the source\'s', async ({ page }) => {
  const repo = mkRepo();
  const blocks = prepare(repo, 'spec').filter((e) => e.id !== 'summary');
  const groups = [...new Set(blocks.map((b) => b.group).filter(Boolean))];
  expect(groups.length).toBeGreaterThan(3);
  const ru = (g) => `Группа ${groups.indexOf(g) + 1}`;
  fs.rmSync(path.join(repo, '.git', 'inspec-read'), { recursive: true, force: true });
  const d = setup('spec', (b) => ({ ...en(b), group: b.group ? ru(b.group) : null }), repo);

  // The doc route carries each entry's group.
  const doc = await (await fetch(`${d.api}/doc`)).json();
  for (const b of doc.blocks) expect(b.display.group, b.id).toBe(b.group ? ru(b.group) : null);

  await page.goto(d.url);
  const labels = await page.locator('.F .toc .tg2').allTextContents();
  expect(labels).toEqual(groups.map(ru));
  const toc = await page.locator('.F .toc').textContent();
  for (const g of groups) expect(toc, g).not.toContain(g.replace(/`/g, ''));

  // An entry without `group` breaks the schema: open names it (S5).
  const s5 = d.blocks.find((b) => b.id === 'S5');
  const entry = JSON.parse(fs.readFileSync(s5.display, 'utf8'));
  delete entry.group;
  fs.writeFileSync(s5.display, JSON.stringify(entry));
  const r = iar(['open', '--id', 'demo/spec', '--no-open'], { cwd: repo });
  expect(r.code).toBe(2);
  expect(r.err).toMatch(/\bS5\b.*group/);
});

// Long code spans with no break opportunity, as in the live run's session flow.
const LONG = '`node <skill dir>/iar/iar.mjs prepare <md> --id <slug>/<kind> --lang <lang>`';
const NOSPACE = '`run_in_background:true,docs/features/<slug>/plan.md#a-very-long-anchor-with-no-spaces-at-all`';
const DIAGRAMS = {
  S1: {
    type: 'flow',
    caption: 'Review round in the session',
    steps: [
      { label: 'prepare', text: LONG },
      { label: 'Subagent', text: `writes each ${NOSPACE} when prepare printed blocks` },
      { label: 'open and wait', text: `${NOSPACE} then \`wait\`` },
      { label: 'Review', text: 'the operator approves or comments and sends', actor: 'you' },
      { label: 'Result', text: `\`approved\` or \`changes_requested\`, ${NOSPACE}` },
      { label: 'Next', text: NOSPACE },
    ],
    loop: `On \`changes_requested\`, back to ${LONG}`,
  },
  S2: {
    type: 'matrix',
    cols: ['Before', NOSPACE, 'After'],
    rows: [
      { label: NOSPACE, cells: [{ text: LONG }, { text: NOSPACE, tag: NOSPACE, tone: 'warn' }, { text: 'short' }] },
      { label: 'Second', cells: [{ text: 'a' }, { text: 'b' }, { text: NOSPACE }] },
    ],
  },
  S3: { type: 'states', transitions: [{ from: NOSPACE, to: 'Approved', on: LONG }, { from: 'Approved', to: NOSPACE, on: NOSPACE }] },
  S4: { type: 'compare', before: { label: 'Before', text: NOSPACE }, after: { label: NOSPACE, text: LONG } },
};

test('S36 at 1280 and 520 no diagram is wider than its card, a wide flow scrolls inside it, no step overlaps another', async ({ page }) => {
  const d = setup('spec', (b) => ({ ...en(b), diagram: DIAGRAMS[b.id] || null }));
  for (const width of [1280, 520]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(d.url);
    for (const id of Object.keys(DIAGRAMS)) {
      await topic(page, id).click();
      await expect(card(page).locator('.dia')).toHaveCount(1);
      const m = await card(page).evaluate((c) => {
        const box = c.getBoundingClientRect();
        const out = [];
        // Content inside a horizontal scroll box may sit past the card while scrolled out of view; the box may not.
        const scrolled = (el) => {
          for (let p = el.parentElement; p && p !== c; p = p.parentElement) if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX)) return true;
          return false;
        };
        for (const el of c.querySelectorAll('.dia, .dia *')) {
          if (scrolled(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.width && (r.left < box.left - 0.5 || r.right > box.right + 0.5)) out.push(`${el.tagName}.${el.className} ${Math.round(r.left)}–${Math.round(r.right)} outside ${Math.round(box.left)}–${Math.round(box.right)}`);
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.clientWidth) out.push(`${el.tagName}.${el.className} overflows its own box`);
        }
        const steps = [...c.querySelectorAll('.flow .n')].map((e) => e.getBoundingClientRect());
        const overlaps = [];
        steps.forEach((a, i) =>
          steps.slice(i + 1).forEach((b, k) => {
            if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push(`${i}/${i + k + 1}`);
          }),
        );
        // At full width no code span inside a flow step is broken across lines.
        const broken = innerWidth > 760 ? [...c.querySelectorAll('.flow code')].filter((e) => e.getClientRects().length > 1).map((e) => e.textContent) : [];
        return { out, overlaps, broken, wide: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      });
      expect(m.out, `${id} at ${width}`).toEqual([]);
      expect(m.overlaps, `${id} at ${width}`).toEqual([]);
      expect(m.broken, `${id} at ${width}`).toEqual([]);
      expect(m.wide, `${id} at ${width}`).toBe(false);
    }
  }
});

test('S37 the document list uses the page\'s tokens and theme, slug and kind in their own cells, each a link', async ({ page }) => {
  const d = setup('plan');
  setup('spec', en, d.repo);
  const list = d.url.replace('/demo/plan', '/');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const ink = () => page.evaluate(() => getComputedStyle(document.body).color);

  // The review page's own colours, per theme, as the reference.
  const want = {};
  for (const t of ['light', 'dark']) {
    await page.goto(d.url);
    await page.locator(`#themeSeg button[data-t="${t}"]`).click();
    want[t] = [await bg(), await ink()];
  }
  expect(want.light[0]).not.toBe(want.dark[0]);

  await page.goto(list);
  // The choice made on the review page holds here too (dark was picked last).
  expect([await bg(), await ink()]).toEqual(want.dark);
  for (const t of ['light', 'dark']) {
    await page.locator(`#themeSeg button[data-t="${t}"]`).click();
    expect([await bg(), await ink()], t).toEqual(want[t]);
    await page.reload();
    expect([await bg(), await ink()], `${t} after reload`).toEqual(want[t]);
  }
  await page.locator('#themeSeg button[data-t="system"]').click();
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    expect([await bg(), await ink()], `system ${scheme}`).toEqual(want[scheme]);
  }
  await page.emulateMedia({ colorScheme: 'light' });

  // One row per document, slug and kind in separate cells, each row a link to its document.
  const rows = page.locator('.docs > a');
  await expect(rows).toHaveCount(2);
  const token = new URL(d.url).pathname.split('/')[1];
  for (const [i, kind] of ['spec', 'plan'].entries()) {
    const r = rows.nth(i);
    await expect(r).toHaveAttribute('href', `/${token}/demo/${kind}`);
    await expect(r.locator('.cell.slug')).toHaveText('demo');
    await expect(r.locator('.cell.kind')).toHaveText(kind);
    await expect(r.locator('.cell.round')).toHaveText('round 1');
    await expect(r.locator('.cell.status')).toHaveText('in review');
  }
  // Slug and kind are distinct columns: the kind cell starts right of the slug cell, on the same line.
  const [s, k] = await Promise.all([rows.first().locator('.cell.slug').boundingBox(), rows.first().locator('.cell.kind').boundingBox()]);
  expect(k.x).toBeGreaterThanOrEqual(s.x + s.width);
  expect(Math.abs(k.y - s.y)).toBeLessThan(4);
  await rows.first().click();
  await expect(page).toHaveURL(d.url.replace('/plan', '/spec'));
  await expect(page.locator('.card h2')).toHaveText('About this document');
});

test('S38 a deleted word keeps a space on each side; a matrix cell\'s tone colours it with or without a tag', async ({ page }) => {
  const repo = mkRepo();
  const file = docPath(repo, 'spec');
  fs.writeFileSync(file, '# Demo\n\n## Contract\n\n- **S1** one\n- **S2** two\n');
  const v1 = {
    body: 'Keep the url и, the port and alpha beta gamma.',
    tldr: 'A delta epsilon zeta line.',
  };
  const matrix = {
    type: 'matrix',
    cols: ['A', 'B', 'C', 'D', 'E', 'F'],
    rows: [
      {
        label: 'Row',
        cells: [{ text: 'ok', tone: 'ok' }, { text: 'changed', tone: 'changed' }, { text: 'new', tone: 'new' }, { text: 'warn', tone: 'warn' }, { text: 'tagged', tag: 'T', tone: 'ok' }, { text: 'plain' }],
      },
    ],
  };
  const d = setup('spec', (b) => ({ ...en(b), ...(b.id === 'S1' ? v1 : {}), diagram: b.id === 'S2' ? matrix : null }), repo);
  const put = await fetch(`${d.api}/review`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ round: 1, blocks: { S1: { status: 'cm', comments: [{ quote: '', kind: 'change', text: 'Drop words.' }] }, S2: { status: 'ok' } } }) });
  expect(put.status).toBe(204);
  expect((await fetch(`${d.api}/submit`, { method: 'POST' })).status).toBe(200);
  fs.writeFileSync(file, '# Demo\n\n## Contract\n\n- **S1** one, shorter\n- **S2** two\n');
  for (const e of prepare(repo, 'spec')) write(e, e.id === 'summary' ? SUMMARY : { ...en(e), body: 'Keep the url, the port and alpha gamma.', tldr: 'A delta zeta line.' });
  open(repo, 'spec');

  await page.goto(d.url);
  await topic(page, 'S1').click();
  const dels = await card(page).evaluate((c) =>
    [...c.querySelectorAll('.body del, .tldr del')].map((del) => {
      const field = del.closest('.body, .tldr');
      const before = document.createRange();
      before.setStart(field, 0);
      before.setEndBefore(del);
      const after = document.createRange();
      after.setStartAfter(del);
      after.setEnd(field, field.childNodes.length);
      return { del: del.textContent, before: before.toString().slice(-1), after: after.toString().slice(0, 1) };
    }),
  );
  expect(dels.map((x) => x.del).sort()).toEqual(['beta', 'epsilon', 'и']);
  for (const x of dels) {
    expect(x.before, `before "${x.del}"`).toMatch(/^\s?$/);
    expect(x.after, `after "${x.del}"`).toMatch(/^\s?$/);
    expect(`${x.before}${x.after}`.length, `"${x.del}" inside the text`).toBe(2);
  }

  // The matrix: each tone has its own background, with or without a tag; a cell without tone keeps the plain one.
  for (const t of ['light', 'dark']) {
    await page.locator(`#themeSeg button[data-t="${t}"]`).click();
    await topic(page, 'S2').click();
    const bgs = await card(page).locator('.mx > div:not(.h):not(.r)').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    const [ok, changed, fresh, warn, tagged, plain] = bgs;
    expect(new Set([ok, changed, fresh, warn, plain]).size, `${t}: ${bgs.join(' | ')}`).toBe(5);
    expect(tagged, t).toBe(ok);
  }
});

test('S42 a link to a local file or anchor shows its label, never raw markdown; other schemes stay inert', async ({ page }) => {
  const body = 'Intent: [intent.md](intent.md), see [rows](#contract) and [bad](javascript:alert(1)).';
  const d = setup('spec', (b) => ({ ...en(b), body: b.id === 'S1' ? body : en(b).body, tldr: b.id === 'S1' ? 'See [the plan](plan.md).' : en(b).tldr }));
  await page.goto(d.url);
  await topic(page, 'S1').click();
  const c = card(page);
  await expect(c.locator('.body')).toContainText('Intent: intent.md, see rows and');
  await expect(c.locator('.body')).not.toContainText('](intent.md)');
  await expect(c.locator('.body .local-link').first()).toHaveAttribute('title', 'intent.md');
  await expect(c.locator('.body a')).toHaveCount(0);
  await expect(c.locator('.body')).toContainText('[bad](javascript:alert(1))');
  await expect(c.locator('.tldr')).toHaveText('See the plan.');
});
