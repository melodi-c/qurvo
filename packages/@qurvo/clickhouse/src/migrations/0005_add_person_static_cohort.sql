CREATE TABLE IF NOT EXISTS person_static_cohort (
    project_id UUID,
    cohort_id UUID,
    person_id UUID,
    added_at DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(added_at)
ORDER BY (project_id, cohort_id, person_id);
