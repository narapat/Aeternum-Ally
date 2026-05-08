import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  ArrowLeft, RefreshCw, Loader2, AlertCircle, Users,
  Mail, Zap, AlertTriangle, ShieldCheck, ShieldOff, Download,
} from 'lucide-react';
import CompanyExportModal from './CompanyExportModal';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CompanyStats {
  company_name: string;
  users: {
    total: number;
    by_role: Record<string, number>;
  };
  invitations: {
    total: number;
    breakdown: Record<string, number>;
    recent: { email: string; role: string; status: string; created_at: string; expires_at: string }[];
  };
  ai_usage: {
    total_calls: number;
    byok: number;
    platform: number;
    by_month: { month: string; byok: number; platform: number; total: number }[];
    by_action: { action: string; calls: number; input_tokens: number; output_tokens: number; avg_ms: number }[];
  };
  ai_errors: {
    total: number;
    by_category: { category: string; count: number; last_seen: string }[];
  };
}

interface Props {
  companyId:   string;
  companyName: string;
  isActive:    boolean;
  adminToken:  string;
  onBack:      () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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

const fmt    = (n: number) => n.toLocaleString();
const fmtK   = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);
const fmtMs  = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
};
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const ROLE_COLORS: Record<string, string> = {
  Owner: '#16a34a', Admin: '#7c3aed', Manager: '#2563eb', Consultant: '#d97706',
};
const STATUS_STYLES: Record<string, string> = {
  Accepted: 'bg-esg-900/50 text-esg-400 border-esg-800/50',
  Pending:  'bg-blue-900/40 text-blue-400 border-blue-800/50',
  Expired:  'bg-slate-800 text-slate-400 border-slate-700',
};

// ── Section wrapper ───────────────────────────────────────────────────────────
const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
      <span className="text-esg-500">{icon}</span>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-white">{title}</h3>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

// ── Main panel ────────────────────────────────────────────────────────────────
const CompanyStatsPanel: React.FC<Props> = ({ companyId, companyName, isActive, adminToken, onBack }) => {
  const [stats,       setStats]       = useState<CompanyStats | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [showExport,  setShowExport]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await callAdmin('company_stats', adminToken, { org_id: companyId });
      setStats(data);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load company stats');
    } finally {
      setLoading(false);
    }
  }, [adminToken, companyId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center gap-3 py-24 text-slate-500">
      <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Loading company stats…</span>
    </div>
  );

  if (error) return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Companies
      </button>
      <div className="flex items-center gap-2.5 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-3">
        <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        <button onClick={load} className="ml-auto text-xs underline">Retry</button>
      </div>
    </div>
  );

  if (!stats) return null;

  const roleData = Object.entries(stats.users.by_role)
    .filter(([, v]) => (v as number) > 0)
    .map(([name, value]) => ({ name, value: value as number, color: ROLE_COLORS[name] ?? '#64748b' }));

  const chartData = stats.ai_usage.by_month.map(m => ({ ...m, name: monthLabel(m.month) }));

  const byokPct = stats.ai_usage.total_calls > 0
    ? Math.round((stats.ai_usage.byok / stats.ai_usage.total_calls) * 100) : 0;

  return (
    <div className="space-y-6">

      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Back to Companies"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">{stats.company_name}</h2>
              {isActive
                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-esg-900/50 text-esg-400 border border-esg-800/50"><ShieldCheck className="w-3 h-3" />Active</span>
                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700"><ShieldOff className="w-3 h-3" />Inactive</span>}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Company statistics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* ── Section 1: Users & Roles ──────────────────────────────────────── */}
      <Section title="Users & Roles" icon={<Users className="w-4 h-4" />}>
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {/* Donut chart */}
          <div className="flex-shrink-0 flex flex-col items-center">
            {roleData.length === 0 ? (
              <div className="flex flex-col items-center justify-center w-40 h-40 text-slate-400">
                <Users className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">No members</p>
              </div>
            ) : (
              <div className="relative w-40 h-40">
                <PieChart width={160} height={160}>
                  <Pie data={roleData} cx={75} cy={75} innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
                    {roleData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [v, '']}
                  />
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-slate-800 dark:text-white">{stats.users.total}</span>
                  <span className="text-xs text-slate-400">members</span>
                </div>
              </div>
            )}
          </div>

          {/* Role list */}
          <div className="flex-1 space-y-2 w-full">
            {Object.entries(stats.users.by_role).map(([role, count]) => (
              <div key={role} className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ROLE_COLORS[role] ?? '#64748b' }} />
                <span className="text-sm text-slate-600 dark:text-slate-300 flex-1">{role}</span>
                <span className="text-sm font-semibold text-slate-800 dark:text-white tabular-nums">{count}</span>
                <div className="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${stats.users.total > 0 ? ((count as number) / stats.users.total) * 100 : 0}%`, background: ROLE_COLORS[role] ?? '#64748b' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Section 2: Invitations ────────────────────────────────────────── */}
      <Section title="Invitations" icon={<Mail className="w-4 h-4" />}>
        {stats.invitations.total === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No invitations sent.</p>
        ) : (
          <div className="space-y-4">
            {/* Badge counts */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.invitations.breakdown).map(([status, count]) => (
                <span key={status} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${STATUS_STYLES[status] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                  {status} <span className="font-bold">{count}</span>
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-300 border border-slate-600">
                Total <span className="font-bold">{stats.invitations.total}</span>
              </span>
            </div>

            {/* Recent invites table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50">
                    {['Email', 'Role', 'Status', 'Sent', 'Expires'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {stats.invitations.recent.map((inv, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300 max-w-[180px] truncate">{inv.email}</td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{inv.role}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_STYLES[inv.status] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(inv.created_at)}</td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(inv.expires_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* ── Section 3: AI Usage ───────────────────────────────────────────── */}
      <Section title="AI Usage" icon={<Zap className="w-4 h-4" />}>
        <div className="space-y-5">
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Calls', value: fmt(stats.ai_usage.total_calls) },
              { label: 'Platform',    value: fmt(stats.ai_usage.platform) },
              { label: 'BYOK',        value: `${fmt(stats.ai_usage.byok)} (${byokPct}%)` },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg px-3 py-2.5 text-center">
                <p className="text-lg font-bold text-slate-800 dark:text-white">{s.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Monthly chart */}
          {stats.ai_usage.total_calls === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <Zap className="w-6 h-6 mb-2 opacity-30" /><p className="text-sm">No AI calls yet.</p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Calls / Month — last 12 months</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} />
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
            </div>
          )}

          {/* By action table */}
          {stats.ai_usage.by_action.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50">
                    {['Action','Calls','Tokens','Avg latency'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {stats.ai_usage.by_action.map(a => (
                    <tr key={a.action} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title={a.action}>{a.action}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 tabular-nums">{fmt(a.calls)}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 tabular-nums">{fmtK(a.input_tokens + a.output_tokens)}</td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 tabular-nums">{fmtMs(a.avg_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      {/* ── Section 4: Errors ─────────────────────────────────────────────── */}
      <Section title={`AI Errors${stats.ai_errors.total > 0 ? ` (${fmt(stats.ai_errors.total)})` : ''}`} icon={<AlertTriangle className="w-4 h-4" />}>
        {stats.ai_errors.total === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-esg-500">
            <ShieldCheck className="w-8 h-8 mb-2 opacity-60" />
            <p className="text-sm font-medium">No errors — looking good!</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50">
                  {['Error category','Count','Last seen'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {stats.ai_errors.by_category.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300 max-w-[280px] truncate font-mono text-[11px]" title={e.category}>{e.category}</td>
                    <td className="px-3 py-2.5 text-red-400 font-semibold tabular-nums">{e.count}</td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(e.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Export modal */}
      {showExport && (
        <CompanyExportModal
          companyId={companyId}
          companyName={stats.company_name}
          adminToken={adminToken}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
};

export default CompanyStatsPanel;
