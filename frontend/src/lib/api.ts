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

  getNews: (token: string, forceRefresh = false) =>
    fetchWithAuth<{ articles: any[]; fetchedAt?: string }>('/api/news', token, forceRefresh ? { refresh: '1' } : undefined),

  reviewTransaction: async (
    token: string,
    id: string,
    payload: { status: string; review_notes: string }
  ) => {
    const res = await fetch(`${API_BASE}/api/transactions/${id}/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  getReport: async (token: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/api/transactions/report`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.blob();
  },

  deleteOrganization: async (token: string, id: string): Promise<{ success: boolean; message: string }> => {
    const res = await fetch(`${API_BASE}/api/organizations/${id}`, {
      method: 'DELETE',
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
  },
};
