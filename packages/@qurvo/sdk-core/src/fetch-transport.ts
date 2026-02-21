import type { Transport, SendOptions, CompressFn } from './types';

export class FetchTransport implements Transport {
  constructor(private readonly compress?: CompressFn) {}

  async send(endpoint: string, apiKey: string, payload: unknown, options?: SendOptions): Promise<boolean> {
    try {
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
      });
      return response.ok || response.status === 202;
    } catch {
      return false;
    }
  }
}
