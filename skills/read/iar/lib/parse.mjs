// Split rules and block hash (spec: Architecture › Split rules).
import { createHash } from 'node:crypto';

const ID_HEADING = /^## ([A-Z][0-9]+)\b/;
const ID_ITEM = /^- \*\*([A-Z][0-9]+)\b/;
const FENCE = /^\s*(```|~~~)/;

export function hash(source) {
  const lines = source.replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 12);
}

// The document summary's hash (S29): sha256 over the block hashes in order, one per line, first 12 hex.
export const summaryHash = (hashes) => createHash('sha256').update(hashes.join('\n')).digest('hex').slice(0, 12);

export function slugify(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'section';
}

function trimBlank(lines) {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
}

// Returns {blocks:[{id, section, group, source, hash}]}; throws when the document has no `##` section.
export function split(text) {
  let lines = text.replace(/\r/g, '').split('\n');
  if (lines[0].trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) lines = lines.slice(end + 1);
  }

  // Cut into the preamble and `##` sections, ignoring headings inside fences.
  const preamble = [];
  const sections = [];
  let fence = false;
  for (const line of lines) {
    if (FENCE.test(line)) fence = !fence;
    if (!fence && line.startsWith('## ')) sections.push({ heading: line, lines: [] });
    else (sections.length ? sections[sections.length - 1].lines : preamble).push(line);
  }
  if (!sections.length) throw new Error('no "##" section');

  const blocks = [];
  const seen = new Map();
  const unique = (id) => {
    const n = (seen.get(id) || 0) + 1;
    seen.set(id, n);
    return n === 1 ? id : `${id}-${n}`;
  };
  const add = (id, section, group, src) => {
    const source = src.join('\n');
    blocks.push({ id: unique(id), section, group, source, hash: hash(source) });
  };

  const titleSkipped = [...preamble];
  const h1 = titleSkipped.findIndex((l) => l.trim());
  if (h1 >= 0 && titleSkipped[h1].startsWith('# ')) titleSkipped.splice(h1, 1);
  const overview = trimBlank(titleSkipped);
  if (overview.length) add('overview', 'Overview', null, overview);

  for (const sec of sections) {
    const name = sec.heading.slice(3).trim();
    const token = ID_HEADING.exec(sec.heading);
    const secId = token ? token[1] : slugify(name);
    const parts = []; // {type:'prose'|'item'|'sub', lines, id?}
    let cur = null;
    fence = false;
    const ls = sec.lines;
    for (let i = 0; i < ls.length; i++) {
      const line = ls[i];
      const opensFence = FENCE.test(line);
      if (!fence && line.startsWith('### ')) {
        cur = { type: 'sub', lines: [line], name: line.slice(4).trim() };
        parts.push(cur);
      } else if (!fence && cur?.type !== 'sub' && ID_ITEM.test(line)) {
        cur = { type: 'item', lines: [line], id: ID_ITEM.exec(line)[1] };
        parts.push(cur);
      } else if (cur?.type === 'item' && !fence && !/^\s/.test(line) && line.trim()) {
        cur = { type: 'prose', lines: [line] };
        parts.push(cur);
      } else if (cur?.type === 'item' && !fence && !line.trim()) {
        // A blank line stays in the item only when indented continuation follows it.
        let j = i;
        while (j < ls.length && !ls[j].trim()) j++;
        if (j < ls.length && /^\s/.test(ls[j])) cur.lines.push(line);
        else {
          cur = { type: 'prose', lines: [line] };
          parts.push(cur);
        }
      } else if (cur) cur.lines.push(line);
      else {
        cur = { type: 'prose', lines: [line] };
        parts.push(cur);
      }
      if (opensFence) fence = !fence;
    }

    const hasItems = parts.some((p) => p.type === 'item');
    let group = null;
    let prose = 0;
    let first = true;
    const emit = (id, src) => {
      const body = trimBlank(src);
      add(id, name, group, first ? (body.length ? [sec.heading, '', ...body] : [sec.heading]) : body);
      first = false;
    };
    for (const p of parts) {
      const body = trimBlank(p.lines);
      if (p.type === 'item') emit(p.id, body);
      else if (p.type === 'sub') {
        group = null;
        emit(`${secId}/${slugify(p.name)}`, body);
      } else if (!body.length) continue;
      else if (hasItems && body.length === 1 && body[0].trimEnd().endsWith(':')) {
        group = body[0].trimEnd().replace(/:$/, '');
      } else {
        group = null;
        prose++;
        emit(prose === 1 ? secId : `${secId}-${prose}`, body);
      }
    }
    if (first) emit(secId, []);
  }
  return { blocks };
}
