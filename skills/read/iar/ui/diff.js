// Word diff (LCS) of a rendered field against its display at the last submit (spec S13).
// Both versions are rendered by md.js first; the diff then marks words in the new field's text nodes, so the
// markup (paragraphs, lists, code) is the new version's and only the words are compared.
const MAX_CELLS = 4e6; // a longer pair is shown without marks rather than freezing the tab

function textNodes(root) {
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode()); ) out.push(n);
  return out;
}

// A word is a number written in groups of three (10 000, 10\u00a0000), a run of letters and digits, or one other
// visible character, so punctuation next to a changed word stays unmarked.
const WORD = /\p{N}{1,3}(?:[ \u00a0\u202f]\p{N}{3})+(?![\p{L}\p{N}_])|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

// [{node, at, end, text}] for every word of the field.
function words(root) {
  const out = [];
  for (const node of textNodes(root)) for (const m of node.data.matchAll(WORD)) out.push({ node, at: m.index, end: m.index + m[0].length, text: m[0] });
  return out;
}

// The old text of a run of deleted words, with its own spacing where the words share a text node.
function oldText(run) {
  let t = '';
  run.forEach((w, k) => {
    const p = run[k - 1];
    t += !p ? w.text : p.node === w.node ? w.node.data.slice(p.end, w.end) : ` ${w.text}`;
  });
  return t;
}

// Edit script turning a into b: [{op: '=' | '-' | '+', i?, j?}] in order.
export function lcs(a, b) {
  const n = a.length;
  const m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) ops.push({ op: '=', i: i++, j: j++ });
    else if (L[i + 1][j] >= L[i][j + 1]) ops.push({ op: '-', i: i++ });
    else ops.push({ op: '+', j: j++ });
  }
  while (i < n) ops.push({ op: '-', i: i++ });
  while (j < m) ops.push({ op: '+', j: j++ });
  return ops;
}

// Marks el (the new field, rendered) against oldHtml (the old field, rendered): inserted words in <ins>,
// deleted words as <del> where they stood.
export function diffInto(el, oldHtml) {
  const tmp = document.createElement('div');
  tmp.innerHTML = oldHtml;
  const aw = words(tmp);
  const bw = words(el);
  if (aw.length * bw.length > MAX_CELLS) return;
  const ops = lcs(aw.map((w) => w.text), bw.map((w) => w.text));
  // Each edit: wrap a run of new words of one text node in <ins>, or put deleted words before a new word (or
  // after the last one).
  const edits = [];
  let gone = [];
  let ins = null;
  for (const o of ops) {
    if (o.op === '-') {
      gone.push(aw[o.i]);
      continue;
    }
    const w = bw[o.j];
    if (gone.length) {
      edits.push({ node: w.node, at: w.at, del: oldText(gone) });
      ins = null;
    }
    gone = [];
    if (o.op === '=') ins = null;
    else if (ins && ins.node === w.node) ins.end = w.end;
    else edits.push((ins = { node: w.node, at: w.at, end: w.end }));
  }
  if (gone.length) {
    const last = bw[bw.length - 1];
    if (last) edits.push({ node: last.node, at: last.end, del: oldText(gone) });
    else el.append(mark('del', oldText(gone)));
  }
  const byNode = new Map();
  for (const e of edits) (byNode.get(e.node) || byNode.set(e.node, []).get(e.node)).push(e);
  for (const [node, list] of byNode) {
    // Last first, so earlier offsets stay valid; at one offset the word is wrapped before the del goes in front.
    list.sort((x, y) => y.at - x.at || (x.del ? 1 : -1));
    for (const e of list) {
      const r = document.createRange();
      if (e.del) {
        r.setStart(node, Math.min(e.at, node.data.length));
        r.collapse(true);
        r.insertNode(spaced(el, r, mark('del', e.del)));
      } else {
        r.setStart(node, e.at);
        r.setEnd(node, e.end);
        r.surroundContents(document.createElement('ins'));
      }
    }
  }
}

// The deleted words with a space on each side where their neighbours have none (S38): "url и," reads "url и ,",
// never "urlи,". The spaces are spans of class `ds`, which the quote highlight skips like the deleted words.
function spaced(el, at, del) {
  const before = document.createRange();
  before.setStart(el, 0);
  before.setEnd(at.startContainer, at.startOffset);
  const after = document.createRange();
  after.setStart(at.startContainer, at.startOffset);
  after.setEnd(el, el.childNodes.length);
  const space = () => mark('span', ' ', 'ds');
  const f = document.createDocumentFragment();
  if (/\S$/.test(before.toString())) f.append(space());
  f.append(del);
  if (/^\S/.test(after.toString())) f.append(space());
  return f;
}

function mark(tag, text, cls) {
  const m = document.createElement(tag);
  if (cls) m.className = cls;
  m.textContent = text;
  return m;
}
