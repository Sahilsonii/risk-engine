import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, useOrganization } from '@clerk/clerk-react';
import { RefreshCw } from 'lucide-react';
import { TransactionTable } from '../components/Tables/TransactionTable';
import { KPICard } from '../components/KPIStrip/KPICard';
import { Sidebar } from '../components/Layout/Sidebar';
import { TopBar } from '../components/Layout/TopBar';
import { api } from '../lib/api';
import { Transaction, Stats, Pagination } from '../types';

export function MerchantDashboard() {
  const { getToken, userId: currentUserId } = useAuth();
  const { organization, membership, memberships, invitations } = useOrganization({
    memberships: { pageSize: 50 },
    invitations: { pageSize: 50 }
  });
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [pagination,   setPagination]   = useState<Pagination | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [page,         setPage]         = useState(1);
  const [lastUpdated,  setLastUpdated]  = useState<Date>(new Date());
  
  // Admin Features States
  const isOrgAdmin = membership?.role === 'org:admin' || membership?.role === 'admin';
  const [activeTab, setActiveTab] = useState<'transactions' | 'analytics' | 'flagged' | 'news' | 'members'>('transactions');
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  // Startup Loading & Chart Hover States
  const [startupLoading, setStartupLoading] = useState(true);
  const [hoveredBarIdx, setHoveredBarIdx] = useState<number | null>(null);

  // News States
  const [news, setNews] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [lastNewsFetch, setLastNewsFetch] = useState<Date | null>(null);

  // Onboarding / Invite Form States
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'org:member' | 'org:admin'>('org:member');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Donut Chart Hover States
  const [hoveredSlice, setHoveredSlice] = useState<'approved' | 'flagged' | 'rejected' | 'pending' | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const fetchNews = useCallback(async () => {
    if (lastNewsFetch && Date.now() - lastNewsFetch.getTime() < 5 * 60 * 1000) {
      return;
    }
    setNewsLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await api.getNews(token);
      setNews(res.articles);
      setLastNewsFetch(new Date());
    } catch (err) {
      console.error('Error fetching news:', err);
    } finally {
      setNewsLoading(false);
    }
  }, [getToken, lastNewsFetch]);

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

  // Fetch news when news tab becomes active
  useEffect(() => {
    if (activeTab === 'news') {
      fetchNews();
    }
  }, [activeTab, fetchNews]);

  // deliberate startup loading skeleton timer
  useEffect(() => {
    const timer = setTimeout(() => {
      setStartupLoading(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

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

  // Invite member
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !organization) return;
    
    setIsInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    
    try {
      await organization.inviteMember({ emailAddress: inviteEmail, role: inviteRole });
      setInviteSuccess(`Invitation sent successfully to ${inviteEmail}!`);
      setInviteEmail('');
      invitations?.revalidate?.();
    } catch (err: any) {
      console.error(err);
      setInviteError(err.errors?.[0]?.message || 'Failed to send invitation.');
    } finally {
      setIsInviting(false);
    }
  };

  // Remove member
  const handleRemoveMember = async (mem: any) => {
    const displayName = [mem.publicUserData.firstName, mem.publicUserData.lastName].filter(Boolean).join(' ') || mem.publicUserData.identifier;
    if (window.confirm(`Are you sure you want to remove ${displayName} from the organization?`)) {
      setRemovingId(mem.id);
      try {
        await mem.destroy();
        memberships?.revalidate?.();
      } catch (err: any) {
        alert(err.errors?.[0]?.message || 'Failed to remove member.');
      } finally {
        setRemovingId(null);
      }
    }
  };

  // Revoke invite
  const handleRevokeInvite = async (invite: any) => {
    if (window.confirm(`Are you sure you want to revoke the invitation for ${invite.emailAddress}?`)) {
      setRevokingId(invite.id);
      try {
        await invite.revoke();
        invitations?.revalidate?.();
      } catch (err: any) {
        alert(err.errors?.[0]?.message || 'Failed to revoke invitation.');
      } finally {
        setRevokingId(null);
      }
    }
  };

  // Leave organization
  const handleLeaveOrganization = async () => {
    if (!membership || !organization) return;
    if (window.confirm(`Are you sure you want to leave ${organization.name}? You will lose access to all its transactions.`)) {
      try {
        await membership.destroy();
        window.location.reload();
      } catch (err: any) {
        alert(err.errors?.[0]?.message || 'Failed to leave organization.');
      }
    }
  };

  return (
    <div
      id="merchant-dashboard"
      className="flex bg-zinc-50 dark:bg-zinc-950 min-h-screen text-zinc-805 dark:text-zinc-100 transition-colors duration-200"
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
        {startupLoading ? (
          <div className={`grid ${isOrgAdmin ? 'grid-cols-5' : 'grid-cols-4'} gap-4 mb-6`}>
            {[...Array(isOrgAdmin ? 5 : 4)].map((_, i) => (
              <div key={i} className="h-[92px] bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 flex flex-col justify-between animate-pulse">
                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-2/3" />
                <div className="h-6 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className={`grid ${isOrgAdmin ? 'grid-cols-5' : 'grid-cols-4'} gap-4 mb-6`}>
            <KPICard
              label="Total Transactions"
              value={stats?.total || '—'}
              accent="zinc"
              infoText={stats?.ai_insights?.total}
              loadingInfo={!stats?.ai_insights}
            />
            <KPICard
              label="Approval Rate"
              value={stats ? `${stats.approval_rate || 0}%` : '—'}
              accent="green"
              infoText={stats?.ai_insights?.approval_rate}
              loadingInfo={!stats?.ai_insights}
            />
            {isOrgAdmin && (
              <KPICard
                label="Rejection Rate"
                value={stats && (Number(stats.total) - Number(stats.pending)) > 0 ? `${((Number(stats.rejected) / (Number(stats.total) - Number(stats.pending))) * 100).toFixed(1)}%` : '0%'}
                accent="red"
                infoText={stats?.ai_insights?.rejection_rate}
                loadingInfo={!stats?.ai_insights}
              />
            )}
            <KPICard
              label="Flagged"
              value={stats?.flagged || '—'}
              sub="Requires review"
              accent="amber"
              infoText={stats?.ai_insights?.flagged}
              loadingInfo={!stats?.ai_insights}
            />
            <KPICard
              label="Total Volume"
              value={stats ? `$${Number(stats.total_volume).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
              accent="blue"
              infoText={stats?.ai_insights?.total_volume}
              loadingInfo={!stats?.ai_insights}
            />
          </div>
        )}

        {/* Tab Selector (Visible to all, but tabs depend on role) */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 mb-6 gap-2">
          <button
            onClick={() => { setActiveTab('transactions'); setPage(1); }}
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'transactions'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            Transaction History
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'analytics'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            Volume Velocity & Analytics
          </button>
          {isOrgAdmin && (
            <button
              onClick={() => setActiveTab('flagged')}
              className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
                activeTab === 'flagged'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              Flagged & Rejected Audit
            </button>
          )}
          <button
            onClick={() => setActiveTab('news')}
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'news'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            News & Alerts
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'members'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {isOrgAdmin ? 'Members & Settings' : 'Organization Members'}
          </button>
        </div>

        {/* Main Content Area based on Selected Tab */}
        {activeTab === 'transactions' && (
          <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h2 className="text-xs font-medium text-zinc-750 dark:text-zinc-300 uppercase tracking-wider">Transaction History</h2>
              {pagination && (
                <span className="text-xs text-zinc-400 dark:text-zinc-600 font-mono">
                  {pagination.total} total · Page {pagination.page} of {pagination.pages}
                </span>
              )}
            </div>

            <TransactionTable transactions={transactions} loading={loading || startupLoading} showMetadata={isOrgAdmin} />

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  id="prev-page-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p: number) => p - 1)}
                  className="text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-550 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <span className="text-xs font-mono text-zinc-500">{page} / {pagination.pages}</span>
                <button
                  id="next-page-btn"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p: number) => p + 1)}
                  className="text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-550 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left/Middle Columns: Volume Velocity & AI Explanation */}
            <div className="lg:col-span-2 space-y-6">
              {/* Volume Velocity Chart Card */}
              {startupLoading ? (
                <div className="h-64 bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 animate-pulse flex items-center justify-center text-zinc-400 dark:text-zinc-500 text-xs font-mono">
                  Initializing Real-time Risk Analytics...
                </div>
              ) : (
                (() => {
                  const rawChartData = stats?.chart_data || [];
                  const chartData = rawChartData.length > 0 ? rawChartData.slice(-12) : [...Array(12)].map((_, idx: number) => {
                    const time = new Date(Date.now() - (11 - idx) * 5 * 60000);
                    return {
                      bucket: time.toISOString(),
                      count: Math.floor(Math.random() * 20) + 5,
                      volume: Math.floor(Math.random() * 80000) + 10000,
                      flagged_rejected: Math.floor(Math.random() * 2),
                    };
                  });
                  const maxVolume = Math.max(...chartData.map((d: any) => Number(d.volume)), 10000);

                  return (
                    <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 relative">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 uppercase tracking-wider mb-0.5">Real-time Volume Velocity Monitor</h3>
                          <p className="text-[10px] text-zinc-450 dark:text-zinc-500">Hourly volume velocity aggregated in 5-minute intervals. Hover over bars to audit risk distribution.</p>
                        </div>
                        <div className="flex items-center gap-4 text-[10px]">
                          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                            <div className="w-2.5 h-2.5 bg-blue-500/80 rounded" />
                            <span>Clear Volume</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                            <div className="w-2.5 h-2.5 bg-red-500/80 rounded" />
                            <span>Flagged/Rejected</span>
                          </div>
                        </div>
                      </div>

                      <div className="relative h-[120px] w-full flex items-end">
                        <svg className="w-full h-full" viewBox="0 0 800 120" preserveAspectRatio="none">
                          {/* Grid Lines */}
                          <line x1="40" y1="10" x2="780" y2="10" stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" strokeWidth="1" strokeDasharray="3 3" />
                          <line x1="40" y1="60" x2="780" y2="60" stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" strokeWidth="1" strokeDasharray="3 3" />
                          <line x1="40" y1="110" x2="780" y2="110" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeWidth="1" />

                          {/* Volume Scale Labels */}
                          <text x="10" y="14" fill="#71717a" className="text-[9px] font-mono">${(maxVolume).toLocaleString('en-US', { maximumFractionDigits: 0 })}</text>
                          <text x="10" y="64" fill="#71717a" className="text-[9px] font-mono">${(maxVolume/2).toLocaleString('en-US', { maximumFractionDigits: 0 })}</text>
                          <text x="10" y="114" fill="#71717a" className="text-[9px] font-mono">$0</text>

                          {/* Bars rendering */}
                          {chartData.map((d: any, idx: number) => {
                            const volumeVal = Number(d.volume);
                            const barHeight = (volumeVal / maxVolume) * 90; // max height of 90px
                            const yCoord = 110 - barHeight;
                            const xCoord = 70 + idx * 58;

                            const isHovered = hoveredBarIdx === idx;
                            const riskPercent = d.count > 0 ? (d.flagged_rejected / d.count) : 0;
                            const riskHeight = riskPercent * barHeight;
                            const safeHeight = barHeight - riskHeight;

                            const timeStr = new Date(d.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                            return (
                              <g key={idx}>
                                {/* Interactive Invisible Bar overlay */}
                                <rect
                                  x={xCoord - 10}
                                  y="10"
                                  width="44"
                                  height="100"
                                  fill="transparent"
                                  className="cursor-pointer"
                                  onMouseEnter={() => setHoveredBarIdx(idx)}
                                  onMouseLeave={() => setHoveredBarIdx(null)}
                                />

                                {/* Safe volume segment bar */}
                                {safeHeight > 0 && (
                                  <rect
                                    x={xCoord}
                                    y={yCoord + riskHeight}
                                    width="24"
                                    height={safeHeight}
                                    rx="2"
                                    fill="url(#blueGradient)"
                                    className={`transition-all duration-200 ${isHovered ? 'brightness-110' : 'opacity-85'}`}
                                  />
                                )}

                                {/* Risk volume segment bar */}
                                {riskHeight > 0 && (
                                  <rect
                                    x={xCoord}
                                    y={yCoord}
                                    width="24"
                                    height={riskHeight}
                                    rx="2"
                                    fill="url(#redGradient)"
                                    className={`transition-all duration-200 ${isHovered ? 'brightness-110' : 'opacity-90'}`}
                                  />
                                )}

                                {/* Label (Time) */}
                                {idx % 2 === 0 && (
                                  <text
                                    x={xCoord + 12}
                                    y="124"
                                    textAnchor="middle"
                                    fill="#71717a"
                                    className="text-[9px] font-mono"
                                  >
                                    {timeStr}
                                  </text>
                                )}
                              </g>
                            );
                          })}

                          {/* Definitions of Gradients */}
                          <defs>
                            <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.85" />
                              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.95" />
                            </linearGradient>
                            <linearGradient id="redGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f87171" stopOpacity="0.9" />
                              <stop offset="100%" stopColor="#b91c1c" stopOpacity="0.95" />
                            </linearGradient>
                          </defs>
                        </svg>

                        {/* Floating Interactive Tooltip */}
                        {hoveredBarIdx !== null && (
                          (() => {
                            const d = chartData[hoveredBarIdx];
                            const xCoord = 70 + hoveredBarIdx * 58;
                            const volumeVal = Number(d.volume);
                            const barHeight = (volumeVal / maxVolume) * 90;
                            const yCoord = 110 - barHeight;
                            const timeStart = new Date(d.bucket);
                            const timeEnd = new Date(timeStart.getTime() + 5 * 60000);
                            
                            const timeRange = `${timeStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${timeEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

                            return (
                              <div
                                className="absolute bg-white/95 dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-2xl p-2.5 z-[200] pointer-events-none text-left backdrop-blur-sm transition-all duration-150 text-zinc-800 dark:text-zinc-200"
                                style={{
                                  left: `${Math.min(Math.max(xCoord - 80, 10), 520)}px`,
                                  bottom: `${120 - yCoord + 10}px`,
                                  width: '184px'
                                }}
                              >
                                <div className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">{timeRange}</div>
                                <div className="flex flex-col gap-0.5 font-mono text-[10px]">
                                  <div className="flex justify-between">
                                    <span className="text-zinc-500 dark:text-zinc-400">Total Volume:</span>
                                    <span className="text-zinc-900 dark:text-zinc-100 font-bold">${volumeVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-zinc-500 dark:text-zinc-400">Total Txns:</span>
                                    <span className="text-zinc-900 dark:text-zinc-100 font-bold">{d.count}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-zinc-500 dark:text-zinc-400">Flagged/Rejected:</span>
                                    <span className="text-red-500 dark:text-red-400 font-bold">{d.flagged_rejected}</span>
                                  </div>
                                  <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800 mt-1 pt-1">
                                    <span className="text-zinc-500 dark:text-zinc-400">Approval Rate:</span>
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                      {d.count > 0 ? (((d.count - d.flagged_rejected) / d.count) * 100).toFixed(1) : '100'}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Gemini AI chart explanation card */}
              <div className="bg-blue-500/5 border border-blue-200 dark:border-blue-900/30 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-2 text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                  AI Trend Analysis
                </div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 font-sans leading-relaxed">
                  {stats?.ai_insights?.chart_explanation || 'Analyzing transaction trends and velocity metrics over the last hour...'}
                </p>
              </div>
            </div>

            {/* Right Column: Status Donut Chart */}
            <div className="space-y-6">
              {startupLoading ? (
                <div className="h-[350px] bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 animate-pulse flex items-center justify-center text-zinc-400 dark:text-zinc-500 text-xs font-mono">
                  Loading Distribution Analytics...
                </div>
              ) : (
                (() => {
                  const approvedCount = Number(stats?.approved || 0);
                  const flaggedCount = Number(stats?.flagged || 0);
                  const rejectedCount = Number(stats?.rejected || 0);
                  const pendingCount = Number(stats?.pending || 0);
                  const totalCount = approvedCount + flaggedCount + rejectedCount + pendingCount;

                  const approvedPct = totalCount > 0 ? (approvedCount / totalCount) : 0;
                  const flaggedPct = totalCount > 0 ? (flaggedCount / totalCount) : 0;
                  const rejectedPct = totalCount > 0 ? (rejectedCount / totalCount) : 0;
                  const pendingPct = totalCount > 0 ? (pendingCount / totalCount) : 0;

                  const radius = 70;
                  const strokeWidth = 14;
                  const circ = 2 * Math.PI * radius; // ~439.82

                  const slices = [
                    { name: 'Approved', key: 'approved', count: approvedCount, pct: approvedPct, cumPct: 0, gradientId: 'approvedDonutGradient', colorClass: 'text-blue-500' },
                    { name: 'Flagged', key: 'flagged', count: flaggedCount, pct: flaggedPct, cumPct: approvedPct, gradientId: 'flaggedDonutGradient', colorClass: 'text-amber-500' },
                    { name: 'Rejected', key: 'rejected', count: rejectedCount, pct: rejectedPct, cumPct: approvedPct + flaggedPct, gradientId: 'rejectedDonutGradient', colorClass: 'text-red-500' },
                    { name: 'Pending', key: 'pending', count: pendingCount, pct: pendingPct, cumPct: approvedPct + flaggedPct + rejectedPct, gradientId: 'pendingDonutGradient', colorClass: 'text-zinc-500' },
                  ];

                  const handleMouseMove = (e: React.MouseEvent) => {
                    const parentRect = e.currentTarget.parentElement?.getBoundingClientRect();
                    if (parentRect) {
                      setTooltipPos({
                        x: e.clientX - parentRect.left,
                        y: e.clientY - parentRect.top,
                      });
                    }
                  };

                  return (
                    <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 flex flex-col items-center relative">
                      <div className="self-start w-full mb-4">
                        <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 uppercase tracking-wider mb-0.5">Status Distribution</h3>
                        <p className="text-[10px] text-zinc-450 dark:text-zinc-500">Transaction distribution breakdown. Hover over arcs to inspect.</p>
                      </div>

                      <div className="relative w-[200px] h-[200px] flex items-center justify-center my-2">
                        <svg className="w-full h-full transform -scale-x-100" viewBox="0 0 200 200">
                          <defs>
                            <linearGradient id="approvedDonutGradient" x1="0" y1="0" x2="1" y2="1">
                              <stop offset="0%" stopColor="#60a5fa" />
                              <stop offset="100%" stopColor="#2563eb" />
                            </linearGradient>
                            <linearGradient id="flaggedDonutGradient" x1="0" y1="0" x2="1" y2="1">
                              <stop offset="0%" stopColor="#fbbf24" />
                              <stop offset="100%" stopColor="#d97706" />
                            </linearGradient>
                            <linearGradient id="rejectedDonutGradient" x1="0" y1="0" x2="1" y2="1">
                              <stop offset="0%" stopColor="#f87171" />
                              <stop offset="100%" stopColor="#dc2626" />
                            </linearGradient>
                            <linearGradient id="pendingDonutGradient" x1="0" y1="0" x2="1" y2="1">
                              <stop offset="0%" stopColor="#a1a1aa" />
                              <stop offset="100%" stopColor="#52525b" />
                            </linearGradient>
                          </defs>

                          {/* Base track when empty */}
                          {totalCount === 0 && (
                            <circle
                              cx="100"
                              cy="100"
                              r={radius}
                              fill="none"
                              stroke="currentColor"
                              className="text-zinc-150 dark:text-zinc-800"
                              strokeWidth={strokeWidth}
                            />
                          )}

                          {slices.map((slice) => {
                            if (slice.count === 0) return null;
                            const isHovered = hoveredSlice === slice.key;

                            return (
                              <circle
                                key={slice.key}
                                cx="100"
                                cy="100"
                                r={radius}
                                fill="none"
                                stroke={`url(#${slice.gradientId})`}
                                strokeWidth={isHovered ? strokeWidth + 3 : strokeWidth}
                                strokeDasharray={circ}
                                strokeDashoffset={circ * (1 - slice.pct)}
                                transform={`rotate(${-90 + 365 * slice.cumPct} 100 100)`}
                                className="transition-all duration-200 cursor-pointer origin-center"
                                onMouseEnter={() => setHoveredSlice(slice.key as any)}
                                onMouseLeave={() => { setHoveredSlice(null); setTooltipPos(null); }}
                                onMouseMove={handleMouseMove}
                              />
                            );
                          })}
                        </svg>

                        {/* Center Display */}
                        <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 dark:text-zinc-500">
                            {hoveredSlice ? hoveredSlice : 'Total'}
                          </span>
                          <span className="text-lg font-mono font-bold text-zinc-850 dark:text-zinc-100 mt-0.5">
                            {hoveredSlice === 'approved' ? approvedCount.toLocaleString() :
                             hoveredSlice === 'flagged' ? flaggedCount.toLocaleString() :
                             hoveredSlice === 'rejected' ? rejectedCount.toLocaleString() :
                             hoveredSlice === 'pending' ? pendingCount.toLocaleString() :
                             totalCount.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono mt-0.5">
                            {hoveredSlice ? `${((hoveredSlice === 'approved' ? approvedPct :
                                             hoveredSlice === 'flagged' ? flaggedPct :
                                             hoveredSlice === 'rejected' ? rejectedPct :
                                             pendingPct) * 105).toFixed(1)}%` : '100%'}
                          </span>
                        </div>
                      </div>

                      {/* Legend list */}
                      <div className="w-full grid grid-cols-2 gap-2 mt-4">
                        {slices.map((slice) => {
                          const isHovered = hoveredSlice === slice.key;
                          return (
                            <div
                              key={slice.key}
                              onMouseEnter={() => setHoveredSlice(slice.key as any)}
                              onMouseLeave={() => setHoveredSlice(null)}
                              className={`flex items-center gap-2 p-2 rounded-md transition-colors cursor-pointer border ${
                                isHovered 
                                  ? 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800' 
                                  : 'border-transparent'
                              }`}
                            >
                              <div className={`w-2.5 h-2.5 rounded-full ${
                                slice.key === 'approved' ? 'bg-blue-500' :
                                slice.key === 'flagged' ? 'bg-amber-500' :
                                slice.key === 'rejected' ? 'bg-red-500' :
                                'bg-zinc-500'
                              }`} />
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">{slice.name}</span>
                                <span className="text-xs font-mono font-bold text-zinc-850 dark:text-zinc-100">{slice.count.toLocaleString()}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Floating Tooltip */}
                      {hoveredSlice && tooltipPos && (
                        <div
                          className="absolute bg-white/95 dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-2xl p-2.5 z-[200] pointer-events-none text-left backdrop-blur-sm transition-all duration-75 text-zinc-800 dark:text-zinc-200"
                          style={{
                            left: `${tooltipPos.x + 12}px`,
                            top: `${tooltipPos.y - 45}px`,
                            width: '140px'
                          }}
                        >
                          <div className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                            {hoveredSlice.toUpperCase()}
                          </div>
                          <div className="font-mono text-xs flex justify-between">
                            <span className="text-zinc-500 dark:text-zinc-400">Count:</span>
                            <span className="font-bold text-zinc-900 dark:text-zinc-100">
                              {hoveredSlice === 'approved' ? approvedCount :
                               hoveredSlice === 'flagged' ? flaggedCount :
                               hoveredSlice === 'rejected' ? rejectedCount :
                               pendingCount}
                            </span>
                          </div>
                          <div className="font-mono text-xs flex justify-between mt-0.5">
                            <span className="text-zinc-500 dark:text-zinc-400">Share:</span>
                            <span className="font-bold text-zinc-900 dark:text-zinc-100">
                              {(totalCount > 0 ? (
                                (hoveredSlice === 'approved' ? approvedPct :
                                 hoveredSlice === 'flagged' ? flaggedPct :
                                 hoveredSlice === 'rejected' ? rejectedPct :
                                 pendingPct) * 100
                              ) : 0).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {activeTab === 'flagged' && isOrgAdmin && (
          <div className="space-y-4">
            {startupLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">AI-Powered Risk Auditing</h3>
                  <p className="text-xs text-zinc-500">
                    Audit flagged or rejected transactions in real-time. Click "Run AI Risk Audit" to request an analysis of the transaction data from the Gemini AI Risk Engine.
                  </p>
                </div>
                
                <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                    <h2 className="text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-semibold">Flagged/Rejected Transactions</h2>
                    <span className="text-xs text-zinc-400 dark:text-zinc-650 font-mono">
                      {transactions.filter((t: any) => t.status === 'FLAGGED' || t.status === 'REJECTED').length} matches
                    </span>
                  </div>
                  
                  <div className="divide-y divide-zinc-200/50 dark:divide-zinc-800/80">
                    {transactions.filter((t: any) => t.status === 'FLAGGED' || t.status === 'REJECTED').length === 0 ? (
                      <div className="p-8 text-center text-zinc-400 dark:text-zinc-500 text-xs">
                        No flagged or rejected transactions found.
                      </div>
                    ) : (
                      transactions
                        .filter((t: any) => t.status === 'FLAGGED' || t.status === 'REJECTED')
                        .map((txn: any) => (
                          <div key={txn.id} className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/10 transition-colors flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{txn.id.substring(0, 8)}…{txn.id.substring(28)}</span>
                                <span className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{txn.customer_name || 'N/A'}</span>
                                <span className="text-xs text-zinc-550 dark:text-zinc-500 font-mono">{txn.location || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-mono font-semibold text-zinc-800 dark:text-zinc-200">${Number(txn.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                  txn.status === 'FLAGGED' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                                }`}>{txn.status}</span>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{new Date(txn.created_at).toLocaleTimeString()}</span>
                              </div>
                            </div>
                            
                            {/* Gemini AI explanation card */}
                            <div className="mt-1">
                              {explanations[txn.id] ? (
                                <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 flex flex-col gap-2">
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                                    AI Risk Audit Summary
                                  </div>
                                  <p className="text-xs text-zinc-700 dark:text-zinc-300 font-sans font-normal leading-relaxed">
                                    {explanations[txn.id].replace(/[\*_"]/g, '')}
                                  </p>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleExplain(txn.id)}
                                  disabled={explainingId === txn.id}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/40 text-blue-600 dark:text-blue-400 text-xs font-semibold rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
              </>
            )}
          </div>
        )}

        {activeTab === 'news' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">Real-time Financial & Transaction News</h3>
                <p className="text-xs text-zinc-500">
                  Stay updated with global compliance events, payment regulations, and fraud prevention alerts. Refreshes every 5 minutes.
                </p>
              </div>
              <button
                onClick={fetchNews}
                disabled={newsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all font-semibold disabled:opacity-50"
              >
                <RefreshCw size={12} className={newsLoading ? "animate-spin" : ""} />
                Fetch News
              </button>
            </div>

            {newsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-28 bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 flex flex-col justify-between animate-pulse">
                    <div className="space-y-2">
                      <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4" />
                      <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2" />
                    </div>
                    <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-1/4" />
                  </div>
                ))}
              </div>
            ) : news.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg p-12 text-center flex flex-col items-center justify-center gap-3">
                <span className="text-xs text-zinc-500">No recent articles found. Try fetching new content.</span>
                <button
                  onClick={fetchNews}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-semibold transition-colors"
                >
                  Retrieve Feed
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {news.map((item: any, idx: number) => {
                  let formattedDate = item.pubDate;
                  try {
                    formattedDate = new Date(item.pubDate).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                  } catch (e) {}

                  return (
                    <div 
                      key={idx} 
                      className="border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900/30 p-5 rounded-lg flex flex-col gap-2 hover:translate-x-1 duration-205 transition-all shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <a 
                          href={item.link} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-sm font-semibold text-zinc-800 hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400 leading-snug"
                        >
                          {item.title}
                        </a>
                        <span className="shrink-0 px-2 py-0.5 rounded text-[9px] uppercase font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-750">
                          {item.source}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans font-normal">
                        {item.description}
                      </p>
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono mt-1">
                        Published: {formattedDate}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {startupLoading ? (
              <>
                <div className="lg:col-span-2 h-[350px] bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-lg animate-pulse" />
                <div className="h-[350px] bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-lg animate-pulse" />
              </>
            ) : (
              <>
                {/* Members List (2 cols) */}
                <div className="lg:col-span-2 bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                    <h2 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Organization Members</h2>
                    <span className="text-xs text-zinc-400 dark:text-zinc-600 font-mono">
                      {memberships?.data?.length || 0} active
                    </span>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 uppercase tracking-wider text-[10px] font-medium">
                          <th className="px-4 py-3">Member</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200/50 dark:divide-zinc-800/50">
                        {!memberships?.data ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-zinc-400 dark:text-zinc-500 font-mono">
                              Loading members...
                            </td>
                          </tr>
                        ) : (
                          memberships.data.map((mem: any) => {
                            const isSelf = mem.publicUserData.userId === currentUserId;
                            const displayName = [mem.publicUserData.firstName, mem.publicUserData.lastName].filter(Boolean).join(' ') || mem.publicUserData.identifier;
                            const roleDisplay = mem.role === 'org:admin' || mem.role === 'admin' ? 'Administrator' : 'Member';
                            
                            return (
                              <tr key={mem.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                                <td className="px-4 py-3 flex items-center gap-3">
                                  <img 
                                    src={mem.publicUserData.imageUrl} 
                                    alt="" 
                                    className="w-6 h-6 rounded-full border border-zinc-200 dark:border-zinc-800"
                                  />
                                  <div className="flex flex-col">
                                    <span className="text-zinc-700 dark:text-zinc-200 font-medium">{displayName}</span>
                                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">{mem.publicUserData.identifier}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-zinc-650 dark:text-zinc-300">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                    roleDisplay === 'Administrator' 
                                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20' 
                                      : 'bg-zinc-100 dark:bg-zinc-850 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/50'
                                  }`}>
                                    {roleDisplay}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {isSelf ? (
                                    <span className="text-[10px] text-zinc-400 dark:text-zinc-650 italic px-2">Current User</span>
                                  ) : isOrgAdmin ? (
                                    <button
                                      onClick={() => handleRemoveMember(mem)}
                                      disabled={removingId === mem.id}
                                      className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-500 dark:text-red-400 rounded text-[10px] font-semibold transition-colors disabled:opacity-50"
                                    >
                                      {removingId === mem.id ? 'Removing...' : 'Remove'}
                                    </button>
                                  ) : (
                                    <span className="text-zinc-400 dark:text-zinc-600">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right column: Invite Form (for Admin) or Org Details (for Member) */}
                <div className="flex flex-col gap-6">
                  {isOrgAdmin ? (
                    <>
                      {/* Invite Form */}
                      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 flex flex-col gap-4">
                        <div>
                          <h3 className="text-xs font-semibold text-zinc-750 dark:text-zinc-200 uppercase tracking-wider mb-1">Invite New Member</h3>
                          <p className="text-[11px] text-zinc-450 dark:text-zinc-500">Send an invitation email to join this organization.</p>
                        </div>
                        
                        <form onSubmit={handleInvite} className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500">Email Address</label>
                            <input
                              type="email"
                              required
                              placeholder="email@example.com"
                              value={inviteEmail}
                              onChange={(e: any) => setInviteEmail(e.target.value)}
                              className="bg-zinc-50 dark:bg-zinc-855 border border-zinc-200 dark:border-zinc-800 rounded px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                          </div>
                          
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500">Role</label>
                            <select
                              value={inviteRole}
                              onChange={(e: any) => setInviteRole(e.target.value as any)}
                              className="bg-zinc-50 dark:bg-zinc-855 border border-zinc-200 dark:border-zinc-800 rounded px-2.5 py-2 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors"
                            >
                              <option value="org:member">Member</option>
                              <option value="org:admin">Administrator</option>
                            </select>
                          </div>
                          
                          {inviteError && (
                            <div className="text-[11px] text-red-500 dark:text-red-400 bg-red-500/5 border border-red-500/10 rounded p-2 font-medium">
                              {inviteError}
                            </div>
                          )}
                          {inviteSuccess && (
                            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 rounded p-2 font-medium">
                              {inviteSuccess}
                            </div>
                          )}
                          
                          <button
                            type="submit"
                            disabled={isInviting}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            {isInviting ? 'Sending...' : 'Send Invitation'}
                          </button>
                        </form>
                      </div>

                      {/* Pending Invitations list */}
                      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
                        <h3 className="text-xs font-semibold text-zinc-750 dark:text-zinc-200 uppercase tracking-wider">Pending Invitations</h3>
                        
                        <div className="divide-y divide-zinc-200/50 dark:divide-zinc-800/60 max-h-60 overflow-y-auto">
                          {!invitations?.data ? (
                            <div className="text-center text-zinc-400 dark:text-zinc-650 text-[11px] py-4">Loading invites...</div>
                          ) : invitations.data.length === 0 ? (
                            <div className="text-center text-zinc-400 dark:text-zinc-650 text-[11px] py-4">No pending invitations.</div>
                          ) : (
                            invitations.data.map((inv: any) => (
                              <div key={inv.id} className="py-2.5 flex items-center justify-between gap-2 text-[11px]">
                                <div className="flex flex-col gap-0.5 truncate">
                                  <span className="text-zinc-700 dark:text-zinc-300 truncate font-medium">{inv.emailAddress}</span>
                                  <span className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-semibold">
                                    {inv.role === 'org:admin' || inv.role === 'admin' ? 'Admin' : 'Member'}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleRevokeInvite(inv)}
                                  disabled={revokingId === inv.id}
                                  className="text-red-500 dark:text-red-400 hover:text-red-650 dark:hover:text-red-300 font-semibold disabled:opacity-50"
                                >
                                  Revoke
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Organization Profile Details */}
                      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 flex flex-col gap-4">
                        <div>
                          <h3 className="text-xs font-semibold text-zinc-750 dark:text-zinc-200 uppercase tracking-wider mb-1">Organization Profile</h3>
                          <p className="text-[11px] text-zinc-450 dark:text-zinc-500">Details of your active organization.</p>
                        </div>
                        
                        <div className="flex items-center gap-3 bg-zinc-100 dark:bg-zinc-950 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800/85">
                          {organization?.imageUrl ? (
                            <img src={organization.imageUrl} alt="" className="w-10 h-10 rounded-lg border border-zinc-200 dark:border-zinc-800" />
                          ) : (
                            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                              {organization?.name?.[0] || 'O'}
                            </div>
                          )}
                          <div className="flex flex-col truncate">
                            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate">{organization?.name || 'OLD ERA AI'}</span>
                            <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono truncate">ID: {organization?.id}</span>
                          </div>
                        </div>

                        <div className="text-[11px] text-zinc-650 dark:text-zinc-400 bg-blue-500/5 border border-blue-200 dark:border-blue-900/10 rounded-lg p-3 leading-relaxed">
                          <div className="font-semibold text-blue-600 dark:text-blue-400 mb-1 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                            Member Access
                          </div>
                          You are signed in as a Member of this organization. You can view all transactions and team members, but cannot modify settings or invite new users.
                        </div>
                      </div>

                      {/* Leave Organization Card */}
                      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 flex flex-col gap-3">
                        <h3 className="text-xs font-semibold text-zinc-750 dark:text-zinc-200 uppercase tracking-wider">Leave Organization</h3>
                        <p className="text-[11px] text-zinc-450 dark:text-zinc-500 leading-relaxed">
                          Leaving will revoke your access to this organization's transactions and dashboard.
                        </p>
                        
                        <button
                          onClick={handleLeaveOrganization}
                          className="mt-2 w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-500 dark:text-red-400 rounded text-xs font-semibold transition-colors"
                        >
                          Leave Organization
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
