---
name: Artifact review (IAR)
status: todo
---

## D1 — Prepare, open and wait
status: todo
- [ ] S1
- [ ] S2
- [ ] S3
- [ ] S4
- [ ] S6
- [ ] S7
- [ ] S8
- [ ] S9
Notes: the thinnest path through prepare, state, server and CLI, observed over HTTP: `iar.mjs` (prepare, open,
wait, stop), `lib/parse.mjs`, `lib/state.mjs` for round 1 only (blocks.json, review.json, result.json, no carry),
`lib/server.mjs` with server.json, the token, port reuse and the doc, review and submit routes; the page route
serves a bare placeholder until D3. Display entries are only checked for presence here; schema checks are D2.
Dev setup starts here: root `package.json` (`node --test tests/read/`), `.gitignore`, `tests/read/fixtures/`
(intent, spec, `spec.ids` regenerated from spec.md as committed, the two-delivery plan). Tests use a temporary
git repository, `--no-open` except the opener test, and `stop` after each test. ~400 lines.

## D2 — Guards, drop and many documents
status: todo
builds on: D1
- [ ] S5
- [ ] S11
- [ ] S28
Notes: display schema validation in `open` (fields, the four diagram types, matrix cell counts), `drop` in
`iar.mjs` and `state.mjs`, the `/<token>/` document list, and the 8-hour idle exit (make the timeout injectable
so the test does not wait). Two documents in one repository share one server.json. ~170 lines.

## D3 — Review page: read, approve, submit
status: todo
builds on: D1
- [ ] S10
- [ ] S15
- [ ] S17
- [ ] S18
- [ ] S21
- [ ] S22
Notes: `ui/index.html`, `app.js` (topic list with groups, focus card, keyboard, approve, submit button states,
3 s polling, round switch, Reconnecting…), `md.js` (the one renderer, used for fields and Show source),
the base of `app.css` taken from `mockup.html`. Adds `@playwright/test`, `playwright.config.mjs` and
`playwright test` to `npm test`. Comments, theme switch, narrow layout and diagrams come in D4; S10 here
covers approvals only and D4's comment tests extend it. ~420 lines.

## D4 — Comments, theme, narrow layout and diagrams
status: todo
builds on: D3
- [ ] S16
- [ ] S19
- [ ] S20
- [ ] S23
Notes: selection → Comment with the three kinds, quote highlight, the delete-and-approve confirm; the
System/Light/Dark switch with storage wrapped in try/catch; the ≤ 760 px topic row; the flow, matrix, states and
compare renderers with their narrow forms. Diagram text goes through md.js's inline path so markup stays inert.
~380 lines.

## D5 — The next round
status: todo
builds on: D4
- [ ] S12
- [ ] S13
- [ ] S14
- [ ] S24
Notes: carry between rounds in `state.mjs` (prevHash, wasApproved, approvedRound), `replies.json` read and
deleted by prepare, `prevDisplay` in the doc route, `ui/diff.js` (word LCS) for summary, body and check,
read-only earlier comments with Agent replies. S24 is judged here because round 2 is the last screen the
mockup shows. ~250 lines.

## D6 — The /inspec:read skill and the offer
status: todo
builds on: D2, D5
- [ ] S25
- [ ] S26
- [ ] S27
Notes: `skills/read/SKILL.md` (the session flow, the display subagent, wait in background, drop on chat), the
offer in brief §3 (with the `- **O<n>** <text>` outcome format), spec §5 and plan before "Commit plan.md",
the README row and `plugin.json` 0.3.0. Review, build and start keep their text. Only markdown and one version
line: ~5 source lines.
