---
name: review
description: "Checks a built delivery against its spec in a fresh session: does every checked row really hold, and does the diff cover the spec's States and Touches. Writes findings into plan.md for /inspec:build to close; edits no code. Use when the operator asks to review a feature or delivery."
argument-hint: "<slug> [D<n>]"
---

# Review a delivery

The build ticked its own boxes; this checks the claims. Run in a fresh session, never the one that built. Read
only: edit no code, run nothing that writes to the tree, and give every command a timeout.

## 1. Read

From the delivery's branch read plan.md, spec.md and intent.md (if any). Take the named delivery, else the
newest `done` one without a `Review:` line. The change is `<start>..HEAD`, `<start>` from its `Log:` line
`started from …`. Read `git diff --stat` and the diff, and the code around it as needed.

## 2. Check

- **Every checked row.** Run its check. Read the test it runs: a test that would pass on a wrong tree (it
  checks a proxy, one example of an all-claim, a value the row does not decide, or nothing the row names) means
  the row does not hold. For a `qa` row, look at the product in the states the row names.
- **States and Touches.** For each state the spec's States assigns to this delivery's rows and each instance
  of its Touches, find where the diff handles it. A state or an instance it misses is a finding.
- **Defects you can show** on lines the diff adds or changes: a wrong result, a crash, a lost or leaked
  resource, a broken contract with a caller. Name the input or state that triggers it. Never style, naming,
  what a linter catches, or what predates the diff.
- `high`: wrong in normal use or loses data. `medium`: wrong in a reachable edge case. `low`: minor or latent.

## 3. Record

Under the delivery in plan.md, uncheck each row that does not hold, and add:

```markdown
Review:
- [ ] R1 high · src/export.ts:42 — an empty selection writes a header-only file instead of refusing (S2)
- [ ] R2 medium · S5 — the test checks the config value, not the exported file
```

Any open item sets the delivery back to `status: todo`; no finding is `Review: clean`. Commit plan.md alone
(`docs(<slug>): review D<n>`) and report the items in a short list; `/inspec:build` closes them.
