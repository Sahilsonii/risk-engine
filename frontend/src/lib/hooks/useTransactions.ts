import { useState, useEffect, useCallback } from 'react';
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
  refreshInterval = 5000,
}: UseTransactionsOptions): UseTransactionsResult {
  const { getToken } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [pagination,   setPagination]   = useState<Pagination | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [lastUpdated,  setLastUpdated]  = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
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
  }, [getToken, page, tenantFilter, statusFilter]);

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
