-- Add hidden: false to each element in config.series for existing trend insights.
-- Idempotent: only touches rows where the first series element lacks the "hidden" key.

UPDATE insights
SET config = jsonb_set(
  config,
  '{series}',
  (
    SELECT jsonb_agg(elem || '{"hidden": false}')
    FROM jsonb_array_elements(config->'series') AS elem
  )
),
updated_at = now()
WHERE type = 'trend'
  AND config->'series' IS NOT NULL
  AND NOT (config->'series'->0 ? 'hidden');
