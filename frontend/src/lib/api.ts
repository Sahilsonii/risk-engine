import { TransactionsResponse, Stats } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function fetchWithAuth<T>(
  path: string,
  token: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  getTransactions: (token: string, params?: Record<string, string>) =>
    fetchWithAuth<TransactionsResponse>('/api/transactions', token, params),

  getStats: (token: string) =>
    fetchWithAuth<Stats>('/api/stats', token),

  getRecent: (token: string) =>
    fetchWithAuth<{ data: any[] }>('/api/recent', token),
};
