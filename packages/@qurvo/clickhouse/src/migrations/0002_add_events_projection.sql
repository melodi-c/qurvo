-- Migration: 0002_add_events_projection.sql
-- Created: 2026-02-21T19:25:29.270Z
--
-- Projection for the events list page: ORDER BY (project_id, timestamp).
-- The main table key is (project_id, event_name, timestamp, event_id),
-- which forces a full project scan when querying by project_id + timestamp
-- without event_name filter. This projection lets ClickHouse use the
-- timestamp part of the key efficiently and skip sorting.

ALTER TABLE events
  ADD PROJECTION IF NOT EXISTS events_by_project_timestamp
  (
    SELECT *
    ORDER BY (project_id, timestamp, event_id)
  );

ALTER TABLE events
  MATERIALIZE PROJECTION events_by_project_timestamp
  SETTINGS mutations_sync = 0;
