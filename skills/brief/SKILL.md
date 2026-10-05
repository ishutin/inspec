---
name: brief
description: "The why step: turns an idea into docs/features/<slug>/intent.md (problem, who, observable outcomes, Headline scenario, scope) with every product choice settled by the operator. Use when a change's problem, users or outcome is still open; a change the operator can already describe starts at /inspec:spec."
argument-hint: "[idea, optional]"
---

# Write the intent with the operator

The intent says why a change is worth making, for whom, and what they will observe when it works. It names no
technology, file or mechanism: that is `/inspec:spec`'s job. The conversation is the work; the file records its
decisions. If the operator gave no idea, ask them to describe it.

## 1. Understand the request

Read what the operator gave and every source it links. Read enough of the repository and product (its
`CLAUDE.md`, the code and docs of the area) to tell an observed problem from a guessed cause and to ask sharp
questions. Hand a search too wide to read yourself to an `Explore` subagent and ask for a short report of
`path:line` facts. Summarise back the current experience, who it hurts, and what success would look like.

**One capability per intent.** When the idea holds two things a user could get and judge separately, say so,
write one, and leave the other for its own slug.

## 2. Settle the product choices

Investigate yourself whatever the repository can answer. Ask the operator only what changes the intent: who it
is for, what they observe, what is out. Ask with AskUserQuestion, in **rounds**: a round holds every question
whose premise is already settled, each with concrete options, what each means for the user, and your
recommendation first; the next round follows the answers. Never drip-feed one question at a time, and never
ask a question whose premise is still open. Probe vague words ("all", "same", "automatic", "better") for the
users, states and failure cases they cover.

Never guess. A point the operator has not settled is written as `Open: …`, not decided for them. A technical
choice that does not change what a user observes goes to Open for the spec, not to the operator.

## 3. Write intent.md

Agree a slug with the operator: short kebab-case (`csv-export`). Write `docs/features/<slug>/intent.md`. If it
already exists, read it and revise it with the operator, section by section; never replace it.

```yaml
---
name: CSV export        # a short human name
status: todo            # todo while anything is Open, done when every product choice is settled
---
```

Sections:

- **Problem** — the user's current experience and its harm.
- **Who** — the people affected and in which situation.
- **Outcomes** — what a user sees or can do when it works; observable, never the mechanism. One item each,
  written `- **O<n>** <text>` (`O1`, `O2`, …) so later steps can cite it. Each names who
  observes it and the situations they meet it in (first use and return, an error, the weakest supported device,
  no network, another platform); a situation whose result is a product choice is settled here.
- **Headline scenario** — one end-to-end walk through the change, step by step, as a user takes it. The spec's
  rows prove it, so write it so a person could follow and judge it.
- **References** — only when the change has some: prototype, screenshots or mockups, as paths under
  `docs/features/<slug>/references/` or URLs.
- **Not in scope** — what a reader might expect that this change leaves out.
- **Open** — every unsettled point, one line each.

Write in your own words, each thing once; quote exactly only text the product must show character for
character. Length follows the change: a small one is short.

Before committing, reread it: every outcome is one someone could observe, and no scenario step skips a choice.

Once the document is complete, ask the operator which way to go, not with a question tool but in plain text
in the language they write in: agree as is, edit in chat, or open the review with /inspec:read. Ask it once,
at this point only, never in the other replies of this step; after an edit in chat, ask again. For the review,
follow `/inspec:read <slug> intent` on the file as it is until it comes back approved. Commit once they agree.

## 4. Commit and hand off

Commit only intent.md and its references folder on `feature/<slug>`, never on the base and never with other
changes in the checkout. If the branch exists, switch to it; otherwise `git switch -c feature/<slug>` from the
branch the operator is on (the uncommitted file moves with it).

```
git add docs/features/<slug>/intent.md docs/features/<slug>/references
git commit -m "docs(<slug>): intent"
```

Leave out the references path when there is none (`git add` of a missing path stages nothing); `git add -f` a
reference file the repo's `.gitignore` drops (`*.png`). Switch back to the branch the operator
was on and tell them the commit and branch in one line. Offer to go straight on to `/inspec:spec`.
