import React, { useEffect, useState } from "react";
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
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { generateDMAInsight } from "../services/geminiService";
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
  onEditTopic: (topicCode: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const DMAInsightHub: React.FC<Props> = ({
  assessments,
  profile,
  bmcData,
  swotData,
  onBack,
  onContinue,
  onEditTopic,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<InsightHubResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    generateDMAInsight(assessments, bmcData, swotData, profile)
      .then((result) => {
        if (!cancelled) {
          setInsight(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to analyse assessments. Please try again.");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasFixIssues = insight?.qualityChecks.some((c) => c.status === "needs_fix") ?? false;

  if (loading) return <LoadingState />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <XCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Analysis Failed</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mb-6">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); setInsight(null);
            generateDMAInsight(assessments, bmcData, swotData, profile)
              .then(setInsight).catch((e) => setError(e instanceof Error ? e.message : "Error"))
              .finally(() => setLoading(false));
          }}
          className="px-6 py-2.5 bg-esg-600 text-white rounded-lg hover:bg-esg-700 transition-colors font-medium"
        >
          Retry Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">DMA Insight Hub</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          AI-powered quality review of your Double Materiality Assessment
        </p>
      </div>

      {/* Score banner */}
      <ScoreBanner assessments={assessments} checks={insight?.qualityChecks ?? []} />

      {/* Quality checks */}
      {insight && insight.qualityChecks.length > 0 && (
        <QualityCheckSection checks={insight.qualityChecks} onEditTopic={onEditTopic} />
      )}

      {/* Strategic insight */}
      {insight?.strategicInsight && (
        <StrategicInsightPanel insight={insight.strategicInsight} />
      )}

      {/* Recommended actions */}
      {insight && (
        <RecommendedActionsSection actions={insight.recommendedActions} onEditTopic={onEditTopic} />
      )}

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
// Loading state
// ─────────────────────────────────────────────────────────────────────────────

const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
    <div className="relative mb-6">
      <div className="w-16 h-16 rounded-full border-2 border-esg-200 dark:border-esg-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-esg-600 animate-spin" />
      </div>
    </div>
    <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Analysing your assessments…</h2>
    <p className="text-slate-500 dark:text-slate-400 max-w-sm text-sm">
      Reviewing quality, identifying gaps, and generating strategic insights from your DMA data.
    </p>
    <div className="mt-8 space-y-2 text-sm text-slate-400 dark:text-slate-500">
      {["Checking ESRS coverage…", "Analysing materiality patterns…", "Building strategic insights…"].map((step) => (
        <div key={step} className="flex items-center gap-2 justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-esg-400 animate-pulse" />
          {step}
        </div>
      ))}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Score banner
// ─────────────────────────────────────────────────────────────────────────────

const ScoreBanner: React.FC<{ assessments: AssessmentData[]; checks: QualityCheck[] }> = ({
  assessments,
  checks,
}) => {
  const materialCount = assessments.filter((a) => a.isMaterial).length;
  const completionPct = assessments.length === 0 ? 0 : Math.round((assessments.length / 10) * 100);
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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {[
        { label: "Material Topics", value: `${materialCount}/10`, color: "text-esg-600 dark:text-esg-400" },
        { label: "Assessments Done", value: `${completionPct}%`, color: "text-blue-600 dark:text-blue-400" },
        {
          label: "Quality Status",
          value: `${fixCount > 0 ? `${fixCount} fix` : reviewCount > 0 ? `${reviewCount} review` : `${okCount} ok`}`,
          color: fixCount > 0 ? "text-red-500" : reviewCount > 0 ? "text-amber-500" : "text-emerald-500",
        },
        { label: "Statement Ready", value: readiness, color: readinessColor },
      ].map(({ label, value, color }) => (
        <div
          key={label}
          className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm text-center"
        >
          <div className={`text-2xl font-bold ${color}`}>{value}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</div>
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
  checks: QualityCheck[];
  onEditTopic: (topicCode: string) => void;
}> = ({ checks, onEditTopic }) => {
  const sorted = [...checks].sort((a, b) => {
    const order = { needs_fix: 0, review: 1, ok: 2 };
    return order[a.status] - order[b.status];
  });

  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-esg-500" />
        Quality Check
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((check) => (
          <QualityCheckCard key={check.topic} check={check} onEditTopic={onEditTopic} />
        ))}
      </div>
    </section>
  );
};

const QualityCheckCard: React.FC<{
  check: QualityCheck;
  onEditTopic: (topicCode: string) => void;
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
            onClick={() => onEditTopic(check.topic)}
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
