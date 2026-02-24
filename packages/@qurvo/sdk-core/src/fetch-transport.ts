import type { Transport, SendOptions, CompressFn } from './types';
import { QuotaExceededError, NonRetryableError } from './types';

export class FetchTransport implements Transport {
  constructor(private readonly compress?: CompressFn) {}

  async send(endpoint: string, apiKey: string, payload: unknown, options?: SendOptions): Promise<boolean> {
    const json = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'x-api-key': apiKey,
    };

    let body: BodyInit;
    if (this.compress && !options?.keepalive) {
      body = await this.compress(json);
      headers['Content-Type'] = 'text/plain';
      headers['Content-Encoding'] = 'gzip';
    } else {
      body = json;
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
      keepalive: options?.keepalive,
      signal: options?.signal,
    });

    if (response.ok || response.status === 202) return true;

    if (response.status === 429) {
      const responseBody = await response.json().catch(() => ({}));
      if (responseBody?.quota_limited) {
        throw new QuotaExceededError();
      }
    }

    const responseBody = await response.text().catch(() => '');

    // 4xx = client error, retrying won't help (bad data, auth, validation)
    if (response.status >= 400 && response.status < 500) {
      throw new NonRetryableError(response.status, `HTTP ${response.status}: ${responseBody}`);
    }

    // 5xx = server error, retryable
    throw new Error(`HTTP ${response.status}: ${responseBody}`);
  }
}
