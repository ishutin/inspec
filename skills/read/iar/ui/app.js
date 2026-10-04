// The review page: topic list, focus card, keyboard, approve, comments by selection or on the block, submit,
// 3 s polling, round switch, Reconnecting…, theme, narrow layout and diagrams (spec S10, S15–S23), and the
// document summary screen before the first block (S30–S32).
// Every display text goes through md.js and sits inside [data-content]; the chrome is English.
import { esc, inline, block, code } from './md.js';
import { diffInto } from './diff.js';
import { themeSwitch } from './theme.js';

const [token, slug, kind] = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
const API = `/${encodeURIComponent(token)}/api/${encodeURIComponent(slug)}/${encodeURIComponent(kind)}`;
const POLL_MS = 3000;
const RETRY_MS = 1500;
const KINDS = ['change', 'question', 'unclear'];
const LABEL = { new: 'Not reviewed', ok: 'Approved', cm: 'Has comments', chg: 'Changed' };
const PLACEHOLDER = { change: 'What should change?', question: 'Ask the agent; it answers, the document stays as is', unclear: 'What is hard to follow?' };

const $ = (id) => document.getElementById(id);

let doc = null; // the last payload adopted from the server
let review = null; // the page's working copy of doc.review
let seen = ''; // the last payload as received, to notice any change on the server (a drop, a prepare, a new round)
const SUM = -1; // `cur` on the summary screen
let cur = SUM;
const showSrc = new Set();
let online = true;
let sent = false;
let dirty = false; // local edits not yet sent
let sending = null;
let again = false;
let pop = null;
let ask = null; // the open confirm dialog
let timer = null;
let toastTimer = null;
let pushes = 0; // PUTs started: a poll that overlapped one reads again instead of taking a stale copy

// ---------- review model ----------
const own = (c) => c.round === undefined || c.round === doc.round;
const entry = (id) => (review.blocks[id] ||= { status: 'new', comments: [] });
const mine = (e) => e.comments.filter(own);
const canEdit = () => doc && online && !sent;
const onSum = () => cur === SUM;
// The summary takes comments only: no status, no approval, never counted in progress (S30, S31).
const sumEntry = () => (review.summary ||= { comments: [] });
const target = () => (onSum() ? sumEntry() : entry(doc.blocks[cur].id));
const disp = (b) => b.display || { section: b.section, group: null, title: b.id, tldr: '', body: '', check: null, flag: null, covers: [], diagram: null };

function nextOpen(i) {
  const bs = doc.blocks;
  for (let k = 1; k <= bs.length; k++) {
    const j = (i + k) % bs.length;
    if (entry(bs[j].id).status !== 'ok') return j;
  }
  return i;
}

function change() {
  dirty = true;
  render();
  push();
}

// Start review, and Enter on the summary: the first block not approved (the first block when all are).
function startReview() {
  if (!doc || !doc.blocks.length || ask) return;
  const j = nextOpen(SUM);
  cur = j === SUM ? 0 : j;
  closePop();
  render();
}

function approve() {
  if (onSum()) return startReview();
  if (!canEdit() || ask) return;
  const id = doc.blocks[cur].id;
  const e = entry(id);
  if (e.status === 'ok') {
    e.status = 'new';
    closePop();
    return change();
  }
  const yes = () => {
    if (!canEdit() || doc.blocks[cur]?.id !== id) return;
    // This round's comments go; earlier rounds' comments and their replies stay.
    e.comments = e.comments.filter((c) => !own(c));
    e.status = 'ok';
    cur = nextOpen(cur);
    change();
  };
  closePop();
  const n = mine(e).length;
  if (n) confirmBox(`Delete ${n} comment${n === 1 ? '' : 's'} and approve?`, yes);
  else yes();
}

// An in-page Yes/No dialog; Enter answers with the focused button (Yes first), Escape is No.
function confirmBox(text, onYes) {
  closeAsk();
  ask = document.createElement('div');
  ask.className = 'modal';
  ask.innerHTML = `<div role="dialog" aria-modal="true" aria-label="Confirm"><p class="q"></p><div class="actions"><button type="button" class="btn primary" data-ask="yes">Yes</button><button type="button" class="btn" data-ask="no">No</button></div></div>`;
  ask.querySelector('.q').textContent = text;
  ask.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-ask]');
    if (!t && ev.target !== ask) return;
    const ok = t && t.dataset.ask === 'yes';
    closeAsk();
    if (ok) onYes();
  });
  document.body.append(ask);
  ask.querySelector('[data-ask="yes"]').focus();
}

function closeAsk() {
  if (ask) ask.remove();
  ask = null;
}

function removeComment(k) {
  if (!canEdit()) return;
  const e = target();
  e.comments.splice(k, 1);
  if (!onSum() && !mine(e).length && e.status === 'cm') e.status = 'new';
  change();
}

// ---------- server ----------
function body() {
  const blocks = {};
  for (const b of doc.blocks) {
    const e = entry(b.id);
    blocks[b.id] = { status: e.status, comments: mine(e).map(({ id, quote, kind: k, text }) => ({ id, quote, kind: k, text })) };
  }
  const summary = { comments: mine(sumEntry()).map(({ id, quote, kind: k, text }) => ({ id, quote, kind: k, text })) };
  return JSON.stringify({ round: doc.round, blocks, summary });
}

function push() {
  if (sending) {
    again = true;
    return sending;
  }
  if (!dirty || !online || !doc) return Promise.resolve();
  dirty = false;
  pushes++;
  sending = fetch(`${API}/review`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: body() })
    .then((r) => {
      if (r.status === 400 || r.status === 409) {
        // The server's state wins (another round, or a block that is gone): take it at the next poll.
        seen = '';
        r.json().then((j) => toast(j.error || 'The review changed on the server'), () => {});
      } else if (!r.ok) throw new Error(String(r.status));
      // The server now holds this page's review, not the one last read: a later drop back to that one must still show.
      else seen = '';
    })
    .catch(() => {
      dirty = true;
      offline();
    })
    .finally(() => {
      sending = null;
      if (again) {
        again = false;
        push();
      }
    });
  return sending;
}

async function flush() {
  while (online && (sending || dirty)) await (sending || push());
}

function adopt(p, raw) {
  const wasSum = onSum();
  const id = doc && doc.blocks[cur] && doc.blocks[cur].id;
  const newRound = !doc || doc.round !== p.round;
  doc = p;
  seen = raw;
  review = structuredClone(p.review || { round: p.round, blocks: {} });
  sent = !!p.submitted;
  if (newRound) {
    dirty = false;
    showSrc.clear();
    closePop();
    closeAsk();
    // Every round opens on the summary, which from round 2 lists what changed (S30, S32).
    cur = SUM;
  } else if (!wasSum) {
    const i = p.blocks.findIndex((b) => b.id === id);
    cur = i >= 0 ? i : Math.max(0, Math.min(cur, p.blocks.length - 1));
  }
}

function offline() {
  if (!online) return;
  online = false;
  closePop();
  closeAsk();
  render();
}

async function poll() {
  clearTimeout(timer);
  const gen = pushes;
  try {
    const r = await fetch(`${API}/doc`, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const raw = await r.text();
    const p = JSON.parse(raw);
    const back = !online;
    online = true;
    const sameRound = doc && p.round === doc.round;
    if (sameRound && (dirty || sending || gen !== pushes)) {
      // Local edits go first; the server's copy is read again once they are sent.
      if (!sending) push();
      if (back) render();
    } else if (raw !== seen && !(sameRound && (pop || ask))) {
      adopt(p, raw);
      render();
    } else if (back) render();
  } catch {
    offline();
  }
  schedule();
}

function schedule() {
  clearTimeout(timer);
  if (document.visibilityState === 'visible') timer = setTimeout(poll, online ? POLL_MS : RETRY_MS);
}

async function submitReview() {
  if (!canEdit()) return;
  await flush();
  if (!online) return;
  let r;
  try {
    r = await fetch(`${API}/submit`, { method: 'POST' });
  } catch {
    return offline();
  }
  if (r.ok) {
    sent = true;
    render();
    return;
  }
  const j = await r.json().catch(() => ({}));
  toast(j.error || `Submit failed (${r.status})`);
  seen = '';
  poll();
}

// ---------- rendering ----------
function badge(e) {
  let t = LABEL[e.status] || LABEL.new;
  if (e.status === 'ok' && e.approvedRound && e.approvedRound < doc.round) t = `Approved in round ${e.approvedRound}`;
  if (e.status === 'chg' && e.wasApproved) t = 'Changed after approval';
  return `<span class="st ${esc(e.status)}">${t}</span>`;
}

// ---------- diagrams (S23) ----------
// Typed entries drawn as elements; every text goes through md.js `code`: backtick spans as code, the rest as text.
// A matrix's column count goes to CSS as --cols after render (the CSP allows no inline style attribute).
const TONE = { ok: 'ok', changed: 'chg', new: 'new', warn: 'cm' };
const DIAGRAMS = {
  flow: (g) =>
    `<ol class="flow">${g.steps.map((x) => `<li><div class="n${x.actor === 'you' ? ' you' : ''}"><b class="lb">${code(x.label)}</b>${code(x.text)}</div></li>`).join('')}</ol>${
      g.loop ? `<div class="note">↺ ${code(g.loop)}</div>` : ''
    }`,
  matrix: (g) =>
    `<div class="mx" data-cols="${g.cols.length}"><div class="h"></div>${g.cols.map((c) => `<div class="h">${code(c)}</div>`).join('')}${g.rows
      .map(
        (r) =>
          `<div class="r">${code(r.label)}</div>${r.cells
            .map((c) => `<div>${c.tag ? `<span class="st ${TONE[c.tone] || 'new'}">${code(c.tag)}</span><br>` : ''}${code(c.text)}</div>`)
            .join('')}`,
      )
      .join('')}</div>`,
  states: (g) =>
    `<div class="stt">${g.transitions.map((t) => `<span class="s">${code(t.from)}</span><span class="ar">→</span><span class="s">${code(t.to)}</span><span class="on">${code(t.on)}</span>`).join('')}</div>`,
  compare: (g) => `<div class="cmp"><div><b class="lb">${code(g.before.label)}</b>${code(g.before.text)}</div><div class="after"><b class="lb">${code(g.after.label)}</b>${code(g.after.text)}</div></div>`,
};

function diagram(g) {
  const draw = g && Object.hasOwn(DIAGRAMS, g.type) && DIAGRAMS[g.type];
  if (!draw) return '';
  let inner;
  try {
    inner = draw(g);
  } catch {
    return ''; // open checks the schema (S5); a broken entry shows the body alone
  }
  return `<figure class="dia" data-content data-type="${esc(g.type)}">${g.caption ? `<figcaption class="cap">${code(g.caption)}</figcaption>` : ''}${inner}${
    g.note ? `<div class="note">${code(g.note)}</div>` : ''
  }</figure>`;
}

function toc() {
  let section = null;
  let group = null;
  return `<a class="sum${onSum() ? ' cur' : ''}" data-id="summary"><span class="tt">Summary</span></a>${doc.blocks
    .map((b, i) => {
      const d = disp(b);
      let h = '';
      if (d.section !== section) {
        h += `<div class="tg" data-content>${inline(d.section)}</div>`;
        section = d.section;
        group = null;
      }
      // The label is the display entry's, in the display language (S35); the source's group only marks where a
      // group starts.
      if (b.group && b.group !== group && d.group) h += `<div class="tg2" data-content>${inline(d.group)}</div>`;
      group = b.group;
      return `${h}<a class="topic${i === cur ? ' cur' : ''}" data-id="${esc(b.id)}" data-i="${i}"><span class="dot ${esc(entry(b.id).status)}"></span><span class="tt" data-content>${inline(d.title)}</span>${d.flag ? '<span class="fl" title="Agent\'s decision">⚑</span>' : ''}</a>`;
    })
    .join('')}`;
}

// From round 2: every block whose hash changed since the last submit ("Changed", "Changed after approval") and
// every comment of that round with an agent reply, each a link to its block (S32). The summary's own answered
// comments show on this same screen, under it.
function changes() {
  if (doc.round < 2) return '';
  const K = doc.round - 1;
  const items = [];
  doc.blocks.forEach((b, i) => {
    const e = entry(b.id);
    const link = `<a data-go="${i}" data-content>${inline(disp(b).title)}</a>`;
    if (e.prevHash && e.prevHash !== b.hash) items.push(`<li>${link}<span class="st chg">${e.wasApproved ? 'Changed after approval' : 'Changed'}</span></li>`);
    for (const c of e.comments) {
      if (c.round === K && c.reply) {
        items.push(`<li>${link}<span class="why">answered</span><q data-content>${esc(c.text)}</q><div class="reply"><b>Agent</b> <span data-content>${esc(c.reply)}</span></div></li>`);
      }
    }
  });
  return `<div class="changes"><span class="lab">Changed since round ${K}</span>${items.length ? `<ul>${items.join('')}</ul>` : `<p>No block changed and no comment was answered.</p>`}</div>`;
}

function summaryCard() {
  const s = (doc.summary && doc.summary.display) || { tldr: '', body: '', diagram: null };
  const off = canEdit() ? '' : ' disabled';
  const left = doc.blocks.filter((x) => entry(x.id).status !== 'ok').length;
  return `<div class="stage">
  ${sent ? '<div class="notice" id="notice"><b>Review sent.</b> Waiting for the session to read it; this tab switches to the next round when it is ready.</div>' : ''}
  <div class="card sum" data-block="summary">
    <div class="hd"><span class="tag">Summary · ${doc.blocks.length} block${doc.blocks.length === 1 ? '' : 's'}</span></div>
    <h2>About this document</h2>
    ${s.tldr ? `<div class="tldr" data-content data-sel="summary">${inline(s.tldr)}</div>` : ''}
    ${s.body ? `<div class="body" data-content data-sel="summary">${block(s.body)}</div>` : ''}
    ${diagram(s.diagram)}
    ${changes()}
    ${comments(sumEntry())}
    <div class="actions">
      <button class="btn primary" data-act="start">Start review <span class="kbd">↵</span></button>
      <button class="btn" data-act="comment"${off}>Comment on document <span class="kbd">C</span></button>
    </div>
  </div>
  <div class="nav"><span><span class="kbd">↵</span> start review · <span class="kbd">C</span> comment</span><span>${left} left</span></div>
</div>`;
}

function comments(e) {
  if (!e.comments.length) return '';
  const items = e.comments.map((c, k) => {
    const del = own(c) ? `<button class="x" data-act="del" data-k="${k}"${canEdit() ? '' : ' disabled'}>remove</button>` : '';
    const quote = c.quote ? `<q data-content>${esc(c.quote)}</q>` : '';
    const reply = c.reply ? `<div class="reply"><b>Agent</b> <span data-content>${esc(c.reply)}</span></div>` : '';
    return `<div class="cmt${own(c) ? '' : ' old'}">${del}${quote}<span class="k">${esc(c.kind)}</span><span data-content>${esc(c.text)}</span>${reply}</div>`;
  });
  return `<div class="cmts">${items.join('')}</div>`;
}

function focusCard() {
  if (onSum()) return summaryCard();
  const bs = doc.blocks;
  const b = bs[cur];
  const d = disp(b);
  const e = entry(b.id);
  const id = esc(b.id);
  const covers = Array.isArray(d.covers) ? d.covers : [];
  const meta =
    d.check || covers.length
      ? `<div class="meta">${d.check ? `<span class="ck" data-content data-sel="${id}">${inline(d.check)}</span>` : ''}${
          covers.length ? `<span class="cv">covers ${covers.map((c) => `<b data-content title="${esc(c.text)}">${esc(c.id)}</b>`).join(' ')}</span>` : ''
        }</div>`
      : '';
  const off = canEdit() ? '' : ' disabled';
  const ok = e.status === 'ok';
  const left = bs.filter((x) => entry(x.id).status !== 'ok').length;
  return `<div class="stage">
  ${sent ? '<div class="notice" id="notice"><b>Review sent.</b> Waiting for the session to read it; this tab switches to the next round when it is ready.</div>' : ''}
  <div class="card" data-block="${id}">
    <div class="hd"><span class="tag"><span data-content>${inline(d.section)}</span> · ${cur + 1} of ${bs.length}</span>${badge(e)}</div>
    <h2 data-content>${inline(d.title)}</h2>
    ${d.tldr ? `<div class="tldr" data-content data-sel="${id}">${inline(d.tldr)}</div>` : ''}
    ${d.flag ? `<div class="flag"><span class="lab">⚑ Agent's decision</span><span data-content data-sel="${id}">${inline(d.flag)}</span></div>` : ''}
    ${d.body ? `<div class="body" data-content data-sel="${id}">${block(d.body)}</div>` : ''}
    ${diagram(d.diagram)}
    ${meta}
    ${showSrc.has(b.id) ? `<div class="src" data-content><span class="lab">Source</span><div class="md">${block(b.source)}</div></div>` : ''}
    ${comments(e)}
    <div class="actions">
      <button class="btn ${ok ? 'ok' : 'primary'}" data-act="approve"${off}>${ok ? '✓ Approved' : 'Approve'} <span class="kbd">↵</span></button>
      <button class="btn" data-act="comment"${off}>Comment on block <span class="kbd">C</span></button>
      <button class="linkish" data-act="source">${showSrc.has(b.id) ? 'Hide source' : 'Show source'}</button>
    </div>
  </div>
  <div class="nav"><span><span class="kbd">↑</span> <span class="kbd">↓</span> move · <span class="kbd">↵</span> approve · <span class="kbd">C</span> comment</span><span>${left} left</span></div>
</div>`;
}

function header() {
  const bs = doc.blocks;
  const n = bs.length || 1;
  const count = (s) => bs.filter((b) => entry(b.id).status === s).length;
  const ok = count('ok');
  const cm = count('cm');
  const pending = count('new') + count('chg');
  const notes = bs.reduce((a, b) => a + mine(entry(b.id)).length, mine(sumEntry()).length);
  $('docname').textContent = `${slug} · ${kind}.md`;
  $('round').textContent = `Round ${doc.round}`;
  $('barOk').style.width = `${(ok / n) * 100}%`;
  $('barCm').style.width = `${(cm / n) * 100}%`;
  $('ptext').textContent = `${ok}/${bs.length} approved${cm ? ` · ${cm} with comments` : ''}`;
  const s = $('submit');
  s.textContent = sent ? 'Sent' : pending ? `${pending} to review` : notes ? `Send ${notes} comment${notes === 1 ? '' : 's'}` : 'Approve document';
  s.disabled = sent || !online || pending > 0;
}

function banner() {
  const el = $('banner');
  el.hidden = online;
  if (!online) {
    el.innerHTML = `<b>Reconnecting…</b><span>The review server does not answer. Run <code>/inspec:read ${esc(slug)} ${esc(kind)}</code> in the session to start it again.</span>`;
  }
}

function render() {
  document.title = `inspec review · ${slug} · ${kind}`;
  banner();
  if (!doc) {
    $('submit').disabled = true;
    return;
  }
  const list = document.querySelector('.F .toc');
  const scroll = list ? [list.scrollTop, list.scrollLeft] : [0, 0];
  $('app').innerHTML = doc.blocks.length ? `<div class="F"><nav class="toc">${toc()}</nav>${focusCard()}</div>` : '<p class="loading">This document has no blocks.</p>';
  const nav = document.querySelector('.F .toc');
  if (nav) {
    [nav.scrollTop, nav.scrollLeft] = scroll;
    const c = nav.querySelector('a.cur');
    if (c) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  for (const mx of document.querySelectorAll('.card .mx[data-cols]')) mx.style.setProperty('--cols', mx.dataset.cols);
  diffs();
  highlight();
  header();
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 5000);
}

// ---------- round-2 diff (S13) ----------
// A block whose hash changed since the last submit shows its summary, body and check as a word diff against its
// display at that submit; the title and the diagram show the new version only.
function diffs() {
  const b = doc.blocks[cur];
  const c = document.querySelector('.card');
  if (!b || !c || !b.prevDisplay || !b.display) return;
  const p = b.prevDisplay;
  for (const [sel, html] of [['.tldr', inline(p.tldr || '')], ['.body', block(p.body || '')], ['.meta .ck', inline(p.check || '')]]) {
    const el = c.querySelector(sel);
    if (el) diffInto(el, html);
  }
}

// ---------- quote highlight ----------
// Marks each comment's quote in the first [data-sel] field holding it. A quote may span elements (bold, code)
// and its whitespace may differ from the text nodes' (a selection across lines), so both are compared collapsed.
function highlight() {
  const c = document.querySelector('.card');
  if (!c || (!onSum() && !doc.blocks[cur])) return;
  const fields = [...c.querySelectorAll('[data-sel]')];
  for (const cm of target().comments) {
    const q = (cm.quote || '').replace(/\s+/g, ' ').trim();
    if (q) fields.some((el) => paint(el, q, own(cm)));
  }
}

function paint(el, q, mineToo) {
  const nodes = [];
  // Deleted words of a diff (S13) are not part of the text a quote was taken from.
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('del') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let n; (n = w.nextNode()); ) nodes.push(n);
  // The collapsed text, with each of its characters' node and offset.
  let text = '';
  const where = [];
  let space = true;
  for (const n of nodes) {
    for (let k = 0; k < n.data.length; k++) {
      const ch = n.data[k];
      if (/\s/.test(ch)) {
        if (space) continue;
        space = true;
        text += ' ';
      } else {
        space = false;
        text += ch;
      }
      where.push([n, k]);
    }
  }
  const at = text.indexOf(q);
  if (at < 0) return false;
  const [n0, k0] = where[at];
  const [n1, k1] = where[at + q.length - 1];
  // Wrap the matched part of each text node, last first so earlier offsets stay valid.
  const parts = [];
  for (let i = nodes.indexOf(n0); i <= nodes.indexOf(n1); i++) {
    const n = nodes[i];
    const a = n === n0 ? k0 : 0;
    const b = n === n1 ? k1 + 1 : n.data.length;
    if (b > a && n.data.slice(a, b).trim()) parts.push([n, a, b]);
  }
  for (const [n, a, b] of parts.reverse()) {
    const r = document.createRange();
    r.setStart(n, a);
    r.setEnd(n, b);
    const m = document.createElement('mark');
    m.className = mineToo ? 'cm' : 'cm old';
    r.surroundContents(m);
  }
  return true;
}

// ---------- selection → Comment ----------
// The selection must lie in one [data-sel] field of the focused card.
function selectionQuote() {
  const s = getSelection();
  if (!s || s.isCollapsed || !s.rangeCount) return null;
  const q = s.toString().replace(/\s+/g, ' ').trim();
  if (!q) return null;
  const field = (n) => (n && (n.nodeType === 3 ? n.parentElement : n))?.closest('.card [data-sel]');
  const el = field(s.anchorNode);
  if (!el || el !== field(s.focusNode)) return null;
  return { quote: q, rect: s.getRangeAt(0).getBoundingClientRect() };
}

function offerComment() {
  if (!canEdit() || ask || (pop && !pop.sel)) return;
  const sel = selectionQuote();
  if (!sel) {
    if (pop && pop.sel) closePop();
    return;
  }
  closePop();
  pop = document.createElement('div');
  pop.className = 'pop sel';
  pop.sel = true;
  pop.innerHTML = '<button type="button" class="btn primary">Comment</button>';
  place(pop, sel.rect);
  document.body.append(pop);
  // mousedown, not click: the selection would collapse first.
  pop.firstChild.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation(); // the document's mousedown would close the box this opens
    openComment(sel.quote, sel.rect);
  });
  pop.firstChild.addEventListener('click', () => openComment(sel.quote, sel.rect));
}

function place(el, r) {
  el.style.left = `${Math.max(8, Math.min(r.left + scrollX, scrollX + innerWidth - 310))}px`;
  el.style.top = `${r.bottom + scrollY + 6}px`;
}

// ---------- comment box ----------
function closePop() {
  if (pop) pop.remove();
  pop = null;
}

function openComment(quote = '', rect = null) {
  if (!canEdit() || ask) return;
  closePop();
  const id = onSum() ? 'summary' : doc.blocks[cur].id;
  const r = rect || document.querySelector('.card [data-act="comment"]').getBoundingClientRect();
  let k = 'change';
  pop = document.createElement('div');
  pop.className = 'pop';
  pop.innerHTML = `${quote ? `<div class="pq" data-content>“${esc(quote)}”</div>` : ''}<div class="kinds">${KINDS.map((x) => `<button type="button" data-k="${x}" class="${x === k ? 'on' : ''}">${x}</button>`).join('')}</div><textarea data-content placeholder="${PLACEHOLDER[k]}"></textarea><div class="actions"><button type="button" class="btn primary" data-pop="save">Save</button><button type="button" class="btn" data-pop="cancel">Cancel</button></div>`;
  place(pop, r);
  document.body.append(pop);
  getSelection().removeAllRanges();
  const ta = pop.querySelector('textarea');
  ta.focus();
  pop.addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.k) {
      k = t.dataset.k;
      ta.placeholder = PLACEHOLDER[k];
      for (const b of pop.querySelectorAll('.kinds button')) b.classList.toggle('on', b.dataset.k === k);
      ta.focus();
    } else if (t.dataset.pop === 'cancel') closePop();
    else if (t.dataset.pop === 'save') save();
  });
  const save = () => {
    const text = ta.value.trim();
    if (!text || !canEdit()) return;
    const e = id === 'summary' ? sumEntry() : entry(id);
    e.comments.push({ quote, kind: k, text, round: doc.round });
    if (id !== 'summary') e.status = 'cm';
    closePop();
    change();
  };
  pop.save = save;
}

// ---------- events ----------
function move(step) {
  if (!doc || !doc.blocks.length) return;
  cur = Math.max(SUM, Math.min(doc.blocks.length - 1, cur + step));
  closePop();
  render();
}

document.addEventListener('click', (ev) => {
  if (!doc) return;
  const t = ev.target.closest('.F .toc a.topic, .F .toc a.sum, .card [data-act], .card [data-go]');
  if (!t) return;
  if (t.matches('a.topic, a.sum, [data-go]')) {
    cur = t.matches('a.sum') ? SUM : Number(t.dataset.i ?? t.dataset.go);
    closePop();
    render();
    return;
  }
  const act = t.dataset.act;
  if (act === 'approve') approve();
  else if (act === 'start') startReview();
  else if (act === 'comment') openComment();
  else if (act === 'source') {
    const id = doc.blocks[cur].id;
    if (showSrc.has(id)) showSrc.delete(id);
    else showSrc.add(id);
    render();
  } else if (act === 'del') removeComment(Number(t.dataset.k));
});

document.addEventListener('mousedown', (ev) => {
  if (pop && !pop.contains(ev.target) && !ev.target.closest('[data-act="comment"]')) closePop();
});

// The mouse offers "Comment" on release; a touch or keyboard selection once it rests.
let pressing = false;
let selTimer = null;
document.addEventListener('mousedown', () => (pressing = true), true);
document.addEventListener('mouseup', (ev) => {
  pressing = false;
  if (!doc || (pop && pop.contains(ev.target))) return;
  setTimeout(offerComment);
});
document.addEventListener('selectionchange', () => {
  clearTimeout(selTimer);
  if (doc && !pressing) selTimer = setTimeout(offerComment, 350);
});

document.addEventListener('keydown', (ev) => {
  if (!doc) return;
  if (ask) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeAsk();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      (ask.contains(document.activeElement) && document.activeElement.closest('[data-ask]') ? document.activeElement : ask.querySelector('[data-ask="yes"]')).click();
    } else if (ev.key !== 'Tab') ev.preventDefault();
    return;
  }
  if (pop && pop.contains(ev.target)) {
    if (ev.key === 'Escape') closePop();
    else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      pop.save();
    }
    return;
  }
  if (ev.key === 'Escape' && pop) return closePop();
  if (ev.shiftKey && ev.key.startsWith('Arrow')) return; // extends a selection
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.target.closest && ev.target.closest('input, textarea, select, [contenteditable]')) return;
  if (ev.key === 'ArrowDown' || ev.code === 'KeyJ') {
    ev.preventDefault();
    move(1);
  } else if (ev.key === 'ArrowUp' || ev.code === 'KeyK') {
    ev.preventDefault();
    move(-1);
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    approve();
  } else if (ev.code === 'KeyC') {
    ev.preventDefault();
    openComment();
  }
});

$('submit').addEventListener('click', submitReview);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') poll();
  else clearTimeout(timer);
});

themeSwitch();
render();
poll();
