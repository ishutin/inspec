# Library: libraries and SDKs

## Observers and where to check them
- The consumer's code: it compiles, links and behaves as documented.
- The consumer's build: size and transitive dependencies.
- A reader of the docs and their examples.

## States that usually apply
Misuse (null, wrong call order, use after close); the thread safety the docs promise; each supported language,
compiler, runtime and platform version; an upgrade from the last release (deprecations); the error shape a
caller handles.

## Populations and how to enumerate them
Every changed public symbol (an API or ABI diff), every documented example, known dependents (a dependents
search).

## Proxy → observation
| Proxy | Observation |
|---|---|
| an internal unit test | a test through the public entry point, as a separate consumer package |
| "backward compatible" | an API or ABI diff against the last release, plus that release's tests |
| a semver claim | the diff classified |
| a doc example | the example compiled and run |
