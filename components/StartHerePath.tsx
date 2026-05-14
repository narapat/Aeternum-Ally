import React from 'react';
import { ArrowLeft, ExternalLink, TrendingUp, Leaf, Globe } from 'lucide-react';
import type { StartHerePathId } from './StartHere';

type AppView = 'profile' | 'canvas' | 'swot' | 'dm_dashboard' | 'kpi' | 'tasks' | 'carbon_wizard' | 'carbon_dashboard' | 'insight_hub';

interface Step {
  number: number;
  title: string;
  description: string;
  targetView: AppView;
  buttonLabel: string;
  optional?: boolean;
}

interface PathConfig {
  id: StartHerePathId;
  icon: React.ReactNode;
  color: 'esg' | 'green' | 'blue';
  title: string;
  description: string;
  steps: Step[];
}

const PATHS: PathConfig[] = [
  {
    id: 'start_here_esg',
    icon: <TrendingUp className="w-5 h-5" />,
    color: 'esg',
    title: 'ESG Readiness',
    description: 'Follow these steps to build your sustainability foundation. Each module builds on the previous one.',
    steps: [
      {
        number: 1,
        title: 'Company Profile',
        description: 'Define the business context and company information used across the platform.',
        targetView: 'profile',
        buttonLabel: 'Open Company Profile',
      },
      {
        number: 2,
        title: 'Sustainability Business Model Canvas',
        description: 'Connect sustainability thinking to the organisation\'s business model.',
        targetView: 'canvas',
        buttonLabel: 'Open Business Model',
      },
      {
        number: 3,
        title: 'SWOT Analysis',
        description: 'Identify sustainability-related risks, opportunities, strengths, and weaknesses.',
        targetView: 'swot',
        buttonLabel: 'Open SWOT',
      },
      {
        number: 4,
        title: 'Double Materiality Assessment (DMA)',
        description: 'Assess sustainability topics from impact and financial materiality perspectives.',
        targetView: 'dm_dashboard',
        buttonLabel: 'Open DMA',
      },
      {
        number: 5,
        title: 'KPI',
        description: 'Define measurable sustainability indicators connected to material topics.',
        targetView: 'kpi',
        buttonLabel: 'Open KPI',
      },
      {
        number: 6,
        title: 'Task Generator',
        description: 'Generate suggested sustainability tasks based on KPI and DMA information.',
        targetView: 'tasks',
        buttonLabel: 'Open Tasks',
      },
    ],
  },
  {
    id: 'start_here_carbon',
    icon: <Leaf className="w-5 h-5" />,
    color: 'green',
    title: 'Carbon Starter',
    description: 'Set up Scope 1 and Scope 2 carbon tracking step by step. Start small and build from there.',
    steps: [
      {
        number: 1,
        title: 'Company Profile',
        description: 'Set up the business context used for carbon tracking.',
        targetView: 'profile',
        buttonLabel: 'Open Company Profile',
      },
      {
        number: 2,
        title: 'Carbon Setup',
        description: 'Configure emission tracking categories and carbon settings.',
        targetView: 'carbon_wizard',
        buttonLabel: 'Open Carbon Setup',
      },
      {
        number: 3,
        title: 'Carbon Entries',
        description: 'Record monthly fuel, electricity, and activity data.',
        targetView: 'carbon_wizard',
        buttonLabel: 'Open Carbon Entries',
      },
      {
        number: 4,
        title: 'Carbon Dashboard',
        description: 'Review emissions trends and identify major emission sources.',
        targetView: 'carbon_dashboard',
        buttonLabel: 'Open Carbon Dashboard',
      },
      {
        number: 5,
        title: 'Create Carbon-related KPI',
        description: 'Connect carbon activities to measurable sustainability KPIs.',
        targetView: 'kpi',
        buttonLabel: 'Open KPI',
        optional: true,
      },
    ],
  },
  {
    id: 'start_here_stakeholder',
    icon: <Globe className="w-5 h-5" />,
    color: 'blue',
    title: 'Stakeholder Request Readiness',
    description: 'Organise your sustainability information so you can respond to requests with confidence.',
    steps: [
      {
        number: 1,
        title: 'Company Profile',
        description: 'Set up organisational information used across sustainability records.',
        targetView: 'profile',
        buttonLabel: 'Open Company Profile',
      },
      {
        number: 2,
        title: 'Double Materiality Assessment (DMA)',
        description: 'Identify material sustainability topics relevant to stakeholders.',
        targetView: 'dm_dashboard',
        buttonLabel: 'Open DMA',
      },
      {
        number: 3,
        title: 'KPI',
        description: 'Organise measurable sustainability information.',
        targetView: 'kpi',
        buttonLabel: 'Open KPI',
      },
      {
        number: 4,
        title: 'Attach Evidence URLs',
        description: 'Attach document links and supporting evidence to KPI, Task, and Carbon records.',
        targetView: 'kpi',
        buttonLabel: 'Open KPI & Evidence',
      },
      {
        number: 5,
        title: 'Review Open Gaps',
        description: 'Identify areas where sustainability information is incomplete or missing.',
        targetView: 'insight_hub',
        buttonLabel: 'Open Insight Hub',
      },
    ],
  },
];

const COLOR_MAP = {
  esg: {
    iconBg: 'bg-esg-50 dark:bg-esg-900/30',
    iconText: 'text-esg-600 dark:text-esg-400',
    stepCircle: 'bg-esg-600 text-white',
    stepLine: 'bg-esg-200 dark:bg-esg-800',
    button: 'bg-esg-600 hover:bg-esg-700 text-white',
    optionalBadge: 'bg-esg-50 text-esg-600 dark:bg-esg-900/30 dark:text-esg-400 border border-esg-200 dark:border-esg-700',
  },
  green: {
    iconBg: 'bg-green-50 dark:bg-green-900/30',
    iconText: 'text-green-600 dark:text-green-400',
    stepCircle: 'bg-green-600 text-white',
    stepLine: 'bg-green-200 dark:bg-green-800',
    button: 'bg-green-600 hover:bg-green-700 text-white',
    optionalBadge: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-700',
  },
  blue: {
    iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    iconText: 'text-blue-600 dark:text-blue-400',
    stepCircle: 'bg-blue-600 text-white',
    stepLine: 'bg-blue-200 dark:bg-blue-800',
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
    optionalBadge: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-700',
  },
};

interface StartHerePathProps {
  pathId: StartHerePathId;
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

const StartHerePath: React.FC<StartHerePathProps> = ({ pathId, onBack, onNavigate }) => {
  const config = PATHS.find(p => p.id === pathId);
  if (!config) return null;

  const c = COLOR_MAP[config.color];

  return (
    <div className="animate-in fade-in duration-500 max-w-2xl mx-auto space-y-8">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Start Here
      </button>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${c.iconBg}`}>
          <span className={c.iconText}>{config.icon}</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{config.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{config.description}</p>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-0">
        {config.steps.map((step, index) => {
          const isLast = index === config.steps.length - 1;
          return (
            <div key={step.number} className="flex gap-4">
              {/* Timeline column */}
              <div className="flex flex-col items-center flex-shrink-0 w-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${step.optional ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400' : c.stepCircle}`}>
                  {step.number}
                </div>
                {!isLast && (
                  <div className={`w-0.5 flex-1 my-1 min-h-[2rem] ${step.optional ? 'bg-slate-200 dark:bg-slate-700' : c.stepLine}`} />
                )}
              </div>

              {/* Content */}
              <div className={`flex-1 pb-6 ${isLast ? '' : ''}`}>
                <div className={`bg-white dark:bg-slate-800 rounded-xl border p-5 shadow-sm ${step.optional ? 'border-dashed border-slate-200 dark:border-slate-700' : 'border-slate-200 dark:border-slate-700'}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-800 dark:text-white">{step.title}</h3>
                        {step.optional && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.optionalBadge}`}>
                            Optional
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{step.description}</p>
                    </div>
                    <button
                      onClick={() => onNavigate(step.targetView)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${c.button}`}
                    >
                      {step.buttonLabel}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StartHerePath;
