export const SESSION_TOKEN_LENGTH = 32;
const SESSION_TTL_DAYS = 30;
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_SECONDS = 60;

export const SESSION_CACHE_TTL_SECONDS = 60;
export const SESSION_CACHE_KEY_PREFIX = 'session:';
export const MAX_ACTIVE_SESSIONS_PER_USER = 10;

export const VERIFICATION_CODE_TTL_SECONDS = 10 * 60;
export const VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;
export const VERIFICATION_MAX_ATTEMPTS = 10;
export const VERIFICATION_ATTEMPTS_WINDOW_SECONDS = 10 * 60;

export const ANALYTICS_CACHE_TTL_SECONDS = 3600; // 1 hour
export const PROPERTY_NAMES_CACHE_TTL_SECONDS = 3600; // 1 hour

export const AI_MAX_TOOL_CALL_ITERATIONS = 10;
export const AI_CONTEXT_MESSAGE_LIMIT = 200;
export const AI_RATE_LIMIT_PER_MINUTE = parseInt(process.env.AI_RATE_LIMIT_PER_MINUTE ?? '20', 10);
export const AI_RATE_LIMIT_PER_HOUR = parseInt(process.env.AI_RATE_LIMIT_PER_HOUR ?? '200', 10);
export const AI_SUMMARY_THRESHOLD = 40;
export const AI_SUMMARY_KEEP_RECENT = 20;
export const AI_SUMMARIZATION_MODEL = 'gpt-4o-mini';
export const AI_TOOL_CACHE_TTL_SECONDS = 300; // 5 minutes
export const AI_RETRY_MAX_ATTEMPTS = 3;
export const AI_RETRY_BASE_DELAY_MS = 30_000; // 30 seconds
export const AI_RATE_LIMIT_MINUTE_WINDOW_SECONDS = 60;
export const AI_RATE_LIMIT_HOUR_WINDOW_SECONDS = 3600; // 1 hour
export const AI_QUOTA_KEY_TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days — slightly longer than billing period
export const AI_PLAN_LIMIT_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes — plan changes only on upgrade/downgrade

/** Redis key prefixes for AI rate-limiting buckets */
export const AI_RATE_LIMIT_MINUTE_KEY_PREFIX = 'ai:rl:m:';
export const AI_RATE_LIMIT_HOUR_KEY_PREFIX = 'ai:rl:h:';
/** Redis key prefix for AI tool result cache */
export const AI_TOOL_CACHE_KEY_PREFIX = 'ai:tool_cache:';

/** Default title assigned to a newly created AI conversation */
export const AI_DEFAULT_CONVERSATION_TITLE = 'New conversation';

/** Cost per 1M tokens in USD for each supported OpenAI model: { input, output } */
export const MODEL_COST_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
};

/** URL path slug for each insight type — used when building navigation links */
export const INSIGHT_TYPE_SLUGS: Record<string, string> = {
  trend: 'trends',
  funnel: 'funnels',
  retention: 'retentions',
  lifecycle: 'lifecycles',
  stickiness: 'stickiness',
  paths: 'paths',
};

export const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

export type ProjectRole = 'owner' | 'editor' | 'viewer';
export const PROJECT_ROLE_LEVELS: Record<string, number> = { owner: 3, editor: 2, viewer: 1 };

export const THROTTLE_SHORT_TTL_MS = 1000;
export const THROTTLE_SHORT_LIMIT = 20;
export const THROTTLE_MEDIUM_TTL_MS = 60_000;
export const THROTTLE_MEDIUM_LIMIT = 300;

export const MAX_BREAKDOWN_VALUES = 25;
export const MAX_PATH_NODES = 20;
export const MAX_METRIC_SEGMENTS = 20;
