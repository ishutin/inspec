# Contract rows and their checks

## Shape

```markdown
## Contract
- **S1** <who observes what, where, in which states> — check: `<command>`
- **S2** <a refused or invalid case> — check: `<command>`
- **S3** <what a person judges by eye, in the states named> — qa
- **S4** <a behaviour that already holds and must keep holding> (regression) — check: `<command>`
```

- One behaviour per row (about 60 words at most), ids unique, the separator ` — `. A row too broad for one
  check is split into rows.
- One command per row, in one backtick span, so the command holds no backtick. It runs with a shell at the
  repository root; `&&` chains steps. Each command is targeted (the test file it names, not the whole suite)
  and has a timeout.
- `(regression)`: the claim already holds on the base and must keep holding, for a named behaviour a path must
  keep, never for "the suite stays green".
- At least one row on an error path (refused, invalid, failed input), and at least one with a command.
- `— qa`: no command; the claim names each state to look at (a screenshot or an output per state), judged
  against `## References`.
- Rows carry no checkbox: progress lives in plan.md, the spec stays the agreement.

## A check proves its row

A check proves its row when it fails before the change and passes after it, on every correct tree. The spec
skill runs every command on the base: a new row must be red there, a regression row green. The traps that pass
that test and still prove nothing:

- **A proxy proves the proxy.** A variable's value, a setting, internal state or a synthetic sample checks
  itself: check what the observer gets (the captured screen or frame, the response, the real tool's output), on
  real-shaped data.
- **An all-claim on one example** passes a tree that breaks every other instance: sweep the population Touches
  names, in each state States names.
- **A check pins only what the row decides.** An identifier, a formatting detail, or an exact pixel, float or
  count where the row sets a tolerance fails a correct tree and invites bending the product to the check. A
  negative grep is anchored to the call-site syntax, never a bare word.
- **No check is green on every tree.** `true`, `echo`, a `grep` for a word the base already holds, or the whole
  suite as a new row: name the new test file instead.
- **A new row's check names only new test files and never filters by test name**: most runners pass a file
  whose filter matches nothing, and ignore a missing file mixed with existing ones. Rows of one behaviour group
  may share one new file, each claim a test in it that fails on the base.
- **Red for the wrong reason.** A test file that does not exist yet is red on the base for want of the file,
  not the behaviour; such a check is proven when the build writes the test and sees it fail by an assertion
  before the change. A check that runs on the base must fail there by an assertion about the row: read its
  output.
- **Pipes hide exit codes**: `cmd | tail` exits with `tail`'s code. Run the command bare, or with
  `set -o pipefail`.
- **An absence check** is `grep -q <pattern> <file>; test $? -eq 1`: a plain `! grep` also passes when the file
  is missing (grep exits 2).
- **Prose proves only that a sentence is there.** A grep over docs may back a row worded that way, never a row
  about what the code or a user does.
- **Counts and orders** come from the tree under test (or a live look, for a UI), never a number typed in the
  spec unless the requirement pins it.
- **`qa` only where no command can observe the row**: how something looks or feels to a person. A status code,
  a link target, an order in built output is a command.
- **A prescribed regex, format or parser** comes with two positive and two negative examples from real output;
  **a prescribed external call** (`gh`, an API) has its exact shape run once and stated in the spec.
