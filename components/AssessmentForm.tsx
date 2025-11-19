
import React, { useState, useEffect } from 'react';
import { AssessmentData, ESRSTopic, ImpactScore, FinancialScore } from '../types';
import { SCALE_OPTIONS, LIKELIHOOD_OPTIONS, calculateImpactMateriality, calculateFinancialMateriality, TOPICS } from '../constants';
import { generateAssessmentSuggestions } from '../services/geminiService';
import { AlertCircle, TrendingUp, Cpu, Loader2, Save, X } from 'lucide-react';

interface Props {
  companyDescription: string;
  onSave: (data: AssessmentData) => void;
  onCancel: () => void;
  initialData?: AssessmentData | null;
}

const AssessmentForm: React.FC<Props> = ({ companyDescription, onSave, onCancel, initialData }) => {
  const [topic, setTopic] = useState<ESRSTopic>(ESRSTopic.E1);
  const [impactDesc, setImpactDesc] = useState('');
  const [financialDesc, setFinancialDesc] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);

  const [impactScore, setImpactScore] = useState<ImpactScore>({
    scale: 1,
    scope: 1,
    irremediability: 1,
    likelihood: 1
  });

  const [financialScore, setFinancialScore] = useState<FinancialScore>({
    magnitude: 1,
    likelihood: 1
  });

  // Load initial data if editing
  useEffect(() => {
    if (initialData) {
      setTopic(initialData.topic);
      setImpactDesc(initialData.impactDescription);
      setFinancialDesc(initialData.financialDescription);
      setImpactScore(initialData.impactScore);
      setFinancialScore(initialData.financialScore);
    } else {
      // Reset if switching to new
      setTopic(ESRSTopic.E1);
      setImpactDesc('');
      setFinancialDesc('');
      setImpactScore({ scale: 1, scope: 1, irremediability: 1, likelihood: 1 });
      setFinancialScore({ magnitude: 1, likelihood: 1 });
    }
  }, [initialData]);

  const handleAutoFill = async () => {
    setLoadingAI(true);
    const suggestions = await generateAssessmentSuggestions(companyDescription, topic);
    setImpactDesc(suggestions.impactSuggestion);
    setFinancialDesc(suggestions.financialSuggestion);
    setLoadingAI(false);
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
      isMaterial: imValue > 40 || fmValue > 40 // Threshold logic
    };
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 space-y-8 transition-colors h-full flex flex-col">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{initialData ? 'Edit Assessment' : 'New Assessment'}</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Evaluate impact and financial materiality for a specific ESRS topic.</p>
        </div>
        <div className="flex gap-2">
             <button
              type="button"
              onClick={handleAutoFill}
              disabled={loadingAI}
              className="flex items-center gap-2 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-3 py-2 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-sm font-medium"
            >
              {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
              AI Auto-Fill
            </button>
            <button type="button" onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-6 h-6" />
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">ESRS Topic</label>
          <select 
            value={topic} 
            onChange={(e) => setTopic(e.target.value as ESRSTopic)}
            className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-esg-500 focus:border-esg-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
          >
            {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-y-auto">
        {/* Impact Materiality Section */}
        <div className="space-y-6 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-2">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-bold text-lg">Impact Materiality</h3>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Impact Description</label>
            <textarea 
              value={impactDesc}
              onChange={e => setImpactDesc(e.target.value)}
              className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg h-24 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600"
              placeholder="Describe the impact on people/environment..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ScoreSelect label="Scale" value={impactScore.scale} onChange={v => setImpactScore({...impactScore, scale: v})} options={SCALE_OPTIONS} />
            <ScoreSelect label="Scope" value={impactScore.scope} onChange={v => setImpactScore({...impactScore, scope: v})} options={SCALE_OPTIONS} />
            <ScoreSelect label="Irremediability" value={impactScore.irremediability} onChange={v => setImpactScore({...impactScore, irremediability: v})} options={SCALE_OPTIONS} />
            <ScoreSelect label="Likelihood" value={impactScore.likelihood} onChange={v => setImpactScore({...impactScore, likelihood: v})} options={LIKELIHOOD_OPTIONS} />
          </div>
          
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
             <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Impact Score:</span>
                <span className="font-bold text-blue-700 dark:text-blue-400">{Math.round(calculateImpactMateriality(impactScore))} / 100</span>
             </div>
          </div>
        </div>

        {/* Financial Materiality Section */}
        <div className="space-y-6 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 mb-2">
            <TrendingUp className="w-5 h-5" />
            <h3 className="font-bold text-lg">Financial Materiality</h3>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Risks & Opportunities</label>
            <textarea 
              value={financialDesc}
              onChange={e => setFinancialDesc(e.target.value)}
              className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg h-24 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600"
              placeholder="Describe financial risks or opportunities..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ScoreSelect label="Magnitude" value={financialScore.magnitude} onChange={v => setFinancialScore({...financialScore, magnitude: v})} options={SCALE_OPTIONS} />
            <ScoreSelect label="Likelihood" value={financialScore.likelihood} onChange={v => setFinancialScore({...financialScore, likelihood: v})} options={LIKELIHOOD_OPTIONS} />
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

const ScoreSelect = ({ label, value, onChange, options }: { label: string, value: number, onChange: (n: number) => void, options: {value: number, label: string}[] }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">{label}</label>
    <select 
      value={value} 
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-1 focus:ring-esg-500"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.value} - {opt.label}</option>
      ))}
    </select>
  </div>
);

export default AssessmentForm;
