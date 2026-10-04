---
name: Artifact review (IAR)
status: done
---

# Artifact review (IAR): spec

`/inspec:read` opens an intent, spec or plan as a local web page of short blocks to approve or comment on, and
returns the verdict to the session. Intent: `docs/features/artifact-review/intent.md` (outcomes O1–O14).

## Contract

Prepare (CLI `skills/read/iar/iar.mjs`):

- **S1** `prepare <md> --id <slug>/<kind> --lang <tag>` splits the document by the Split rules (Architecture)
  and prints one JSON object per block it needs a display for. On the fixtures the block ids, in order, are:
  intent → `problem, who, O1, O2, O3, O4, O5, O6, O7, O8, O9, O10, O11, O12, O13, O14, headline-scenario,
  references, not-in-scope`; plan → `D1, D2`; spec → the list in `tests/read/fixtures/spec.ids`, taken from this file as
  committed. — check: `node --test --test-timeout=30000 tests/read/prepare.test.mjs`
- **S2** A block's hash depends only on its own source: two prepares give the same hashes; editing one block
  changes that block's hash and no other; trailing spaces and trailing blank lines change none. — check:
  `node --test --test-timeout=30000 tests/read/prepare.test.mjs`
- **S3** prepare prints exactly the blocks whose hash has no display entry for `--lang`; once they are written, a
  second prepare of the unchanged document prints `[]`, and the page shows those entries unchanged (O9). —
  check: `node --test --test-timeout=30000 tests/read/prepare.test.mjs`
- **S4** prepare exits 2 with the reason on stderr and writes nothing to the state directory for: a missing
  file; a file with no `##` section; an `--id` not shaped `<slug>/<intent|spec|plan>`; a kind that differs from
  the file's base name; a working directory outside a git repository. — check:
  `node --test --test-timeout=30000 tests/read/prepare.test.mjs`

Server and waiting (CLI and HTTP):

- **S5** `open --id …` with any block lacking a display entry, or with an entry that breaks the display schema
  (a missing field, an unknown diagram type, a matrix row whose cells do not match its columns), exits 2
  within 2 s, names every such block id on stderr, and opens nothing. — check: `node --test --test-timeout=30000 tests/read/server.test.mjs`
- **S6** `open --id <slug>/<kind>` starts the repository's server when none is running, or reuses the running
  one, prints `inspec-read: <url>` with url `http://127.0.0.1:<port>/<token>/<slug>/<kind>` and exits 0. The
  server listens on 127.0.0.1 only; a request whose path lacks the token gets 404. `open` runs `open <url>` on
  darwin and `xdg-open <url>` on linux unless `--no-open`; with neither on `PATH` it only prints. — check: `node --test --test-timeout=30000 tests/read/server.test.mjs`
- **S7** The url of a document is the same across rounds, `prepare` reruns, `stop` and a new `open`: the port
  and the 32-hex token are kept in `server.json` and reused; only when that port is taken by another process
  does `open` pick a new one and print the new url. — check: `node --test --test-timeout=30000 tests/read/server.test.mjs`
- **S8** `wait --id …` exits 0 within 2 s of a submit for the current round and prints the result as its last
  stdout line, also written to `result.json`; the server keeps running. All approved gives
  `{"result":"approved","round":N}`; with comments, `{"result":"changes_requested","round":N,"approved":[<ids>],
  "feedback":[{"block":<id>,"hash":<hash>,"comments":[{"id","quote","kind","text"}]}]}`, where `kind` is
  `change`, `question` or `unclear`, `quote` is `""` for a comment on the whole block, and only this round's
  comments appear. When the current round was already submitted while nobody waited, `wait` prints its result
  at once. — check: `node --test --test-timeout=30000 tests/read/server.test.mjs`
- **S9** A submit while any block is "Not reviewed" or "Changed" gets 409; a review update naming an unknown
  block id or comment kind gets 400 and changes nothing. — check: `node --test --test-timeout=30000 tests/read/server.test.mjs`
- **S10** Approvals and comments made on the page are still there after a page reload, a server `stop` and
  `open`, and a prepare rerun of the unchanged document, all in the same round (O10). — check: `npx playwright test tests/read/ui.spec.mjs`
- **S11** `drop --id …` discards the current round's unsent statuses and comments; the page then shows the
  round as prepare left it (O12). — check: `node --test --test-timeout=30000 tests/read/server.test.mjs`
- **S28** One server serves several documents at once, each at its own url, and `/<token>/` lists every
  document in the state directory with its slug, kind, round and status as links. The server exits after 8 hours
  with no request; a visible page polls every 3 s, so an open tab keeps it alive. — check: `node --test --test-timeout=30000 tests/read/server.test.mjs`

Next round:

- **S12** prepare after any submitted round N starts round N+1. Each block starts as follows. If it was approved
  and its hash is unchanged, it stays approved, labelled "Approved in round K". If it was approved and its hash
  changed, it is "Changed after approval". If it had comments and its hash changed, it is "Changed". If it had
  comments and its hash is unchanged, it is "Not reviewed", with those comments shown read-only. A new block is
  "Not reviewed", and a removed block is gone. After an `approved` round with no edits, every block is
  "Approved in round K". — check: `npx playwright test tests/read/ui.spec.mjs`
- **S13** A changed block shows its summary, body and check as a word diff against its display at the last
  submit, with inserted and deleted words marked; its title and diagram show the new version only. — check:
  `npx playwright test tests/read/ui.spec.mjs`
- **S14** Each entry of `<state>/replies.json` (`{"<comment id>":"<text>"}`) shows under that comment, labelled
  "Agent", in the next round; prepare deletes the file once read. — check:
  `npx playwright test tests/read/ui.spec.mjs`

Page (`skills/read/iar/ui/`), judged against `mockup.html`:

- **S15** The topic list shows every block, grouped under its section name, each with its title, a status dot
  whose colour differs for each of "Not reviewed", "Approved", "Has comments" and "Changed", and ⚑ when the
  block has a flag. The focused block shows its section, "n of N", title, summary, flag, body, the diagram,
  one quiet line with the check and the covered outcome ids (each id shows its text on hover), and comments; a
  field that is empty is not shown. Clicking a
  topic focuses it; ↑/↓ and j/k move; Enter outside the comment box approves and moves to the next block that
  is not approved, and on an approved block makes it "Not reviewed"; C opens a comment on the block. The spec fixture of S1 renders every block. — check:
  `npx playwright test tests/read/ui.spec.mjs`
- **S16** Selecting text inside a block shows "Comment". Saving with a kind (change, question or unclear)
  stores the selected text as the quote, highlights it, and marks the block "Has comments". Approve on a block
  with this round's comments asks "Delete N comments and approve?". Yes deletes them and approves; No changes
  nothing. Earlier rounds' comments and replies stay. — check: `npx playwright test tests/read/ui.spec.mjs`
- **S17** "Show source" shows the block's original markdown rendered by the same renderer as S22, so its
  lists, code and emphasis read as formatted text. — check:
  `npx playwright test tests/read/ui.spec.mjs`
- **S18** The submit button reads "N to review" and is disabled while N blocks are "Not reviewed" or "Changed".
  It reads "Send N comments", N counting this round's comments, when none is pending and some have comments.
  It reads "Approve document" when all are approved. After submitting, the page says the review was sent and
  that it waits for the session; when the next round is prepared, the same tab switches to it within 5 s with
  no reload. When the server cannot be reached, the page shows "Reconnecting…" with the command that starts it
  again (`/inspec:read <slug> <kind>`), disables the controls, and recovers within 5 s of the server's return. — check: `npx playwright test tests/read/ui.spec.mjs`
- **S19** Theme: System follows `prefers-color-scheme`, Light and Dark override it, the choice survives a reload,
  and with storage throwing the page still renders in System; the body background and text colours differ
  between the light and dark captures. — check: `npx playwright test tests/read/ui.spec.mjs`
- **S20** At a viewport 760 px wide or less, the topic list is one horizontally scrolling row no taller than
  56 px, the focused topic is inside the viewport, and the page has no horizontal scroll. — check:
  `npx playwright test tests/read/ui.spec.mjs`
- **S21** With Russian display text, no element outside `[data-content]` holds a Cyrillic character.
  `[data-content]` marks each display field (section names and titles in the topic list included), each
  diagram, each comment text and each source view. The interface is English (O2). — check:
  `npx playwright test tests/read/ui.spec.mjs`
- **S22** Display markdown renders paragraphs, `-` and `1.` lists, bold, italic, inline and fenced code, pipe
  tables and http(s) links as elements; `tldr`, `title`, `check` and `flag` render the inline part (bold,
  italic, code) the same way. Raw HTML, `<script>`, `javascript:` links and any `<…>` render as inert text,
  so `- **O<n>**` inside a code span shows character for character. —
  check: `npx playwright test tests/read/ui.spec.mjs`
- **S23** Each diagram type (flow, matrix, states, compare) renders as elements holding every text of its
  entry, with backtick spans as code and any other markup as inert text. At 760 px or less, a flow stacks its
  steps vertically, a matrix shows one column, and the page has no horizontal scroll. — check:
  `npx playwright test tests/read/ui.spec.mjs`
- **S24** The page matches `mockup.html` in layout, spacing and colour in light and dark, at 1280×800 and
  520×800, in round 1 and round 2. — qa

Document summary:

- **S29** prepare also prints an entry with id `summary` when `display/summary.<hash>.<lang>.json` is missing,
  where `<hash>` is the first 12 hex of sha256 over the document's block hashes in order; it is not a block of
  `blocks.json`. `open` refuses (exit 2, naming `summary`) when that entry is missing or breaks its schema
  `{tldr, body, diagram}`. — check: `node --test --test-timeout=30000 tests/read/summary.test.mjs`
- **S30** The page opens on the summary screen, "About this document": summary, body and diagram, and a "Start
  review" button that, like Enter, goes to the first block not approved. The topic list shows "Summary" first,
  with no status dot; progress, "n of N" and the submit counts leave it out. — check: `npx playwright test tests/read/summary.spec.mjs`
- **S31** A comment on the summary, by selection or as a whole, is kept like a block comment, counts in "Send N
  comments", never blocks a submit, and reaches the result as a feedback entry `{"block":"summary","hash":<summary
  hash>,"comments":[…]}`; in the next round it shows read-only on the summary with its reply. — check: `npx playwright test tests/read/summary.spec.mjs`
- **S32** From round 2 on, the summary screen lists "Changed since round K": every block that is "Changed" or
  "Changed after approval" and every comment with an agent reply, each a link to its block. — check: `npx playwright test tests/read/summary.spec.mjs`
- **S33** `skills/read/SKILL.md`'s subagent brief asks for the summary entry, written by the display rules from
  the whole document. — check: `grep -qF 'display/summary' skills/read/SKILL.md`

Fixes from the live run:

- **S34** An open tab switches to round N+1 only once `open` has accepted that round's display entries: after
  `prepare` and before a successful `open`, the doc route still serves round N as submitted, and the page keeps
  showing "sent, waiting for the session". — check: `node --test --test-timeout=30000 tests/read/qa-fixes.test.mjs`
- **S35** Topic-list group labels are in the display language: a block's display entry carries `group` (the
  translated label of its group, or null), and the page shows that label, never the source's. — check: `npx playwright test tests/read/qa-fixes.spec.mjs`
- **S36** At 1280×800 and 520×800, no diagram (the four types, with long `code` spans) is wider than its card,
  and no step of a flow overlaps another. — check: `npx playwright test tests/read/qa-fixes.spec.mjs`
- **S37** The document list at `/<token>/` uses the page's tokens and theme (system, light, dark), shows slug
  and kind as separate cells, and links each document. — check: `npx playwright test tests/read/qa-fixes.spec.mjs`
- **S38** In a word diff, a deleted word keeps a space on each side of its neighbours, and a matrix cell's
  `tone` colours the cell whether or not it has a `tag`. — check: `npx playwright test tests/read/qa-fixes.spec.mjs`
- **S39** `skills/read/SKILL.md` says a comment on the summary is a remark on the document as a whole: the
  session acts on it by editing the document through its owning skill or answers it in `replies.json`; it is
  never sent to the display subagent as a request to reword the summary. — check: `grep -qF 'never sent to the display' skills/read/SKILL.md`

Skills and docs:

- **S25** The sentence "Agree as is, edit in chat, or open the review with /inspec:read." is in
  `skills/brief/SKILL.md`, `skills/spec/SKILL.md` and `skills/plan/SKILL.md`, and `README.md` lists
  `/inspec:read`. — check: `grep -qF 'or open the review with /inspec:read' skills/brief/SKILL.md && grep -qF 'or open the review with /inspec:read' skills/spec/SKILL.md && grep -qF 'or open the review with /inspec:read' skills/plan/SKILL.md && grep -qF '/inspec:read' README.md`
- **S26** `skills/brief/SKILL.md` says outcomes are written `- **O<n>** <text>`, and `skills/read/SKILL.md` exists
  with `name: read`. — check: `grep -qF -- '- **O<n>**' skills/brief/SKILL.md && grep -qx 'name: read' skills/read/SKILL.md`
- **S27** In a Claude Code session the Headline scenario runs end to end, opening on the summary. The offer comes before the spec's
  commit, the page opens on its own, and the session waits with no time limit and wakes on submit. It edits, and
  round 2 opens with S3 diffed and S4 answered; the second submit takes the session on to `/inspec:plan`. Also
  check: each block's text reads as the source rewritten for a technical reader, with every fact, number, name
  and condition kept and nothing added, and diagrams appear only where they show the content better;
  `/inspec:read <slug>` with no kind opens the newest document; the display texts are written by one subagent
  and are absent from the session's own context; the operator writing in chat while the
  page is open makes the session stop `wait` and run drop; with `node` missing or below 18 the skill says so and
  continues in chat; on Windows with Node 18+ the page opens and the whole scenario runs; after a machine
  restart the tab left open reconnects once `/inspec:read` runs again. — qa

## Architecture

### Files

New skill `skills/read/`, shipped with the plugin (the plugin cache holds the `skills/` tree):

```
skills/read/SKILL.md            the session flow below
skills/read/iar/iar.mjs         CLI: prepare | open | wait | drop | stop; Node >= 18, built-ins only
skills/read/iar/lib/parse.mjs   Split rules + hash
skills/read/iar/lib/state.mjs   state dir, rounds, carry (S12), replies, drop
skills/read/iar/lib/server.mjs  the repository's server (S5-S9, S28)
skills/read/iar/ui/             index.html, app.css, app.js, md.js, diff.js; vanilla, no build step
```

### State

Outside the tree, per document: `$(git rev-parse --git-common-dir)/inspec-read/<slug>/<kind>/` (the common dir,
so every worktree of the repository shares one server and one state):
- `blocks.json`: `{doc, kind, lang, round, blocks:[{id, section, group, source, hash}]}`.
- `display/<hash>.<lang>.json`: written by the session.
  `{section, group, title, tldr, body, check, flag, covers, diagram}`:
  - `section`: the `##` heading in `lang`.
  - `title`: the block's id token, then ` · ` and a short name in `lang`; without a token, the name alone.
  - `group`: the label of the block's group (S35) in `lang`, or `null` when the block has none.
  - `tldr`: one sentence. Literal syntax (markdown, paths with `<…>`) goes in a code span.
  - `body`: markdown in `lang`. It is the source rewritten for a technical person to read easily, not
    simplified. Every fact, number, name, condition, command and path stays, and nothing is added. The id
    token and the check move to their own fields. Order, lists, short paragraphs and plain sentences serve the
    reader. Jargon the document coins is explained on first use.
  - `check`: for a contract row, one sentence on what proves it, with the command in inline code; otherwise
    `null`.
  - `flag`: a choice the session made without the operator, or `null`. It is always `null` in a session that
    did not write the document.
  - `covers`: `[{id, text}]` for a contract row, naming the intent outcomes the row serves; otherwise `[]`.
  - `diagram`: `null` or one typed object, set only where a picture shows the content better than text; it
    repeats the body and never replaces it. Every text is plain, with backtick spans as code. Each has an
    optional `caption` and `note`:
    - `flow`: `{steps:[{label, text, actor?: "you"}], loop?}`;
    - `matrix`: `{cols:[text], rows:[{label, cells:[{text, tag?, tone?: "ok"|"changed"|"new"|"warn"}]}]}`,
      with one cell per column;
    - `states`: `{transitions:[{from, to, on}]}`;
    - `compare`: `{before:{label, text}, after:{label, text}}`.

- `display/summary.<hash>.<lang>.json`: the document summary (S29), written by the same subagent:
  `{tldr, body, diagram}`. `tldr` says what the document is for in one sentence; `body` gives its main points
  and decisions and where it stops, at most 200 words; only what the document says, nothing added; `diagram`
  as above. Its hash covers every block hash, so it is rewritten whenever the document changes.

  This cache is what makes O9 hold: prepare never asks twice for a hash.
- `review.json`: `{round, blocks:{<id>:{status:"new"|"ok"|"cm"|"chg", hash, approvedRound, prevHash, wasApproved,
  comments:[{id, quote, kind, text, reply, round}]}}}`. Comment ids are `c<round>-<n>`.
- `result.json`: the last submit (S7, S8). `replies.json` is written by the session before prepare (S14).

### Split rules

`parse.mjs`, applied after the front matter and the `#` line:
1. Text before the first `##` is the block `overview`, if it is not blank.
2. A `##` heading opens a section. Its id is the heading's id token, when it opens with one
   (`^## ([A-Z][0-9]+)\b`). Otherwise the id is its slug: lowercase, every run of characters that are not
   letters or digits becomes `-`, Cyrillic is kept, and a repeat gets `-2`, `-3`.
3. Inside a section:
   - A top-level item matching `^- \*\*([A-Z][0-9]+)\b`, with its indented continuation lines, is a block
     whose id is the token.
   - A `###` subsection, up to the next `###` or `##`, is the block `<section>/<sub-slug>`.
   - Each run of other lines is a prose block. The first run takes the section's id, and later runs take
     `-2`, `-3`.
   - A run holding only blank lines is no block.
   - A section's heading line belongs to its first block.
   - In a section with id items, a prose run that is one line ending in `:` is no block: it is the group
     label of the items after it (`group` in `blocks.json`), shown above them in the topic list.

The token regex matches `- **S1** <who observes…` (criteria.md) and `- **O1 Offered at the right moment.**`
(this intent). It does not match `- **Problem** — the user's current experience` (brief SKILL.md) or
`- [ ] S1` (the plan template).

Hash: sha256 of the block source with trailing spaces removed from each line and trailing blank lines removed,
first 12 hex characters. `section` is not part of it.

### Rounds

prepare starts round N+1 when `result.json` holds round N. Otherwise it rebuilds round N and keeps
`review.json` entries whose hash is unchanged. Carry follows S12. `prevHash` is the hash at the last submit, and
`diff.js` diffs `display/<prevHash>` against the new display word by word (LCS).

### Server and HTTP

One server per repository, `lib/server.mjs`, started by `open` as a detached process that outlives the
session. `<git-common-dir>/inspec-read/server.json` holds `{port, token, pid}`. The port is the first free one from
47100 up on the first start, then the same one on every start. All routes are under `/<token>/`:
- `GET /`: the document list (S28).
- `GET <slug>/<kind>`: the page and its assets.
- `GET api/<slug>/<kind>/doc`: `{doc, kind, lang, round, blocks:[{id, section, source, hash, display,
  prevDisplay}], review}`. The page polls it every 3 s while visible and re-renders when `round` changes.
- `PUT api/<slug>/<kind>/review`: the page sends the whole review on each change. Returns 400 on an unknown id
  or kind, else 204.
- `POST api/<slug>/<kind>/submit`: returns 409 while blocks are pending, else writes `result.json` and returns
  200.

`wait` watches `result.json` for the current round. `stop` ends the server. The opener is `open` on darwin,
`xdg-open` on linux and `cmd /c start "" <url>` on win32; if it fails, the url is only printed. Every path is
built with `node:path`.

### Session flow

`skills/read/SKILL.md` runs as `/inspec:read <slug> [intent|spec|plan]`; the default kind is the
newest that exists (plan, else spec, else intent). The flow is also followed from brief, spec and plan when the
operator picks the review there.
1. Check `node --version` ≥ 18; if not, say so and continue in chat.
2. `lang` is the language the operator writes in.
3. Pick the document: the working-tree file when it is there, else
   `git show feature/<slug>:docs/features/<slug>/<kind>.md` into a temp file named `<kind>.md`.
4. Run `node <skill dir>/iar/iar.mjs prepare <md> --id <slug>/<kind> --lang <lang>`. If it prints any block,
   start one `general-purpose` subagent (no model override) with the printed blocks (and the summary entry), `lang`, the intent's path,
   the display rules of State, and the flags as a list of block id and text (only the session knows them). The
   subagent writes every `display/<hash>.<lang>.json` and replies with the ids it wrote, so the texts stay out
   of the session's context. If `open` then refuses an entry (S5), the same subagent is asked again for those
   ids only.
5. Run `open`, then `wait` with Bash `run_in_background: true`. The harness wakes the session when `wait`
   exits.
6. On `approved`, the document is agreed. On `changes_requested`, edit through the owning skill (spec.md only
   through `/inspec:spec`), write `replies.json` for the questions, and go to 4.
7. If the operator writes in chat first, stop the `wait` task, run `drop`, and act on the chat.

### Offer placement

- Brief: the offer is a new last step of §3, after "Before committing, reread it", and the outcome format
  becomes `- **O<n>** <text>`.
- Spec: §5 reorders to prove → offer → set `status: done` once agreed → commit.
- Plan: the offer goes before "Commit plan.md".

All three carry the S25 sentence, written without backticks around `/inspec:read` so that S25's check can
find it.

### Dev only

- Root `package.json`: `private`, with devDependency `@playwright/test` and script `test` running
  `node --test tests/read/` and `playwright test`.
- `playwright.config.mjs`.
- `tests/read/fixtures/`: copies of this feature's `intent.md` and `spec.md` as committed, `spec.ids`, and a
  `plan.md` holding the plan template's two deliveries.

Tests run `open` with `--no-open` in a temporary git repository and `stop` the server after each test. The opener test puts recording `open` and
`xdg-open` scripts first on `PATH`.

## Touches

- Skills that end in an agreement: `grep -rlE 'operator agrees|Commit only intent|Commit plan.md' skills`.
  - Brief, spec and plan get the offer.
  - Review also matches, because it commits findings to plan.md. No agreement is involved, so it keeps its text.
  - Build and start keep theirs.
- `grep -n '/inspec:' README.md`: the skills table gets the `/inspec:read` row.
- Tests and CI: `ls tests .github`.
  - Neither exists today.
  - `npm test` is the only runner and covers every new test file.
  - `.gitignore` gains `node_modules/`, `test-results/` and `playwright-report/`.
- `.claude-plugin/plugin.json` `version`: becomes `0.3.0`.

## States

- Input:
  - missing file, no `##`, bad or mismatched `--id`, not a git repository (S4);
  - missing display (S5);
  - Cyrillic, raw HTML and `javascript:` links (S21, S22), including inside diagrams (S23);
  - a display entry that breaks the schema (S5);
  - a block added or removed between rounds (S12);
  - a renamed `##` heading changes only its section's first block (S2, Split rules).
- Interaction:
  - approve, un-approve, approve with comments (S15, S16);
  - comment by selection or on the whole block, in each of the three kinds (S16);
  - keyboard (Enter inside and outside the comment box) and topic click (S15);
  - submit while blocks are pending (S9, S18);
  - act while the server is unreachable (S18).
- Time:
  - reload, server stop and start, and a prepare rerun (S10);
  - a submit while no session waits (S8); 8 hours without requests (S28);
  - round N+1, also after an approved round (S12–S14);
  - a block changed twice since its approval, which diffs against the last submit (S13);
  - the operator answering in chat mid-review (S11, S27);
  - waiting with no time limit (S27).
- Environment:
  - light, dark, system, and storage throwing (S19);
  - ≤ 760 px (S20, S23);
  - darwin and linux openers, and no opener (S6); Windows (S27);
  - Node missing or below 18 (S27).
- Actors: another local process without the token (S6); another process on the stored port (S7); two
  documents open at once (S28).
- Load and limits: a one-block document (S1 with a minimal fixture inside prepare.test) and this spec's
  47 blocks (S1, S15).

## References

- `mockup.html` is the agreed page, a copy of `references/prototype-focus.html`. It shows the topic list and
  focus card, flags, covers, comment kinds, the round-2 diff, the theme switch and the narrow layout. S24 is
  judged against it.
- `references/demo-spec.html`: this spec as it would look in the tool: every block's display written in
  Russian by the rules of State, with diagrams of all four types where they help.
- `references/prototype-v1-three-layouts.html`: rejected layouts, context only.

## Not in scope

- Splitting a section further than its id items, `###` subsections and prose runs.
- Approving the summary: it is a reading aid, never under review.
- Agent's-decision flags in a session that did not write the document.
- Several reviewers, sharing, remote hosting.
- Reaching the server from another machine.

## Open

None.
