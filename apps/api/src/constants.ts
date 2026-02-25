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
export const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

export type ProjectRole = 'owner' | 'editor' | 'viewer';
export const PROJECT_ROLE_LEVELS: Record<ProjectRole, number> = { owner: 3, editor: 2, viewer: 1 };
