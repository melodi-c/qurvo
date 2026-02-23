CREATE TABLE IF NOT EXISTS cohort_membership_history (
    project_id  UUID,
    cohort_id   UUID,
    date        Date,
    count       UInt64,
    recorded_at DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(recorded_at)
ORDER BY (project_id, cohort_id, date);
