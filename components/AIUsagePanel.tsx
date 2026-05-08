import React, { useEffect, useMemo, useState } from "react";
import {
  Sparkles, Zap, Brain, Loader2, Save, AlertCircle, CheckCircle2,
  TrendingUp, DollarSign, Hash, Key, ShieldCheck, ShieldOff, Eye, EyeOff,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import {
  fetchAiSettings, upsertAiSettings, upsertByokSettings, fetchMonthlyCallCount, fetchAiUsageLog,
  type AiUsageRow,
} from "../services/dbService";
import type { OrgRole } from "../types";

interface Props {
  organizationId: string;
  currentUserRole: OrgRole | null;
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
  generateAssessmentScoring:     "AI scoring",
  generateCanvasSuggestion:      "Canvas suggestion",
  generateSwotInternal:          "SWOT internal",
  generateSwotExternal:          "SWOT external",
  generateKPISuggestions:        "KPI suggestions",
  generateSustainabilityStatement: "Sustainability statement",
  analyzeTopicQuality:           "Quality check",
  analyzeDMASynthesis:           "DMA synthesis",
  analyzeDMAQuality:             "DMA quality (legacy)",
  generateTasks:                 "Task generation",
};

const ACTION_COLORS: Record<string, string> = {
  generateAssessmentSuggestions: "#3b82f6",
  generateAssessmentScoring:     "#60a5fa",
  generateCanvasSuggestion:      "#10b981",
  generateSwotInternal:          "#f59e0b",
  generateSwotExternal:          "#8b5cf6",
  generateKPISuggestions:        "#ec4899",
  generateSustainabilityStatement: "#06b6d4",
  analyzeTopicQuality:           "#f97316",
  analyzeDMASynthesis:           "#84cc16",
  analyzeDMAQuality:             "#a78bfa",
  generateTasks:                 "#fb923c",
};

// Platform soft limit shown in the quota bar (same default as api.ts)
const PLATFORM_SOFT_LIMIT_DEFAULT = 100;

const AIUsagePanel: React.FC<Props> = ({ organizationId, currentUserRole }) => {
  const canManage = currentUserRole === "Owner" || currentUserRole === "Admin";

  // ── Model selection ──────────────────────────────────────────────
  const [model, setModel] = useState<string>("gemini-2.5-flash");
  const [savedModel, setSavedModel] = useState<string>("gemini-2.5-flash");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  // ── BYOK ─────────────────────────────────────────────────────────
  const [useBYOK, setUseBYOK] = useState(false);
  const [savedUseBYOK, setSavedUseBYOK] = useState(false);
  const [byokProvider, setByokProvider] = useState<string>("gemini");
  const [byokKeyInput, setByokKeyInput] = useState<string>("");   // blank = unchanged
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [isSavingBYOK, setIsSavingBYOK] = useState(false);
  const [byokSaveError, setByokSaveError] = useState<string | null>(null);
  const [byokSaveStatus, setByokSaveStatus] = useState<"idle" | "saved">("idle");

  // ── Usage data ───────────────────────────────────────────────────
  const [usage, setUsage] = useState<AiUsageRow[]>([]);
  const [monthlyCallCount, setMonthlyCallCount] = useState<number>(0);
  const [softQuotaMonthly, setSoftQuotaMonthly] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch settings + recent usage + this month's count on mount
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      fetchAiSettings(organizationId),
      fetchAiUsageLog(organizationId, 500),
      fetchMonthlyCallCount(organizationId),
    ]).then(([settings, log, monthCount]) => {
      if (cancelled) return;
      if (settings) {
        setModel(settings.model);
        setSavedModel(settings.model);
        setUseBYOK(settings.use_byok);
        setSavedUseBYOK(settings.use_byok);
        setByokProvider(settings.byok_provider ?? "gemini");
        setHasStoredKey(settings.has_byok_key);
        setSoftQuotaMonthly(settings.soft_quota_monthly);
      }
      setUsage(log);
      setMonthlyCallCount(monthCount);
      setIsLoading(false);
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [organizationId]);

  const isDirty = model !== savedModel;
  const isByokDirty = useBYOK !== savedUseBYOK || byokKeyInput !== "";

  const handleSaveModel = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await upsertAiSettings(organizationId, model);
      setSavedModel(model);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (error: any) {
      setSaveError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBYOK = async () => {
    setIsSavingBYOK(true);
    setByokSaveError(null);
    try {
      const payload: Parameters<typeof upsertByokSettings>[1] = {
        use_byok: useBYOK,
        byok_provider: useBYOK ? byokProvider : null,
      };
      // Only send key field when user typed something
      if (byokKeyInput.trim()) payload.byok_api_key = byokKeyInput.trim();
      // Explicit clear when disabling and a key was stored
      else if (!useBYOK && hasStoredKey) payload.byok_api_key = null;

      await upsertByokSettings(organizationId, payload);
      setSavedUseBYOK(useBYOK);
      setHasStoredKey(useBYOK ? (byokKeyInput.trim() !== "" || hasStoredKey) : false);
      setByokKeyInput("");
      setByokSaveStatus("saved");
      setTimeout(() => setByokSaveStatus("idle"), 3000);
    } catch (error: any) {
      setByokSaveError(error.message);
    } finally {
      setIsSavingBYOK(false);
    }
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

      {/* ====================== Quota bar ====================== */}
      {!savedUseBYOK && (
        <section>
          <header className="mb-3">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Hash className="w-4 h-4 text-esg-600" /> Monthly call quota
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Platform quota resets on the 1st of each month. Enable BYOK below to bypass it.
            </p>
          </header>

          <QuotaBar
            used={monthlyCallCount}
            limit={softQuotaMonthly ?? PLATFORM_SOFT_LIMIT_DEFAULT}
          />
        </section>
      )}

      {/* ====================== BYOK ====================== */}
      <section>
        <header className="mb-4">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Key className="w-4 h-4 text-esg-600" /> Bring Your Own Key (BYOK)
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Supply your own Gemini API key to bypass the monthly platform quota and use the model of your choice.
          </p>
        </header>

        {byokSaveError && (
          <div className="mb-3 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {byokSaveError}
          </div>
        )}

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-4">
          {/* Toggle */}
          <label className={`flex items-center justify-between gap-3 ${canManage ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
            <div className="flex items-center gap-2">
              {useBYOK
                ? <ShieldCheck className="w-5 h-5 text-emerald-500" />
                : <ShieldOff className="w-5 h-5 text-slate-400" />}
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">
                  {useBYOK ? "BYOK enabled" : "BYOK disabled"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {useBYOK
                    ? "AI calls use your own API key and bypass platform quota."
                    : "AI calls use the platform Gemini key (quota applies)."}
                </p>
              </div>
            </div>
            <div
              role="switch"
              aria-checked={useBYOK}
              onClick={() => canManage && setUseBYOK(!useBYOK)}
              className={`relative inline-flex w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                useBYOK ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  useBYOK ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </div>
          </label>

          {/* Key input — only shown when BYOK is toggled on */}
          {useBYOK && (
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-700">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Provider
                </label>
                <select
                  value={byokProvider}
                  onChange={(e) => canManage && setByokProvider(e.target.value)}
                  disabled={!canManage}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm px-3 py-2 disabled:opacity-60"
                >
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  API Key {hasStoredKey && !byokKeyInput && (
                    <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-normal">· key stored</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={byokKeyInput}
                    onChange={(e) => canManage && setByokKeyInput(e.target.value)}
                    disabled={!canManage}
                    placeholder={hasStoredKey ? "Enter a new key to replace the stored one" : "AIza..."}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm px-3 py-2 pr-10 font-mono disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Your key is stored encrypted on the server and is never sent to the browser.
                </p>
              </div>
            </div>
          )}

          {/* Save button */}
          {canManage && (
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {isByokDirty ? (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved changes
                  </span>
                ) : byokSaveStatus === "saved" ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleSaveBYOK}
                disabled={!isByokDirty || isSavingBYOK}
                className="flex items-center gap-2 bg-esg-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-esg-700 transition-colors disabled:opacity-50"
              >
                {isSavingBYOK ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save BYOK settings
              </button>
            </div>
          )}

          {!canManage && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Only Owners and Admins can configure BYOK.
            </p>
          )}
        </div>
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

const QuotaBar: React.FC<{ used: number; limit: number }> = ({ used, limit }) => {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isWarning = pct >= 80 && pct < 100;
  const isOver = pct >= 100;
  const barColor = isOver
    ? "bg-red-500"
    : isWarning
    ? "bg-amber-500"
    : "bg-esg-500";

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-2">
      {(isOver || isWarning) && (
        <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
          isOver
            ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
            : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
        }`}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {isOver
            ? "Soft quota exceeded. AI calls are still allowed but you may want to enable BYOK or contact support."
            : "Approaching monthly quota. Consider enabling BYOK to avoid interruptions."}
        </div>
      )}
      <div className="flex justify-between items-center text-xs text-slate-600 dark:text-slate-400">
        <span>{used.toLocaleString()} calls used</span>
        <span>{limit.toLocaleString()} soft limit</span>
      </div>
      <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-400">{pct}% of monthly soft limit used</p>
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
