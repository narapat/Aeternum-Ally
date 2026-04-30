import React, { useEffect, useMemo, useState } from "react";
import {
  Sparkles, Zap, Brain, Loader2, Save, AlertCircle, CheckCircle2,
  TrendingUp, DollarSign, Hash,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { supabase } from "../lib/supabaseClient";
import type { OrgRole } from "../types";

interface Props {
  organizationId: string;
  currentUserRole: OrgRole | null;
}

interface UsageRow {
  id: string;
  user_email: string | null;
  action: string;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  success: boolean;
  estimated_cost_usd: number | null;
  created_at: string;
}

const MODELS: { id: string; label: string; tagline: string; icon: React.ReactNode }[] = [
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    tagline: "Fastest & cheapest. Good for short suggestions.",
    icon: <Zap className="w-5 h-5" />,
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    tagline: "Balanced quality, speed and price. Recommended default.",
    icon: <Sparkles className="w-5 h-5" />,
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    tagline: "Most capable. Best for long-form report generation.",
    icon: <Brain className="w-5 h-5" />,
  },
];

const ACTION_LABELS: Record<string, string> = {
  generateAssessmentSuggestions: "Materiality assessment",
  generateCanvasSuggestion: "Canvas suggestion",
  generateSwotInternal: "SWOT internal",
  generateSwotExternal: "SWOT external",
  generateKPISuggestions: "KPI suggestions",
  generateSustainabilityStatement: "Sustainability statement",
};

const ACTION_COLORS: Record<string, string> = {
  generateAssessmentSuggestions: "#3b82f6",
  generateCanvasSuggestion: "#10b981",
  generateSwotInternal: "#f59e0b",
  generateSwotExternal: "#8b5cf6",
  generateKPISuggestions: "#ec4899",
  generateSustainabilityStatement: "#06b6d4",
};

const AIUsagePanel: React.FC<Props> = ({ organizationId, currentUserRole }) => {
  const canManage = currentUserRole === "Owner" || currentUserRole === "Admin";

  const [model, setModel] = useState<string>("gemini-2.5-flash");
  const [savedModel, setSavedModel] = useState<string>("gemini-2.5-flash");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch settings + recent usage on mount
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      supabase
        .from("organization_ai_settings")
        .select("model")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("ai_usage_log")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(500), // last 500 calls is plenty for a 30-day chart + table
    ]).then(([settingsResp, usageResp]) => {
      if (cancelled) return;
      if (settingsResp.data?.model) {
        setModel(settingsResp.data.model);
        setSavedModel(settingsResp.data.model);
      }
      if (usageResp.data) {
        setUsage(usageResp.data as UsageRow[]);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const isDirty = model !== savedModel;

  const handleSaveModel = async () => {
    setIsSaving(true);
    setSaveError(null);

    const { error } = await supabase
      .from("organization_ai_settings")
      .upsert(
        { organization_id: organizationId, model },
        { onConflict: "organization_id" }
      );

    setIsSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setSavedModel(model);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 3000);
  };

  // Derived stats
  const stats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthUsage = usage.filter((r) => new Date(r.created_at) >= monthStart);
    const totalCalls = monthUsage.length;
    const totalTokens = monthUsage.reduce(
      (sum, r) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
      0
    );
    const totalCost = monthUsage.reduce((sum, r) => sum + Number(r.estimated_cost_usd ?? 0), 0);
    const successRate = totalCalls === 0
      ? 100
      : Math.round((monthUsage.filter((r) => r.success).length / totalCalls) * 100);

    return { totalCalls, totalTokens, totalCost, successRate };
  }, [usage]);

  // Chart: 30-day usage by feature
  const chartData = useMemo(() => {
    const days: Record<string, Record<string, number>> = {};
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      days[key] = {};
    }

    usage.forEach((row) => {
      if (!row.success) return;
      const key = new Date(row.created_at).toISOString().slice(0, 10);
      if (days[key] === undefined) return; // outside 30-day window
      days[key][row.action] = (days[key][row.action] ?? 0) + 1;
    });

    return Object.entries(days).map(([date, byAction]) => ({
      date: date.slice(5), // MM-DD
      ...byAction,
    }));
  }, [usage]);

  // Distinct actions seen in the last 30 days (for legend / bars)
  const seenActions = useMemo(() => {
    const set = new Set<string>();
    chartData.forEach((d) => {
      Object.keys(d).forEach((k) => {
        if (k !== "date") set.add(k);
      });
    });
    return Array.from(set);
  }, [chartData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading AI settings…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ====================== Model selector ====================== */}
      <section>
        <header className="mb-4">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-esg-600" /> AI Model
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Choose which Gemini model is used for AI-assisted features in this workspace.
          </p>
        </header>

        {saveError && (
          <div className="mb-3 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {saveError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODELS.map((m) => {
            const selected = model === m.id;
            const isCurrentSaved = savedModel === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => canManage && setModel(m.id)}
                disabled={!canManage}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  selected
                    ? "border-esg-500 bg-esg-50 dark:bg-esg-900/20"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                } ${canManage ? "cursor-pointer" : "cursor-not-allowed opacity-75"}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className={`p-2 rounded-lg ${selected ? "bg-esg-100 text-esg-700 dark:bg-esg-900/50 dark:text-esg-300" : "bg-slate-100 dark:bg-slate-700 text-slate-500"}`}>
                    {m.icon}
                  </div>
                  {isCurrentSaved && (
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-slate-800 dark:text-white text-sm">{m.label}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{m.tagline}</p>
              </button>
            );
          })}
        </div>

        {canManage && (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {isDirty ? (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved changes
                </span>
              ) : saveStatus === "saved" ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleSaveModel}
              disabled={!isDirty || isSaving}
              className="flex items-center gap-2 bg-esg-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-esg-700 transition-colors disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save model choice
            </button>
          </div>
        )}

        {!canManage && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
            Only Owners and Admins can change the AI model.
          </p>
        )}
      </section>

      {/* ====================== Usage this month ====================== */}
      <section>
        <header className="mb-4">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-esg-600" /> AI Usage — this month
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Token consumption and estimated costs for AI features used in your workspace.
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Calls" value={stats.totalCalls.toLocaleString()} icon={<Hash className="w-4 h-4 text-blue-500" />} />
          <StatCard label="Tokens" value={formatTokens(stats.totalTokens)} icon={<Sparkles className="w-4 h-4 text-purple-500" />} />
          <StatCard label="Est. cost" value={`$${stats.totalCost.toFixed(stats.totalCost < 1 ? 4 : 2)}`} icon={<DollarSign className="w-4 h-4 text-emerald-500" />} />
          <StatCard label="Success rate" value={`${stats.successRate}%`} icon={<CheckCircle2 className="w-4 h-4 text-amber-500" />} />
        </div>

        {/* 30-day chart */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Last 30 days · calls per day, by feature
          </h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#94a3b8" interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "rgba(15,23,42,0.95)", border: "none", borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: "#fff" }}
                  labelStyle={{ color: "#cbd5e1", fontWeight: 600 }}
                  formatter={(v: number, name: string) => [v, ACTION_LABELS[name] ?? name]}
                />
                <Legend
                  formatter={(v) => <span className="text-xs text-slate-600 dark:text-slate-400">{ACTION_LABELS[v] ?? v}</span>}
                  wrapperStyle={{ fontSize: 11 }}
                />
                {seenActions.map((action) => (
                  <Bar
                    key={action}
                    dataKey={action}
                    stackId="a"
                    fill={ACTION_COLORS[action] ?? "#94a3b8"}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ====================== Recent activity ====================== */}
      <section>
        <header className="mb-4">
          <h3 className="font-bold text-slate-800 dark:text-white">Recent activity</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Last 50 AI calls in your workspace.</p>
        </header>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left p-3 font-semibold">Time</th>
                  <th className="text-left p-3 font-semibold">User</th>
                  <th className="text-left p-3 font-semibold">Feature</th>
                  <th className="text-left p-3 font-semibold">Model</th>
                  <th className="text-right p-3 font-semibold">Tokens</th>
                  <th className="text-right p-3 font-semibold">Cost</th>
                  <th className="text-center p-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                {usage.slice(0, 50).map((r) => {
                  const tokens = (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
                  return (
                    <tr key={r.id}>
                      <td className="p-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                        {formatRelativeTime(r.created_at)}
                      </td>
                      <td className="p-3 text-slate-700 dark:text-slate-300 text-xs">
                        {r.user_email ?? "—"}
                      </td>
                      <td className="p-3 text-slate-700 dark:text-slate-300 text-xs">
                        {ACTION_LABELS[r.action] ?? r.action}
                      </td>
                      <td className="p-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                        {r.model.replace("gemini-", "")}
                      </td>
                      <td className="p-3 text-right text-slate-700 dark:text-slate-300 text-xs font-mono">
                        {formatTokens(tokens)}
                      </td>
                      <td className="p-3 text-right text-slate-700 dark:text-slate-300 text-xs font-mono">
                        {r.estimated_cost_usd != null
                          ? `$${Number(r.estimated_cost_usd).toFixed(4)}`
                          : "—"}
                      </td>
                      <td className="p-3 text-center">
                        {r.success ? (
                          <span className="inline-flex w-2 h-2 bg-emerald-500 rounded-full" title="Success" />
                        ) : (
                          <span className="inline-flex w-2 h-2 bg-red-500 rounded-full" title="Failed" />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {usage.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                      No AI calls yet. Try the AI Suggest button on Business Model Canvas or SWOT.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
    <div className="flex items-center gap-2 mb-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
      {icon} {label}
    </div>
    <div className="text-xl font-bold text-slate-800 dark:text-white">{value}</div>
  </div>
);

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default AIUsagePanel;
