
import React, { useState } from 'react';
import { SwotAnalysis, SustainabilityBusinessModel, CompanyProfile } from '../types';
import { generateSwotInternal, generateSwotExternal } from '../services/geminiService';
import { ArrowRight, ArrowLeft, Loader2, Globe, ShieldAlert, TrendingUp, Zap, AlertTriangle, Plus, X } from 'lucide-react';
import SaveIndicator from './SaveIndicator';
import type { SaveStatus } from '../hooks/useOrgData';

interface Props {
  data: SwotAnalysis;
  onChange: (data: SwotAnalysis) => void;
  profile: CompanyProfile;
  bmcData: SustainabilityBusinessModel;
  saveStatus: SaveStatus;
  isDirty: boolean;
  onSave: () => void;
  saveError?: string | null;
}

// ── Shared array editor ───────────────────────────────────────────────────────

interface ArrayFieldEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  focusRingColor?: string;
}

const ArrayFieldEditor: React.FC<ArrayFieldEditorProps> = ({
  items, onChange, placeholder, focusRingColor = 'focus:ring-indigo-500'
}) => {
  const [draft, setDraft] = useState('');

  const addItem = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...items, trimmed]);
    setDraft('');
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className={`border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-950 focus-within:ring-2 ${focusRingColor} transition-all`}>
      <ul className="p-4 space-y-2 min-h-[100px] max-h-52 overflow-y-auto">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 group">
            <span className="text-slate-300 dark:text-slate-600 text-sm flex-shrink-0">•</span>
            <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">{item}</span>
            <button
              onClick={() => removeItem(i)}
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-opacity p-0.5 rounded flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-slate-300 dark:text-slate-600 italic py-2">No items yet — add one below or use AI.</li>
        )}
      </ul>
      <div className="border-t border-slate-100 dark:border-slate-700 p-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
          placeholder={placeholder || 'Add item and press Enter…'}
          className="flex-1 text-sm px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-400"
        />
        <button
          onClick={addItem}
          disabled={!draft.trim()}
          className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const SwotAnalysisWizard: React.FC<Props> = ({ data, onChange, profile, bmcData, saveStatus, isDirty, onSave, saveError }) => {
  const [step, setStep] = useState<number>(0);
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  const handleGenerateInternalField = async (field: 'strengths' | 'weaknesses') => {
    setLoadingMap(m => ({ ...m, [field]: true }));
    const result = await generateSwotInternal(profile, bmcData);
    if (field === 'strengths' && result.strengths.length > 0)
      onChange({ ...data, strengths: result.strengths });
    else if (field === 'weaknesses' && result.weaknesses.length > 0)
      onChange({ ...data, weaknesses: result.weaknesses });
    setLoadingMap(m => ({ ...m, [field]: false }));
  };

  const handleGenerateExternal = async (field: 'opportunities' | 'threats') => {
    setLoadingMap(m => ({ ...m, [field]: true }));
    const result = await generateSwotExternal(profile, field === 'opportunities' ? 'OPPORTUNITIES' : 'THREATS');
    onChange({ ...data, [field]: result });
    setLoadingMap(m => ({ ...m, [field]: false }));
  };

  const renderStepInternal = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
        <h3 className="text-xl font-bold text-slate-800 dark:text-white">Step 1: Internal Factors</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Analyze your Strengths and Weaknesses based on your Business Model Canvas.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Strengths */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-400">
              <TrendingUp className="w-5 h-5" /> Strengths
            </label>
            <button
              onClick={() => handleGenerateInternalField('strengths')}
              disabled={loadingMap.strengths}
              className="flex items-center gap-1.5 text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
            >
              {loadingMap.strengths ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              AI Suggest
            </button>
          </div>
          <ArrayFieldEditor
            items={data.strengths}
            onChange={(items) => onChange({ ...data, strengths: items })}
            placeholder="e.g. Strong proprietary technology"
            focusRingColor="focus:ring-emerald-500"
          />
        </div>

        {/* Weaknesses */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" /> Weaknesses
            </label>
            <button
              onClick={() => handleGenerateInternalField('weaknesses')}
              disabled={loadingMap.weaknesses}
              className="flex items-center gap-1.5 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 px-3 py-1.5 rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
            >
              {loadingMap.weaknesses ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              AI Suggest
            </button>
          </div>
          <ArrayFieldEditor
            items={data.weaknesses}
            onChange={(items) => onChange({ ...data, weaknesses: items })}
            placeholder="e.g. High dependency on single supplier"
            focusRingColor="focus:ring-amber-500"
          />
        </div>
      </div>
    </div>
  );

  const renderStepExternal = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
        <h3 className="text-xl font-bold text-slate-800 dark:text-white">Step 2: External Factors</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Identify Opportunities and Threats. <span className="text-indigo-500 font-medium">AI will search the web for news and trends.</span></p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Opportunities */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400">
              <Globe className="w-5 h-5" /> Opportunities
            </label>
            <button
              onClick={() => handleGenerateExternal('opportunities')}
              disabled={loadingMap.opportunities}
              className="flex items-center gap-1.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-3 py-1.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              {loadingMap.opportunities ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
              Search News
            </button>
          </div>
          <ArrayFieldEditor
            items={data.opportunities}
            onChange={(items) => onChange({ ...data, opportunities: items })}
            placeholder="e.g. Growing demand for sustainable products"
            focusRingColor="focus:ring-blue-500"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500">AI searches for: Market trends, new regulations, competitor shifts.</p>
        </div>

        {/* Threats */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="flex items-center gap-2 font-bold text-red-600 dark:text-red-400">
              <ShieldAlert className="w-5 h-5" /> Threats
            </label>
            <button
              onClick={() => handleGenerateExternal('threats')}
              disabled={loadingMap.threats}
              className="flex items-center gap-1.5 text-xs bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 px-3 py-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
            >
              {loadingMap.threats ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
              Search News
            </button>
          </div>
          <ArrayFieldEditor
            items={data.threats}
            onChange={(items) => onChange({ ...data, threats: items })}
            placeholder="e.g. Supply chain disruptions"
            focusRingColor="focus:ring-red-500"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500">AI searches for: Economic downturns, geopolitical risks, resource scarcity.</p>
        </div>
      </div>
    </div>
  );

  const renderMatrix = () => {
    const QuadrantList = ({ items, emptyText }: { items: string[]; emptyText: string }) => (
      <ul className="space-y-2">
        {items.length > 0
          ? items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="flex-shrink-0 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))
          : <li className="text-sm italic opacity-60">{emptyText}</li>
        }
      </ul>
    );

    return (
      <div className="animate-in fade-in duration-500">
        <div className="mb-6 flex justify-between items-end">
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">SWOT Matrix</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Strategic overview of your business position.</p>
          </div>
          <button onClick={() => setStep(0)} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
            Edit Analysis
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:h-[600px]">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6 overflow-y-auto min-h-[200px]">
            <h4 className="font-bold text-emerald-800 dark:text-emerald-400 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> STRENGTHS
            </h4>
            <QuadrantList items={data.strengths} emptyText="No strengths listed." />
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 overflow-y-auto min-h-[200px]">
            <h4 className="font-bold text-amber-800 dark:text-amber-400 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> WEAKNESSES
            </h4>
            <QuadrantList items={data.weaknesses} emptyText="No weaknesses listed." />
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 overflow-y-auto min-h-[200px]">
            <h4 className="font-bold text-blue-800 dark:text-blue-400 mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5" /> OPPORTUNITIES
            </h4>
            <QuadrantList items={data.opportunities} emptyText="No opportunities listed." />
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 overflow-y-auto min-h-[200px]">
            <h4 className="font-bold text-red-800 dark:text-red-400 mb-4 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" /> THREATS
            </h4>
            <QuadrantList items={data.threats} emptyText="No threats listed." />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Stepper */}
      <div className="mb-8 flex items-center justify-center">
        <div className={`flex items-center ${step >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
          <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm ${step === 0 ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-current'}`}>1</span>
          <span className="ml-2 font-medium hidden sm:block">Internal</span>
        </div>
        <div className={`w-8 sm:w-16 h-0.5 mx-2 sm:mx-4 ${step >= 1 ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-300 dark:bg-slate-700'}`} />
        <div className={`flex items-center ${step >= 1 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
          <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm ${step === 1 ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-current'}`}>2</span>
          <span className="ml-2 font-medium hidden sm:block">External</span>
        </div>
        <div className={`w-8 sm:w-16 h-0.5 mx-2 sm:mx-4 ${step >= 2 ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-300 dark:bg-slate-700'}`} />
        <div className={`flex items-center ${step >= 2 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
          <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm ${step === 2 ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-current'}`}>3</span>
          <span className="ml-2 font-medium hidden sm:block">Review</span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-4 md:p-8 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 transition-colors min-h-[500px]">
        {step === 0 && renderStepInternal()}
        {step === 1 && renderStepExternal()}
        {step === 2 && renderMatrix()}
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={() => setStep(prev => Math.max(0, prev - 1))}
          disabled={step === 0}
          className={`flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 rounded-lg font-medium transition-colors ${
            step === 0 ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {step < 2 ? (
          <button
            onClick={() => setStep(prev => prev + 1)}
            className="flex items-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-2 md:px-8 md:py-3 rounded-lg font-bold hover:bg-slate-800 dark:hover:bg-slate-100 shadow-lg transition-all"
          >
            Next Step <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <SaveIndicator status={saveStatus} isDirty={isDirty} onSave={onSave} errorMessage={saveError} />
        )}
      </div>
    </div>
  );
};

export default SwotAnalysisWizard;
