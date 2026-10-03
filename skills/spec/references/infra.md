# Infra: deploy, configuration and operations

## Observers and where to check them
- The deployed service: health and a probe of its behaviour.
- An operator: alerts and logs.
- The next deploy.

## States that usually apply
First deploy, upgrade, rollback; a step that fails midway; a missing secret; differences between environments;
more than one replica; a cold start.

## Populations and how to enumerate them
Every environment, and every service that uses the changed module or setting. Enumerate from the environment
list and a grep of the module or key.

## Proxy → observation
| Proxy | Observation |
|---|---|
| configuration text | a plan or dry-run diff, plus a probe of the deployed service |
| "is cached" | the TTL observed |
| "rolls back" | a rollback run, then the probe |
