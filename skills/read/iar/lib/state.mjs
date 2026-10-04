// State directory, rounds and review (spec: Architecture › State, Rounds).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { split } from './parse.mjs';

export const KINDS = ['intent', 'spec', 'plan'];
export const COMMENT_KINDS = ['change', 'question', 'unclear'];
export const STATUSES = ['new', 'ok', 'cm', 'chg'];
const SLUG = /^[a-z0-9][a-z0-9._-]*$/i;
const LANG = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/;

export class UsageError extends Error {}

export function parseId(id) {
  const m = /^([^/]+)\/([^/]+)$/.exec(id || '');
  if (!m || !SLUG.test(m[1]) || m[1].includes('..') || !KINDS.includes(m[2])) {
    throw new UsageError(`--id must be <slug>/<intent|spec|plan>, got "${id ?? ''}"`);
  }
  return { slug: m[1], kind: m[2] };
}

export function checkLang(lang) {
  if (!LANG.test(lang || '')) throw new UsageError(`--lang must be a language tag such as en or ru, got "${lang ?? ''}"`);
  return lang;
}

// <git-common-dir>/inspec-read, shared by every worktree of the repository.
export function rootDir(cwd = process.cwd()) {
  let out;
  try {
    out = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    throw new UsageError('not inside a git repository (git rev-parse --git-common-dir failed)');
  }
  return path.join(path.resolve(cwd, out.trim()), 'inspec-read');
}

export const docDir = (root, slug, kind) => path.join(root, slug, kind);
export const displayPath = (dir, hash, lang) => path.join(dir, 'display', `${hash}.${lang}.json`);

export function readJSON(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
  fs.renameSync(tmp, file);
}

const freshEntry = (hash) => ({ status: 'new', hash, approvedRound: null, prevHash: null, wasApproved: false, comments: [] });

// Splits the document into dir/blocks.json and dir/review.json; returns the blocks lacking a display for lang.
export function prepare(mdPath, { slug, kind, lang, cwd }) {
  if (!fs.existsSync(mdPath) || !fs.statSync(mdPath).isFile()) throw new UsageError(`no such file: ${mdPath}`);
  const base = path.basename(mdPath, path.extname(mdPath));
  if (base !== kind) throw new UsageError(`--id kind "${kind}" differs from the file's base name "${base}"`);
  let blocks;
  try {
    ({ blocks } = split(fs.readFileSync(mdPath, 'utf8')));
  } catch (e) {
    throw new UsageError(`${mdPath}: ${e.message}`);
  }
  const root = rootDir(cwd);
  const dir = docDir(root, slug, kind);

  const result = readJSON(path.join(dir, 'result.json'));
  const old = readJSON(path.join(dir, 'review.json'));
  let round = readJSON(path.join(dir, 'blocks.json'))?.round || 1;
  if (result && result.round >= round) round = result.round + 1;

  const review = { round, blocks: {} };
  for (const b of blocks) {
    const prev = old && old.round === round ? old.blocks[b.id] : null;
    review.blocks[b.id] = prev && prev.hash === b.hash ? prev : freshEntry(b.hash);
  }
  writeJSON(path.join(dir, 'blocks.json'), { doc: slug, kind, lang, round, blocks });
  writeJSON(path.join(dir, 'review.json'), review);

  return blocks
    .filter((b) => !fs.existsSync(displayPath(dir, b.hash, lang)))
    .map((b) => ({ id: b.id, section: b.section, group: b.group, hash: b.hash, source: b.source, display: displayPath(dir, b.hash, lang) }));
}

export function load(dir) {
  const blocks = readJSON(path.join(dir, 'blocks.json'));
  if (!blocks) return null;
  const review = readJSON(path.join(dir, 'review.json')) || { round: blocks.round, blocks: {} };
  return { ...blocks, review, result: readJSON(path.join(dir, 'result.json')) };
}

export function missingDisplays(dir) {
  const s = load(dir);
  return s.blocks.filter((b) => !fs.existsSync(displayPath(dir, b.hash, s.lang))).map((b) => b.id);
}

// The page's whole review for this round. Throws a message string for a 400.
export function applyReview(dir, body) {
  const s = load(dir);
  if (!body || typeof body !== 'object' || typeof body.blocks !== 'object' || !body.blocks) throw 'review must be {round, blocks}';
  if (body.round !== undefined && body.round !== s.round) throw `review is for round ${body.round}, current is ${s.round}`;
  const next = structuredClone(s.review);
  for (const [id, b] of Object.entries(body.blocks)) {
    const cur = next.blocks[id];
    if (!cur) throw `unknown block id: ${id}`;
    if (b.status !== undefined && !STATUSES.includes(b.status)) throw `unknown status for ${id}: ${b.status}`;
    if (b.comments !== undefined && !Array.isArray(b.comments)) throw `comments of ${id} must be a list`;
    const mine = (b.comments || []).filter((c) => c && (c.round === undefined || c.round === s.round));
    for (const c of mine) {
      if (!COMMENT_KINDS.includes(c.kind)) throw `unknown comment kind in ${id}: ${c.kind}`;
      if (typeof c.text !== 'string') throw `comment text in ${id} must be a string`;
    }
    if (b.status !== undefined) cur.status = b.status;
    if (b.comments !== undefined) {
      const earlier = cur.comments.filter((c) => c.round !== s.round);
      let n = 0;
      for (const bl of Object.values(next.blocks)) for (const c of bl.comments) n = Math.max(n, Number(String(c.id).split('-')[1]) || 0);
      const ids = new Set();
      const kept = mine.map((c) => {
        let cid = typeof c.id === 'string' && c.id.startsWith(`c${s.round}-`) && !ids.has(c.id) ? c.id : `c${s.round}-${++n}`;
        ids.add(cid);
        return { id: cid, quote: typeof c.quote === 'string' ? c.quote : '', kind: c.kind, text: c.text, reply: null, round: s.round };
      });
      cur.comments = [...earlier, ...kept];
    }
  }
  writeJSON(path.join(dir, 'review.json'), next);
  return next;
}

// Returns {code, result}: 409 while blocks are pending or the round was already sent.
export function submit(dir) {
  const s = load(dir);
  if (s.result && s.result.round === s.round) return { code: 409, error: `round ${s.round} was already submitted` };
  const pending = s.blocks.filter((b) => ['new', 'chg'].includes(s.review.blocks[b.id]?.status || 'new')).map((b) => b.id);
  if (pending.length) return { code: 409, error: `not reviewed: ${pending.join(', ')}` };
  const entries = s.blocks.map((b) => [b.id, s.review.blocks[b.id]]);
  const approved = entries.filter(([, e]) => e.status === 'ok').map(([id]) => id);
  let result;
  if (approved.length === entries.length) result = { result: 'approved', round: s.round };
  else {
    const feedback = entries
      .map(([id, e]) => ({
        block: id,
        hash: e.hash,
        comments: e.comments.filter((c) => c.round === s.round).map(({ id: cid, quote, kind, text }) => ({ id: cid, quote, kind, text })),
      }))
      .filter((f) => f.comments.length);
    result = { result: 'changes_requested', round: s.round, approved, feedback };
  }
  writeJSON(path.join(dir, 'result.json'), result);
  return { code: 200, result };
}
