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

Every file opens with `name` and `status: todo | done | blocked`; each delivery in plan.md has its own status.

Install:

```
claude plugin marketplace add ishutin/inspec
claude plugin install inspec@inspec
```
