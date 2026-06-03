import { useState, useEffect, useCallback } from 'react';
import { useAuth, useOrganization, OrganizationProfile } from '@clerk/clerk-react';
import { TransactionTable } from '../components/Tables/TransactionTable';
import { KPICard } from '../components/KPIStrip/KPICard';
import { Sidebar } from '../components/Layout/Sidebar';
import { TopBar } from '../components/Layout/TopBar';
import { api } from '../lib/api';
import { Transaction, Stats, Pagination } from '../types';

export function MerchantDashboard() {
  const { getToken } = useAuth();
  const { organization, membership } = useOrganization();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [pagination,   setPagination]   = useState<Pagination | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [page,         setPage]         = useState(1);
  const [lastUpdated,  setLastUpdated]  = useState<Date>(new Date());
  
  // Admin Features States
  const isOrgAdmin = membership?.role === 'org:admin' || membership?.role === 'admin';
  const [activeTab, setActiveTab] = useState<'transactions' | 'flagged' | 'members'>('transactions');
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const [txnRes, statsRes] = await Promise.all([
        api.getTransactions(token, { page: String(page), limit: '20' }),
        api.getStats(token),
      ]);

      setTransactions(txnRes.data);
      setPagination(txnRes.pagination);
      setStats(statsRes);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching merchant data:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, page]);

  // Initial fetch + auto-refresh every 5 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Trigger Gemini explanation
  const handleExplain = async (id: string) => {
    setExplainingId(id);
    try {
      const token = await getToken();
      if (!token) return;
      
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const res = await fetch(`${API_BASE}/api/transactions/${id}/explain`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setExplanations(prev => ({ ...prev, [id]: data.explanation }));
      } else {
        setExplanations(prev => ({ ...prev, [id]: 'Could not generate audit explanation. Please check risk engine logs.' }));
      }
    } catch (err) {
      console.error(err);
      setExplanations(prev => ({ ...prev, [id]: 'Error contacting AI risk engine.' }));
    } finally {
      setExplainingId(null);
    }
  };

  return (
    <div
      id="merchant-dashboard"
      className="flex bg-zinc-950 min-h-screen text-zinc-100"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <Sidebar />
      <main className="ml-56 flex-1 p-6">
        {/* Header */}
        <TopBar
          title={organization?.name || "My Transactions"}
          subtitle={isOrgAdmin ? "Merchant Dashboard (Administrator)" : "Merchant Dashboard (Member)"}
          lastUpdated={lastUpdated}
          onRefresh={fetchData}
        />

        {/* KPI Strip */}
        <div className={`grid ${isOrgAdmin ? 'grid-cols-5' : 'grid-cols-4'} gap-4 mb-6`}>
          <KPICard
            label="Total Transactions"
            value={stats?.total || '—'}
            accent="zinc"
          />
          <KPICard
            label="Approval Rate"
            value={stats ? `${stats.approval_rate || 0}%` : '—'}
            accent="green"
          />
          {isOrgAdmin && (
            <KPICard
              label="Rejection Rate"
              value={stats && (Number(stats.total) - Number(stats.pending)) > 0 ? `${((Number(stats.rejected) / (Number(stats.total) - Number(stats.pending))) * 100).toFixed(1)}%` : '0%'}
              accent="red"
            />
          )}
          <KPICard
            label="Flagged"
            value={stats?.flagged || '—'}
            sub="Requires review"
            accent="amber"
          />
          <KPICard
            label="Total Volume"
            value={stats ? `$${Number(stats.total_volume).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
            accent="blue"
          />
        </div>

        {/* Tab Selector (Only visible to Org Admins) */}
        {isOrgAdmin && (
          <div className="flex border-b border-zinc-800 mb-6 gap-2">
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
                activeTab === 'transactions'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Transaction History
            </button>
            <button
              onClick={() => setActiveTab('flagged')}
              className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
                activeTab === 'flagged'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Flagged & Rejected Audit
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
                activeTab === 'members'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Members & Settings
            </button>
          </div>
        )}

        {/* Main Content Area based on Selected Tab */}
        {activeTab === 'transactions' && (
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">Transaction History</h2>
              {pagination && (
                <span className="text-xs text-zinc-600 font-mono">
                  {pagination.total} total · Page {pagination.page} of {pagination.pages}
                </span>
              )}
            </div>

            <TransactionTable transactions={transactions} loading={loading} showMetadata={isOrgAdmin} />

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
                <button
                  id="prev-page-btn"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="text-xs px-3 py-1.5 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <span className="text-xs font-mono text-zinc-500">{page} / {pagination.pages}</span>
                <button
                  id="next-page-btn"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage(p => p + 1)}
                  className="text-xs px-3 py-1.5 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'flagged' && isOrgAdmin && (
          <div className="space-y-4">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">AI-Powered Risk Auditing</h3>
              <p className="text-xs text-zinc-500">
                Audit flagged or rejected transactions in real-time. Click "Run AI Risk Audit" to request an analysis of the transaction data from the Gemini AI Risk Engine.
              </p>
            </div>
            
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center">
                <h2 className="text-xs font-medium text-zinc-300 uppercase tracking-wider font-semibold">Flagged/Rejected Transactions</h2>
                <span className="text-xs text-zinc-600 font-mono">
                  {transactions.filter(t => t.status === 'FLAGGED' || t.status === 'REJECTED').length} matches
                </span>
              </div>
              
              <div className="divide-y divide-zinc-800/80">
                {transactions.filter(t => t.status === 'FLAGGED' || t.status === 'REJECTED').length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 text-xs">
                    No flagged or rejected transactions found.
                  </div>
                ) : (
                  transactions
                    .filter(t => t.status === 'FLAGGED' || t.status === 'REJECTED')
                    .map((txn) => (
                      <div key={txn.id} className="p-4 hover:bg-zinc-800/10 transition-colors flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs text-zinc-500">{txn.id.substring(0, 8)}…{txn.id.substring(28)}</span>
                            <span className="text-xs text-zinc-300 font-medium">{txn.customer_name || 'N/A'}</span>
                            <span className="text-xs text-zinc-500 font-mono">{txn.location || 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-mono font-semibold text-zinc-200">${Number(txn.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                              txn.status === 'FLAGGED' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}>{txn.status}</span>
                            <span className="text-xs text-zinc-500 font-mono">{new Date(txn.created_at).toLocaleTimeString()}</span>
                          </div>
                        </div>
                        
                        {/* Gemini AI explanation card */}
                        <div className="mt-1">
                          {explanations[txn.id] ? (
                            <div className="bg-zinc-850 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 flex flex-col gap-1.5">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                                AI Risk Audit Summary
                              </div>
                              <p className="leading-relaxed italic font-medium">"{explanations[txn.id]}"</p>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleExplain(txn.id)}
                              disabled={explainingId === txn.id}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/40 text-blue-400 text-xs font-semibold rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {explainingId === txn.id ? (
                                <>
                                  <div className="w-3.5 h-3.5 border-2 border-blue-400/20 border-t-blue-400 rounded-full animate-spin" />
                                  Running AI Risk Audit...
                                </>
                              ) : (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                                  Run AI Risk Audit
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'members' && isOrgAdmin && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 flex justify-center">
            <OrganizationProfile 
              appearance={{
                elements: {
                  card: 'bg-zinc-900 border border-zinc-800 shadow-none p-0 w-full max-w-4xl',
                  navbar: 'border-r border-zinc-800 text-zinc-300 pr-4',
                  navbarLink: 'text-zinc-400 hover:text-zinc-100 text-xs py-2 px-3 rounded-md hover:bg-zinc-800/40',
                  navbarLinkActive: 'text-blue-400 bg-blue-500/10 font-medium',
                  headerTitle: 'text-zinc-100 text-lg font-semibold',
                  headerSubtitle: 'text-zinc-500 text-xs',
                  profileSectionTitle: 'text-zinc-300 border-b border-zinc-800 pb-2 text-xs font-semibold uppercase tracking-wider',
                  profileSectionContent: 'text-zinc-100',
                  userActiveContainer: 'bg-zinc-800/50 rounded-lg p-3',
                  breadcrumbsItem: 'text-zinc-400 text-xs',
                  breadcrumbsItemActive: 'text-zinc-100 text-xs font-medium',
                  organizationProfilePage: 'text-zinc-100 bg-zinc-900 p-6',
                  formFieldLabel: 'text-zinc-400 text-xs',
                  formFieldInput: 'bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-blue-500 text-xs rounded-md',
                  formButtonPrimary: 'bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2 px-4 rounded-md transition-colors',
                  membersPage: 'bg-zinc-900 text-zinc-100',
                  membersTable: 'text-zinc-100 text-xs',
                  membersTableHeader: 'text-zinc-500 border-b border-zinc-800 font-medium pb-2 uppercase tracking-wider text-[10px]',
                  membersTableRow: 'border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors',
                  membersTableCell: 'text-zinc-300 py-3',
                  membersTableActionMenuButton: 'text-zinc-400 hover:text-zinc-100',
                  memberRoleSelectTrigger: 'bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2.5 py-1 text-xs focus:outline-none focus:border-blue-500',
                  invitedMembersPage: 'bg-zinc-900 text-zinc-100',
                }
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
