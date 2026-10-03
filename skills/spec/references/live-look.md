# Live look at the base

Code says what a rule sets, not which elements end up showing it, in which order, at which size. Before a spec
states anything about an existing UI, bring the base up and look at it.

## When

The change alters something visible that already exists in the running app, page, game or device: a screen,
a component's look or behaviour, a theme. Not for UI built from scratch, and not for a change with no visible
surface. A look already recorded on the current base (in an earlier spec) is reused.

Run the look in one `general-purpose` subagent (`model: "sonnet"`): it brings the base up, takes the
captures, runs the sweep and returns the measured values with their queries, the sweep's population and its
exceptions, and the capture paths, in under ~2 000 characters, never the images. When the subagent cannot
drive the running thing, do the look in the main session.

## Bring it up

- Build and serve the **base** (the branch the change starts from) the way the repository does: its dev or preview command,
  or what its `CLAUDE.md` or README names. Start the server in the
  background on a free port and stop it when the look is done.
- A mobile app: launch it in the simulator or emulator when the session has one. With none, say so, spec from
  code, and record "not looked at live" under Open.
- Ask the operator before a long build, a browser-driver install or anything that needs credentials.

## Look and measure

Open the screens or scenes the change touches at the smallest and largest supported size and scale, in each
state the spec's States names (under input, open, after a restart with stored state, the weakest supported
device, each theme). Measure the outcome (what is drawn against what is behind it, frame time), not the values
that produce it. Save one capture (screenshot, frame or GPU capture, simulator shot) per state as
`docs/features/<slug>/references/base-<state>.png`: the "before" the operator compares against, never the
target. They are committed with spec.md (`git add -f`: a `.gitignore` may drop `*.png`).

Every claim about the existing UI (which elements carry a colour, their order, a count, what is visible where)
comes from a query on the live base (computed styles, DOM order, bounding boxes, a view-hierarchy dump),
recorded with the query and its result. An exhaustive list (every surface of a colour, every place a component
appears) comes from such a sweep, never from reading the code or an "e.g." list. Record the population the sweep covered:
screens, sizes, states.

## Feed it back

- Inventories and exceptions go into Touches verbatim from the sweep.
- An exhaustive row ("the only …", "no element …") names each exception the sweep found that the change
  keeps; one found but not kept is a decision to write down.
- A check that reads generated output (an order, a count, a selector over built HTML) is run against the live
  base first, so it matches the real output and not a string the markup or its script happens to hold.
