---
name: build
description: "Builds one delivery of docs/features/<slug>/plan.md in this session until every spec row it owns holds, checking each off and keeping a log in plan.md, then marks it done (or blocked, with the reason). Resumes an interrupted build and closes review findings. Use when the operator asks to build, implement or continue a feature or delivery."
argument-hint: "<slug> [D<n>]"
---

# Build a delivery

One session builds one delivery to done. The spec's rows are the bar; its Architecture and the delivery's notes
are help. plan.md is the build's record and the only doc file the build edits: the spec is the agreement.
Run in a fresh session, not the one that planned: the files must be enough on their own.

## 1. Start

- Read `docs/features/<slug>/plan.md` from the newest branch of the feature (`feature/<slug>` or a later
  `feature/<slug>-d<n>`). Take the named delivery, else the first that is `todo`, or `done` with an open
  `Review:` item, and whose `builds on` is `done`. A `blocked` one: read its `Blocked:` line, tell the operator,
  and go on only on their word.
- The checkout must be clean. D1 is built on `feature/<slug>`. A later delivery gets `feature/<slug>-d<n>`,
  created from the branch of the delivery it builds on, or with none from the last `docs(<slug>)` commit.
  Never on the base branch.
- Read spec.md in full, intent.md if there is one, the repository's `CLAUDE.md` and its skills for the area,
  and what the notes name.
- **Resume, don't restart.** A delivery with a `Log:` or checked rows was started before: read the log and
  `git log` of the branch, trust a checked row only after you run its check again, and go on from the first
  open item. A first start adds `Log:` under the delivery with `- started from <sha>`, and runs each row's
  check there: a new row must be red, a regression row green; one that is not is a spec defect (§4 Blocked).

## 2. Build

Work through the open rows, then the open `Review:` items:

- For a row whose test file is new: write the test first and see it fail by an assertion about the row, not
  by a missing import or file. Then implement until it holds.
- Follow Architecture where it is right; where it is wrong, do what the rows need and log why. Never change
  what a row means to make it pass.
- A review item left open: fix it, or answer it `— rejected: <concrete reason>` when it is not a defect.
- Update the tests the notes say move, and the docs Touches names. Coding standards are enforced by
  `/inspec:review`, not here.
- After each item: check it off, add one line to `Log:` (what was done), and commit the code with that
  plan.md change. Never `git add -A`.

## 3. Verify

- Run the check of every row of this delivery and of every earlier `done` delivery bare (no pipe into
  `tail`), and the repository's own test, lint and type commands. All green. A row that turned red is
  unchecked.
- For each `qa` row: bring the product up, capture each state the row names, compare with the spec's
  References, and log the verdict with what you looked at.
- Read the whole diff once against the spec: a state from States or an instance from Touches the diff misses,
  a row that holds only for the example. Fix what you find.

## 4. Finish

**Done**: every row and review item is checked. Set the delivery's `status: done` (and the frontmatter
`status: done` when it was the last), log `- done`, add under the delivery `Merge danger: one-way|two-way door, blast radius: …` (from the spec's
Architecture), and commit. Report the branch, the rows with their result
and any deviation from the spec. Push or open a PR only when the operator asks; its description repeats the `Merge danger:` line.

**Blocked**: a row stays red after three distinct attempts, the spec contradicts the code, or a product question
comes up that the docs do not answer and the operator is not there. Commit the work so far, set the delivery's
`status: blocked` and add `Blocked:` with the reason, what was tried and what would unblock it (often a spec
change through `/inspec:spec`), and commit that. Never mark done with an open item.
