import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { TransactionTable } from '../components/Tables/TransactionTable';
import { KPICard } from '../components/KPIStrip/KPICard';
import { Sidebar } from '../components/Layout/Sidebar';
import { TopBar } from '../components/Layout/TopBar';
import { api } from '../lib/api';
import { Transaction, Stats, Pagination } from '../types';
import { Filter } from 'lucide-react';

export function AdminDashboard() {
  const { getToken } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [pagination,   setPagination]   = useState<Pagination | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [page,         setPage]         = useState(1);
  const [tenantFilter, setTenantFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
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
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, page, tenantFilter, statusFilter]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const TENANTS = ['merchant_alpha','merchant_beta','merchant_gamma','merchant_delta','merchant_epsilon'];
  const STATUSES = ['PENDING','APPROVED','FLAGGED','REJECTED'];

  return (
    <div
      id="admin-dashboard"
      className="flex bg-zinc-950 min-h-screen text-zinc-100"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <Sidebar />
      <main className="ml-56 flex-1 p-6">
        {/* Header */}
        <TopBar
          title="System Overview"
          subtitle="All tenants"
          lastUpdated={lastUpdated}
          onRefresh={fetchData}
        />

        {/* KPIs */}
        <div className="grid grid-cols-6 gap-4 mb-6">
          <KPICard label="Total Transactions"  value={stats?.total || '—'}                              accent="zinc"  />
          <KPICard label="Total Volume"        value={`$${Number(stats?.total_volume || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}  accent="blue"  />
          <KPICard label="Approval Rate"       value={stats ? `${stats.approval_rate || 0}%` : '—'}          accent="green" />
          <KPICard label="Rejection Rate"      value={stats && (Number(stats.total) - Number(stats.pending)) > 0 ? `${((Number(stats.rejected) / (Number(stats.total) - Number(stats.pending))) * 100).toFixed(1)}%` : '0%'} accent="red" />
          <KPICard label="Flagged"             value={stats?.flagged || '—'} sub="Needs review"         accent="amber" />
          <KPICard label="Queue Depth"         value={stats?.queue_depth ?? '—'} sub="Redis backlog"    accent="zinc"  />
        </div>

        {/* Per-Tenant Breakdown */}
        {stats?.tenant_breakdown && stats.tenant_breakdown.length > 0 && (
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h2 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">Tenant Breakdown</h2>
            </div>
            <div className="overflow-x-auto">
              <table id="tenant-breakdown-table" className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                    <th className="px-4 py-2 text-left">Tenant</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2 text-right">Approved</th>
                    <th className="px-4 py-2 text-right">Flagged</th>
                    <th className="px-4 py-2 text-right">Rejected</th>
                    <th className="px-4 py-2 text-right">Volume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {stats.tenant_breakdown.map((t) => (
                    <tr
                      key={t.tenant_id}
                      className="hover:bg-zinc-800/30 cursor-pointer transition-colors"
                      onClick={() => { setTenantFilter(t.tenant_id); setPage(1); }}
                    >
                      <td className="px-4 py-2 font-mono text-blue-400">{t.tenant_id}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-zinc-300">{t.total}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-emerald-400">{t.approved}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-amber-400">{t.flagged}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-red-400">{t.rejected}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-zinc-300">
                        ${Number(t.volume).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filters + Table */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
            <Filter size={12} className="text-zinc-500" />
            <select
              id="tenant-filter"
              value={tenantFilter}
              onChange={e => { setTenantFilter(e.target.value); setPage(1); }}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Tenants</option>
              {TENANTS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {(tenantFilter || statusFilter) && (
              <button
                id="clear-filters-btn"
                onClick={() => { setTenantFilter(''); setStatusFilter(''); setPage(1); }}
                className="text-xs text-zinc-500 hover:text-red-400 ml-auto transition-colors"
              >
                Clear filters ×
              </button>
            )}
            {pagination && (
              <span className="text-xs text-zinc-600 font-mono ml-auto">
                {pagination.total} results
              </span>
            )}
          </div>

          <TransactionTable transactions={transactions} loading={loading} showTenant />

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
              <button
                id="admin-prev-page-btn"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="text-xs px-3 py-1.5 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <span className="text-xs font-mono text-zinc-500">{page} / {pagination.pages}</span>
              <button
                id="admin-next-page-btn"
                disabled={page >= pagination.pages}
                onClick={() => setPage(p => p + 1)}
                className="text-xs px-3 py-1.5 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
