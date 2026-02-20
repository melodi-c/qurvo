import { Api } from './generated/Api';

export const apiClient = new Api({
  baseUrl: '',
  securityWorker: () => {
    const token = localStorage.getItem('qurvo_token');
    if (token) {
      return { headers: { Authorization: `Bearer ${token}` } };
    }
  },
});

export const api = apiClient.api;
