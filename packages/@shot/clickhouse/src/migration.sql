DROP TABLE IF EXISTS events;

CREATE TABLE IF NOT EXISTS events
(
    event_id        UUID DEFAULT generateUUIDv4(),
    project_id      UUID,

    event_name      LowCardinality(String),
    event_type      LowCardinality(String) DEFAULT 'track',

    distinct_id     String,
    anonymous_id    String DEFAULT '',
    user_id         String DEFAULT '',
    person_id       UUID,

    session_id      String DEFAULT '',
    url             String DEFAULT '',
    referrer        String DEFAULT '',
    page_title      String DEFAULT '',
    page_path       String DEFAULT '',

    device_type     LowCardinality(String) DEFAULT '',
    browser         LowCardinality(String) DEFAULT '',
    browser_version String DEFAULT '',
    os              LowCardinality(String) DEFAULT '',
    os_version      String DEFAULT '',
    screen_width    UInt16 DEFAULT 0,
    screen_height   UInt16 DEFAULT 0,

    country         LowCardinality(String) DEFAULT '',
    region          String DEFAULT '',
    city            String DEFAULT '',

    language        LowCardinality(String) DEFAULT '',
    timezone        String DEFAULT '',

    properties      String DEFAULT '{}',
    user_properties String DEFAULT '{}',

    sdk_name        LowCardinality(String) DEFAULT '',
    sdk_version     String DEFAULT '',

    timestamp       DateTime64(3, 'UTC'),
    ingested_at     DateTime64(3, 'UTC') DEFAULT now64(3),

    batch_id        String DEFAULT ''
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, event_name, timestamp, event_id)
TTL toDateTime(timestamp) + INTERVAL 365 DAY;

CREATE TABLE IF NOT EXISTS person_distinct_id_overrides
(
    project_id  UUID,
    distinct_id String,
    person_id   UUID,
    version     UInt64
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (project_id, distinct_id);

CREATE OR REPLACE DICTIONARY person_overrides_dict
(
    project_id  UUID,
    distinct_id String,
    person_id   UUID
)
PRIMARY KEY project_id, distinct_id
SOURCE(CLICKHOUSE(
    USER '${CLICKHOUSE_USER}'
    PASSWORD '${CLICKHOUSE_PASSWORD}'
    QUERY 'SELECT project_id, distinct_id, argMax(person_id, version) AS person_id FROM shot_analytics.person_distinct_id_overrides GROUP BY project_id, distinct_id'
))
LIFETIME(MIN 30 MAX 60)
LAYOUT(COMPLEX_KEY_HASHED())
