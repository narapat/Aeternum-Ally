
import React, { useState } from 'react';
import { SwotAnalysis, SustainabilityBusinessModel } from '../types';
import { generateSwotInternal, generateSwotExternal } from '../services/geminiService';
import { ArrowRight, ArrowLeft, Loader2, Globe, ShieldAlert, TrendingUp, Zap, AlertTriangle } from 'lucide-react';
import SaveIndicator from './SaveIndicator';
import type { SaveStatus } from '../hooks/useOrgData';

interface Props {
  data: SwotAnalysis;
  onChange: (data: SwotAnalysis) => void;
  companyName: string;
  companyDescription: string;
  bmcData: SustainabilityBusinessModel;
  saveStatus: SaveStatus;
  isDirty: boolean;
  onSave: () => void;
  saveError?: string | null;
}

const SwotAnalysisWizard: React.FC<Props> = ({ data, onChange, companyName, companyDescription, bmcData, saveStatus, isDirty, onSave, saveError }) => {
  const [step, setStep] = useState<number>(0);
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  const handleGenerateInternal = async () => {
    setLoadingMap({ ...loadingMap, internal: true });
    const result = await generateSwotInternal(companyName, bmcData);
    onChange({
      ...data,
      strengths: result.strengths || data.strengths,
      weaknesses: result.weaknesses || data.weaknesses
    });
    setLoadingMap({ ...loadingMap, internal: false });
  };

  const handleGenerateExternal = async (field: 'opportunities' | 'threats') => {
    setLoadingMap({ ...loadingMap, [field]: true });
    const result = await generateSwotExternal(companyName, companyDescription, field === 'opportunities' ? 'OPPORTUNITIES' : 'THREATS');
    onChange({
      ...data,
      [field]: result
    });
    setLoadingMap({ ...loadingMap, [field]: false });
  };

  const renderStepInternal = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 dark:border-slate-700 pb-4 gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white">Step 1: Internal Factors</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Analyze your Strengths and Weaknesses based on your Business Model Canvas.</p>
        </div>
        <button 
          onClick={handleGenerateInternal}
          disabled={loadingMap.internal}
          className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-4 py-2 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-sm font-medium w-full sm:w-auto justify-center"
        >
          {loadingMap.internal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Auto-Analyze Internal
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-400">
             <TrendingUp className="w-5 h-5" /> Strengths
          </label>
          <textarea 
            value={data.strengths}
            onChange={(e) => onChange({ ...data, strengths: e.target.value })}
            className="w-full h-48 md:h-64 p-4 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 text-sm leading-relaxed"
            placeholder="e.g., - Strong proprietary technology&#10;- Loyal customer base..."
          />
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
             <AlertTriangle className="w-5 h-5" /> Weaknesses
          </label>
          <textarea 
            value={data.weaknesses}
            onChange={(e) => onChange({ ...data, weaknesses: e.target.value })}
            className="w-full h-48 md:h-64 p-4 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 text-sm leading-relaxed"
            placeholder="e.g., - High dependency on single supplier&#10;- Limited marketing budget..."
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
          <textarea 
            value={data.opportunities}
            onChange={(e) => onChange({ ...data, opportunities: e.target.value })}
            className="w-full h-48 md:h-64 p-4 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm leading-relaxed"
            placeholder="e.g., - Growing demand for sustainable products&#10;- New government grants..."
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
          <textarea 
            value={data.threats}
            onChange={(e) => onChange({ ...data, threats: e.target.value })}
            className="w-full h-48 md:h-64 p-4 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 text-sm leading-relaxed"
            placeholder="e.g., - Supply chain disruptions&#10;- New tariffs..."
          />
          <p className="text-xs text-slate-400 dark:text-slate-500">AI searches for: Economic downturns, geopolitical risks, resource scarcity.</p>
        </div>
      </div>
    </div>
  );

  const renderMatrix = () => (
    <div className="animate-in fade-in duration-500">
       <div className="mb-6 flex justify-between items-end">
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">SWOT Matrix</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Strategic overview of your business position.</p>
          </div>
          <button 
            onClick={() => setStep(0)} 
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Edit Analysis
          </button>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:h-[600px]">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6 overflow-y-auto min-h-[200px]">
             <h4 className="font-bold text-emerald-800 dark:text-emerald-400 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" /> STRENGTHS
             </h4>
             <div className="whitespace-pre-wrap text-sm text-emerald-900 dark:text-emerald-100">{data.strengths || "No strengths listed."}</div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 overflow-y-auto min-h-[200px]">
             <h4 className="font-bold text-amber-800 dark:text-amber-400 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> WEAKNESSES
             </h4>
             <div className="whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-100">{data.weaknesses || "No weaknesses listed."}</div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 overflow-y-auto min-h-[200px]">
             <h4 className="font-bold text-blue-800 dark:text-blue-400 mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5" /> OPPORTUNITIES
             </h4>
             <div className="whitespace-pre-wrap text-sm text-blue-900 dark:text-blue-100">{data.opportunities || "No opportunities listed."}</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 overflow-y-auto min-h-[200px]">
             <h4 className="font-bold text-red-800 dark:text-red-400 mb-4 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" /> THREATS
             </h4>
             <div className="whitespace-pre-wrap text-sm text-red-900 dark:text-red-100">{data.threats || "No threats listed."}</div>
          </div>
       </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
        {/* Responsive Stepper */}
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
