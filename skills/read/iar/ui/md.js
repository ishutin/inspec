// The page's one markdown renderer (S17, S22): display fields and Show source both go through it.
// Everything is escaped first, so raw HTML, scripts and any <…> stay text; only the forms below become elements.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const CODE_SPAN = /(`+)([\s\S]*?[^`])\1(?!`)/g;
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s()<>"']+)\)/g;

function emphasis(s) {
  return s
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, '$1<strong>$2</strong>')
    .replace(/\*(?=[^\s*])([^*]*?[^\s*])\*/g, '<em>$1</em>')
    .replace(/(^|[^\p{L}\p{N}_])_(?=[^\s_])([^_]*?[^\s_]|[^\s_])_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>');
}

// The inline part: code spans, http(s) links, bold and italic. Used alone for tldr, title, check and flag.
export function inline(src) {
  const held = [];
  const hold = (html) => `\u0000${held.push(html) - 1}\u0000`;
  let s = String(src ?? '').replace(/\u0000/g, '');
  s = s.replace(CODE_SPAN, (_, _ticks, code) => hold(`<code>${esc(code.length > 2 && code.startsWith(' ') && code.endsWith(' ') ? code.slice(1, -1) : code)}</code>`));
  s = esc(s);
  s = s.replace(LINK, (_, label, url) => hold(`<a href="${url}" target="_blank" rel="noopener noreferrer">${emphasis(label)}</a>`));
  s = emphasis(s);
  while (s.includes('\u0000')) s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => held[i]);
  return s;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const QUOTE = /^ {0,3}>/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const lead = (l) => l.length - l.trimStart().length;
const isTable = (lines, i) => lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') && TABLE_SEP.test(lines[i + 1]);
const opens = (lines, i) => FENCE.test(lines[i]) || HEADING.test(lines[i]) || ITEM.test(lines[i]) || QUOTE.test(lines[i]) || isTable(lines, i);

// Splits a table row on pipes outside code spans; `\|` is a literal pipe.
function cells(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const out = [];
  let cell = '';
  let ticks = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\' && t[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (c === '`') {
      let n = 1;
      while (t[i + n] === '`') n++;
      ticks = ticks === 0 ? n : ticks === n ? 0 : ticks;
      cell += '`'.repeat(n);
      i += n - 1;
    } else if (c === '|' && !ticks) {
      out.push(cell.trim());
      cell = '';
    } else cell += c;
  }
  out.push(cell.trim());
  return out;
}

function list(lines, i, out) {
  const first = ITEM.exec(lines[i]);
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let loose = false;
  while (i < lines.length) {
    const m = ITEM.exec(lines[i]);
    if (!m || m[1].length !== indent || /\d/.test(m[2]) !== ordered) break;
    const content = [m[3]];
    const cont = indent + m[2].length + 1;
    i++;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) {
        let j = i;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length && lead(lines[j]) > indent) {
          content.push('');
          i++;
          continue;
        }
        const next = j < lines.length && ITEM.exec(lines[j]);
        if (next && next[1].length === indent && /\d/.test(next[2]) === ordered) loose = true;
        i = j;
        break;
      }
      if (lead(l) > indent) content.push(l.slice(Math.min(lead(l), cont)));
      else if (!opens(lines, i)) content.push(l.trim());
      else break;
      i++;
    }
    if (content.slice(0, -1).includes('')) loose = true;
    items.push(content);
  }
  const tag = ordered ? 'ol' : 'ul';
  const start = ordered ? parseInt(first[2], 10) : 1;
  const html = items.map((c) => {
    const inner = render(c);
    return `<li>${loose ? inner : inner.replace(/^<p>([\s\S]*?)<\/p>/, '$1')}</li>`;
  });
  out.push(`<${tag}${start !== 1 ? ` start="${start}"` : ''}>${html.join('')}</${tag}>`);
  return i;
}

function render(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    let m;
    if (!l.trim()) {
      i++;
    } else if ((m = FENCE.exec(l))) {
      const body = [];
      const close = new RegExp(`^ {0,3}${m[1][0] === '`' ? '`' : '~'}{${m[1].length},}\\s*$`);
      for (i++; i < lines.length && !close.test(lines[i]); i++) body.push(lines[i]);
      i++;
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
    } else if ((m = HEADING.exec(l))) {
      const n = Math.min(6, m[1].length + 2);
      out.push(`<h${n}>${inline(m[2])}</h${n}>`);
      i++;
    } else if (isTable(lines, i)) {
      const head = cells(l);
      const rows = [];
      for (i += 2; i < lines.length && lines[i].trim() && lines[i].includes('|'); i++) rows.push(cells(lines[i]));
      const row = (r, tagName) => `<tr>${head.map((_, k) => `<${tagName}>${inline(r[k] ?? '')}</${tagName}>`).join('')}</tr>`;
      out.push(`<table><thead>${row(head, 'th')}</thead><tbody>${rows.map((r) => row(r, 'td')).join('')}</tbody></table>`);
    } else if (ITEM.test(l)) {
      i = list(lines, i, out);
    } else if (QUOTE.test(l)) {
      const inner = [];
      for (; i < lines.length && QUOTE.test(lines[i]); i++) inner.push(lines[i].replace(/^ {0,3}> ?/, ''));
      out.push(`<blockquote>${render(inner)}</blockquote>`);
    } else {
      const para = [l.trim()];
      for (i++; i < lines.length && lines[i].trim() && !opens(lines, i); i++) para.push(lines[i].trim());
      out.push(`<p>${inline(para.join('\n'))}</p>`);
    }
  }
  return out.join('');
}

// Block markdown: paragraphs, headings, `-` and `1.` lists, fenced code, pipe tables, quotes, and the inline part.
export function block(src) {
  return render(String(src ?? '').replace(/\r/g, '').split('\n'));
}
