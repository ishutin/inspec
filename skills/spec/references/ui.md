# UI: web, native and desktop screens

## Observers and where to check them
- A person looking at the presented screen, the first frame after launch or reload included.
- Keyboard, switch and assistive-tech users (screen readers, VoiceOver, TalkBack, Narrator): a declared role or
  trait promises its interaction model (a menu role promises arrow keys, a button trait activation).
- The person on the weakest supported device or browser.

## States that usually apply
Rest, hover, focus, pressed, disabled, open, selected; window size and scale factor; light, dark and high
contrast; reduced motion; long and right-to-left strings; the first frame after a restart with a stored choice;
on the web, no script.

## Populations and how to enumerate them
Every screen × locale, every instance of a component, every text and background pair. Enumerate with a DOM
query, an accessibility-tree or view-hierarchy dump, or snapshot tests, on the running base
([live look](../../plan/references/live-look.md)), never from the stylesheet or an "e.g." list.

## Proxy → observation
| Proxy | Observation |
|---|---|
| a theme variable or token value | contrast measured on the capture, in each input state |
| a flag or attribute set before render | what the first presented frame draws, on a throttled CPU |
| a role or trait present | the interaction model driven with keys or the screen reader |
| "matches the mockup" | a snapshot diff with a tolerance, or `qa` against the reference |
| a computed style on one element | a sweep of every element in the population |
