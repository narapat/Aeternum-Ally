import React, { useState, useEffect } from 'react';
import { Building2, Users, Zap, AlertTriangle, Loader2, RefreshCw, TrendingUp, ShieldOff } from 'lucide-react';

interface DashboardStats {
  totalCompanies:    number;
  activeCompanies:   number;
  inactiveCompanies: number;
  totalUsers:        number;
  aiCallsToday:      number;
  aiErrorsTotal:     number;
}

interface Props {
  adminToken: string;
}

const AdminDashboard: React.FC<Props> = ({ adminToken }) => {
  const [stats, setStats]     = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const fetchStats = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/.netlify/functions/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ action: 'admin_dashboard' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load stats');
      setStats(json);
    } catch (err: any) {
      setError(err?.message ?? 'Error loading dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, [adminToken]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Platform Overview</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Live metrics across all registered companies</p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && !stats ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading platform stats…
          </div>
        </div>
      ) : stats ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              icon={<Building2 className="w-5 h-5 text-blue-500" />}
              label="Total Companies"
              value={stats.totalCompanies}
              sub={`${stats.activeCompanies} active · ${stats.inactiveCompanies} inactive`}
              color="blue"
            />
            <StatCard
              icon={<Users className="w-5 h-5 text-violet-500" />}
              label="Total Members"
              value={stats.totalUsers}
              sub="Across all organisations"
              color="violet"
            />
            <StatCard
              icon={<Zap className="w-5 h-5 text-amber-500" />}
              label="AI Calls Today"
              value={stats.aiCallsToday}
              sub="Since midnight UTC"
              color="amber"
            />
            <StatCard
              icon={<ShieldOff className="w-5 h-5 text-red-500" />}
              label="AI Errors (Total)"
              value={stats.aiErrorsTotal}
              sub="All time"
              color="red"
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5 text-esg-500" />}
              label="Active Companies"
              value={stats.activeCompanies}
              sub={`${stats.totalCompanies > 0 ? Math.round((stats.activeCompanies / stats.totalCompanies) * 100) : 0}% of total`}
              color="green"
            />
          </div>

          {/* Placeholder panels for future issues */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PlaceholderPanel title="AI Usage by Month" issueRef="#77" />
            <PlaceholderPanel title="Top Active Companies" issueRef="#74" />
          </div>
        </>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const COLORS: Record<string, string> = {
  blue:   'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800',
  violet: 'bg-violet-50 dark:bg-violet-900/20 border-violet-100 dark:border-violet-800',
  amber:  'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800',
  red:    'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800',
  green:  'bg-esg-50 dark:bg-esg-900/20 border-esg-100 dark:border-esg-800',
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  color: string;
}> = ({ icon, label, value, sub, color }) => (
  <div className={`rounded-xl border p-5 flex items-start gap-4 ${COLORS[color] ?? COLORS.blue}`}>
    <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-900/50 flex items-center justify-center flex-shrink-0 shadow-sm">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide truncate">{label}</p>
      <p className="text-2xl font-bold text-slate-800 dark:text-white mt-0.5">{value.toLocaleString()}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{sub}</p>
    </div>
  </div>
);

const PlaceholderPanel: React.FC<{ title: string; issueRef: string }> = ({ title, issueRef }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 flex flex-col items-center justify-center min-h-[180px] text-center">
    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Coming in issue {issueRef}</p>
  </div>
);

export default AdminDashboard;
