import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../api';
import { Transaction, Stats, Pagination } from '../../types';

interface UseTransactionsOptions {
  page: number;
  tenantFilter?: string;
  statusFilter?: string;
  refreshInterval?: number;
}

interface UseTransactionsResult {
  transactions: Transaction[];
  stats: Stats | null;
  pagination: Pagination | null;
  loading: boolean;
  lastUpdated: Date;
  refetch: () => void;
}

export function useTransactions({
  page,
  tenantFilter = '',
  statusFilter = '',
  refreshInterval = 8000,           // ← raised from 5 s to 8 s
}: UseTransactionsOptions): UseTransactionsResult {
  const { getToken } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [pagination,   setPagination]   = useState<Pagination | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [lastUpdated,  setLastUpdated]  = useState<Date>(new Date());

  // Cache the token so we don't call getToken() on every poll
  const tokenRef   = useRef<string | null>(null);
  const tokenExpRef = useRef<number>(0);

  const getCachedToken = useCallback(async () => {
    const now = Date.now();
    // Reuse cached token if it is less than 50 seconds old
    if (tokenRef.current && now < tokenExpRef.current) {
      return tokenRef.current;
    }
    const token = await getToken();
    tokenRef.current  = token;
    tokenExpRef.current = now + 50_000;   // cache for 50 s
    return token;
  }, [getToken]);

  const fetchData = useCallback(async () => {
    // Skip fetch when the browser tab is hidden — saves network + DB load
    if (document.hidden) return;

    try {
      const token = await getCachedToken();
      if (!token) return;

      const params: Record<string, string> = { page: String(page), limit: '20' };
      if (tenantFilter) params.tenant = tenantFilter;
      if (statusFilter) params.status = statusFilter;

      const [txnRes, statsRes] = await Promise.all([
        api.getTransactions(token, params),
        api.getStats(token),
      ]);

      setTransactions(txnRes.data);
      setPagination(txnRes.pagination);
      setStats(statsRes);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [getCachedToken, page, tenantFilter, statusFilter]);

  // Initial fetch + auto-refresh
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  return {
    transactions,
    stats,
    pagination,
    loading,
    lastUpdated,
    refetch: fetchData,
  };
}
