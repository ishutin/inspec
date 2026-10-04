---
name: Artifact review (IAR)
status: todo
---

# Artifact review (IAR)

## Problem

Every planning step of inspec ends with a markdown document the operator has to agree to: intent.md, spec.md,
plan.md. They are long, dense and in the repository's language, which is often not the operator's. Today the
operator either reads the raw file in an editor or says "ok" without really reading it. Feedback goes back as
free chat text that names no exact place, and after each round of edits they cannot tell which parts changed,
so they reread everything or trust blindly. The agent also rewrites paragraphs it was not asked to touch, so an
agreed passage silently drifts.

## Who

The operator: the one person running an inspec session on their own machine, at the end of `/inspec:brief`,
`/inspec:spec` or `/inspec:plan`, deciding whether the document is right before going on.

## Outcomes

- **O1 Offered at the right moment.** At the end of brief, spec and plan, the session offers three ways
  on: agree as is, edit in chat, or open the artifact review. The operator can also start the review
  themselves with a skill at any time for an existing intent, spec or plan.
- **O2 Read in short blocks, in their language.** The review opens in the browser as one block at a time
  (a section, a contract row, a delivery), with a short summary first, in the language the operator writes
  in the session. When that is the document's own language, there is no translation. Each block can show its
  original text. The tool's own interface (buttons, labels, statuses) is in English.
- **O3 See where you are.** A list of blocks on the left, grouped by section, shows each one's status (not
  reviewed, approved, has comments, changed) and lets them jump to any block. The keyboard moves between
  blocks, approves and opens a comment.
- **O4 Approve per block.** The operator approves a block with one action. The approval holds for the
  original text of that block in the repository, not for its translation or summary.
- **O5 Comment precisely.** They can select any text in a block and comment on it, or comment on the whole
  block. Each comment is a change, a question or "unclear". A question gets an answer from the agent in the
  next round and leaves the document as it is unless the operator then asks for a change.
- **O6 See what the agent decided alone.** Blocks that hold a choice the agent made without the operator carry
  a visible flag, so the operator's attention goes there first.
- **O7 Trace to the intent.** In a spec, each contract row shows which intent outcome it covers.
- **O8 Send and come back.** When every block is approved or commented, the operator sends the review. If all
  are approved, the session hears that the document is agreed and goes on. Otherwise the session edits the
  document, and the next round opens with the untouched approved blocks still approved, and each changed block
  showing what changed. A block that was approved and is changed by an edit loses its approval and comes back
  marked "changed after approval".
- **O9 Same text unless edited.** A block's summary and translation stay word for word the same between rounds
  unless its original text changed.
- **O10 Nothing lost.** Closing the tab or reloading keeps approvals and draft comments; reopening shows the
  same round where they left it.
- **O11 Theme.** The interface follows the system theme, and the operator can force light or dark; the choice
  is remembered.

## Headline scenario

1. `/inspec:spec` finishes `spec.md` for `csv-export` and asks: agree, edit in chat, or open the artifact
   review. The operator picks the review.
2. The browser opens on block 1 of 9, in Russian, the language the operator has been writing in. The left
   list shows Overview, Contract S1–S5, Architecture, Touches, Not in scope; S3 and S4 carry the ⚑ flag.
3. They approve Overview and S1 with `A`, moving to the next block each time.
4. On S3 they select "comma" and comment, as a change: "Excel in the Russian locale expects a semicolon".
5. On S4 they comment on the whole block, as a question: "why 10 000?". They approve the rest.
6. They send the review. The session reads the two comments, edits S3 in spec.md and prepares an answer to
   the question.
7. Round 2 opens. Seven blocks are still approved. S3 shows the edit as a diff. S4 shows the agent's answer.
8. They approve S3, approve S4 after reading the answer, and send. The session reports the spec agreed and
   goes on to `/inspec:plan`.

## References

- `references/prototype-focus.html` — the agreed direction: topic list + one block in focus, English chrome,
  flags, traceability, comment kinds, round 2 demo, theme switch. Open it in a browser.
- `references/prototype-v1-three-layouts.html` — the first exploration (Focus, Document, Checklist); Document's
  topic list was kept, the rest rejected.

## Not in scope

- Reviewers other than the operator: sharing a link, several authors, hosting, accounts.
- A Document or Checklist layout; only the focus view with the topic list.
- Showing the spec's fresh-review findings on blocks.
- Reviewing build output, code or plan.md's build log; only intent, spec and plan as written by those steps.
- Switching the display language inside the tool.
- Editing the document's text directly in the tool.
- Any record of a passed review in the repository: agreeing is the operator's call, as it is today.

## Open

- What the session does while the review is open and nobody sends it: how long it waits, and how the
  operator abandons it from chat.
- Slug `artifact-review` and the skill's name (`/inspec:review` is taken by the code review): confirm.
