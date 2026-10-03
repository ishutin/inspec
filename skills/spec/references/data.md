# Data: schemas, stored formats and migrations

## Observers and where to check them
- The app reading rows or files after the change.
- Reports and exports.
- A rollback.

## States that usually apply
An empty table and a large one (lock time); nulls and legacy values; a half-applied migration run again; writes
during the migration; the old app version on the new schema (deploy order); a rollback.

## Populations and how to enumerate them
Every reader and writer of a changed column, field or format. Enumerate by grep plus a query over a
real-shaped copy of the data.

## Proxy → observation
| Proxy | Observation |
|---|---|
| "migration file present" | the migration applied to a real-shaped copy, with every read path passing |
| a schema diff | invariants and counts compared before and after |
| a fixture of three rows | a copy with the real distribution of nulls, sizes and legacy values |
