
import React, { useState } from 'react';
import { SustainabilityBusinessModel, CompanyProfile } from '../types';
import { Info, Wand2, ArrowRight, ArrowLeft, Grid, Check, Loader2, PlayCircle, Plus, X } from 'lucide-react';
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

// ── Shared array editor (wizard view — spacious) ──────────────────────────────

interface ArrayFieldEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}

const ArrayFieldEditor: React.FC<ArrayFieldEditorProps> = ({ items, onChange, placeholder }) => {
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
    <div className="border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 focus-within:border-esg-400 transition-colors">
      <ul className="p-3 space-y-2 min-h-[100px] max-h-64 overflow-y-auto">
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
          <li className="text-sm text-slate-300 dark:text-slate-600 italic py-1">No items yet — add one below.</li>
        )}
      </ul>
      <div className="border-t border-slate-100 dark:border-slate-700 p-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
          placeholder={placeholder || 'Add item and press Enter…'}
          className="flex-1 text-sm px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-esg-400"
        />
        <button
          onClick={addItem}
          disabled={!draft.trim()}
          className="text-sm px-3 py-1.5 bg-esg-600 text-white rounded-md hover:bg-esg-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const BusinessModelCanvas: React.FC<Props> = ({ data, onChange, profile, saveStatus, isDirty, onSave, saveError }) => {
  const [mode, setMode] = useState<'grid' | 'wizard'>('wizard');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loadingField, setLoadingField] = useState<string | null>(null);

  const currentStep = WIZARD_STEPS[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === WIZARD_STEPS.length - 1;

  const handleChange = (field: CanvasField, value: string[]) => {
    onChange({ ...data, [field]: value });
  };

  const handleAiSuggest = async (field: CanvasField, label: string) => {
    setLoadingField(field);
    const suggestion = await generateCanvasSuggestion(profile, label, data);
    if (suggestion.length > 0) {
      const existing = data[field];
      const merged = [...existing, ...suggestion.filter(s => !existing.includes(s))];
      handleChange(field, merged);
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

              <ArrayFieldEditor
                items={data[field.key]}
                onChange={(items) => handleChange(field.key, items)}
                placeholder={`Add ${field.label} item and press Enter…`}
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

  // --- Render: Grid View ---
  const renderGrid = () => (
    <div className="animate-in fade-in duration-500">
      <div className="bg-white dark:bg-slate-800 p-1 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
        {/* Top Section */}
        <div className="flex flex-col md:grid md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-700">
          <div className="flex flex-col divide-y divide-slate-200 dark:divide-slate-700">
            <CanvasCard
              title="Key Partners"
              hint="Suppliers, NGOs, Gov bodies"
              value={data.keyPartners}
              onChange={(v) => handleChange('keyPartners', v)}
              className="h-auto md:h-full min-h-[160px]"
            />
          </div>

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

          <div className="flex flex-col">
            <CanvasCard
              title="Value Propositions"
              hint="Product/Service value + Social/Eco value"
              value={data.valueProposition}
              onChange={(v) => handleChange('valueProposition', v)}
              className="h-auto md:h-full min-h-[200px] bg-esg-50/50 dark:bg-esg-900/10"
            />
          </div>

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

        {/* Bottom Section: Financials */}
        <div className="border-t border-slate-200 dark:border-slate-700">
          <div className="flex flex-col md:grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-700">
            <CanvasCard
              title="Cost Structure"
              hint="Fixed costs, Variable costs, Economies of scale"
              value={data.costStructure}
              onChange={(v) => handleChange('costStructure', v)}
              className="h-auto md:h-56 min-h-[220px]"
              height=""
            />
            <CanvasCard
              title="Revenue Streams"
              hint="Asset sale, Usage fee, Subscription, Licensing"
              value={data.revenueStreams}
              onChange={(v) => handleChange('revenueStreams', v)}
              className="h-auto md:h-56 min-h-[220px]"
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
              className="h-auto md:h-56 min-h-[220px]"
              height=""
              headerColor="text-red-600 dark:text-red-400"
            />
            <CanvasCard
              title="Eco-Social Benefits"
              hint="Carbon reduction, Community dev, Wellbeing (Positive externalities)"
              value={data.ecoSocialBenefits}
              onChange={(v) => handleChange('ecoSocialBenefits', v)}
              className="h-auto md:h-56 min-h-[220px]"
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
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Sustainable Business Model Canvas</h2>
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

// ── Compact card for grid view ────────────────────────────────────────────────

interface CardProps {
  title: string;
  value: string[];
  onChange: (val: string[]) => void;
  hint?: string;
  className?: string;
  height?: string;
  headerColor?: string;
}

const CanvasCard: React.FC<CardProps> = ({
  title, value, onChange, hint,
  className = '', height = 'h-full',
  headerColor = 'text-slate-700 dark:text-slate-300'
}) => {
  const [draft, setDraft] = useState('');

  const addItem = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...value, trimmed]);
    setDraft('');
  };

  const removeItem = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className={`p-3 ${className} ${height} flex flex-col`}>
      <div className="flex justify-between items-center mb-2">
        <h3 className={`font-bold text-xs uppercase tracking-wide ${headerColor}`}>{title}</h3>
        {hint && (
          <div className="relative group/tooltip">
            <Info className="w-3 h-3 text-slate-300 dark:text-slate-600 cursor-help" />
            <div className="absolute right-0 top-4 w-48 bg-slate-800 text-white text-xs p-2 rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 hidden md:block">
              {hint}
            </div>
          </div>
        )}
      </div>

      <ul className="flex-1 space-y-1 overflow-y-auto min-h-[40px] mb-2">
        {value.map((item, i) => (
          <li key={i} className="flex items-start gap-1 group/item">
            <span className="text-slate-300 dark:text-slate-600 text-xs mt-0.5 flex-shrink-0">•</span>
            <span className="flex-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{item}</span>
            <button
              onClick={() => removeItem(i)}
              className="opacity-0 group-hover/item:opacity-100 text-slate-300 hover:text-red-400 dark:text-slate-600 dark:hover:text-red-400 flex-shrink-0 transition-opacity ml-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </li>
        ))}
        {value.length === 0 && (
          <li className="text-xs text-slate-300 dark:text-slate-600 italic">None added</li>
        )}
      </ul>

      <div className="flex gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
          placeholder="Add…"
          className="flex-1 text-xs p-1.5 border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:border-esg-400"
        />
        <button
          onClick={addItem}
          className="text-xs px-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-esg-50 hover:text-esg-600 dark:hover:bg-esg-900/20 dark:hover:text-esg-400 transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
};

export default BusinessModelCanvas;
