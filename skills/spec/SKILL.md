---
name: spec
description: "The how step: turns an intent, or a change the operator can already describe, into docs/features/<slug>/spec.md: the contract as rows each with the check that proves it (red on the base), the architecture, touches, states and references; /inspec:plan then cuts it into PRs. Use after /inspec:brief, or directly for a change whose behaviour the operator can already describe."
argument-hint: "[slug or description, optional]"
---

# Write the spec with the operator

The spec says how the change behaves and where it lives in the code, precisely enough that a fresh session
builds it from the file alone. It is the agreement: once committed it changes only through this skill. Technical choices are settled here; product choices are
the operator's. Read [references/criteria.md](references/criteria.md) first: the row format and what makes a
check prove its row.

## 1. Find the input

With a slug named, or the intent this session just wrote, read it from its branch:
`git show feature/<slug>:docs/features/<slug>/intent.md`. With no intent, take the operator's description: it
is enough when they can say what changes, for whom and how they would see it work; agree a kebab-case slug.
When the problem, users or outcome is still open, suggest `/inspec:brief` first. If spec.md already exists, read
it and revise it with the operator; never replace it. A row a delivery already built is never rewritten: new
work on built code is a new row, and `/inspec:plan` gives it a delivery.

## 2. Read the code: never spec blind

Read the repository's `CLAUDE.md`, its own skills for the area, and the code, tests and docs the change
touches. Hand a sweep too wide to read yourself (every importer, every reader of a value) to an `Explore`
subagent (`model: "sonnet"`) and ask for under ~2 000 characters of `path:line` facts; open yourself every path
a decision rests on.

- Read `references/<surface>.md` for each surface the change has (ui, graphics, mobile, api, cli, library,
  data, infra, embedded): who observes it and how, its usual states and populations, the proxies to avoid.
- **Live look.** A visible change to an existing UI is looked at on the running base first
  ([references/live-look.md](references/live-look.md)); every claim about it comes from a measurement there.
- **Close every decision the code can answer**: which API the installed version offers, which call sites read
  a value, what an existing test pins. Write the decided mechanism with its evidence (path and symbol, never a
  line number). "Decide which", "TBD" in a spec are defects. Code goes in only if you ran it, marked
  `(spiked: <input>)`.
- **Tests the change moves**: grep the changed symbols and paths under the test directories, including tests
  that scan sources or built output; name each one whose expected value moves, with its new value.

A product choice the intent left open goes to the operator with AskUserQuestion, in rounds of the questions
whose premises are settled, each with options and your recommendation first. Never guess one.

For a visible screen or component with no agreed look, offer HTML mockups: draft them in the session's scratch
space, show them, and iterate until the operator picks one. Save it as `docs/features/<slug>/mockup.html`; it
is authority over what it shows.

## 3. Write spec.md

```yaml
---
name: CSV export        # the intent's name, or a short human name
status: todo            # todo while anything is Open, done when agreed
---
```

Sections:

- **Contract** — rows `S1`, `S2`, … in the format of [references/criteria.md](references/criteria.md). Every
  intent outcome and the Headline scenario are covered by some row.
- **Architecture** — the modules touched and where new code goes; the data and interfaces (types, files,
  events, commands, endpoints) with their shapes; the decided mechanisms with their evidence and traps.
- **Touches** — every instance the change applies to or alters, as populations: call sites, screens or scenes,
  endpoints or public symbols, readers of a changed value, state or format, neighbours that must behave alike,
  and the docs, CI and test commands that describe or run it (a new test nothing runs is a gap). Each with the
  rerunnable search that enumerated it, never memory or an "e.g." list, and the instances kept as they are.
- **States** — one line per axis that applies: its states and the rows that decide them. An axis that does not
  apply is omitted; a state left undecided goes to Not in scope or Open, never silent.
  - Input: empty, missing, invalid or corrupt (including assets and files), extreme numbers, unusual text.
  - Interaction: each way a user or caller acts on it; repeated, cancelled, duplicate or out-of-order calls.
  - Time: first run; restart; stop or crash between two effects; retry and resume; pause or background;
    connection lost and restored; an edit mid-flight; timeout; a long run; the same input twice.
  - Environment: screen size and scale, theme, locale, platform and OS version, device class, network,
    permissions, optional features or runtimes.
  - Actors: a second user, client, thread or process at once; a refused request leaves no trace.
  - Load and limits: none, one, many, at the cap; budgets (frame time, latency, memory, size); exhaustion.
- **References** — the mockup, the live look's captures, screenshots or URLs, one bullet each with what it
  shows; `qa` rows are judged against them.
- **Not in scope** — what this spec deliberately leaves out.
- **Open** — a bounded technical unknown, with how it gets settled. No product question stays here.

No promise without its bound ("retries", "is cached"): state the count, TTL or timeout. Four rules make a row
prove what it says:
1. **Observed, not inferred.** A check observes the outcome where its observer does (what is on screen, the
   response, the exit code and output, the file another program reads, the call a library's user makes),
   through the real entry point, on real-shaped input. Internal state or a source grep may back a row, never
   replace its check.
2. **Every state decided.** A row holds in each state of States it can meet, and its check drives the ones a
   defect hides in: under input as well as at rest, after a restart, on the weakest supported device, on retry.
3. **All means all.** A row with all, every, no, only or each checks the whole population from Touches, never
   an example; its exceptions are exactly the instances the spec keeps.
4. **Both directions.** A check fails on every tree that breaks the row and passes on every tree that meets it.

Say each thing once; cite a row by its id. Past about 20 KB a spec almost always holds a second capability:
split it with the operator.

## 4. One fresh review

Start one `general-purpose` subagent with only the paths of intent.md (if any) and spec.md. It reads them cold,
as the session that builds it will, with the code they cite, and reports without editing: every place it would
have to guess (a name, a shape, a which, an expected value), a check through a proxy (rule 1), a state no row
decides (2), an all-claim without its population (3), a check a correct tree would fail or a wrong tree pass
(4), an outcome no row covers. Settle each finding: drop one the file already answers,
fix a technical gap yourself, take a product gap to the operator. The review runs once; never a second reader.

## 5. Prove, commit, hand off

Run each command on the base (a clean checkout of the branch the change starts from), bare: a new row must be
red there by an assertion, a regression row green; a check whose test file does not exist yet is proven by the
build. Rewrite the check or the row, never weaken it, until it holds.

Commit spec.md, the mockup and the captures (`git add -f` what `.gitignore` drops) on `feature/<slug>`, never on
the base and never with other changes. If the branch does not exist, `git switch -c feature/<slug>` from the
branch the operator is on.

```
git add docs/features/<slug>/spec.md
git commit -m "docs(<slug>): spec"
```

Set `status: done` once the operator agrees and nothing is Open. Switch back to the operator's branch, report
the rows and any open question in a few lines, and go on to `/inspec:plan <slug>` in this session.
