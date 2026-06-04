import { useUser, useOrganization } from '@clerk/clerk-react';
import { useAuth } from '@clerk/clerk-react';
import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '../components/Layout/Sidebar';
import { TopBar } from '../components/Layout/TopBar';
import { api } from '../lib/api';
import { Stats } from '../types';
import {
  User,
  Building2,
  Shield,
  Mail,
  Calendar,
  Hash,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
} from 'lucide-react';

export function ProfilePage() {
  const { user, isLoaded: userLoaded } = useUser();
  const { organization, membership } = useOrganization();
  const { getToken } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const isOrgAdmin = membership?.role === 'org:admin' || membership?.role === 'admin';

  const fetchStats = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const statsRes = await api.getStats(token);
      setStats(statsRes);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching stats for profile:', err);
    }
  }, [getToken]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (!userLoaded) {
    return (
      <div className="flex bg-zinc-50 dark:bg-zinc-950 min-h-screen text-zinc-800 dark:text-zinc-100" style={{ fontFamily: 'Inter, sans-serif' }}>
        <Sidebar />
        <main className="ml-56 flex-1 p-6 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-xs text-zinc-500">Loading profile...</span>
          </div>
        </main>
      </div>
    );
  }

  const joinDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'N/A';

  const statItems = [
    {
      label: 'Total Transactions',
      value: stats ? Number(stats.total).toLocaleString() : '—',
      icon: BarChart3,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Approved',
      value: stats ? Number(stats.approved).toLocaleString() : '—',
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Flagged',
      value: stats ? Number(stats.flagged).toLocaleString() : '—',
      icon: AlertTriangle,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      label: 'Rejected',
      value: stats ? Number(stats.rejected).toLocaleString() : '—',
      icon: XCircle,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
    },
  ];

  return (
    <div
      className="flex bg-zinc-50 dark:bg-zinc-950 min-h-screen text-zinc-800 dark:text-zinc-100 transition-colors duration-200"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <Sidebar />
      <main className="ml-56 flex-1 p-6">
        <TopBar
          title="My Profile"
          subtitle={isOrgAdmin ? 'Administrator Account' : 'Member Account'}
          lastUpdated={lastUpdated}
          onRefresh={fetchStats}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Profile Card */}
          <div className="lg:col-span-1 space-y-6">
            {/* Avatar + Identity Card */}
            <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
              {/* Gradient Banner */}
              <div className="h-24 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 relative">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE4YzAtOS45NC04LjA2LTE4LTE4LTE4djJjOC44NCAwIDE2IDcuMTYgMTYgMTZoMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-60" />
              </div>

              {/* Avatar */}
              <div className="px-5 -mt-10 relative z-10">
                <div className="w-20 h-20 rounded-xl border-4 border-white dark:border-zinc-900 shadow-lg overflow-hidden bg-blue-600">
                  {user?.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">
                      {user?.firstName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
              </div>

              {/* Identity Details */}
              <div className="px-5 pt-3 pb-5">
                <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
                  {user?.fullName || user?.firstName || 'User'}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{user?.primaryEmailAddress?.emailAddress}</p>

                {/* Role Badge */}
                <div className="mt-3 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isOrgAdmin
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                  }`}>
                    <Shield size={10} />
                    {isOrgAdmin ? 'Administrator' : 'Member'}
                  </span>
                </div>
              </div>
            </div>

            {/* Organization Card */}
            <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm dark:shadow-none">
              <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Building2 size={11} />
                Organization
              </h3>
              <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800 rounded-lg p-3">
                {organization?.imageUrl ? (
                  <img src={organization.imageUrl} alt="" className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-800" />
                ) : (
                  <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                    {organization?.name?.[0] || 'O'}
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate">{organization?.name || 'No Organization'}</span>
                  <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono truncate">{organization?.id || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Details + Stats */}
          <div className="lg:col-span-2 space-y-6">
            {/* Account Details */}
            <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm dark:shadow-none">
              <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                <User size={11} />
                Account Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { icon: User, label: 'Full Name', value: user?.fullName || 'N/A' },
                  { icon: Mail, label: 'Email Address', value: user?.primaryEmailAddress?.emailAddress || 'N/A' },
                  { icon: Hash, label: 'User ID', value: user?.id || 'N/A', mono: true },
                  { icon: Calendar, label: 'Account Created', value: joinDate },
                  { icon: Building2, label: 'Organization', value: organization?.name || 'N/A' },
                  { icon: Shield, label: 'Role', value: isOrgAdmin ? 'Administrator' : 'Member' },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 bg-zinc-50/70 dark:bg-zinc-950/30 border border-zinc-100 dark:border-zinc-800/50 rounded-lg p-3 hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <item.icon size={12} className="text-zinc-500 dark:text-zinc-400" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{item.label}</span>
                      <span className={`text-xs text-zinc-700 dark:text-zinc-200 truncate ${item.mono ? 'font-mono' : 'font-medium'}`}>
                        {item.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity Summary */}
            <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm dark:shadow-none">
              <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                <Activity size={11} />
                Activity Summary
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {statItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-zinc-50/70 dark:bg-zinc-950/30 border border-zinc-100 dark:border-zinc-800/50 rounded-lg p-4 flex flex-col items-center text-center hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors group"
                  >
                    <div className={`w-10 h-10 rounded-lg ${item.bg} flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-200`}>
                      <item.icon size={18} className={item.color} />
                    </div>
                    <span className="text-lg font-mono font-bold text-zinc-800 dark:text-zinc-100 tabular-nums">{item.value}</span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-medium mt-0.5">{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Approval Rate Progress Bar */}
              {stats && (
                <div className="mt-5 bg-zinc-50/70 dark:bg-zinc-950/30 border border-zinc-100 dark:border-zinc-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Approval Rate</span>
                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">{stats.approval_rate || 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${Math.min(Number(stats.approval_rate || 0), 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Total Volume Card */}
            {stats && (
              <div className="bg-gradient-to-br from-blue-500/5 via-blue-500/3 to-transparent border border-blue-200 dark:border-blue-900/30 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-1">Total Volume Processed</h4>
                    <span className="text-2xl font-mono font-bold text-blue-600 dark:text-blue-400">
                      ${Number(stats.total_volume).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="text-right">
                    <h4 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Average Transaction</h4>
                    <span className="text-lg font-mono font-bold text-zinc-700 dark:text-zinc-300">
                      ${Number(stats.avg_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
