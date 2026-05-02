
import React, { useState } from 'react';
import { SustainabilityBusinessModel, CompanyProfile } from '../types';
import { Info, Wand2, ArrowRight, ArrowLeft, Grid, Check, Loader2, PlayCircle } from 'lucide-react';
import { generateCanvasSuggestion } from '../services/geminiService';
import SaveIndicator from './SaveIndicator';
import type { SaveStatus } from '../hooks/useOrgData';

interface Props {
  data: SustainabilityBusinessModel;
  onChange: (data: SustainabilityBusinessModel) => void;
  profile: CompanyProfile;
  saveStatus: SaveStatus;
  isDirty: boolean;
  onSave: () => void;
  saveError?: string | null;
}

type CanvasField = keyof SustainabilityBusinessModel;

interface Step {
  id: string;
  title: string;
  description: string;
  fields: { key: CanvasField; label: string; hint: string; color?: string }[];
}

const WIZARD_STEPS: Step[] = [
  {
    id: 'value',
    title: 'Value Proposition',
    description: 'What core value do you deliver to your customers and society?',
    fields: [
      { key: 'valueProposition', label: 'Value Propositions', hint: 'Product/Service value + Social/Eco value', color: 'text-blue-700 dark:text-blue-400' }
    ]
  },
  {
    id: 'customers',
    title: 'Customers & Delivery',
    description: 'Who are your customers and how do you reach them?',
    fields: [
      { key: 'customerSegments', label: 'Customer Segments', hint: 'Who are we creating value for?' },
      { key: 'customerRelationships', label: 'Customer Relationships', hint: 'What type of relationship does each segment expect?' },
      { key: 'channels', label: 'Channels', hint: 'How do we reach our customer segments?' }
    ]
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure',
    description: 'What do you need to create this value?',
    fields: [
      { key: 'keyActivities', label: 'Key Activities', hint: 'What key activities do our value propositions require?' },
      { key: 'keyResources', label: 'Key Resources', hint: 'What key resources do our value propositions require?' },
      { key: 'keyPartners', label: 'Key Partners', hint: 'Who are our key partners and suppliers?' }
    ]
  },
  {
    id: 'financial',
    title: 'Financial Viability',
    description: 'What is the cost structure and revenue model?',
    fields: [
      { key: 'costStructure', label: 'Cost Structure', hint: 'What are the most important costs inherent in our business model?' },
      { key: 'revenueStreams', label: 'Revenue Streams', hint: 'For what value are our customers really willing to pay?' }
    ]
  },
  {
    id: 'sustainability',
    title: 'Sustainability Impact',
    description: 'What are the environmental and social externalities?',
    fields: [
      { key: 'ecoSocialCosts', label: 'Eco-Social Costs', hint: 'Negative impacts (pollution, waste, stress)', color: 'text-red-600 dark:text-red-400' },
      { key: 'ecoSocialBenefits', label: 'Eco-Social Benefits', hint: 'Positive impacts (regeneration, community, equality)', color: 'text-esg-600 dark:text-esg-400' }
    ]
  }
];

const BusinessModelCanvas: React.FC<Props> = ({ data, onChange, profile, saveStatus, isDirty, onSave, saveError }) => {
  const [mode, setMode] = useState<'grid' | 'wizard'>('wizard');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loadingField, setLoadingField] = useState<string | null>(null);

  const currentStep = WIZARD_STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === WIZARD_STEPS.length - 1;

  const handleChange = (field: CanvasField, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const handleAiSuggest = async (field: CanvasField, label: string) => {
    setLoadingField(field);
    const suggestion = await generateCanvasSuggestion(profile, label);
    if (suggestion) {
      // Append if not empty, or replace if empty
      const currentVal = data[field];
      const newVal = currentVal ? `${currentVal}\n\n--- AI Suggestion ---\n${suggestion}` : suggestion;
      handleChange(field, newVal);
    }
    setLoadingField(null);
  };

  // --- Render: Wizard View ---
  const renderWizard = () => (
    <div className="max-w-5xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
          <span>Step {currentStepIndex + 1} of {WIZARD_STEPS.length}</span>
          <span>{Math.round(((currentStepIndex + 1) / WIZARD_STEPS.length) * 100)}% Completed</span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
          <div 
            className="bg-esg-600 h-2 rounded-full transition-all duration-500 ease-in-out"
            style={{ width: `${((currentStepIndex + 1) / WIZARD_STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white dark:bg-slate-800 p-4 md:p-8 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 min-h-[400px] transition-colors">
        <div className="mb-6 border-b border-slate-100 dark:border-slate-700 pb-4">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{currentStep.title}</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{currentStep.description}</p>
        </div>

        <div className="space-y-6">
          {currentStep.fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <div className="flex justify-between items-center">
                <label className={`block text-sm font-bold uppercase tracking-wide ${field.color || 'text-slate-700 dark:text-slate-300'}`}>
                  {field.label}
                </label>
                <button
                  onClick={() => handleAiSuggest(field.key, field.label)}
                  disabled={!!loadingField}
                  className="flex items-center gap-1.5 text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-3 py-1.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50"
                >
                  {loadingField === field.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                  AI Suggest
                </button>
              </div>
              
              <textarea
                value={data[field.key]}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="w-full p-4 border border-slate-300 dark:border-slate-600 rounded-lg h-32 focus:ring-2 focus:ring-esg-500 focus:border-esg-500 transition-all text-sm leading-relaxed bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                placeholder={`Enter details for ${field.label}...`}
              />
              <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                <Info className="w-3 h-3" /> {field.hint}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8">
        <button
          onClick={() => setCurrentStepIndex(prev => Math.max(0, prev - 1))}
          disabled={isFirstStep}
          className={`flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 rounded-lg font-medium transition-colors ${
            isFirstStep ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {isLastStep ? (
           <button
           onClick={() => setMode('grid')}
           className="flex items-center gap-2 bg-esg-600 text-white px-6 py-2 md:px-8 md:py-3 rounded-lg font-bold hover:bg-esg-700 shadow-lg shadow-esg-600/20 transition-all text-sm md:text-base"
         >
           Finish & View Canvas <Check className="w-5 h-5" />
         </button>
        ) : (
          <button
            onClick={() => setCurrentStepIndex(prev => Math.min(WIZARD_STEPS.length - 1, prev + 1))}
            className="flex items-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-2 md:px-8 md:py-3 rounded-lg font-bold hover:bg-slate-800 dark:hover:bg-slate-100 shadow-lg transition-all text-sm md:text-base"
          >
            Next Step <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  // --- Render: Grid View (Original) ---
  const renderGrid = () => (
    <div className="animate-in fade-in duration-500">
      <div className="bg-white dark:bg-slate-800 p-1 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
        {/* Top Section: The Business Logic */}
        {/* Responsive: Flex column on mobile, grid on desktop */}
        <div className="flex flex-col md:grid md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-700">
            
            {/* Column 1: Upstream */}
            <div className="flex flex-col divide-y divide-slate-200 dark:divide-slate-700">
                <CanvasCard 
                    title="Key Partners" 
                    hint="Suppliers, NGOs, Gov bodies"
                    value={data.keyPartners} 
                    onChange={(v) => handleChange('keyPartners', v)} 
                    className="h-auto md:h-full min-h-[160px]"
                />
            </div>

            {/* Column 2: Activities & Resources */}
            <div className="flex flex-col divide-y divide-slate-200 dark:divide-slate-700">
                <CanvasCard 
                    title="Key Activities" 
                    hint="Production, Problem solving, Network"
                    value={data.keyActivities} 
                    onChange={(v) => handleChange('keyActivities', v)} 
                    className="h-auto md:h-1/2 min-h-[160px]"
                />
                <CanvasCard 
                    title="Key Resources" 
                    hint="Physical, Intellectual, Human, Financial"
                    value={data.keyResources} 
                    onChange={(v) => handleChange('keyResources', v)} 
                    className="h-auto md:h-1/2 min-h-[160px]"
                />
            </div>

            {/* Column 3: Value Proposition (Center) */}
            <div className="flex flex-col">
                <CanvasCard 
                    title="Value Propositions" 
                    hint="Product/Service value + Social/Eco value"
                    value={data.valueProposition} 
                    onChange={(v) => handleChange('valueProposition', v)} 
                    className="h-auto md:h-full min-h-[200px] bg-esg-50/50 dark:bg-esg-900/10"
                />
            </div>

            {/* Column 4: Relationships & Channels */}
            <div className="flex flex-col divide-y divide-slate-200 dark:divide-slate-700">
                <CanvasCard 
                    title="Customer Relationships" 
                    hint="Personal assistance, Automated, Communities"
                    value={data.customerRelationships} 
                    onChange={(v) => handleChange('customerRelationships', v)} 
                    className="h-auto md:h-1/2 min-h-[160px]"
                />
                <CanvasCard 
                    title="Channels" 
                    hint="Awareness, Evaluation, Purchase, Delivery, After-sales"
                    value={data.channels} 
                    onChange={(v) => handleChange('channels', v)} 
                    className="h-auto md:h-1/2 min-h-[160px]"
                />
            </div>

             {/* Column 5: Segments */}
             <div className="flex flex-col">
                <CanvasCard 
                    title="Customer Segments" 
                    hint="Mass market, Niche, Segmented, Diversified"
                    value={data.customerSegments} 
                    onChange={(v) => handleChange('customerSegments', v)} 
                    className="h-auto md:h-full min-h-[160px]"
                />
            </div>
        </div>

        {/* Bottom Section: Financials & Impact */}
        <div className="border-t border-slate-200 dark:border-slate-700">
            <div className="flex flex-col md:grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-700">
                <CanvasCard 
                    title="Cost Structure" 
                    hint="Fixed costs, Variable costs, Economies of scale"
                    value={data.costStructure} 
                    onChange={(v) => handleChange('costStructure', v)} 
                    className="h-auto md:h-32 min-h-[140px]"
                    height=""
                />
                <CanvasCard 
                    title="Revenue Streams" 
                    hint="Asset sale, Usage fee, Subscription, Licensing"
                    value={data.revenueStreams} 
                    onChange={(v) => handleChange('revenueStreams', v)} 
                    className="h-auto md:h-32 min-h-[140px]"
                    height=""
                />
            </div>
        </div>
        
        {/* Sustainability Layer */}
        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
             <div className="flex flex-col md:grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-700">
                <CanvasCard 
                    title="Eco-Social Costs" 
                    hint="Pollution, Waste, Social stress (Negative externalities)"
                    value={data.ecoSocialCosts} 
                    onChange={(v) => handleChange('ecoSocialCosts', v)} 
                    className="h-auto md:h-32 min-h-[140px]"
                    height=""
                    headerColor="text-red-600 dark:text-red-400"
                />
                <CanvasCard 
                    title="Eco-Social Benefits" 
                    hint="Carbon reduction, Community dev, Wellbeing (Positive externalities)"
                    value={data.ecoSocialBenefits} 
                    onChange={(v) => handleChange('ecoSocialBenefits', v)} 
                    className="h-auto md:h-32 min-h-[140px]"
                    height=""
                    headerColor="text-esg-600 dark:text-esg-400"
                />
            </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Sustainability Business Model Canvas</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Define your business logic including economic, environmental, and social layers.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto justify-between md:justify-end">
             <div className="bg-slate-100 dark:bg-slate-700 p-1 rounded-lg flex text-sm font-medium">
                <button 
                    onClick={() => setMode('wizard')} 
                    className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-all ${mode === 'wizard' ? 'bg-white dark:bg-slate-600 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                >
                    <PlayCircle className="w-4 h-4" /> <span className="hidden sm:inline">Wizard</span>
                </button>
                <button 
                    onClick={() => setMode('grid')} 
                    className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-all ${mode === 'grid' ? 'bg-white dark:bg-slate-600 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                >
                    <Grid className="w-4 h-4" /> <span className="hidden sm:inline">Canvas</span>
                </button>
             </div>
             <SaveIndicator status={saveStatus} isDirty={isDirty} onSave={onSave} errorMessage={saveError} />
        </div>
      </div>

      {mode === 'wizard' ? renderWizard() : renderGrid()}
    </div>
  );
};

interface CardProps {
  title: string;
  value: string;
  onChange: (val: string) => void;
  hint?: string;
  className?: string;
  height?: string;
  headerColor?: string;
}

const CanvasCard: React.FC<CardProps> = ({ title, value, onChange, hint, className = '', height = 'h-full', headerColor = 'text-slate-700 dark:text-slate-300' }) => (
  <div className={`p-4 ${className} ${height} flex flex-col group`}>
    <div className="flex justify-between items-center mb-2">
        <h3 className={`font-bold text-sm uppercase tracking-wide ${headerColor}`}>{title}</h3>
        {hint && (
            <div className="relative group/tooltip">
                <Info className="w-3 h-3 text-slate-300 dark:text-slate-600 cursor-help" />
                <div className="absolute right-0 top-4 w-48 bg-slate-800 text-white text-xs p-2 rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 hidden md:block">
                    {hint}
                </div>
            </div>
        )}
    </div>
    <textarea 
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full flex-1 resize-none text-sm text-slate-600 dark:text-slate-300 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-600 focus:border-esg-400 focus:bg-white dark:focus:bg-slate-950 dark:focus:text-white focus:ring-0 rounded p-1 transition-all placeholder-slate-300 dark:placeholder-slate-600 min-h-[60px]"
      placeholder={`Define ${title}...`}
    />
  </div>
);

export default BusinessModelCanvas;
