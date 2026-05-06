
import React, { useState, useEffect, useRef } from 'react';
import { AssessmentData, ESRSTopic, ImpactScore, FinancialScore, CompanyProfile, SustainabilityBusinessModel, SwotAnalysis, AssessmentScoring } from '../types';
import { SCALE_OPTIONS, LIKELIHOOD_OPTIONS, calculateImpactMateriality, calculateFinancialMateriality, TOPICS } from '../constants';
import { generateAssessmentSuggestions, generateAssessmentScoring } from '../services/geminiService';
import { AlertCircle, TrendingUp, Cpu, Loader2, Save, X, Sparkles, RotateCcw, AlertTriangle } from 'lucide-react';

interface Props {
  profile: CompanyProfile;
  bmcData: SustainabilityBusinessModel;
  swotData: SwotAnalysis;
  onSave: (data: AssessmentData) => void;
  onCancel: () => void;
  initialData?: AssessmentData | null;
}

type OverrideKey = 'impact.scale' | 'impact.scope' | 'impact.irremediability' | 'impact.likelihood' | 'financial.magnitude' | 'financial.likelihood';

const AssessmentForm: React.FC<Props> = ({ profile, bmcData, swotData, onSave, onCancel, initialData }) => {
  const [topic, setTopic] = useState<ESRSTopic>(ESRSTopic.E1);
  const [impactDesc, setImpactDesc] = useState('');
  const [financialDesc, setFinancialDesc] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [loadingScoring, setLoadingScoring] = useState(false);
  const [scoringError, setScoringError] = useState(false);
  const [aiScoring, setAiScoring] = useState<AssessmentScoring | null>(null);
  const [overrides, setOverrides] = useState<Set<OverrideKey>>(new Set());

  const [impactScore, setImpactScore] = useState<ImpactScore>({
    scale: 1, scope: 1, irremediability: 1, likelihood: 1,
  });
  const [financialScore, setFinancialScore] = useState<FinancialScore>({
    magnitude: 1, likelihood: 1,
  });

  // Always-fresh ref so fetchAIScoring doesn't need to be recreated on prop changes
  const latestRef = useRef({ profile, bmcData, swotData });
  useEffect(() => { latestRef.current = { profile, bmcData, swotData }; });

  useEffect(() => {
    if (initialData) {
      setTopic(initialData.topic);
      setImpactDesc(initialData.impactDescription);
      setFinancialDesc(initialData.financialDescription);
      setImpactScore(initialData.impactScore);
      setFinancialScore(initialData.financialScore);
    } else {
      setTopic(ESRSTopic.E1);
      setImpactDesc('');
      setFinancialDesc('');
      setImpactScore({ scale: 1, scope: 1, irremediability: 1, likelihood: 1 });
      setFinancialScore({ magnitude: 1, likelihood: 1 });
    }
    setAiScoring(null);
    setScoringError(false);
    setOverrides(new Set());
  }, [initialData]);

  const runAIScoring = async (impactD: string, financialD: string, t: ESRSTopic) => {
    const { profile: p, bmcData: b, swotData: s } = latestRef.current;
    setLoadingScoring(true);
    setAiScoring(null);
    setScoringError(false);
    setOverrides(new Set());

    const result = await generateAssessmentScoring(t, p, b, s, impactD, financialD);

    if (result) {
      setAiScoring(result);
      // Only pre-populate when creating new (editing keeps user's existing scores)
      if (!initialData) {
        setImpactScore({
          scale: result.impact.scale.score,
          scope: result.impact.scope.score,
          irremediability: result.impact.irremediability.score,
          likelihood: result.impact.likelihood.score,
        });
        setFinancialScore({
          magnitude: result.financial.magnitude.score,
          likelihood: result.financial.likelihood.score,
        });
      }
    } else {
      setScoringError(true);
    }

    setLoadingScoring(false);
  };

  // AI Auto-Fill: generate descriptions then immediately score based on them
  const handleAutoFill = async () => {
    setLoadingAI(true);
    const suggestions = await generateAssessmentSuggestions(profile, topic);
    setImpactDesc(suggestions.impactSuggestion);
    setFinancialDesc(suggestions.financialSuggestion);
    setLoadingAI(false);
    // Trigger scoring with the freshly generated descriptions
    await runAIScoring(suggestions.impactSuggestion, suggestions.financialSuggestion, topic);
  };

  // Manual trigger: user typed their own descriptions and wants AI score suggestions
  const handleGetAIScores = () => {
    runAIScoring(impactDesc, financialDesc, topic);
  };

  const handleImpactScore = (key: keyof ImpactScore, value: number, overrideKey: OverrideKey) => {
    setImpactScore(prev => ({ ...prev, [key]: value }));
    if (aiScoring) setOverrides(prev => new Set(prev).add(overrideKey));
  };

  const handleFinancialScore = (key: keyof FinancialScore, value: number, overrideKey: OverrideKey) => {
    setFinancialScore(prev => ({ ...prev, [key]: value }));
    if (aiScoring) setOverrides(prev => new Set(prev).add(overrideKey));
  };

  const acceptAllSuggestions = () => {
    if (!aiScoring) return;
    setImpactScore({
      scale: aiScoring.impact.scale.score,
      scope: aiScoring.impact.scope.score,
      irremediability: aiScoring.impact.irremediability.score,
      likelihood: aiScoring.impact.likelihood.score,
    });
    setFinancialScore({
      magnitude: aiScoring.financial.magnitude.score,
      likelihood: aiScoring.financial.likelihood.score,
    });
    setOverrides(new Set());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const imValue = calculateImpactMateriality(impactScore);
    const fmValue = calculateFinancialMateriality(financialScore);
    const data: AssessmentData = {
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      topic,
      impactDescription: impactDesc,
      financialDescription: financialDesc,
      impactScore,
      financialScore,
      impactMaterialityValue: imValue,
      financialMaterialityValue: fmValue,
      isMaterial: imValue > 40 || fmValue > 40,
    };
    onSave(data);
  };

  const canRequestScores = (impactDesc.trim().length > 0 || financialDesc.trim().length > 0) && !loadingScoring && !loadingAI;

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 space-y-6 transition-colors h-full flex flex-col">

      {/* ── Header row: title / step toolbar / close ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">

        {/* Title */}
        <div className="shrink-0">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{initialData ? 'Edit Assessment' : 'New Assessment'}</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Evaluate impact and financial materiality for a specific ESRS topic.</p>
        </div>

        {/* Step toolbar */}
        <div className="flex items-center gap-2 flex-1 justify-center">
          {/* Step 1 */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold">1</span>
            Fill descriptions
          </div>
          <button
            type="button"
            onClick={handleAutoFill}
            disabled={loadingAI || loadingScoring}
            className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-sm font-medium disabled:opacity-50 shrink-0"
            title="AI writes descriptions then immediately suggests scores"
          >
            {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
            AI Auto-Fill
          </button>

          {/* Divider arrow */}
          <span className="text-slate-300 dark:text-slate-600 text-lg shrink-0">→</span>

          {/* Step 2 */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold">2</span>
            AI scores
          </div>

          {/* Step 2 dynamic status */}
          <div className="shrink-0">
            {loadingScoring ? (
              <div className="flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Suggesting scores...
              </div>
            ) : scoringError ? (
              <div className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                Unavailable —{' '}
                <button type="button" onClick={handleGetAIScores} className="underline hover:no-underline">Retry</button>
              </div>
            ) : aiScoring ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                  <Sparkles className="w-4 h-4" />
                  Applied
                </span>
                {overrides.size > 0 && (
                  <button
                    type="button"
                    onClick={acceptAllSuggestions}
                    className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to AI
                  </button>
                )}
              </div>
            ) : canRequestScores ? (
              <button
                type="button"
                onClick={handleGetAIScores}
                className="flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200"
              >
                <Sparkles className="w-4 h-4" />
                Get Suggestions
              </button>
            ) : (
              <span className="text-sm text-slate-400 dark:text-slate-600 italic">fill descriptions first</span>
            )}
          </div>
        </div>

        {/* Close */}
        <button type="button" onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* ── Topic selector ── */}
      <div className="max-w-sm space-y-1.5">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">ESRS Topic</label>
        <select
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value as ESRSTopic);
            setAiScoring(null);
            setScoringError(false);
            setOverrides(new Set());
          }}
          className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-esg-500 focus:border-esg-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
        >
          {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-y-auto">
        {/* Impact Materiality */}
        <div className="space-y-4 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-2">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-bold text-lg">Impact Materiality</h3>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Impact Description</label>
            <textarea
              value={impactDesc}
              onChange={e => { setImpactDesc(e.target.value); setAiScoring(null); setScoringError(false); }}
              className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg h-24 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600"
              placeholder="Describe the impact on people/environment..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ScoreSelect
              label="Scale"
              value={impactScore.scale}
              onChange={v => handleImpactScore('scale', v, 'impact.scale')}
              options={SCALE_OPTIONS}
              suggestion={aiScoring?.impact.scale}
              isOverridden={overrides.has('impact.scale')}
              onAccept={() => { setImpactScore(s => ({ ...s, scale: aiScoring!.impact.scale.score })); setOverrides(p => { const n = new Set(p); n.delete('impact.scale'); return n; }); }}
            />
            <ScoreSelect
              label="Scope"
              value={impactScore.scope}
              onChange={v => handleImpactScore('scope', v, 'impact.scope')}
              options={SCALE_OPTIONS}
              suggestion={aiScoring?.impact.scope}
              isOverridden={overrides.has('impact.scope')}
              onAccept={() => { setImpactScore(s => ({ ...s, scope: aiScoring!.impact.scope.score })); setOverrides(p => { const n = new Set(p); n.delete('impact.scope'); return n; }); }}
            />
            <ScoreSelect
              label="Irremediability"
              value={impactScore.irremediability}
              onChange={v => handleImpactScore('irremediability', v, 'impact.irremediability')}
              options={SCALE_OPTIONS}
              suggestion={aiScoring?.impact.irremediability}
              isOverridden={overrides.has('impact.irremediability')}
              onAccept={() => { setImpactScore(s => ({ ...s, irremediability: aiScoring!.impact.irremediability.score })); setOverrides(p => { const n = new Set(p); n.delete('impact.irremediability'); return n; }); }}
            />
            <ScoreSelect
              label="Likelihood"
              value={impactScore.likelihood}
              onChange={v => handleImpactScore('likelihood', v, 'impact.likelihood')}
              options={LIKELIHOOD_OPTIONS}
              suggestion={aiScoring?.impact.likelihood}
              isOverridden={overrides.has('impact.likelihood')}
              onAccept={() => { setImpactScore(s => ({ ...s, likelihood: aiScoring!.impact.likelihood.score })); setOverrides(p => { const n = new Set(p); n.delete('impact.likelihood'); return n; }); }}
            />
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Impact Score:</span>
              <span className="font-bold text-blue-700 dark:text-blue-400">{Math.round(calculateImpactMateriality(impactScore))} / 100</span>
            </div>
          </div>
        </div>

        {/* Financial Materiality */}
        <div className="space-y-4 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 mb-2">
            <TrendingUp className="w-5 h-5" />
            <h3 className="font-bold text-lg">Financial Materiality</h3>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Risks & Opportunities</label>
            <textarea
              value={financialDesc}
              onChange={e => { setFinancialDesc(e.target.value); setAiScoring(null); setScoringError(false); }}
              className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg h-24 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600"
              placeholder="Describe financial risks or opportunities..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ScoreSelect
              label="Magnitude"
              value={financialScore.magnitude}
              onChange={v => handleFinancialScore('magnitude', v, 'financial.magnitude')}
              options={SCALE_OPTIONS}
              suggestion={aiScoring?.financial.magnitude}
              isOverridden={overrides.has('financial.magnitude')}
              onAccept={() => { setFinancialScore(s => ({ ...s, magnitude: aiScoring!.financial.magnitude.score })); setOverrides(p => { const n = new Set(p); n.delete('financial.magnitude'); return n; }); }}
            />
            <ScoreSelect
              label="Likelihood"
              value={financialScore.likelihood}
              onChange={v => handleFinancialScore('likelihood', v, 'financial.likelihood')}
              options={LIKELIHOOD_OPTIONS}
              suggestion={aiScoring?.financial.likelihood}
              isOverridden={overrides.has('financial.likelihood')}
              onAccept={() => { setFinancialScore(s => ({ ...s, likelihood: aiScoring!.financial.likelihood.score })); setOverrides(p => { const n = new Set(p); n.delete('financial.likelihood'); return n; }); }}
            />
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Financial Score:</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400">{Math.round(calculateFinancialMateriality(financialScore))} / 100</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-slate-700 mt-auto">
        <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 dark:text-slate-400 font-medium hover:text-slate-800 dark:hover:text-white">Cancel</button>
        <button type="submit" className="px-6 py-2 bg-esg-600 text-white font-medium rounded-lg hover:bg-esg-700 shadow-lg shadow-esg-600/20 transition-all flex items-center gap-2">
          <Save className="w-4 h-4" />
          {initialData ? 'Update Assessment' : 'Complete Assessment'}
        </button>
      </div>
    </form>
  );
};

interface ScoreSelectProps {
  label: string;
  value: number;
  onChange: (n: number) => void;
  options: { value: number; label: string }[];
  suggestion?: { score: number; reasoning: string };
  isOverridden?: boolean;
  onAccept?: () => void;
}

const ScoreSelect: React.FC<ScoreSelectProps> = ({ label, value, onChange, options, suggestion, isOverridden, onAccept }) => {
  const [showReasoning, setShowReasoning] = useState(false);
  const hasSuggestion = suggestion !== undefined && suggestion !== null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</label>
        {hasSuggestion && (
          <div className="flex items-center gap-1">
            {isOverridden ? (
              <button
                type="button"
                onClick={onAccept}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Use AI ({suggestion!.score})
              </button>
            ) : (
              <span className="flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                <Sparkles className="w-3 h-3" />
                AI: {suggestion!.score}
              </span>
            )}
            {suggestion!.reasoning && (
              <button
                type="button"
                onClick={() => setShowReasoning(r => !r)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 ml-0.5"
                title="View AI reasoning"
              >
                {showReasoning ? '▲' : '?'}
              </button>
            )}
          </div>
        )}
      </div>

      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full p-2 text-sm border rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-1 focus:ring-esg-500 ${
          isOverridden
            ? 'border-amber-400 dark:border-amber-600'
            : hasSuggestion
            ? 'border-emerald-400 dark:border-emerald-600'
            : 'border-slate-300 dark:border-slate-600'
        }`}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.value} - {opt.label}</option>
        ))}
      </select>

      {showReasoning && suggestion?.reasoning && (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic bg-slate-100 dark:bg-slate-900 p-2 rounded leading-snug">
          {suggestion.reasoning}
        </p>
      )}
    </div>
  );
};

export default AssessmentForm;
