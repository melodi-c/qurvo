-- Migration: 0007_add_ingestion_warnings_table.sql
-- Created: 2026-02-25T21:21:16.663Z
--
-- Write your ClickHouse DDL below.
-- Statements are split on ";\n" — end each statement with a semicolon followed by a newline.
-- Template variables: ${CLICKHOUSE_DB}, ${CLICKHOUSE_USER}, ${CLICKHOUSE_PASSWORD}
--

CREATE TABLE IF NOT EXISTS ingestion_warnings
(
    project_id  UUID,
    type        LowCardinality(String),
    details     String,
    timestamp   DateTime
)
ENGINE = MergeTree()
ORDER BY (project_id, timestamp)
TTL timestamp + INTERVAL 30 DAY;
