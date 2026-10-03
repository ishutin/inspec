# CLI: command-line tools

## Observers and where to check them
- A person at a terminal: stdout, stderr, exit code, prompts.
- A script or CI job: the exit code and stable machine-readable output, with no terminal attached.

## States that usually apply
No arguments, bad arguments, help; output piped, `NO_COLOR`, no TTY; paths with spaces or non-ASCII
characters; a missing file; an interrupt mid-run and its cleanup; a rerun (idempotence); a timeout; two runs at
once (a lock).

## Populations and how to enumerate them
Every command that shares a changed flag or option, and the help text and docs that name it. Enumerate from the
command table and a grep of the flag.

## Proxy → observation
| Proxy | Observation |
|---|---|
| a function's return value | the spawned binary's output and exit code |
| a synthetic output sample | the real tool's output, captured |
| "cleans up on interrupt" | the process signalled mid-run, leftovers listed |
