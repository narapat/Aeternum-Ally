import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Lightbulb,
  Loader2,
  RotateCcw,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { triggerDMAAnalysis, getDMAAnalysisStatus } from "../services/geminiService";
import type {
  AssessmentData,
  CompanyProfile,
  InsightHubResponse,
  QualityCheck,
  RecommendedAction,
  StrategicInsight,
  SustainabilityBusinessModel,
  SwotAnalysis,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  assessments: AssessmentData[];
  profile: CompanyProfile;
  bmcData: SustainabilityBusinessModel;
  swotData: SwotAnalysis;
  onBack: () => void;
  onContinue: () => void;
  /** assessmentId is the UUID of the specific record that was analyzed (deduplicated). */
  onEditTopic: (topicCode: string, assessmentId: string, qualityCheck?: QualityCheck) => void;
  cachedInsight?: InsightHubResponse | null;
  onInsightReady?: (result: InsightHubResponse) => void;
  /** Called as each per-topic quality check resolves — used to persist results to DB. */
  onQualityCheckReady?: (assessmentId: string, check: QualityCheck) => void;
}

// Per-topic loading phase — one per assessment, updated independently
type TopicPhase =
  | { phase: "loading" }
  | { phase: "done"; check: QualityCheck }
  | { phase: "error"; message: string };

// Synthesis (Pass 2) phase — starts after all topics settle
type SynthesisPhase =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; insight: StrategicInsight; actions: RecommendedAction[] }
  | { phase: "error"; message: string };

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const DMAInsightHub: React.FC<Props> = ({
  assessments: rawAssessments,
  profile,
  bmcData,
  swotData,
  onBack,
  onContinue,
  onEditTopic,
  cachedInsight,
  onInsightReady,
  onQualityCheckReady,
}) => {
  // Deduplicate by topic code — one record per ESRS topic for quality check.
  // Pick priority: (1) record with descriptions written > (2) most recently updated.
  // Score is NOT used — it represents materiality significance, not completeness.
  const assessments = React.useMemo(() => {
    const hasContent = (a: AssessmentData) =>
      (a.impactDescription?.trim().length ?? 0) > 0 ||
      (a.financialDescription?.trim().length ?? 0) > 0;
    const updatedTime = (a: AssessmentData) =>
      a.updatedAt ? new Date(a.updatedAt).getTime() : 0;

    const seen = new Map<string, AssessmentData>();
    for (const a of rawAssessments) {
      const code = String(a.topic).split(" ")[0];
      const existing = seen.get(code);
      if (!existing) { seen.set(code, a); continue; }
      const aContent = hasContent(a);
      const existContent = hasContent(existing);
      if (aContent && !existContent) { seen.set(code, a); continue; }
      if (aContent === existContent && updatedTime(a) > updatedTime(existing)) {
        seen.set(code, a);
      }
    }
    return [...seen.values()];
  }, [rawAssessments]);

  const [topicStates, setTopicStates] = useState<Map<string, TopicPhase>>(() => {
    if (cachedInsight) {
      const map = new Map(cachedInsight.qualityChecks.map((c) => [c.topic, { phase: "done", check: c } as TopicPhase]));
      // Topics that timed out in a previous run are absent from the cache.
      // Show them as an error so the user can Re-analyse instead of spinning forever.
      assessments.forEach((a) => {
        const code = String(a.topic).split(" ")[0];
        if (!map.has(code)) {
          map.set(code, { phase: "error", message: "Previous check timed out — click Re-analyse to retry." });
        }
      });
      return map;
    }
    return new Map(assessments.map((a) => [String(a.topic).split(" ")[0], { phase: "loading" } as TopicPhase]));
  });

  const [synthesisState, setSynthesisState] = useState<SynthesisPhase>(() =>
    cachedInsight
      ? { phase: "done", insight: cachedInsight.strategicInsight, actions: cachedInsight.recommendedActions }
      : { phase: "idle" }
  );

  const [polling, setPolling] = useState(false);

  const runAnalysis = React.useCallback(async () => {
    setTopicStates(new Map(assessments.map((a) => [String(a.topic).split(" ")[0], { phase: "loading" } as TopicPhase])));
    setSynthesisState({ phase: "idle" });
    setPolling(true);

    try {
      await triggerDMAAnalysis(profile, assessments, bmcData, swotData);
    } catch (err) {
      setSynthesisState({ phase: "error", message: err instanceof Error ? err.message : "Failed to start analysis." });
      setPolling(false);
    }
  }, [assessments, profile, bmcData, swotData]);

  useEffect(() => {
    const init = async () => {
      if (cachedInsight) return;
      
      const data = await getDMAAnalysisStatus();
      if (data) {
        if (data.status === 'completed' && data.insight_result) {
          const map = new Map(topicStates);
          (data.quality_result || []).forEach((c: any) => {
            map.set(c.topicCode, { phase: "done", check: c });
          });
          setTopicStates(map);
          setSynthesisState({ phase: "done", insight: data.insight_result.strategicInsight, actions: data.insight_result.recommendedActions });
          return;
        } else if (data.status === 'processing') {
          setPolling(true);
          return;
        }
      }
      // If no data or failed, run analysis
      runAnalysis();
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedInsight]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (polling) {
      interval = setInterval(async () => {
        const data = await getDMAAnalysisStatus();
        if (data) {
          // Update topics progressively
          const map = new Map(topicStates);
          let updated = false;
          (data.quality_result || []).forEach((c: any) => {
            const current = map.get(c.topicCode);
            if (!current || current.phase !== 'done') {
              map.set(c.topicCode, { phase: "done", check: c });
              updated = true;
            }
          });
          if (updated) {
            setTopicStates(map);
          }

          if (data.status === 'completed') {
            setSynthesisState({ phase: "done", insight: data.insight_result.strategicInsight, actions: data.insight_result.recommendedActions });
            setPolling(false);
          } else if (data.status === 'failed') {
            setSynthesisState({ phase: "error", message: data.error || "Analysis failed" });
            setPolling(false);
          }
        }
      }, 3000); // Poll every 3 seconds
    }
    return () => clearInterval(interval);
  }, [polling, topicStates]);

  // Derived
  const completedChecks = assessments
    .map((a) => topicStates.get(String(a.topic).split(" ")[0]))
    .filter((s): s is { phase: "done"; check: QualityCheck } => s?.phase === "done")
    .map((s) => s.check);

  const hasFixIssues = completedChecks.some((c) => c.status === "needs_fix");
  const isAnalysing = [...topicStates.values()].some((s) => s.phase === "loading");

  // Map topicCode → assessmentId for the deduplicated record — used by edit links.
  const topicToAssessmentId = React.useMemo(
    () => new Map(assessments.map((a) => [String(a.topic).split(" ")[0], a.id])),
    [assessments],
  );

  const handleEditTopic = React.useCallback((topicCode: string, qualityCheck?: QualityCheck) => {
    const state = topicStates.get(topicCode);
    const qc = qualityCheck ?? (state?.phase === "done" ? state.check : undefined);
    const assessmentId = topicToAssessmentId.get(topicCode) ?? "";
    onEditTopic(topicCode, assessmentId, qc);
  }, [topicStates, topicToAssessmentId, onEditTopic]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">DMA Insight Hub</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            AI-powered quality review of your Double Materiality Assessment
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={isAnalysing || synthesisState.phase === "loading"}
          className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2 transition-colors flex-shrink-0 disabled:opacity-40 shadow-sm"
        >
          <RotateCcw className="w-4 h-4" />
          Re-analyse
        </button>
      </div>

      {/* Score banner — updates as topic cards arrive */}
      <ScoreBanner assessments={assessments} rawCount={rawAssessments.length} checks={completedChecks} />

      {/* Quality checks — each card appears as its topic call resolves */}
      {assessments.length > 0 && (
        <QualityCheckSection
          assessments={assessments}
          topicStates={topicStates}
          onEditTopic={handleEditTopic}
        />
      )}

      {/* Synthesis — shown once all topics settle */}
      <SynthesisSection
        state={synthesisState}
        onRetry={() => {
          if (completedChecks.length > 0) {
            setSynthesisState({ phase: "loading" });
            analyzeDMASynthesis(completedChecks, assessments, profile, bmcData, swotData)
              .then((s) => setSynthesisState({ phase: "done", insight: s.strategicInsight, actions: s.recommendedActions }))
              .catch((e) => setSynthesisState({ phase: "error", message: e instanceof Error ? e.message : "Retry failed" }));
          }
        }}
        onEditTopic={handleEditTopic}
      />

      {/* Navigation */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium w-full sm:w-auto justify-center"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Assessments
        </button>

        <div className="flex flex-col items-center gap-1 text-center">
          {hasFixIssues && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Some topics need attention before continuing
            </p>
          )}
        </div>

        <button
          onClick={onContinue}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-esg-600 text-white hover:bg-esg-700 transition-colors font-medium w-full sm:w-auto justify-center"
        >
          Continue to KPI Dashboard
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Synthesis section — appears after all topic calls settle
// ─────────────────────────────────────────────────────────────────────────────

const SynthesisSection: React.FC<{
  state: SynthesisPhase;
  onRetry: () => void;
  onEditTopic: (topicCode: string, qualityCheck?: QualityCheck) => void;
}> = ({ state, onRetry, onEditTopic }) => {
  if (state.phase === "idle") return null;

  if (state.phase === "loading") {
    return (
      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          Strategic Insight
        </h2>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 space-y-5">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
            
            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 pt-4 text-slate-500 dark:text-slate-400 text-sm border-t border-slate-100 dark:border-slate-700">
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-esg-500" />
            Synthesizing strategic context across all topics…
          </div>
        </div>
      </section>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="flex items-center gap-3 py-6 text-sm text-red-600 dark:text-red-400">
        <XCircle className="w-4 h-4 flex-shrink-0" />
        <span>{state.message}</span>
        <button onClick={onRetry} className="ml-2 underline hover:no-underline flex-shrink-0">Retry</button>
      </div>
    );
  }

  return (
    <>
      <StrategicInsightPanel insight={state.insight} />
      <RecommendedActionsSection actions={state.actions} onEditTopic={onEditTopic} />
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Score banner
// ─────────────────────────────────────────────────────────────────────────────

const ScoreBanner: React.FC<{
  assessments: AssessmentData[];
  rawCount: number;
  checks: QualityCheck[];
}> = ({ assessments, rawCount, checks }) => {
  const uniqueTopics = assessments.length;
  const materialCount = assessments.filter((a) => a.isMaterial).length;
  const fixCount = checks.filter((c) => c.status === "needs_fix").length;
  const reviewCount = checks.filter((c) => c.status === "review").length;
  const okCount = checks.filter((c) => c.status === "ok").length;

  const readiness =
    fixCount > 0 ? "Not Ready" : reviewCount > 0 ? "Needs Review" : materialCount > 0 ? "Ready" : "Incomplete";
  const readinessColor =
    fixCount > 0
      ? "text-red-500"
      : reviewCount > 0
      ? "text-amber-500"
      : materialCount > 0
      ? "text-emerald-500"
      : "text-slate-400";

  // Sub-label shown when there are duplicate records for the same topic
  const topicsLabel = rawCount > uniqueTopics
    ? `${rawCount} records · ${uniqueTopics} unique`
    : "ESRS Topics";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {[
        { label: "Material Topics", value: `${materialCount}/10`, color: "text-esg-600 dark:text-esg-400", sub: null },
        { label: "Topics Covered", value: `${uniqueTopics}/10`, color: "text-blue-600 dark:text-blue-400", sub: topicsLabel },
        {
          label: "Quality Status",
          value: `${fixCount > 0 ? `${fixCount} fix` : reviewCount > 0 ? `${reviewCount} review` : `${okCount} ok`}`,
          color: fixCount > 0 ? "text-red-500" : reviewCount > 0 ? "text-amber-500" : "text-emerald-500",
          sub: null,
        },
        { label: "Statement Ready", value: readiness, color: readinessColor, sub: null },
      ].map(({ label, value, color, sub }) => (
        <div
          key={label}
          className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm text-center"
        >
          <div className={`text-2xl font-bold ${color}`}>{value}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</div>
          {sub && <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>}
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Quality check section
// ─────────────────────────────────────────────────────────────────────────────

const statusConfig = {
  needs_fix: {
    icon: <XCircle className="w-4 h-4 text-red-500" />,
    label: "Must Fix",
    border: "border-l-red-500",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
  review: {
    icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    label: "Should Review",
    border: "border-l-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  ok: {
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    label: "Complete",
    border: "border-l-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
};

const QualityCheckSection: React.FC<{
  assessments: AssessmentData[];
  topicStates: Map<string, TopicPhase>;
  onEditTopic: (topicCode: string, qualityCheck?: QualityCheck) => void;
}> = ({ assessments, topicStates, onEditTopic }) => {
  // Sort: done (needs_fix first) → loading → error
  const sorted = [...assessments].sort((a, b) => {
    const sa = topicStates.get(String(a.topic).split(" ")[0]);
    const sb = topicStates.get(String(b.topic).split(" ")[0]);
    const rank = (s: TopicPhase | undefined) => {
      if (!s || s.phase === "loading") return 3;
      if (s.phase === "error") return 4;
      const order = { needs_fix: 0, review: 1, ok: 2 };
      return order[s.check.status] ?? 2;
    };
    return rank(sa) - rank(sb);
  });

  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-esg-500" />
        Quality Check
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((assessment) => {
          const topicCode = String(assessment.topic).split(" ")[0];
          const topicTitle = String(assessment.topic).replace(/^[A-Z0-9]+ /, "");
          const state = topicStates.get(topicCode);

          if (!state || state.phase === "loading") {
            return <TopicSkeletonCard key={topicCode} topicCode={topicCode} topicTitle={topicTitle} />;
          }
          if (state.phase === "error") {
            return <TopicErrorCard key={topicCode} topicCode={topicCode} topicTitle={topicTitle} message={state.message} />;
          }
          return <QualityCheckCard key={topicCode} check={state.check} onEditTopic={onEditTopic} />;
        })}
      </div>
    </section>
  );
};

const TopicSkeletonCard: React.FC<{ topicCode: string; topicTitle: string }> = ({ topicCode, topicTitle }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 flex items-center gap-3 animate-pulse">
    <Loader2 className="w-4 h-4 text-esg-400 animate-spin flex-shrink-0" />
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{topicCode} — {topicTitle}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Checking quality…</p>
    </div>
  </div>
);

const TopicErrorCard: React.FC<{ topicCode: string; topicTitle: string; message: string }> = ({ topicCode, topicTitle, message }) => (
  <div className="rounded-xl border border-l-4 border-l-slate-400 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-4 flex items-center gap-3">
    <XCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">{topicCode} — {topicTitle}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{message}</p>
    </div>
  </div>
);

const QualityCheckCard: React.FC<{
  check: QualityCheck;
  onEditTopic: (topicCode: string, qualityCheck?: QualityCheck) => void;
}> = ({ check, onEditTopic }) => {
  const [expanded, setExpanded] = useState(check.status === "needs_fix");
  const cfg = statusConfig[check.status] ?? statusConfig.ok;

  return (
    <div
      className={`rounded-xl border border-l-4 ${cfg.border} ${cfg.bg} border-slate-200 dark:border-slate-700 overflow-hidden`}
    >
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span aria-label={cfg.label}>{cfg.icon}</span>
          <span className="font-semibold text-slate-800 dark:text-white text-sm truncate">
            {check.topic} — {check.topicTitle}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              check.status === "needs_fix"
                ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
                : check.status === "review"
                ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                : "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {cfg.label}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && check.issues.length > 0 && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-200 dark:border-slate-700 pt-3">
          {check.issues.map((issue, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-start gap-1.5">
                <span
                  className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    issue.severity === "high"
                      ? "bg-red-500"
                      : issue.severity === "medium"
                      ? "bg-amber-500"
                      : "bg-slate-400"
                  }`}
                />
                <p className="text-sm font-medium text-slate-800 dark:text-white">{issue.title}</p>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 pl-3">{issue.description}</p>
              {issue.fix_suggestion && (
                <p className="text-xs text-slate-500 dark:text-slate-400 pl-3">
                  <span className="font-medium">Fix: </span>
                  {issue.fix_suggestion}
                </p>
              )}
              <p className="text-xs text-esg-600 dark:text-esg-400 font-mono pl-3">{issue.esrs_ref}</p>
            </div>
          ))}
        </div>
      )}

      {expanded && check.issues.length === 0 && (
        <p className="px-4 pb-3 text-xs text-emerald-600 dark:text-emerald-400 border-t border-slate-200 dark:border-slate-700 pt-3">
          No issues found — this topic meets minimum ESRS requirements.
        </p>
      )}

      {/* Edit link — always visible in footer */}
      {expanded && (
        <div className="px-4 pb-3 flex justify-end border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
          <button
            onClick={() => onEditTopic(check.topic, check)}
            className="text-xs font-medium text-esg-600 dark:text-esg-400 hover:underline flex items-center gap-1"
          >
            Edit {check.topic} assessment →
          </button>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Strategic insight panel
// ─────────────────────────────────────────────────────────────────────────────

const StrategicInsightPanel: React.FC<{ insight: StrategicInsight }> = ({ insight }) => (
  <section>
    <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
      <Lightbulb className="w-5 h-5 text-amber-500" />
      Strategic Insight
    </h2>
    <div className="rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 dark:from-blue-800 dark:to-blue-950 p-6 text-white space-y-5">
      <p className="text-base leading-relaxed">{insight.summary}</p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-blue-200 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Key Risks
          </h3>
          <ul className="space-y-1.5">
            {insight.keyRisks.map((r, i) => (
              <li key={i} className="text-sm text-blue-100 flex items-start gap-1.5">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-300 flex-shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-blue-200 mb-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Opportunities
          </h3>
          <ul className="space-y-1.5">
            {insight.opportunities.map((o, i) => (
              <li key={i} className="text-sm text-blue-100 flex items-start gap-1.5">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-300 flex-shrink-0" />
                {o}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {insight.bottomLine && (
        <div className="border-t border-blue-500/40 pt-4">
          <p className="text-sm font-semibold text-blue-100 flex items-center gap-1.5 mb-1">
            <Zap className="w-4 h-4 text-yellow-300" /> Bottom Line
          </p>
          <p className="text-sm text-blue-50">{insight.bottomLine}</p>
        </div>
      )}
    </div>
  </section>
);

// ─────────────────────────────────────────────────────────────────────────────
// Recommended actions
// ─────────────────────────────────────────────────────────────────────────────

const actionTypeConfig = {
  fix: {
    label: "Fix",
    icon: <XCircle className="w-4 h-4 text-red-500" />,
    description: "Correct incomplete or inconsistent assessments",
  },
  comply: {
    label: "Comply",
    icon: <CheckCircle2 className="w-4 h-4 text-blue-500" />,
    description: "Meet specific ESRS requirements",
  },
  improve: {
    label: "Improve",
    icon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
    description: "Strategic opportunities beyond compliance",
  },
};

const priorityStyle = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-emerald-500",
};

const RecommendedActionsSection: React.FC<{
  actions: RecommendedAction[];
  onEditTopic: (topicCode: string) => void;
}> = ({ actions, onEditTopic }) => {
  if (actions.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-esg-500" />
          Recommended Actions
        </h2>
        <p className="text-sm text-slate-400 dark:text-slate-500 italic">No actions generated.</p>
      </section>
    );
  }

  const groups = (["fix", "comply", "improve"] as const).map((type) => ({
    type,
    items: actions.filter((a) => a.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-esg-500" />
        Recommended Actions
      </h2>
      <div className="space-y-6">
        {groups.map(({ type, items }) => {
          const cfg = actionTypeConfig[type];
          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-3">
                {cfg.icon}
                <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">
                  {cfg.label}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">— {cfg.description}</span>
              </div>
              <div className="space-y-3">
                {items.map((action) => (
                  <ActionCard key={action.id} action={action} onEditTopic={onEditTopic} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const ActionCard: React.FC<{
  action: RecommendedAction;
  onEditTopic: (topicCode: string) => void;
}> = ({ action, onEditTopic }) => (
  <div
    className={`bg-white dark:bg-slate-800 rounded-xl border border-l-4 ${priorityStyle[action.priority] ?? priorityStyle.low} border-slate-200 dark:border-slate-700 p-4`}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-medium text-slate-800 dark:text-white text-sm">{action.title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{action.description}</p>
      </div>
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
          action.priority === "high"
            ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
            : action.priority === "medium"
            ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
            : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
        }`}
      >
        {action.priority}
      </span>
    </div>
    <div className="flex items-center justify-between mt-2">
      <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
        <span className="font-mono text-esg-600 dark:text-esg-400">{action.esrs_ref}</span>
        {action.estimated_time && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {action.estimated_time}
          </span>
        )}
      </div>
      {action.source_id && (
        <button
          onClick={() => onEditTopic(action.source_id)}
          className="text-xs text-esg-600 dark:text-esg-400 hover:underline font-medium"
        >
          Edit {action.source_id} →
        </button>
      )}
    </div>
  </div>
);

export default DMAInsightHub;
