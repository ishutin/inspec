---
name: plan
description: "Cuts an agreed spec into deliveries, each one human-reviewable PR, and writes docs/features/<slug>/plan.md: the progress file /inspec:build and /inspec:review keep. Use after /inspec:spec, or to re-cut the todo deliveries of a feature."
argument-hint: "<slug>"
---

# Plan the deliveries

plan.md says what ships in which PR and records how far the build got. It never restates a row: it lists row
ids, and the rows live in spec.md.

## 1. Read

Read `docs/features/<slug>/spec.md` (and plan.md, if there is one) from `feature/<slug>`. The spec must be
`done`; an Open point goes back to `/inspec:spec`. An existing plan: only `todo` deliveries change, and a spec
row no delivery owns yet goes to a new delivery.

## 2. Cut

A delivery is one PR a person reviews in one sitting: **under ~400 changed source lines** (never counting
tests, fixtures, snapshots, lockfiles, generated files, docs or assets), estimated from the spec's Architecture
and Touches and the code they cite. Most features have one delivery.

A bigger change is several. Each delivers behaviour its rows observe, never a layer (a schema PR, then an API
PR); the first is the thinnest path through every layer; each leaves the product working. Every row belongs to
exactly one delivery. A one-way door from the spec's merge danger goes in its own delivery, kept as small as
possible. `builds on` names the delivery whose code it needs; a delivery with none starts from the
base.

With one delivery, write it. With several, show one table (id, name, rows, estimate, builds on) and wait for
the operator's yes, folding in every correction.

## 3. Write plan.md

```markdown
---
name: CSV export
status: todo            # todo | done | blocked: the whole feature
---

## D1 — Export the visible rows
status: todo
- [ ] S1
- [ ] S2
- [ ] S6
Notes: the new files, the tests that move with their new values, the traps for this PR.

## D2 — Export with filters
status: todo
builds on: D1
- [ ] S4
- [ ] S5
```

- Notes say only what the spec does not and this PR needs: which part of Architecture it builds, what it
  leaves for a later delivery. No restated rows, no procedure.
- The checkboxes, `status`, `Log:`, `Review:` and `Blocked:` lines belong to `/inspec:build` and `/inspec:review`:
  written unchecked and `todo`.

Ask the operator in plain text, as the last line of your reply, not with a question tool:
"Agree as is, edit in chat, or open the review with /inspec:read."
Edit in chat and ask again; for the review, follow `/inspec:read <slug> plan` on the file as it is until it comes
back approved.

Commit plan.md alone on `feature/<slug>` (`git commit -m "docs(<slug>): plan"`), switch back to the operator's
branch, and report the deliveries in one line each.
