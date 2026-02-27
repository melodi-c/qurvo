-- Migration: 0008_first_time_retention_projection.sql
-- Created: 2026-02-27T11:44:05.844Z
--
-- Aggregate projection for first_time retention queries.
--
-- The first_time retention inner subquery does:
--   SELECT RESOLVED_PERSON AS person_id, min(granExpr) AS cohort_period
--   FROM events
--   WHERE project_id = ? AND event_name = ?
--   GROUP BY person_id
--
-- Without this projection, ClickHouse must scan ALL historical events for the
-- (project_id, event_name) combination to compute min(timestamp) per person.
-- For projects with years of event history, this is a full partition scan.
--
-- This aggregate projection precomputes min(timestamp) per (project_id, event_name,
-- person_id). ClickHouse uses it automatically when the query GROUPs by those keys
-- and selects min(timestamp) — reducing the scan to reading one precomputed row per
-- person instead of all their raw events.
--
-- Note: The projection uses raw `person_id` (the stored column). Queries that use
-- RESOLVED_PERSON = coalesce(dictGetOrNull(..., distinct_id), person_id) as their
-- GROUP BY key may not automatically benefit — ClickHouse cannot statically prove
-- equivalence between the computed expression and the raw column. See the comment in
-- retention.query.ts for details on why a simple timestamp lower bound is not safe.
-- In practice, for the majority of events (no identity overrides), RESOLVED_PERSON
-- equals raw person_id and ClickHouse's optimizer may still leverage this projection
-- through part-level min/max pruning on the primary key.
--
-- deduplicate_merge_projection_mode must be set to allow projections on
-- ReplacingMergeTree tables (otherwise deduplication drops projection data).

ALTER TABLE events MODIFY SETTING deduplicate_merge_projection_mode = 'rebuild';

ALTER TABLE events
  ADD PROJECTION IF NOT EXISTS events_person_min_timestamp
  (
    SELECT project_id, event_name, person_id, min(timestamp) AS min_ts
    GROUP BY project_id, event_name, person_id
  );

ALTER TABLE events
  MATERIALIZE PROJECTION events_person_min_timestamp
  SETTINGS mutations_sync = 0;
