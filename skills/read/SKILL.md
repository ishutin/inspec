---
name: read
description: "Opens an intent, spec or plan of docs/features/<slug>/ as a local review page in the browser: short blocks rewritten in the operator's language, to approve or comment on one by one; waits for the verdict and runs the edits in rounds until the document is agreed. Use when the operator asks to review or read a document, runs /inspec:read, or picks the review offered at the end of brief, spec or plan."
argument-hint: "<slug> [intent|spec|plan]"
---

# Review a document in the browser

The page shows the document as blocks (a section, a contract row, a delivery), each rewritten for reading in
the operator's language; the operator approves or comments on each and sends the review. The session waits,
edits on comments, and opens the next round at the same link until every block is approved. The approval holds
for the document's own text, never for the display. The page and its state live outside the tree; nothing about
a review is committed.

`<skill dir>` below is this skill's base directory, given when it loads; the CLI is
`node <skill dir>/iar/iar.mjs`. Run it from inside the repository: it keeps its state in
`<git-common-dir>/inspec-read/<slug>/<kind>/` and one server per repository. Brief, spec and plan follow this
flow when the operator picks the review there: the Node check, then step 3 on with the document they just
wrote.

## 1. Arguments and Node

- `/inspec:read <slug> [intent|spec|plan]`. With no kind, take the newest document that exists: plan, else
  spec, else intent. With no slug, list the features (`git branch --list 'feature/*'`) and ask which.
- Run `node --version`. Missing or below 18: say "The review needs Node 18 or newer; continuing in chat" and
  go on in chat (agree as is or edit in chat). Never install anything.
- `lang` is the language the operator writes in, as a tag (`en`, `ru`, `de`).

## 2. Pick the document

- The working-tree file `docs/features/<slug>/<kind>.md` when it is there.
- Else `git show feature/<slug>:docs/features/<slug>/<kind>.md` (plan.md from the newest `feature/<slug>` or
  `feature/<slug>-d<n>`) into a new temp directory, as a file named exactly `<kind>.md`: prepare checks the base
  name against the kind.

## 3. Prepare and write the displays

```
node <skill dir>/iar/iar.mjs prepare <md> --id <slug>/<kind> --lang <lang>
```

It prints a JSON list of the blocks that have no display yet, `[{id, section, group, hash, source, display}]`,
`display` being the path to write; `[]` when every block has one (a display is written once per block text and
reused). Exit 2 is a usage error with the reason on stderr: fix the call, never retry blindly.

When it prints any block, start one `general-purpose` subagent with no model override. You do not read or
write display texts yourself: they stay out of this session's context. Pass it:

- the printed blocks, verbatim;
- `lang`;
- the intent's path (`docs/features/<slug>/intent.md`, or the temp file shown from its branch), for `covers`;
- the flags: one line per block holding a choice this session made without the operator, `<id>: <the choice>`.
  Only the session that wrote the document knows them; otherwise pass "none";
- this brief, as is:

> Write one display file per block below, at the block's `display` path, as JSON in `<lang>`:
> `{section, title, tldr, body, check, flag, covers, diagram}`. All eight fields are required.
>
> - `section`: the block's `##` heading in `<lang>`.
> - `title`: the block's id token (`S3`, `O2`, `D1`), then ` · ` and a short name; a block with no token
>   (`overview`, `architecture/files`) gets the name alone.
> - `tldr`: one sentence. Literal syntax (markdown, paths with `<…>`, commands) goes in a code span.
> - `body`: markdown. The source rewritten for a technical person to read easily, not simplified. Every fact,
>   number, name, condition, command and path stays; nothing is added, no example, opinion or consequence
>   the source does not state. The id token and the check move to their own fields. Order, lists, short
>   paragraphs and plain sentences serve the reader; jargon the document coins is explained on first use from
>   the document itself. Code, paths, ids, commands and quoted product text stay character for character in
>   code spans; literal markdown the source talks about (`- **O<n>**`, `<slug>`) goes in a code span too.
>   Markdown available: paragraphs, `-` and `1.` lists, **bold**, *italic*, inline and fenced code, pipe
>   tables, http(s) links. Raw HTML renders as text.
> - `check`: for a contract row (`S<n>`), one sentence on what proves it, from the source alone, with its
>   command in inline code; otherwise `null`.
> - `flag`: the choice given for this block in the flags list below, in `<lang>`, without the `<id>:`; otherwise
>   `null`. Never invent one.
> - `covers`: for a contract row, `[{id, text}]` naming each intent outcome (`O<n>`) the row serves, with the
>   outcome's text in `<lang>` from the intent; otherwise `[]`.
> - `diagram`: `null` for most blocks. Set one only where a picture shows the content better than text: a flow
>   of steps, states and transitions, a matrix of cases, a before and after. It repeats the body, never
>   replaces it, and adds nothing. Every text in it is plain, with backtick spans as code; any other markup
>   shows as text. One of, each with optional `caption` and `note`:
>   - `{"type":"flow","steps":[{"label","text","actor"?:"you"}],"loop"?}`; `actor: "you"` marks a step the
>     reader takes;
>   - `{"type":"matrix","cols":[text],"rows":[{"label","cells":[{"text","tag"?,"tone"?:"ok"|"changed"|"new"|"warn"}]}]}`,
>     exactly one cell per column;
>   - `{"type":"states","transitions":[{"from","to","on"}]}`;
>   - `{"type":"compare","before":{"label","text"},"after":{"label","text"}}`.
>
> Write only the files named; overwrite none other. Reply with the ids you wrote, one per line, and nothing
> else.

## 4. Open and wait

```
node <skill dir>/iar/iar.mjs open --id <slug>/<kind>
```

- Exit 2 lists every block whose display is missing or breaks the schema: send the same subagent (SendMessage)
  those ids with their reasons, ask it to rewrite only them, and run `open` again.
- Exit 0 prints `inspec-read: <url>` and opens the browser. Tell the operator the url in one line: the same
  link serves every round, and a tab left open follows by itself.
- Then run `node <skill dir>/iar/iar.mjs wait --id <slug>/<kind>` with Bash `run_in_background: true`. It has
  no time limit; the harness wakes this session when it exits. Never poll it, never sleep, never add a timeout.
  Its last stdout line is the result.

## 5. The verdict

- `{"result":"approved","round":N}`: the document is agreed. Say so in one line and return to the step that
  offered the review (it commits and goes on), or, when run alone, stop.
- `{"result":"changes_requested","round":N,"approved":[…],"feedback":[{block, hash, comments:[{id, quote,
  kind, text}]}]}` (`quote` is `""` for a comment on the whole block):
  - `change`: edit the block's source. Edit through the skill that owns the document (intent through
    `/inspec:brief`'s rules, spec.md only through `/inspec:spec`, plan.md through `/inspec:plan`); touch no
    block nobody commented on.
  - `question`: answer it; the document stays as it is unless the answer shows the text is wrong.
  - `unclear`: say what the text means; when the source itself is ambiguous, also make it precise.
  - Answers go in `replies.json`, `{"c<round>-<n>": "<answer in lang>"}` keyed by comment id, written to
    `$(git rev-parse --path-format=absolute --git-common-dir)/inspec-read/<slug>/<kind>/replies.json` before
    prepare. Answer every question and unclear; a change gets a reply only when it was not done as asked.
  - Then go to 3: prepare starts round N+1 (approved untouched blocks stay approved, edited blocks show a diff,
    replies show under their comments), and `open` reuses the same link.

## 6. The operator writes in chat first

While `wait` runs, a chat message from the operator ends the review: stop the background `wait` task, run
`node <skill dir>/iar/iar.mjs drop --id <slug>/<kind>` (it discards what the page had not sent), and act on
what they wrote: agreed, an edit in chat, or no review. Leave the server running; `stop` only when asked.
