import { gzipSync, strToU8 } from 'fflate';
import { EventQueue, FetchTransport } from '@qurvo/sdk-core';
import type { EventPayload, QueuePersistence } from '@qurvo/sdk-core';
import { SDK_VERSION } from './version';
import type { TelegramUser, TelegramInvoiceClosedEvent, TelegramWebApp } from './telegram.d';

export type { TelegramUser } from './telegram.d';

const SDK_NAME = '@qurvo/sdk-tma';
const SESSION_ID_KEY = 'qurvo_tma_session_id';
const CLOUD_STORAGE_QUEUE_KEY = 'qurvo_queue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return (
    (typeof crypto !== 'undefined' && crypto.randomUUID?.()) ||
    Math.random().toString(36).substring(2) + Date.now().toString(36)
  );
}

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = generateId();
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return generateId();
  }
}

/** Safely access window.Telegram.WebApp — returns null if not in TMA context. */
function getTelegramWebApp(): TelegramWebApp | null {
  try {
    return window?.Telegram?.WebApp ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CloudStorage persistence
// ---------------------------------------------------------------------------

/**
 * Wraps Telegram CloudStorage in the QueuePersistence interface.
 * CloudStorage operations are async/callback-based but QueuePersistence is sync —
 * we use a best-effort fire-and-forget write, and a synchronised load via
 * a pre-flight `loadCloudQueue()` call at init time.
 */
function buildCloudStoragePersistence(
  twa: TelegramWebApp,
  onLoad: (events: unknown[]) => void,
): QueuePersistence {
  // Kick off an async load to seed the in-memory queue on startup
  twa.CloudStorage.getItem(CLOUD_STORAGE_QUEUE_KEY, (err, raw) => {
    if (err || !raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        onLoad(parsed);
      }
    } catch {
      // malformed — ignore
    }
  });

  return {
    save(events: unknown[]) {
      if (events.length === 0) {
        twa.CloudStorage.removeItem(CLOUD_STORAGE_QUEUE_KEY);
        return;
      }
      twa.CloudStorage.setItem(CLOUD_STORAGE_QUEUE_KEY, JSON.stringify(events));
    },
    load(): unknown[] {
      // synchronous load is not available; we handle initial load via onLoad callback above
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

function buildContext(twa: TelegramWebApp | null) {
  const user = twa?.initDataUnsafe?.user;
  return {
    session_id: getSessionId(),
    platform: twa?.platform ?? 'unknown',
    tma_start_param: twa?.initDataUnsafe?.start_param ?? undefined,
    tma_is_premium: user?.is_premium ?? false,
    tma_language_code: user?.language_code ?? undefined,
    sdk_name: SDK_NAME,
    sdk_version: SDK_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Public config interface
// ---------------------------------------------------------------------------

export interface TmaSdkConfig {
  /** Qurvo ingest API key (sk_...) */
  apiKey: string;
  /** Ingest endpoint URL. Defaults to http://localhost:3001 */
  endpoint?: string;
  /**
   * Whether to track optional Telegram button/payment events.
   * - `main_button_clicked` — fires when user taps the Telegram MainButton
   * - `back_button_pressed` — fires when user taps the Telegram BackButton
   * - `invoice_closed` — fires on Telegram Payments invoice close (with status)
   */
  autoEvents?: {
    mainButton?: boolean;
    backButton?: boolean;
    invoiceClosed?: boolean;
  };
  /** Override `distinctId` instead of deriving it from Telegram.WebApp.initDataUnsafe.user.id */
  distinctId?: string;
  /** Flush interval in milliseconds. Default: 3000 */
  flushInterval?: number;
  /** Events per batch. Default: 10 */
  flushSize?: number;
}

// ---------------------------------------------------------------------------
// SDK class
// ---------------------------------------------------------------------------

class QurvoTma {
  private queue: EventQueue | null = null;
  private userId: string | null = null;
  private initialized = false;
  private twa: TelegramWebApp | null = null;

  /**
   * Initialise the SDK. Must be called once, as early as possible in your
   * Telegram Mini App (e.g. right after Telegram.WebApp.ready()).
   */
  init(config: TmaSdkConfig): void {
    if (this.initialized) return;

    this.twa = getTelegramWebApp();
    const twa = this.twa;

    // Resolve distinctId: explicit override → Telegram user ID → fallback random
    if (config.distinctId) {
      this.userId = config.distinctId;
    } else if (twa?.initDataUnsafe?.user?.id) {
      this.userId = String(twa.initDataUnsafe.user.id);
    } else {
      this.userId = generateId();
    }

    const endpoint = config.endpoint || 'http://localhost:3001';

    const compress = async (data: string) => {
      const compressed = gzipSync(strToU8(data), { mtime: 0 });
      return new Blob([compressed.buffer as ArrayBuffer], { type: 'text/plain' });
    };
    const transport = new FetchTransport(compress);

    let persistence: QueuePersistence | undefined;

    if (twa?.CloudStorage) {
      // CloudStorage persistence: on load, enqueue restored events into the queue
      // We need a reference to the queue, so we defer the enqueue via a callback
      // that fires after the queue is constructed.
      let pendingRestored: unknown[] = [];
      let queueRef: EventQueue | null = null;

      persistence = buildCloudStoragePersistence(twa, (events) => {
        pendingRestored = events;
        // If queue is already created, enqueue immediately
        if (queueRef) {
          for (const e of events) {
            queueRef.enqueue(e as EventPayload);
          }
          pendingRestored = [];
        }
      });

      this.queue = new EventQueue(
        transport,
        `${endpoint}/v1/batch`,
        config.apiKey,
        config.flushInterval ?? 3000,
        config.flushSize ?? 10,
        1000,
        30_000,
        undefined,
        persistence,
      );

      queueRef = this.queue;

      // Drain any events that arrived before queue was assigned
      if (pendingRestored.length > 0) {
        for (const e of pendingRestored) {
          this.queue.enqueue(e as EventPayload);
        }
        pendingRestored = [];
      }
    } else {
      // No CloudStorage (e.g. running in browser preview) — fall back to no persistence
      this.queue = new EventQueue(
        transport,
        `${endpoint}/v1/batch`,
        config.apiKey,
        config.flushInterval ?? 3000,
        config.flushSize ?? 10,
        1000,
        30_000,
      );
    }

    this.queue.start();
    this.initialized = true;

    // Track tma_opened auto-event
    this.track('tma_opened', this.buildTmaOpenedProperties());

    // Setup flush on viewport change (fired when TMA collapses/closes)
    if (twa) {
      twa.onEvent('viewportChanged', () => {
        if (this.queue && this.queue.size > 0) {
          this.queue.flushForUnload();
        }
      });
    }

    // Fallback: flush on document visibility change (works in webview)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.queue && this.queue.size > 0) {
        this.queue.flushForUnload();
      }
    });

    // Optional auto-events
    const autoEvents = config.autoEvents;
    if (autoEvents && twa) {
      if (autoEvents.mainButton) {
        const mainButtonHandler = () => this.track('main_button_clicked');
        twa.onEvent('mainButtonClicked', mainButtonHandler);
      }

      if (autoEvents.backButton) {
        const backButtonHandler = () => this.track('back_button_pressed');
        twa.onEvent('backButtonClicked', backButtonHandler);
      }

      if (autoEvents.invoiceClosed) {
        const invoiceClosedHandler = (event: TelegramInvoiceClosedEvent) => {
          this.track('invoice_closed', { url: event.url, status: event.status });
        };
        twa.onEvent('invoiceClosed', invoiceClosedHandler as (...args: unknown[]) => void);
      }
    }
  }

  /**
   * Track a custom event.
   */
  track(event: string, properties?: Record<string, unknown>): void {
    if (!this.queue || !this.userId) return;

    const payload: EventPayload = {
      event,
      distinct_id: this.userId,
      properties,
      context: buildContext(this.twa),
      timestamp: new Date().toISOString(),
      event_id: generateId(),
    };
    this.queue.enqueue(payload);
  }

  /**
   * Identify the current user (sends `$identify` event).
   * In most TMA use-cases this is not needed — `init()` already resolves the
   * Telegram user ID. Call `identify()` only if you want to link the Telegram
   * numeric ID to your own application user ID.
   */
  identify(userId: string, userProperties?: Record<string, unknown>): void {
    if (!this.queue) return;

    const previousId = this.userId;
    this.userId = userId;

    const payload: EventPayload = {
      event: '$identify',
      distinct_id: userId,
      // If we had a numeric Telegram ID before, surface it as anonymous_id
      ...(previousId && previousId !== userId ? { anonymous_id: previousId } : {}),
      user_properties: userProperties,
      context: buildContext(this.twa),
      timestamp: new Date().toISOString(),
      event_id: generateId(),
    };
    this.queue.enqueue(payload);
  }

  /**
   * Set user properties (sends `$set` event).
   */
  set(properties: Record<string, unknown>): void {
    if (!this.queue || !this.userId) return;

    const payload: EventPayload = {
      event: '$set',
      distinct_id: this.userId,
      user_properties: { $set: properties },
      context: buildContext(this.twa),
      timestamp: new Date().toISOString(),
      event_id: generateId(),
    };
    this.queue.enqueue(payload);
  }

  /**
   * Set user properties only if not already set (sends `$set_once` event).
   */
  setOnce(properties: Record<string, unknown>): void {
    if (!this.queue || !this.userId) return;

    const payload: EventPayload = {
      event: '$set_once',
      distinct_id: this.userId,
      user_properties: { $set_once: properties },
      context: buildContext(this.twa),
      timestamp: new Date().toISOString(),
      event_id: generateId(),
    };
    this.queue.enqueue(payload);
  }

  /**
   * Reset the current user identity.
   * After reset, a new random distinct_id is generated on the next `init()`.
   */
  reset(): void {
    this.userId = null;
    this.queue?.stop();
    this.queue = null;
    this.twa = null;
    this.initialized = false;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildTmaOpenedProperties(): Record<string, unknown> {
    const twa = this.twa;
    if (!twa) return {};

    const user = twa.initDataUnsafe?.user;
    const props: Record<string, unknown> = {
      platform: twa.platform,
    };

    if (twa.initDataUnsafe?.start_param) {
      props['start_param'] = twa.initDataUnsafe.start_param;
    }

    if (user) {
      props['tma_user_id'] = user.id;
      if (user.username) props['tma_username'] = user.username;
      if (user.first_name) props['tma_first_name'] = user.first_name;
      if (user.is_premium) props['tma_is_premium'] = user.is_premium;
      if (user.language_code) props['tma_language_code'] = user.language_code;
    }

    return props;
  }
}

export const qurvo = new QurvoTma();
