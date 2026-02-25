import { gzipSync, strToU8 } from 'fflate';
import { EventQueue, FetchTransport } from '@qurvo/sdk-core';
import type { EventPayload, QueuePersistence } from '@qurvo/sdk-core';
import { SDK_VERSION } from './version';

const SDK_NAME = '@qurvo/sdk-browser';
const ANON_ID_KEY = 'qurvo_anonymous_id';
const SESSION_ID_KEY = 'qurvo_session_id';
const USER_ID_KEY = 'qurvo_user_id';

function safeGetItem(storage: Storage, key: string): string | null {
  try { return storage.getItem(key); } catch { return null; }
}
function safeSetItem(storage: Storage, key: string, value: string): void {
  try { storage.setItem(key, value); } catch { /* noop */ }
}

function generateId(): string {
  return crypto.randomUUID?.() || Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function getSessionId(): string {
  let id = safeGetItem(sessionStorage, SESSION_ID_KEY);
  if (!id) {
    id = generateId();
    safeSetItem(sessionStorage, SESSION_ID_KEY, id);
  }
  return id;
}

function getContext() {
  return {
    session_id: getSessionId(),
    url: window.location.href,
    referrer: document.referrer,
    page_title: document.title,
    page_path: window.location.pathname,
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sdk_name: SDK_NAME,
    sdk_version: SDK_VERSION,
  };
}

export interface BrowserSdkConfig {
  apiKey: string;
  endpoint?: string;
  /** If known upfront (e.g. Telegram Mini App), pass user ID to avoid identity gaps and namespace storage per user. */
  distinctId?: string;
  autocapture?: boolean;
  flushInterval?: number;
  flushSize?: number;
}

class QurvoBrowser {
  private queue: EventQueue | null = null;
  private userId: string | null = null;
  private initialized = false;

  init(config: BrowserSdkConfig) {
    if (this.initialized) return;

    // If distinctId passed at init — use it, otherwise fall back to stored/anonymous
    if (config.distinctId) {
      this.userId = config.distinctId;
      safeSetItem(localStorage, USER_ID_KEY, config.distinctId);
    } else {
      this.userId = safeGetItem(localStorage, USER_ID_KEY);
    }

    const endpoint = config.endpoint || 'http://localhost:3001';
    const compress = async (data: string) => {
      const compressed = gzipSync(strToU8(data), { mtime: 0 });
      return new Blob([compressed.buffer as ArrayBuffer], { type: 'text/plain' });
    };
    const transport = new FetchTransport(compress);

    const queueKey = this.userId ? `qurvo_queue:${this.userId}` : 'qurvo_queue';
    const maxEventAgeMs = 24 * 60 * 60 * 1000; // drop events older than 24h
    const persistence: QueuePersistence = {
      save(events) {
        if (events.length === 0) {
          try { localStorage.removeItem(queueKey); } catch { /* noop */ }
          return;
        }
        safeSetItem(localStorage, queueKey, JSON.stringify(events));
      },
      load() {
        const raw = safeGetItem(localStorage, queueKey);
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return [];
          const cutoff = Date.now() - maxEventAgeMs;
          return parsed.filter((e: any) => {
            const ts = e?.timestamp;
            return ts && new Date(ts).getTime() > cutoff;
          });
        } catch {
          return [];
        }
      },
    };

    this.queue = new EventQueue(
      transport,
      `${endpoint}/v1/batch`,
      config.apiKey,
      config.flushInterval || 3000,
      config.flushSize || 10,
      1000,
      30_000,
      undefined,
      persistence,
    );
    this.queue.start();
    this.initialized = true;

    if (config.autocapture !== false) {
      this.setupAutocapture();
    }

    this.setupBeaconFlush();
    this.page();
  }

  track(event: string, properties?: Record<string, unknown>) {
    if (!this.queue) return;

    const payload: EventPayload = {
      event,
      distinct_id: this.userId || this.getAnonymousId(),
      anonymous_id: this.getAnonymousId(),
      properties,
      context: getContext(),
      timestamp: new Date().toISOString(),
      event_id: generateId(),
    };
    this.queue.enqueue(payload);
  }

  identify(userId: string, userProperties?: Record<string, unknown>) {
    if (!this.queue) return;

    this.userId = userId;
    safeSetItem(localStorage, USER_ID_KEY, userId);
    const payload: EventPayload = {
      event: '$identify',
      distinct_id: userId,
      anonymous_id: this.getAnonymousId(),
      user_properties: userProperties,
      context: getContext(),
      timestamp: new Date().toISOString(),
      event_id: generateId(),
    };
    this.queue.enqueue(payload);
  }

  page(properties?: Record<string, unknown>) {
    this.track('$pageview', properties);
  }

  screen(screenName: string, properties?: Record<string, unknown>) {
    this.track('$screen', { $screen_name: screenName, ...properties });
  }

  set(properties: Record<string, unknown>) {
    if (!this.queue) return;

    const payload: EventPayload = {
      event: '$set',
      distinct_id: this.userId || this.getAnonymousId(),
      anonymous_id: this.getAnonymousId(),
      user_properties: { $set: properties },
      context: getContext(),
      timestamp: new Date().toISOString(),
      event_id: generateId(),
    };
    this.queue.enqueue(payload);
  }

  setOnce(properties: Record<string, unknown>) {
    if (!this.queue) return;

    const payload: EventPayload = {
      event: '$set_once',
      distinct_id: this.userId || this.getAnonymousId(),
      anonymous_id: this.getAnonymousId(),
      user_properties: { $set_once: properties },
      context: getContext(),
      timestamp: new Date().toISOString(),
      event_id: generateId(),
    };
    this.queue.enqueue(payload);
  }

  reset() {
    this.userId = null;
  }

  /** Anonymous ID — always per-device, never namespaced. Links pre-identify events to identified users. */
  private getAnonymousId(): string {
    let id = safeGetItem(localStorage, ANON_ID_KEY);
    if (!id) {
      id = generateId();
      safeSetItem(localStorage, ANON_ID_KEY, id);
    }
    return id;
  }

  private setupAutocapture() {
    const originalPushState = history.pushState;
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.page();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.page();
    };

    window.addEventListener('popstate', () => {
      this.page();
    });

    window.addEventListener('hashchange', () => {
      this.page();
    });
  }

  private setupBeaconFlush() {
    const flushForUnload = () => {
      this.track('$pageleave');
      if (this.queue && this.queue.size > 0) {
        this.queue.flushForUnload();
      }
    };

    // pagehide is more reliable than beforeunload in mobile webviews (Telegram, TikTok, etc.)
    // see https://calendar.perfplanet.com/2020/beaconing-in-practice/#beaconing-reliability-avoiding-abandons
    const unloadEvent = 'onpagehide' in self ? 'pagehide' : 'beforeunload';
    window.addEventListener(unloadEvent, flushForUnload);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushForUnload();
    });
  }
}

export const qurvo = new QurvoBrowser();
