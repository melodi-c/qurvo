import type { Transport, SendOptions } from './types';

export class FetchTransport implements Transport {
  async send(endpoint: string, apiKey: string, payload: unknown, options?: SendOptions): Promise<boolean> {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        keepalive: options?.keepalive,
      });
      return response.ok || response.status === 202;
    } catch {
      return false;
    }
  }
}
