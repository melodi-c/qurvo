import { gzipSync, strToU8 } from 'fflate';
import { EventQueue, FetchTransport } from '@qurvo/sdk-core';
import type { EventPayload } from '@qurvo/sdk-core';
import { SDK_VERSION } from './version';

const SDK_NAME = '@qurvo/sdk-browser';
const ANON_ID_KEY = 'qurvo_anonymous_id';
const SESSION_ID_KEY = 'qurvo_session_id';

function generateId(): string {
  return crypto.randomUUID?.() || Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function getAnonymousId(): string {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = generateId();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = generateId();
    sessionStorage.setItem(SESSION_ID_KEY, id);
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

    const endpoint = config.endpoint || 'http://localhost:3001';
    const compress = async (data: string) => {
      const compressed = gzipSync(strToU8(data), { mtime: 0 });
      return new Blob([compressed.buffer as ArrayBuffer], { type: 'text/plain' });
    };
    const transport = new FetchTransport(compress);
    this.queue = new EventQueue(
      transport,
      `${endpoint}/v1/batch`,
      config.apiKey,
      config.flushInterval || 10000,
      config.flushSize || 10,
      1000,
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
      distinct_id: this.userId || getAnonymousId(),
      anonymous_id: getAnonymousId(),
      properties,
      context: getContext(),
      timestamp: new Date().toISOString(),
    };
    this.queue.enqueue(payload);
  }

  identify(userId: string, userProperties?: Record<string, unknown>) {
    if (!this.queue) return;

    this.userId = userId;
    const payload: EventPayload = {
      event: '$identify',
      distinct_id: userId,
      anonymous_id: getAnonymousId(),
      user_properties: userProperties,
      context: getContext(),
      timestamp: new Date().toISOString(),
    };
    this.queue.enqueue(payload);
  }

  page(properties?: Record<string, unknown>) {
    this.track('$pageview', properties);
  }

  set(properties: Record<string, unknown>) {
    if (!this.queue) return;

    const payload: EventPayload = {
      event: '$set',
      distinct_id: this.userId || getAnonymousId(),
      anonymous_id: getAnonymousId(),
      user_properties: { $set: properties },
      context: getContext(),
      timestamp: new Date().toISOString(),
    };
    this.queue.enqueue(payload);
  }

  setOnce(properties: Record<string, unknown>) {
    if (!this.queue) return;

    const payload: EventPayload = {
      event: '$set_once',
      distinct_id: this.userId || getAnonymousId(),
      anonymous_id: getAnonymousId(),
      user_properties: { $set_once: properties },
      context: getContext(),
      timestamp: new Date().toISOString(),
    };
    this.queue.enqueue(payload);
  }

  reset() {
    this.userId = null;
    localStorage.removeItem(ANON_ID_KEY);
    sessionStorage.removeItem(SESSION_ID_KEY);
  }

  private setupAutocapture() {
    const originalPushState = history.pushState;
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.page();
    };

    window.addEventListener('popstate', () => {
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

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushForUnload();
    });

    window.addEventListener('beforeunload', flushForUnload);
  }
}

export const qurvo = new QurvoBrowser();
