# Known Issues

## Unbounded CSV Import in Static Cohorts

**File:** `src/cohorts/static-cohorts.service.ts`
**Severity:** Medium (performance/DoS risk)

### Problem

`importStaticCohortCsv` accepts up to 5MB of CSV content (`@MaxLength(5_000_000)` in DTO).
At ~8 chars per ID, this allows ~555K IDs in a single `IN(...)` ClickHouse query, causing potential memory pressure.
Additionally, `insertStaticMembers` does a single unbounded `ch.insert()` with no batching.

### Proposed Fix

1. Add `MAX_CSV_IDS = 100_000` server-side limit with `AppBadRequestException` on overflow
2. Batch ClickHouse inserts in chunks of 10,000 rows
3. Consider streaming CSV parsing for large files
