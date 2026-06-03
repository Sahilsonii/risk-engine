import { useState, useEffect, useCallback } from 'react';
import { useAuth, useOrganization } from '@clerk/clerk-react';
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
  const [activeTab, setActiveTab] = useState<'transactions' | 'flagged' | 'members'>('transactions');
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  // Onboarding / Invite Form States
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'org:member' | 'org:admin'>('org:member');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

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

        {/* Tab Selector (Visible to all, but tabs depend on role) */}
        <div className="flex border-b border-zinc-800 mb-6 gap-2">
          <button
            onClick={() => { setActiveTab('transactions'); setPage(1); }}
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'transactions'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Transaction History
          </button>
          {isOrgAdmin && (
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
          )}
          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'members'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {isOrgAdmin ? 'Members & Settings' : 'Organization Members'}
          </button>
        </div>

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
                            <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-4 flex flex-col gap-2">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                                AI Risk Audit Summary
                              </div>
                              <p className="text-xs text-zinc-300 font-sans font-normal leading-relaxed">
                                {explanations[txn.id].replace(/[\*_"]/g, '')}
                              </p>
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

        {activeTab === 'members' && (
          <div className="grid grid-cols-3 gap-6">
            {/* Members List (2 cols) */}
            <div className="col-span-2 bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center">
                <h2 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Organization Members</h2>
                <span className="text-xs text-zinc-600 font-mono">
                  {memberships?.data?.length || 0} active
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider text-[10px] font-medium">
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {!memberships?.data ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-zinc-500 font-mono">
                          Loading members...
                        </td>
                      </tr>
                    ) : (
                      memberships.data.map((mem: any) => {
                        const isSelf = mem.publicUserData.userId === currentUserId;
                        const displayName = [mem.publicUserData.firstName, mem.publicUserData.lastName].filter(Boolean).join(' ') || mem.publicUserData.identifier;
                        const roleDisplay = mem.role === 'org:admin' || mem.role === 'admin' ? 'Administrator' : 'Member';
                        
                        return (
                          <tr key={mem.id} className="hover:bg-zinc-800/20 transition-colors">
                            <td className="px-4 py-3 flex items-center gap-3">
                              <img 
                                src={mem.publicUserData.imageUrl} 
                                alt="" 
                                className="w-6 h-6 rounded-full border border-zinc-800"
                              />
                              <div className="flex flex-col">
                                <span className="text-zinc-200 font-medium">{displayName}</span>
                                <span className="text-[10px] text-zinc-500 font-mono">{mem.publicUserData.identifier}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-zinc-300">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                roleDisplay === 'Administrator' 
                                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50'
                              }`}>
                                {roleDisplay}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isSelf ? (
                                <span className="text-[10px] text-zinc-600 italic px-2">Current User</span>
                              ) : isOrgAdmin ? (
                                <button
                                  onClick={() => handleRemoveMember(mem)}
                                  disabled={removingId === mem.id}
                                  className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 rounded text-[10px] font-semibold transition-colors disabled:opacity-50"
                                >
                                  {removingId === mem.id ? 'Removing...' : 'Remove'}
                                </button>
                              ) : (
                                <span className="text-zinc-600">—</span>
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
                  <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4 flex flex-col gap-4">
                    <div>
                      <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider mb-1">Invite New Member</h3>
                      <p className="text-[11px] text-zinc-500">Send an invitation email to join this organization.</p>
                    </div>
                    
                    <form onSubmit={handleInvite} className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase font-bold text-zinc-500">Email Address</label>
                        <input
                          type="email"
                          required
                          placeholder="email@example.com"
                          value={inviteEmail}
                          onChange={e => setInviteEmail(e.target.value)}
                          className="bg-zinc-850 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                      </div>
                      
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase font-bold text-zinc-500">Role</label>
                        <select
                          value={inviteRole}
                          onChange={e => setInviteRole(e.target.value as any)}
                          className="bg-zinc-850 border border-zinc-800 rounded px-2.5 py-2 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors"
                        >
                          <option value="org:member">Member</option>
                          <option value="org:admin">Administrator</option>
                        </select>
                      </div>
                      
                      {inviteError && (
                        <div className="text-[11px] text-red-400 bg-red-500/5 border border-red-500/10 rounded p-2 font-medium">
                          {inviteError}
                        </div>
                      )}
                      {inviteSuccess && (
                        <div className="text-[11px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 rounded p-2 font-medium">
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
                  <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
                    <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Pending Invitations</h3>
                    
                    <div className="divide-y divide-zinc-800/60 max-h-60 overflow-y-auto">
                      {!invitations?.data ? (
                        <div className="text-center text-zinc-600 text-[11px] py-4">Loading invites...</div>
                      ) : invitations.data.length === 0 ? (
                        <div className="text-center text-zinc-600 text-[11px] py-4">No pending invitations.</div>
                      ) : (
                        invitations.data.map((inv: any) => (
                          <div key={inv.id} className="py-2.5 flex items-center justify-between gap-2 text-[11px]">
                            <div className="flex flex-col gap-0.5 truncate">
                              <span className="text-zinc-300 truncate font-medium">{inv.emailAddress}</span>
                              <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">
                                {inv.role === 'org:admin' || inv.role === 'admin' ? 'Admin' : 'Member'}
                              </span>
                            </div>
                            <button
                              onClick={() => handleRevokeInvite(inv)}
                              disabled={revokingId === inv.id}
                              className="text-red-400 hover:text-red-300 font-semibold disabled:opacity-50"
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
                  <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-5 flex flex-col gap-4">
                    <div>
                      <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider mb-1">Organization Profile</h3>
                      <p className="text-[11px] text-zinc-500">Details of your active organization.</p>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                      {organization?.imageUrl ? (
                        <img src={organization.imageUrl} alt="" className="w-10 h-10 rounded-lg border border-zinc-800" />
                      ) : (
                        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                          {organization?.name?.[0] || 'O'}
                        </div>
                      )}
                      <div className="flex flex-col truncate">
                        <span className="text-xs font-semibold text-zinc-200 truncate">{organization?.name || 'OLD ERA AI'}</span>
                        <span className="text-[9px] text-zinc-500 font-mono truncate">ID: {organization?.id}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-zinc-400 bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 leading-relaxed">
                      <div className="font-semibold text-blue-400 mb-1 flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        Member Access
                      </div>
                      You are signed in as a Member of this organization. You can view all transactions and team members, but cannot modify settings or invite new users.
                    </div>
                  </div>

                  {/* Leave Organization Card */}
                  <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-5 flex flex-col gap-3">
                    <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Leave Organization</h3>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      Leaving will revoke your access to this organization's transactions and dashboard.
                    </p>
                    
                    <button
                      onClick={handleLeaveOrganization}
                      className="mt-2 w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 rounded text-xs font-semibold transition-colors"
                    >
                      Leave Organization
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
