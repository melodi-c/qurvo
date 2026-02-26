const QURVO_API_URL = (process.env['QURVO_API_URL'] ?? 'https://api.qurvo.io').replace(/\/$/, '');
const QURVO_API_KEY = process.env['QURVO_API_KEY'];

function buildUrl(path: string, params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') {
      qs.set(key, JSON.stringify(value));
    } else {
      qs.set(key, String(value));
    }
  }
  const query = qs.toString();
  return `${QURVO_API_URL}${path}${query ? `?${query}` : ''}`;
}

export async function queryApi(path: string, params: Record<string, unknown>): Promise<unknown> {
  if (!QURVO_API_KEY) {
    throw new Error(
      'QURVO_API_KEY environment variable is not set. ' +
      'Please configure it before using the Qurvo MCP server.',
    );
  }

  const url = buildUrl(path, params);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': QURVO_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Qurvo API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<unknown>;
}
