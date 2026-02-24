/** Lightweight auth-aware fetch helpers for calls that bypass the generated API client (e.g. SSE streaming). */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('qurvo_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function authFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...init?.headers,
    },
  });
}
