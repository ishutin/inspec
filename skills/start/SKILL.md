---
name: start
description: "Leads a change from idea to built code: reads where a feature stands from its docs and runs the next step (brief, spec, plan, build, review), saying when to continue in a new session. Use when the operator gives an idea or a feature slug, or asks what is next."
argument-hint: "[idea | slug]"
---

# Lead a feature

The state lives in `docs/features/<slug>/` on the `feature/<slug>` branches; this skill reads it, says in one
line where the feature stands, and runs the next step by following that step's skill in full.

## 1. Find the feature

- A slug: read its files with `git show feature/<slug>:docs/features/<slug>/<file>` (or the newest
  `feature/<slug>-d<n>` for plan.md).
- An idea: look for a feature it continues (`git branch --list 'feature/*'`); otherwise it is new.
- Nothing: list the features with their name and status from each plan.md or spec.md, and ask which.

## 2. The next step

| State | Next |
|---|---|
| new, and what changes, for whom or why is still open | brief |
| new and clear, or intent `done` with no spec | spec (a tiny change, one obvious fix, needs no docs: say so and just do it) |
| intent or spec `todo` | the same step, to finish it |
| spec `done`, no plan, or a spec row no delivery owns | plan |
| a delivery `todo` (or `done` with an open Review item) whose `builds on` is done | build |
| the last built delivery has no `Review:` line | offer review (recommend it when the build ran on a model below the strongest, or touched auth, money, stored data, or holds a one-way door) |
| a delivery `blocked` | show its reason and ask how to unblock |
| every delivery `done` and reviewed or review declined | done: offer to push and open PRs, one per delivery |

## 3. Sessions

brief, spec and plan run on in this session, one after another: each ends by saying what it settled and the
next step starts after the operator's go. build and review each need a **fresh session**: the planning
conversation is large, and a fresh reader proves the files are enough. At that point stop and say:

> Next: build D1. Open a new session and run `/inspec:start <slug>`.

The same command in the new session finds the delivery and builds it. Also suggest a new session when this one
has grown long before a step: everything it needs is in the files.
