-- Move metric and metric_property from top-level TrendWidgetConfig into each series[] element.
-- Idempotent: only touches rows where config->>'metric' IS NOT NULL.

UPDATE insights
SET config = (
  SELECT jsonb_set(
    config #- '{metric}' #- '{metric_property}',
    '{series}',
    (
      SELECT jsonb_agg(
        elem || jsonb_build_object('metric', config->>'metric')
        || CASE
             WHEN config->>'metric_property' IS NOT NULL
             THEN jsonb_build_object('metric_property', config->>'metric_property')
             ELSE '{}'::jsonb
           END
      )
      FROM jsonb_array_elements(config->'series') AS elem
    )
  )
),
updated_at = now()
WHERE type = 'trend'
  AND config->>'metric' IS NOT NULL;
