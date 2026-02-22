CREATE TABLE IF NOT EXISTS cohort_members (
    cohort_id   UUID,
    project_id  UUID,
    person_id   UUID,
    version     UInt64
) ENGINE = ReplacingMergeTree(version)
ORDER BY (project_id, cohort_id, person_id);
