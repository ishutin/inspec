# inspec

Plan a change into a few docs, then build it one PR at a time. Start with `/inspec:start <idea or slug>`: it reads
where the feature stands and runs the next step.

| Skill | Writes | Session |
|---|---|---|
| `/inspec:brief` | `docs/features/<slug>/intent.md`: why, for whom, observable outcomes (only when still open) | planning |
| `/inspec:spec` | `spec.md`: contract rows with checks proven red on the base, architecture, touches, states, references; the agreement | planning |
| `/inspec:plan` | `plan.md`: deliveries (one PR each) by row id, with status, checkboxes, log | planning |
| `/inspec:build` | code on `feature/<slug>[-d<n>]`; ticks rows in plan.md, sets `done` or `blocked` | fresh |
| `/inspec:review` | `Review:` items in plan.md: do the ticked rows really hold, are States and Touches covered | fresh |
| `/inspec:start` | nothing: runs the next step | any |
| `/inspec:read` | nothing: opens an intent, spec or plan as a review page in the browser, loops edits until agreed | planning |

Every file opens with `name` and `status: todo | done | blocked`; each delivery in plan.md has its own status.

## Review in the browser

Brief, spec and plan end by asking: "Agree as is, edit in chat, or open the review with /inspec:read." The
review opens the document as a local page of short blocks (a section, a contract row, a delivery), each
rewritten for reading in the language you write in, with every fact, number, name and condition kept. The
original text is one click away; the page itself is in English.

- Approve a block with Enter, or select text and comment on it as a change, a question or "unclear".
- Send the review: the session waits for it, edits what you commented on and answers your questions, and the
  next round opens with untouched approved blocks still approved and each changed block as a word diff.
- Each document has one stable link across rounds and restarts; a tab left open follows the next round and
  reconnects when the server is back. Writing in chat instead closes the review and drops what was not sent.
- Run it any time with `/inspec:read <slug> [intent|spec|plan]` (no kind: the newest document).

It needs Node 18 or newer on macOS, Linux or Windows; without it the session says so and goes on in chat. The
server listens on 127.0.0.1 only, and its state lives in the repository's git directory, outside the tree.
See [`docs/features/artifact-review/references/demo-spec.html`](docs/features/artifact-review/references/demo-spec.html)
for a spec as it looks in the review.

Install:

```
claude plugin marketplace add ishutin/inspec
claude plugin install inspec@inspec
```
