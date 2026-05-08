import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import {
  Building2, Users, Zap, AlertTriangle, Loader2,
  RefreshCw, TrendingUp, ShieldOff,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DashboardStats {
  totalCompanies:    number;
  activeCompanies:   number;
  inactiveCompanies: number;
  totalUsers:        number;
  aiCallsToday:      number;
  aiErrorsTotal:     number;
}

interface MonthRow {
  month:    string;  // YYYY-MM
  byok:     number;
  platform: number;
  total:    number;
}

interface ActionSeries {
  action: string;
  data:   number[];  // length 12
}

interface Props { adminToken: string; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function callAdmin(action: string, token: string, body?: object) {
  const res = await fetch('/.netlify/functions/admin', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ action, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthLabel = (ym: string) => {
  const m = parseInt(ym.split('-')[1], 10) - 1;
  return MONTH_LABELS[m] ?? ym;
};

// Colour palette for feature series (up to 10 actions)
const ACTION_COLORS = [
  '#16a34a','#7c3aed','#2563eb','#d97706','#dc2626',
  '#0891b2','#9333ea','#65a30d','#c2410c','#475569',
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, i) => currentYear - i);

// ---------------------------------------------------------------------------
// Year selector
// ---------------------------------------------------------------------------
const YearSelect: React.FC<{ value: number; onChange: (y: number) => void }> = ({ value, onChange }) => (
  <select
    value={value}
    onChange={e => onChange(Number(e.target.value))}
    className="text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-esg-500"
  >
    {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
  </select>
);

// ---------------------------------------------------------------------------
// Chart card wrapper
// ---------------------------------------------------------------------------
const ChartCard: React.FC<{
  title: string;
  year: number;
  onYearChange: (y: number) => void;
  loading: boolean;
  error: string;
  children: React.ReactNode;
}> = ({ title, year, onYearChange, loading, error, children }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col min-h-[260px]">
    <div className="flex items-center justify-between mb-4">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <YearSelect value={year} onChange={onYearChange} />
    </div>

    {loading ? (
      <div className="flex-1 flex items-center justify-center gap-2 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Loading…</span>
      </div>
    ) : error ? (
      <div className="flex-1 flex items-center justify-center text-xs text-red-400 text-center px-4">
        {error}
      </div>
    ) : (
      children
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Block 1: AI Usage by Month (platform vs BYOK)
// ---------------------------------------------------------------------------
const AIUsageByMonthChart: React.FC<{ adminToken: string }> = ({ adminToken }) => {
  const [year,    setYear]    = useState(currentYear);
  const [rows,    setRows]    = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async (y: number) => {
    setLoading(true); setError('');
    try {
      const json = await callAdmin('admin_ai_usage_by_month', adminToken, { year: y });
      setRows(json.months ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { load(year); }, [year, load]);

  const chartData = rows.map(r => ({ name: monthLabel(r.month), platform: r.platform, byok: r.byok }));
  const isEmpty   = rows.every(r => r.total === 0);

  return (
    <ChartCard title="AI Usage by Month" year={year} onYearChange={y => { setYear(y); }} loading={loading} error={error}>
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Zap className="w-6 h-6 opacity-30" />
          <p className="text-xs">No AI calls in {year}</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#f1f5f9', fontWeight: 600 }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            <Bar dataKey="platform" name="Platform" stackId="a" fill="#16a34a" />
            <Bar dataKey="byok"     name="BYOK"     stackId="a" fill="#7c3aed" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
};

// ---------------------------------------------------------------------------
// Block 2: AI Calls by Feature by Month
// ---------------------------------------------------------------------------
const AICallsByFeatureChart: React.FC<{ adminToken: string }> = ({ adminToken }) => {
  const [year,    setYear]    = useState(currentYear);
  const [months,  setMonths]  = useState<string[]>([]);
  const [series,  setSeries]  = useState<ActionSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async (y: number) => {
    setLoading(true); setError('');
    try {
      const json = await callAdmin('admin_ai_usage_by_action_by_month', adminToken, { year: y });
      setMonths(json.months ?? []);
      setSeries(json.series ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { load(year); }, [year, load]);

  // Reshape: one row per month, one key per action
  const chartData = (months.length > 0 ? months : Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, '0')}`
  )).map((m, mIdx) => {
    const row: Record<string, string | number> = { name: monthLabel(m) };
    series.forEach(s => { row[s.action] = s.data[mIdx] ?? 0; });
    return row;
  });

  const isEmpty = series.length === 0 || series.every(s => s.data.every(n => n === 0));

  // Shorten action names for legend/tooltip (strip common prefix patterns)
  const shortName = (a: string) => a.replace(/_/g, ' ').replace(/^(generate|suggest|analyse|analyze|assess|create|get)\s/, '');

  return (
    <ChartCard title="AI Calls by Feature by Month" year={year} onYearChange={y => { setYear(y); }} loading={loading} error={error}>
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Zap className="w-6 h-6 opacity-30" />
          <p className="text-xs">No AI calls in {year}</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#f1f5f9', fontWeight: 600 }}
              formatter={(value: number, name: string) => [value, shortName(name)]}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, color: '#94a3b8' }}
              formatter={(value: string) => shortName(value)}
            />
            {series.map((s, i) => (
              <Bar
                key={s.action}
                dataKey={s.action}
                name={s.action}
                stackId="a"
                fill={ACTION_COLORS[i % ACTION_COLORS.length]}
                radius={i === series.length - 1 ? [3,3,0,0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
};

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------
const AdminDashboard: React.FC<Props> = ({ adminToken }) => {
  const [stats, setStats]     = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const fetchStats = async () => {
    setLoading(true);
    setError('');
    try {
      const json = await callAdmin('admin_dashboard', adminToken);
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
      {/* Header */}
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

          {/* Chart panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AIUsageByMonthChart    adminToken={adminToken} />
            <AICallsByFeatureChart  adminToken={adminToken} />
          </div>
        </>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// StatCard
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

export default AdminDashboard;
