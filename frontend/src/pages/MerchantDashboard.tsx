import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, useOrganization } from '@clerk/clerk-react';
import { RefreshCw, FileDown, ChevronDown, ChevronUp, Send } from 'lucide-react';
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

  // Review States
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewStatus, setReviewStatus] = useState<Record<string, string>>({});
  const [submittingReviewId, setSubmittingReviewId] = useState<string | null>(null);
  const [reviewMessages, setReviewMessages] = useState<Record<string, { type: 'success' | 'error' | 'warning'; text: string }>>({});

  // Report Download State
  const [downloadingReport, setDownloadingReport] = useState(false);

  // Line chart hover
  const [hoveredLineIdx, setHoveredLineIdx] = useState<number | null>(null);

  // Pie chart hover
  const [hoveredPieSlice, setHoveredPieSlice] = useState<number | null>(null);

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

  // Submit review
  const handleSubmitReview = async (txnId: string) => {
    const notes = reviewNotes[txnId];
    const status = reviewStatus[txnId];
    if (!notes || !status) {
      setReviewMessages(prev => ({ ...prev, [txnId]: { type: 'error', text: 'Please select a status and add review notes.' } }));
      return;
    }

    setSubmittingReviewId(txnId);
    try {
      const token = await getToken();
      if (!token) return;
      const result = await api.reviewTransaction(token, txnId, { status, review_notes: notes });
      
      if (result.overridden) {
        setReviewMessages(prev => ({ ...prev, [txnId]: { type: 'warning', text: result.message } }));
      } else {
        setReviewMessages(prev => ({ ...prev, [txnId]: { type: 'success', text: result.message } }));
      }
      
      // Refresh data
      fetchData();
      setExpandedReviewId(null);
    } catch (err: any) {
      setReviewMessages(prev => ({ ...prev, [txnId]: { type: 'error', text: err.message || 'Failed to submit review.' } }));
    } finally {
      setSubmittingReviewId(null);
    }
  };

  // Download 30-day report
  const handleDownloadReport = async () => {
    setDownloadingReport(true);
    try {
      const token = await getToken();
      if (!token) return;
      const blob = await api.getReport(token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NewEraAI_30Day_Report_${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading report:', err);
      alert('Failed to generate report. Please try again.');
    } finally {
      setDownloadingReport(false);
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

  // Get all flagged/rejected/suspicious transactions
  const flaggedTransactions = transactions.filter((t: any) => t.status === 'FLAGGED' || t.status === 'REJECTED' || t.status === 'SUSPICIOUS');

  // Status options based on role
  const getStatusOptions = (currentStatus: string) => {
    if (isOrgAdmin) {
      return [
        { value: 'APPROVED', label: 'Approve', color: 'text-emerald-600' },
        { value: 'FLAGGED', label: 'Flag', color: 'text-amber-600' },
        { value: 'REJECTED', label: 'Reject', color: 'text-red-600' },
        { value: 'SUSPICIOUS', label: 'Mark Suspicious', color: 'text-pink-600' },
      ].filter(opt => opt.value !== currentStatus);
    }
    // Members can only flag or mark suspicious
    return [
      { value: 'FLAGGED', label: 'Flag for Review', color: 'text-amber-600' },
      { value: 'SUSPICIOUS', label: 'Mark Suspicious', color: 'text-pink-600' },
    ].filter(opt => opt.value !== currentStatus);
  };

  return (
    <div
      id="merchant-dashboard"
      className="flex bg-zinc-50 dark:bg-zinc-950 min-h-screen text-zinc-800 dark:text-zinc-100 transition-colors duration-200"
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

        {/* Tab Selector + Report Download */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 mb-6">
          <div className="flex gap-2">
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

          {/* Report Download Button */}
          <button
            onClick={handleDownloadReport}
            disabled={downloadingReport}
            className="flex items-center gap-1.5 px-3 py-1.5 mb-1 text-xs text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloadingReport ? (
              <>
                <div className="w-3 h-3 border-2 border-blue-400/20 border-t-blue-400 rounded-full animate-spin" />
                Generating AI Report...
              </>
            ) : (
              <>
                <FileDown size={12} />
                30-Day Report
              </>
            )}
          </button>
        </div>

        {/* ═══════════════════════ TAB: TRANSACTIONS ═══════════════════════ */}
        {activeTab === 'transactions' && (
          <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h2 className="text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Transaction History</h2>
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
                  className="text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <span className="text-xs font-mono text-zinc-500">{page} / {pagination.pages}</span>
                <button
                  id="next-page-btn"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p: number) => p + 1)}
                  className="text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════ TAB: ANALYTICS ═══════════════════════ */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Row 1: Volume Velocity Chart + AI Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Hourly volume velocity aggregated in 5-minute intervals. Hover over bars to audit risk distribution.</p>
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

                        <div className="relative h-[180px] w-full flex items-end">
                          <svg className="w-full h-full" viewBox="0 0 800 180" preserveAspectRatio="none">
                            {/* Grid Lines */}
                            <line x1="50" y1="10" x2="780" y2="10" stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" strokeWidth="1" strokeDasharray="3 3" />
                            <line x1="50" y1="55" x2="780" y2="55" stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" strokeWidth="1" strokeDasharray="3 3" />
                            <line x1="50" y1="100" x2="780" y2="100" stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" strokeWidth="1" strokeDasharray="3 3" />
                            <line x1="50" y1="155" x2="780" y2="155" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeWidth="1" />

                            {/* Volume Scale Labels */}
                            <text x="5" y="14" fill="#71717a" fontSize="10" fontFamily="monospace">${(maxVolume).toLocaleString('en-US', { maximumFractionDigits: 0 })}</text>
                            <text x="5" y="59" fill="#71717a" fontSize="10" fontFamily="monospace">${(maxVolume * 0.66).toLocaleString('en-US', { maximumFractionDigits: 0 })}</text>
                            <text x="5" y="104" fill="#71717a" fontSize="10" fontFamily="monospace">${(maxVolume * 0.33).toLocaleString('en-US', { maximumFractionDigits: 0 })}</text>
                            <text x="5" y="159" fill="#71717a" fontSize="10" fontFamily="monospace">$0</text>

                            {/* Bars rendering */}
                            {chartData.map((d: any, idx: number) => {
                              const volumeVal = Number(d.volume);
                              const barHeight = (volumeVal / maxVolume) * 135;
                              const yCoord = 155 - barHeight;
                              const xCoord = 80 + idx * 56;

                              const isHovered = hoveredBarIdx === idx;
                              const riskPercent = d.count > 0 ? (d.flagged_rejected / d.count) : 0;
                              const riskHeight = riskPercent * barHeight;
                              const safeHeight = barHeight - riskHeight;

                              const timeStr = new Date(d.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                              return (
                                <g key={idx}>
                                  {/* Interactive Invisible Bar overlay */}
                                  <rect
                                    x={xCoord - 12}
                                    y="10"
                                    width="50"
                                    height="150"
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
                                      width="26"
                                      height={safeHeight}
                                      rx="3"
                                      fill="url(#blueGradient)"
                                      className={`transition-all duration-200 ${isHovered ? 'brightness-110' : 'opacity-85'}`}
                                    />
                                  )}

                                  {/* Risk volume segment bar */}
                                  {riskHeight > 0 && (
                                    <rect
                                      x={xCoord}
                                      y={yCoord}
                                      width="26"
                                      height={riskHeight}
                                      rx="3"
                                      fill="url(#redGradient)"
                                      className={`transition-all duration-200 ${isHovered ? 'brightness-110' : 'opacity-90'}`}
                                    />
                                  )}

                                  {/* Time label — all shown, rotated for readability */}
                                  <text
                                    x={xCoord + 13}
                                    y="172"
                                    textAnchor="middle"
                                    fill="#71717a"
                                    fontSize="10"
                                    fontFamily="monospace"
                                  >
                                    {timeStr}
                                  </text>
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
                              const xCoord = 80 + hoveredBarIdx * 56;
                              const volumeVal = Number(d.volume);
                              const barHeight = (volumeVal / maxVolume) * 135;
                              const yCoord = 155 - barHeight;
                              const timeStart = new Date(d.bucket);
                              const timeEnd = new Date(timeStart.getTime() + 5 * 60000);
                              
                              const timeRange = `${timeStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${timeEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

                              return (
                                <div
                                  className="absolute bg-white/95 dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-2xl p-2.5 z-[200] pointer-events-none text-left backdrop-blur-sm transition-all duration-150 text-zinc-800 dark:text-zinc-200"
                                  style={{
                                    left: `${Math.min(Math.max(xCoord - 80, 10), 520)}px`,
                                    bottom: `${180 - yCoord + 10}px`,
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
                    const circ = 2 * Math.PI * radius;

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
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Transaction distribution breakdown. Hover over arcs to inspect.</p>
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

                            {totalCount === 0 && (
                              <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeWidth={strokeWidth} />
                            )}

                            {slices.map((slice) => {
                              if (slice.count === 0) return null;
                              const isHovered = hoveredSlice === slice.key;
                              return (
                                <circle
                                  key={slice.key}
                                  cx="100" cy="100" r={radius}
                                  fill="none"
                                  stroke={`url(#${slice.gradientId})`}
                                  strokeWidth={isHovered ? strokeWidth + 3 : strokeWidth}
                                  strokeDasharray={circ}
                                  strokeDashoffset={circ * (1 - slice.pct)}
                                  transform={`rotate(${-90 + 360 * slice.cumPct} 100 100)`}
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
                            <span className="text-lg font-mono font-bold text-zinc-800 dark:text-zinc-100 mt-0.5">
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
                                               pendingPct) * 100).toFixed(1)}%` : '100%'}
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
                                  <span className="text-xs font-mono font-bold text-zinc-800 dark:text-zinc-100">{slice.count.toLocaleString()}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Floating Tooltip */}
                        {hoveredSlice && tooltipPos && (
                          <div
                            className="absolute bg-white/95 dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-2xl p-2.5 z-[200] pointer-events-none text-left backdrop-blur-sm transition-all duration-75 text-zinc-800 dark:text-zinc-200"
                            style={{ left: `${tooltipPos.x + 12}px`, top: `${tooltipPos.y - 45}px`, width: '140px' }}
                          >
                            <div className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">{hoveredSlice.toUpperCase()}</div>
                            <div className="font-mono text-xs flex justify-between">
                              <span className="text-zinc-500 dark:text-zinc-400">Count:</span>
                              <span className="font-bold text-zinc-900 dark:text-zinc-100">
                                {hoveredSlice === 'approved' ? approvedCount : hoveredSlice === 'flagged' ? flaggedCount : hoveredSlice === 'rejected' ? rejectedCount : pendingCount}
                              </span>
                            </div>
                            <div className="font-mono text-xs flex justify-between mt-0.5">
                              <span className="text-zinc-500 dark:text-zinc-400">Share:</span>
                              <span className="font-bold text-zinc-900 dark:text-zinc-100">
                                {(totalCount > 0 ? ((hoveredSlice === 'approved' ? approvedPct : hoveredSlice === 'flagged' ? flaggedPct : hoveredSlice === 'rejected' ? rejectedPct : pendingPct) * 100) : 0).toFixed(1)}%
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

            {/* Row 2: Line Chart + Pie Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Line Chart: Transaction Count Trend */}
              {!startupLoading && (() => {
                const rawChartData = stats?.chart_data || [];
                const chartData = rawChartData.length > 0 ? rawChartData.slice(-12) : [...Array(12)].map((_, idx) => {
                  const time = new Date(Date.now() - (11 - idx) * 5 * 60000);
                  return { bucket: time.toISOString(), count: Math.floor(Math.random() * 20) + 5, volume: Math.floor(Math.random() * 80000) + 10000, flagged_rejected: Math.floor(Math.random() * 2) };
                });
                const maxCount = Math.max(...chartData.map((d: any) => Number(d.count)), 5);
                const chartW = 560, chartH = 180, padL = 40, padR = 20, padT = 20, padB = 35;
                const plotW = chartW - padL - padR, plotH = chartH - padT - padB;

                const points = chartData.map((d: any, i: number) => ({
                  x: padL + (i / (chartData.length - 1)) * plotW,
                  y: padT + plotH - (Number(d.count) / maxCount) * plotH,
                  ...d,
                }));

                const linePath = points.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                const areaPath = `${linePath} L${points[points.length - 1].x},${padT + plotH} L${points[0].x},${padT + plotH} Z`;

                return (
                  <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
                    <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 uppercase tracking-wider mb-1">Transaction Count Trend</h3>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-4">Number of transactions per 5-minute interval over the last hour.</p>
                    <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto">
                      <defs>
                        <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      {/* Grid */}
                      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
                        <g key={i}>
                          <line x1={padL} y1={padT + plotH * (1 - f)} x2={padL + plotW} y2={padT + plotH * (1 - f)} stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" strokeWidth="1" strokeDasharray={f === 0 ? "0" : "3 3"} />
                          <text x={padL - 6} y={padT + plotH * (1 - f) + 4} textAnchor="end" fill="#a1a1aa" fontSize="9" fontFamily="monospace">{Math.round(maxCount * f)}</text>
                        </g>
                      ))}
                      {/* Area */}
                      <path d={areaPath} fill="url(#lineAreaGrad)" />
                      {/* Line */}
                      <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      {/* Dots + Labels */}
                      {points.map((p: any, i: number) => {
                        const timeStr = new Date(p.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const isHov = hoveredLineIdx === i;
                        return (
                          <g key={i}>
                            <rect x={p.x - 20} y={padT} width="40" height={plotH} fill="transparent" className="cursor-pointer"
                              onMouseEnter={() => setHoveredLineIdx(i)} onMouseLeave={() => setHoveredLineIdx(null)} />
                            <circle cx={p.x} cy={p.y} r={isHov ? 5 : 3} fill={isHov ? '#2563eb' : '#3b82f6'} stroke="white" strokeWidth="2" className="transition-all duration-150" />
                            {isHov && (
                              <g>
                                <line x1={p.x} y1={p.y} x2={p.x} y2={padT + plotH} stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
                                <rect x={p.x - 32} y={p.y - 28} width="64" height="20" rx="4" fill="white" stroke="#e4e4e7" />
                                <text x={p.x} y={p.y - 14} textAnchor="middle" fill="#18181b" fontSize="10" fontWeight="700" fontFamily="monospace">{p.count} txns</text>
                              </g>
                            )}
                            {i % 2 === 0 && <text x={p.x} y={padT + plotH + 16} textAnchor="middle" fill="#a1a1aa" fontSize="9" fontFamily="monospace">{timeStr}</text>}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                );
              })()}

              {/* Pie Chart: Amount Distribution */}
              {!startupLoading && (() => {
                const ranges = [
                  { label: '$0 - $1K', min: 0, max: 1000, color: '#60a5fa' },
                  { label: '$1K - $5K', min: 1000, max: 5000, color: '#34d399' },
                  { label: '$5K - $10K', min: 5000, max: 10000, color: '#fbbf24' },
                  { label: '$10K - $50K', min: 10000, max: 50000, color: '#f87171' },
                  { label: '$50K+', min: 50000, max: Infinity, color: '#a78bfa' },
                ];

                const rangeCounts = ranges.map(r => ({
                  ...r,
                  count: transactions.filter(t => Number(t.amount) >= r.min && Number(t.amount) < r.max).length,
                }));
                const totalPie = rangeCounts.reduce((sum, r) => sum + r.count, 0) || 1;

                let cumAngle = 0;
                const pieSlices = rangeCounts.map((r, i) => {
                  const angle = (r.count / totalPie) * 360;
                  const startAngle = cumAngle;
                  cumAngle += angle;
                  return { ...r, startAngle, angle, index: i };
                });

                const toRad = (deg: number) => (deg * Math.PI) / 180;
                const cx = 100, cy = 100, pieR = 80;

                return (
                  <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5">
                    <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 uppercase tracking-wider mb-1">Amount Distribution</h3>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-4">Transaction count by amount range from current page data.</p>
                    <div className="flex items-center gap-6">
                      <svg viewBox="0 0 200 200" className="w-[180px] h-[180px] flex-shrink-0">
                        {pieSlices.map((slice) => {
                          if (slice.count === 0) return null;
                          const isHov = hoveredPieSlice === slice.index;
                          const startRad = toRad(slice.startAngle - 90);
                          const endRad = toRad(slice.startAngle + slice.angle - 90);
                          const largeArc = slice.angle > 180 ? 1 : 0;

                          const explode = isHov ? 4 : 0;
                          const midAngle = toRad(slice.startAngle + slice.angle / 2 - 90);
                          const ex = Math.cos(midAngle) * explode;
                          const ey = Math.sin(midAngle) * explode;

                          const x1 = cx + ex + pieR * Math.cos(startRad);
                          const y1 = cy + ey + pieR * Math.sin(startRad);
                          const x2 = cx + ex + pieR * Math.cos(endRad);
                          const y2 = cy + ey + pieR * Math.sin(endRad);

                          const path = slice.angle >= 359.99
                            ? `M ${cx + ex},${cy + ey - pieR} A ${pieR},${pieR} 0 1 1 ${cx + ex},${cy + ey + pieR} A ${pieR},${pieR} 0 1 1 ${cx + ex},${cy + ey - pieR} Z`
                            : `M ${cx + ex},${cy + ey} L ${x1},${y1} A ${pieR},${pieR} 0 ${largeArc} 1 ${x2},${y2} Z`;

                          return (
                            <path
                              key={slice.index}
                              d={path}
                              fill={slice.color}
                              opacity={isHov ? 1 : 0.85}
                              className="transition-all duration-200 cursor-pointer"
                              onMouseEnter={() => setHoveredPieSlice(slice.index)}
                              onMouseLeave={() => setHoveredPieSlice(null)}
                              stroke="white"
                              strokeWidth="2"
                            />
                          );
                        })}
                      </svg>
                      <div className="flex flex-col gap-2 flex-1">
                        {pieSlices.map((slice) => {
                          const isHov = hoveredPieSlice === slice.index;
                          return (
                            <div
                              key={slice.index}
                              onMouseEnter={() => setHoveredPieSlice(slice.index)}
                              onMouseLeave={() => setHoveredPieSlice(null)}
                              className={`flex items-center gap-2.5 p-2 rounded-md transition-all cursor-pointer border ${isHov ? 'bg-zinc-50 dark:bg-zinc-800/30 border-zinc-200 dark:border-zinc-700 scale-[1.02]' : 'border-transparent'}`}
                            >
                              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: slice.color }} />
                              <div className="flex-1 flex justify-between items-center gap-2">
                                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{slice.label}</span>
                                <div className="text-right">
                                  <span className="text-xs font-mono font-bold text-zinc-800 dark:text-zinc-100">{slice.count}</span>
                                  <span className="text-[10px] text-zinc-400 ml-1">({((slice.count / totalPie) * 100).toFixed(0)}%)</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ═══════════════════════ TAB: FLAGGED & REJECTED AUDIT ═══════════════════════ */}
        {activeTab === 'flagged' && (
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
                    {isOrgAdmin
                      ? 'Review and change the status of flagged or rejected transactions. As an admin, you can approve, reject, or flag transactions directly.'
                      : 'Review flagged or rejected transactions. As a member, you can flag transactions or mark them as suspicious. Only admins can approve status changes.'}
                  </p>
                </div>
                
                <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                    <h2 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Flagged / Rejected / Suspicious Transactions</h2>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                      {flaggedTransactions.length} matches
                    </span>
                  </div>
                  
                  <div className="divide-y divide-zinc-200/50 dark:divide-zinc-800/80">
                    {flaggedTransactions.length === 0 ? (
                      <div className="p-8 text-center text-zinc-400 dark:text-zinc-500 text-xs">
                        No flagged, rejected, or suspicious transactions found.
                      </div>
                    ) : (
                      flaggedTransactions.map((txn: any) => (
                        <div key={txn.id} className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/10 transition-colors flex flex-col gap-3">
                          {/* Transaction Info Row */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{txn.id.substring(0, 8)}…{txn.id.substring(28)}</span>
                              <span className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{txn.customer_name || 'N/A'}</span>
                              <span className="text-xs text-zinc-500 dark:text-zinc-500 font-mono">{txn.location || 'N/A'}</span>
                              {txn.merchant_name && <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono">({txn.merchant_name})</span>}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-mono font-semibold text-zinc-800 dark:text-zinc-200">${Number(txn.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                txn.status === 'FLAGGED' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' :
                                txn.status === 'SUSPICIOUS' ? 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20' :
                                'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                              }`}>{txn.status}</span>
                              <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{new Date(txn.created_at).toLocaleTimeString()}</span>
                            </div>
                          </div>

                          {/* Existing Review Info */}
                          {txn.reviewed_by && (
                            <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-md p-3 flex flex-col gap-1">
                              <div className="flex items-center gap-2 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                Previous Review · {txn.reviewed_at ? new Date(txn.reviewed_at).toLocaleString() : ''}
                              </div>
                              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{txn.review_notes}</p>
                              <span className="text-[9px] text-zinc-400 font-mono">Reviewer: {txn.reviewed_by}</span>
                            </div>
                          )}

                          {/* Review Messages */}
                          {reviewMessages[txn.id] && (
                            <div className={`text-[11px] p-2.5 rounded-md font-medium ${
                              reviewMessages[txn.id].type === 'success' ? 'bg-emerald-500/5 border border-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                              reviewMessages[txn.id].type === 'warning' ? 'bg-amber-500/5 border border-amber-500/10 text-amber-600 dark:text-amber-400' :
                              'bg-red-500/5 border border-red-500/10 text-red-500 dark:text-red-400'
                            }`}>
                              {reviewMessages[txn.id].text}
                            </div>
                          )}
                          
                          {/* Action Buttons Row */}
                          <div className="flex items-center gap-2 mt-1">
                            {/* Toggle Review Panel */}
                            <button
                              onClick={() => setExpandedReviewId(expandedReviewId === txn.id ? null : txn.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold rounded-md transition-all"
                            >
                              {expandedReviewId === txn.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              {expandedReviewId === txn.id ? 'Close Review' : 'Write Review'}
                            </button>

                            {/* Gemini AI Explanation */}
                            {explanations[txn.id] ? (
                              <div className="flex-1 bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 flex flex-col gap-1.5">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
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

                          {/* Expandable Review Form */}
                          {expandedReviewId === txn.id && (
                            <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 mt-1 space-y-3 animate-in slide-in-from-top-2">
                              <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                Submit Review — {isOrgAdmin ? 'Admin Review (Full Access)' : 'Member Review (Limited)'}
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500">Change Status</label>
                                <select
                                  value={reviewStatus[txn.id] || ''}
                                  onChange={(e) => setReviewStatus(prev => ({ ...prev, [txn.id]: e.target.value }))}
                                  className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-blue-500 transition-colors"
                                >
                                  <option value="">Select new status...</option>
                                  {getStatusOptions(txn.status).map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                                {!isOrgAdmin && (
                                  <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                    Only admins can approve transactions. Your status changes will be kept as FLAGGED until admin approval.
                                  </p>
                                )}
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500">Review Notes</label>
                                <textarea
                                  value={reviewNotes[txn.id] || ''}
                                  onChange={(e) => setReviewNotes(prev => ({ ...prev, [txn.id]: e.target.value }))}
                                  placeholder="Describe your findings, reasoning, and recommended actions..."
                                  rows={3}
                                  className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                />
                              </div>

                              <button
                                onClick={() => handleSubmitReview(txn.id)}
                                disabled={submittingReviewId === txn.id || !reviewNotes[txn.id] || !reviewStatus[txn.id]}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {submittingReviewId === txn.id ? (
                                  <>
                                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Submitting...
                                  </>
                                ) : (
                                  <>
                                    <Send size={12} />
                                    Submit Review
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════ TAB: NEWS ═══════════════════════ */}
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
                      className="border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900/30 p-5 rounded-lg flex flex-col gap-2 hover:translate-x-1 duration-200 transition-all shadow-sm"
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
                        <span className="shrink-0 px-2 py-0.5 rounded text-[9px] uppercase font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
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

        {/* ═══════════════════════ TAB: MEMBERS ═══════════════════════ */}
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
                                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                    roleDisplay === 'Administrator' 
                                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20' 
                                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/50'
                                  }`}>
                                    {roleDisplay}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {isSelf ? (
                                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic px-2">Current User</span>
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
                          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 uppercase tracking-wider mb-1">Invite New Member</h3>
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Send an invitation email to join this organization.</p>
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
                              className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded px-3 py-2 text-xs text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                          </div>
                          
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500">Role</label>
                            <select
                              value={inviteRole}
                              onChange={(e: any) => setInviteRole(e.target.value as any)}
                              className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded px-2.5 py-2 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors"
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
                        <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 uppercase tracking-wider">Pending Invitations</h3>
                        
                        <div className="divide-y divide-zinc-200/50 dark:divide-zinc-800/60 max-h-60 overflow-y-auto">
                          {!invitations?.data ? (
                            <div className="text-center text-zinc-400 dark:text-zinc-500 text-[11px] py-4">Loading invites...</div>
                          ) : invitations.data.length === 0 ? (
                            <div className="text-center text-zinc-400 dark:text-zinc-500 text-[11px] py-4">No pending invitations.</div>
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
                                  className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 font-semibold disabled:opacity-50"
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
                          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 uppercase tracking-wider mb-1">Organization Profile</h3>
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Details of your active organization.</p>
                        </div>
                        
                        <div className="flex items-center gap-3 bg-zinc-100 dark:bg-zinc-950 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
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

                        <div className="text-[11px] text-zinc-600 dark:text-zinc-400 bg-blue-500/5 border border-blue-200 dark:border-blue-900/10 rounded-lg p-3 leading-relaxed">
                          <div className="font-semibold text-blue-600 dark:text-blue-400 mb-1 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                            Member Access
                          </div>
                          You are signed in as a Member of this organization. You can view all transactions and team members, but cannot modify settings or invite new users.
                        </div>
                      </div>

                      {/* Leave Organization Card */}
                      <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 flex flex-col gap-3">
                        <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 uppercase tracking-wider">Leave Organization</h3>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
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
