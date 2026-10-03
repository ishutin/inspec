# API: backends and services

## Observers and where to check them
- A client: status, body and headers of the response.
- Another service: the event or message it receives.
- An operator: logs and metrics.

## States that usually apply
Empty, invalid or oversized input; unauthorised; not found; a duplicate request and a retry (idempotency); a
timeout and a partial failure, where a refused request writes nothing; concurrent writes to the same record;
page boundaries; a restart mid-operation; load at the cap.

## Populations and how to enumerate them
Every handler that reads a changed field, every consumer of a schema or event, every caller of a changed
function. Enumerate from the route table, the schema registry and a grep of the field.

## Proxy → observation
| Proxy | Observation |
|---|---|
| a handler unit test | a request through the router and middleware |
| a mocked store | the real store, in a container |
| "retries" | the attempt count and backoff observed |
| a synthetic payload | a captured real one, with its real shape and pagination |
