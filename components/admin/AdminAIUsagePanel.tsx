import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import {
  Zap, RefreshCw, Loader2, AlertCircle, TrendingUp,
  DollarSign, AlertTriangle, Activity,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Summary {
  totalCalls: number; totalInput: number; totalOutput: number;
  totalCost: number; errorCount: number; errorRate: number;
}
interface MonthBucket { month: string; byok: number; platform: number; total: number; }
interface ActionRow {
  action: string; calls: number; input_tokens: number;
  output_tokens: number; errors: number; avg_ms: number;
}
interface TopOrg { org_id: string; name: string; tier: string; calls: number; }

interface Props { adminToken: string; }

// ── API helper ────────────────────────────────────────────────────────────────
async function callAdmin(action: string, token: string) {
  const res = await fetch('/.netlify/functions/admin', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ action }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

// ── Tier badge (reused style) ─────────────────────────────────────────────────
const TIER_STYLES: Record<string, string> = {
  free:       'bg-slate-700 text-slate-300',
  starter:    'bg-blue-900/60 text-blue-300',
  pro:        'bg-violet-900/60 text-violet-300',
  enterprise: 'bg-amber-900/60 text-amber-300',
};
const TierBadge: React.FC<{ tier: string }> = ({ tier }) => (
  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${TIER_STYLES[tier] ?? TIER_STYLES.free}`}>
    {tier}
  </span>
);

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt  = (n: number) => n.toLocaleString();
const fmtK = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);
const fmtMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
};

// ── Summary card ──────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  label: string; value: string; sub?: string;
  icon: React.ReactNode; color: string;
}> = ({ label, value, sub, icon, color }) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-start gap-4">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-slate-800 dark:text-white mt-0.5">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ── Main panel ────────────────────────────────────────────────────────────────
const AdminAIUsagePanel: React.FC<Props> = ({ adminToken }) => {
  const [summary,  setSummary]  = useState<Summary | null>(null);
  const [months,   setMonths]   = useState<MonthBucket[]>([]);
  const [actions,  setActions]  = useState<ActionRow[]>([]);
  const [topOrgs,  setTopOrgs]  = useState<TopOrg[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sumRes, monthRes, actionRes, topRes] = await Promise.all([
        callAdmin('admin_ai_usage_summary',   adminToken),
        callAdmin('admin_ai_usage_by_month',  adminToken),
        callAdmin('admin_ai_usage_by_action', adminToken),
        callAdmin('admin_ai_top_orgs',        adminToken),
      ]);
      setSummary(sumRes);
      setMonths(monthRes.months  ?? []);
      setActions(actionRes.actions ?? []);
      setTopOrgs(topRes.orgs     ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load AI usage data');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading AI usage data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-3 max-w-lg">
        <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        <button onClick={load} className="ml-auto text-xs underline">Retry</button>
      </div>
    );
  }

  const chartData = months.map(m => ({ ...m, name: monthLabel(m.month) }));

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">AI Usage</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Platform-wide AI call statistics across all organisations.</p>
        </div>
        <button
          onClick={load}
          className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard
            label="Total Calls"   value={fmt(summary.totalCalls)}
            icon={<Zap className="w-5 h-5 text-white" />}   color="bg-esg-700"
          />
          <StatCard
            label="Input Tokens"  value={fmtK(summary.totalInput)}
            icon={<Activity className="w-5 h-5 text-white" />} color="bg-blue-700"
          />
          <StatCard
            label="Output Tokens" value={fmtK(summary.totalOutput)}
            icon={<TrendingUp className="w-5 h-5 text-white" />} color="bg-violet-700"
          />
          <StatCard
            label="Est. Total Cost" value={`$${summary.totalCost.toFixed(4)}`}
            icon={<DollarSign className="w-5 h-5 text-white" />} color="bg-amber-700"
          />
          <StatCard
            label="Errors"   value={fmt(summary.errorCount)}
            sub={`${summary.errorRate.toFixed(1)}% error rate`}
            icon={<AlertTriangle className="w-5 h-5 text-white" />} color="bg-red-700"
          />
        </div>
      )}

      {/* Monthly chart */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-4">
          Calls per Month — last 12 months
        </h3>
        {months.every(m => m.total === 0) ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <Zap className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No AI calls recorded yet.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#f1f5f9', fontWeight: 600 }}
                itemStyle={{ color: '#94a3b8' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Bar dataKey="platform" name="Platform"  stackId="a" fill="#16a34a" radius={[0,0,0,0]} />
              <Bar dataKey="byok"     name="BYOK"      stackId="a" fill="#7c3aed" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Two-column lower section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Action breakdown table */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">By Action</h3>
          </div>
          {actions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50">
                    {['Action','Calls','Tokens','Errors','Avg latency'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {actions.map(a => (
                    <tr key={a.action} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-slate-700 dark:text-slate-300 max-w-[160px] truncate" title={a.action}>
                        {a.action}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 tabular-nums">{fmt(a.calls)}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 tabular-nums">{fmtK(a.input_tokens + a.output_tokens)}</td>
                      <td className="px-4 py-2.5">
                        {a.errors > 0
                          ? <span className="text-red-400">{a.errors}</span>
                          : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 tabular-nums">{fmtMs(a.avg_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top consumers this month */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Top Companies — this month</h3>
          </div>
          {topOrgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <Zap className="w-6 h-6 mb-2 opacity-40" />
              <p className="text-sm">No AI calls this month.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {topOrgs.map((org, i) => (
                <div key={org.org_id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <span className="text-xs font-bold text-slate-400 w-5 text-right flex-shrink-0">{i + 1}</span>
                  <div className="w-7 h-7 rounded-lg bg-esg-800 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{org.name}</p>
                    <TierBadge tier={org.tier} />
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-white tabular-nums">{fmt(org.calls)}</p>
                    <p className="text-xs text-slate-400">calls</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default AdminAIUsagePanel;
