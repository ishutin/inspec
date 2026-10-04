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

// [{node, at, text}] for every run of non-space characters.
function words(root) {
  const out = [];
  for (const node of textNodes(root)) for (const m of node.data.matchAll(/\S+/g)) out.push({ node, at: m.index, text: m[0] });
  return out;
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
  const a = words(tmp).map((w) => w.text);
  const bw = words(el);
  if (a.length * bw.length > MAX_CELLS) return;
  const ops = lcs(a, bw.map((w) => w.text));
  // Each edit: wrap a new word, or put deleted words before a new word (or after the last one).
  const edits = [];
  let gone = [];
  for (const o of ops) {
    if (o.op === '-') {
      gone.push(a[o.i]);
      continue;
    }
    const w = bw[o.j];
    if (gone.length) edits.push({ node: w.node, at: w.at, del: gone.join(' ') });
    gone = [];
    if (o.op === '+') edits.push({ node: w.node, at: w.at, end: w.at + w.text.length });
  }
  if (gone.length) {
    const last = bw[bw.length - 1];
    if (last) edits.push({ node: last.node, at: last.at + last.text.length, del: gone.join(' '), after: true });
    else el.append(mark('del', gone.join(' ')));
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
        r.insertNode(mark('del', e.del));
      } else {
        r.setStart(node, e.at);
        r.setEnd(node, e.end);
        r.surroundContents(document.createElement('ins'));
      }
    }
  }
}

function mark(tag, text) {
  const m = document.createElement(tag);
  m.textContent = text;
  return m;
}
