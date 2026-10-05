---
name: review
description: "Checks a built delivery against its spec in a fresh session: does every checked row really hold, and does the diff cover the spec's States and Touches. Fixes mechanical findings itself and writes contract findings into plan.md for /inspec:build to close. Use when the operator asks to review a feature or delivery."
argument-hint: "<slug> [D<n>]"
---

# Review a delivery

The build ticked its own boxes; this checks the claims. Run in a fresh session, never the one that built. Edit
code only for the mechanical fixes of §3; give every command a timeout.

## 1. Read

From the delivery's branch read plan.md, spec.md and intent.md (if any). Take the named delivery, else the
newest `done` one without a `Review:` line. The change is `<start>..HEAD`, `<start>` from its `Log:` line
`started from …`. Read `git diff --stat` and the diff, and the code around it as needed.

## 2. Check

- **Every checked row.** Run its check. Read the test it runs and ask: would it stay green if the behaviour
  broke but the names stayed? A test that would pass on a wrong tree (it checks a proxy, one example of an
  all-claim, a value the row does not decide, or nothing the row names) means the row does not hold, as do
  three known lies: a test that restates the implementation (a constant equal to its literal, a mock returns X
  and the test asserts X); a test that reads source files as text to assert structure, unless that structure is
  itself the contract (a lint or architecture rule); a mock or stub that removes the real failure modes of what
  it replaces. For a `qa` row, look at the product in the states the row names.
- **States and Touches.** For each state the spec's States assigns to this delivery's rows and each instance
  of its Touches, find where the diff handles it. A state or an instance it misses is a finding.
- **Merge danger.** Read the spec's. A delivery with a one-way door gets a deep review: read every line of the
  diff that touches it and try to break it. A two-way-door delivery with a local blast radius gets this contract
  check.
- **Coding standards.** Read the repository's own coding-standards files if present (`CODING_STANDARDS.md`, or
  what its `CLAUDE.md` or `AGENTS.md` point to) and check the diff against them. Never create or propose such a
  file: the repository owns its conventions. With none, leave style alone; never what a linter catches.
- **Defects you can show** on lines the diff adds or changes: a wrong result, a crash, a lost or leaked
  resource, a broken contract with a caller. Name the input or state that triggers it. Never what predates the
  diff.
- `high`: wrong in normal use or loses data. `medium`: wrong in a reachable edge case. `low`: minor or latent.

## 3. Record

**Mechanical** findings (a breach of those standards, anything else fixable with no behaviour change): fix them
yourself, run the delivery's checks and the repository's test, lint and type commands green, and commit the code
alone (`refactor(<slug>): review D<n> fixes`). Everything about the contract (a row that does not hold, a missing
state or touch, a lying check, a one-way-door concern) stays a finding for build.

Under the delivery in plan.md, uncheck each row that does not hold, and add:

```markdown
Review:
- [ ] R1 high · src/export.ts:42 — an empty selection writes a header-only file instead of refusing (S2)
- [ ] R2 medium · S5 — the test checks the config value, not the exported file
- [x] R3 · src/export.ts:10 — fixed: name per CODING_STANDARDS.md
```

Fixed items are listed checked. Any open item sets the delivery back to `status: todo`; no finding is `Review: clean`. Commit plan.md alone
(`docs(<slug>): review D<n>`) and report the items in a short list; `/inspec:build` closes them.
