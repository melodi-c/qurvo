import { Api } from './generated/Api';

export const apiClient = new Api({
  securityWorker: () => {
    const token = localStorage.getItem('qurvo_token');
    if (token) {
      return { headers: { Authorization: `Bearer ${token}` } };
    }
  },
  paramsSerializer: (params) => {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'object') {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`);
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }
    return parts.join('&');
  },
});

export const api = apiClient.api;
