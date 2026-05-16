import React, { useState } from 'react';
import { 
  Compass, 
  ArrowRight, 
  CheckCircle2, 
  Leaf, 
  Building2, 
  Target, 
  Grid, 
  FileText, 
  Zap, 
  TrendingUp, 
  ListChecks, 
  BarChart3,
  Users,
  Link as LinkIcon,
  AlertCircle,
  Clock,
  Sparkles
} from 'lucide-react';

interface PathStep {
  id: string;
  title: string;
  description: string;
  targetView: string;
  isOptional?: boolean;
}

interface Path {
  id: string;
  title: string;
  shortDescription: string;
  bestFor: string[];
  estimatedTime: string;
  expectedOutcomes: string[];
  buttonText: string;
  steps: PathStep[];
  icon: React.ReactNode;
  color: string;
}

interface Props {
  onNavigate: (view: any) => void;
}

const PATHS: Path[] = [
  {
    id: 'esg-readiness',
    title: 'ESG Readiness',
    shortDescription: 'For SMEs starting their sustainability journey and looking for a structured place to begin.',
    bestFor: [
      'SMEs new to sustainability',
      'Companies without a dedicated ESG team',
      'Organizations building initial sustainability structure'
    ],
    estimatedTime: '60–90 minutes',
    expectedOutcomes: [
      'Sustainability strategy baseline',
      'Risks and opportunities overview',
      'Initial materiality understanding',
      'KPI structure',
      'Suggested sustainability tasks'
    ],
    buttonText: 'Start ESG Readiness',
    icon: <Target className="w-6 h-6" />,
    color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30',
    steps: [
      { id: '1', title: 'Company Profile', description: 'Define the business context and company information used across the platform.', targetView: 'profile' },
      { id: '2', title: 'Sustainability Business Model Canvas', description: 'Connect sustainability thinking to the organization’s business model.', targetView: 'canvas' },
      { id: '3', title: 'SWOT', description: 'Identify sustainability-related risks, opportunities, strengths, and weaknesses.', targetView: 'swot' },
      { id: '4', title: 'DMA', description: 'Assess sustainability topics from impact and financial materiality perspectives.', targetView: 'dm_dashboard' },
      { id: '5', title: 'KPI', description: 'Define measurable sustainability indicators connected to material topics.', targetView: 'kpi' },
      { id: '6', title: 'Task Generator', description: 'Generate suggested sustainability tasks based on KPI and DMA information.', targetView: 'tasks' },
    ]
  },
  {
    id: 'carbon-starter',
    title: 'Carbon Starter',
    shortDescription: 'For organizations beginning Scope 1 and Scope 2 carbon tracking.',
    bestFor: [
      'SMEs asked about emissions',
      'Companies starting carbon tracking',
      'Organizations preparing for future carbon reporting'
    ],
    estimatedTime: '45–60 minutes',
    expectedOutcomes: [
      'Basic Scope 1 and Scope 2 tracking',
      'Monthly emissions records',
      'Carbon activity overview',
      'Initial emissions hotspot visibility'
    ],
    buttonText: 'Start Carbon Starter',
    icon: <Leaf className="w-6 h-6" />,
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
    steps: [
      { id: '1', title: 'Company Profile', description: 'Set up the business context used for carbon tracking.', targetView: 'profile' },
      { id: '2', title: 'Carbon Setup', description: 'Configure emission tracking categories and carbon settings.', targetView: 'carbon_wizard' },
      { id: '3', title: 'Carbon Entries', description: 'Record monthly fuel, electricity, and activity data.', targetView: 'carbon_wizard' },
      { id: '4', title: 'Carbon Dashboard', description: 'Review emissions trends and identify major emission sources.', targetView: 'carbon_dashboard' },
      { id: '5', title: 'Create Carbon-related KPI', description: 'Connect carbon activities to measurable sustainability KPIs.', targetView: 'kpi', isOptional: true },
    ]
  },
  {
    id: 'stakeholder-readiness',
    title: 'Stakeholder Request Readiness',
    shortDescription: 'For suppliers and SMEs responding to sustainability-related requests from customers, investors, or business partners.',
    bestFor: [
      'Suppliers',
      'Exporters',
      'SMEs receiving ESG information requests',
      'Companies preparing sustainability evidence'
    ],
    estimatedTime: '45–90 minutes',
    expectedOutcomes: [
      'Structured sustainability information',
      'Relevant KPI overview',
      'Evidence links attached to records',
      'Better visibility of missing information'
    ],
    buttonText: 'Start Stakeholder Readiness',
    icon: <Users className="w-6 h-6" />,
    color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30',
    steps: [
      { id: '1', title: 'Company Profile', description: 'Set up organizational information used across sustainability records.', targetView: 'profile' },
      { id: '2', title: 'DMA', description: 'Identify material sustainability topics relevant to stakeholders.', targetView: 'dm_dashboard' },
      { id: '3', title: 'KPI', description: 'Organize measurable sustainability information.', targetView: 'kpi' },
      { id: '4', title: 'Attach Evidence URLs', description: 'Attach document links and supporting evidence to KPI, Task, and Carbon records.', targetView: 'tasks' },
      { id: '5', title: 'Review Open Gaps', description: 'Identify areas where sustainability information is incomplete or missing.', targetView: 'overview' },
    ]
  }
];

const StartHere: React.FC<Props> = ({ onNavigate }) => {
  const [selectedPath, setSelectedPath] = useState<Path | null>(null);

  if (selectedPath) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button 
          onClick={() => setSelectedPath(null)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <Compass className="w-4 h-4" />
          Back to paths
        </button>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className={`p-8 border-b border-slate-100 dark:border-slate-700 flex items-center gap-6`}>
            <div className={`p-4 rounded-xl ${selectedPath.color}`}>
              {selectedPath.icon}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{selectedPath.title}</h2>
              <p className="text-slate-500 dark:text-slate-400 mt-1">{selectedPath.shortDescription}</p>
            </div>
          </div>

          <div className="p-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">Step-by-Step Checklist</h3>
            <div className="space-y-0">
              {selectedPath.steps.map((step, idx) => (
                <div key={step.id} className="relative flex gap-6 pb-10 last:pb-0">
                  {/* Line */}
                  {idx !== selectedPath.steps.length - 1 && (
                    <div className="absolute left-[15px] top-[30px] bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
                  )}
                  
                  {/* Circle */}
                  <div className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">
                    {step.id}
                  </div>

                  <div className="flex-1 pt-0.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-800 dark:text-white">{step.title}</h4>
                          {step.isOptional && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-medium">Optional</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{step.description}</p>
                      </div>
                      <button 
                        onClick={() => onNavigate(step.targetView)}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        Open Module
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-esg-50 dark:bg-esg-900/20 border border-esg-100 dark:border-esg-800/50 p-6 rounded-2xl flex gap-4 items-start">
          <Sparkles className="w-5 h-5 text-esg-600 dark:text-esg-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-esg-900 dark:text-esg-100">Pro Tip</p>
            <p className="text-sm text-esg-700 dark:text-esg-300 mt-1 leading-relaxed">
              This checklist is designed to be flexible. You can jump between steps or return to this guide at any time. Your progress is saved automatically as you complete each module.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">Start Here</h1>
        <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          Choose the sustainability path that best matches your current business need.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {PATHS.map((path) => (
          <div key={path.id} className="group bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full overflow-hidden">
            <div className="p-8 flex-1 flex flex-col">
              <div className={`w-12 h-12 rounded-xl ${path.color} flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110`}>
                {path.icon}
              </div>
              
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-3">{path.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                {path.shortDescription}
              </p>

              <div className="space-y-4 mb-8">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" />
                    Best For
                  </h4>
                  <ul className="space-y-1.5">
                    {path.bestFor.map((item, i) => (
                      <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mt-1.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    Estimated Time
                  </h4>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{path.estimatedTime}</p>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Zap className="w-3 h-3" />
                    Expected Outcomes
                  </h4>
                  <ul className="space-y-1.5">
                    {path.expectedOutcomes.map((item, i) => (
                      <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full bg-esg-400 mt-1.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-50 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
              <button 
                onClick={() => setSelectedPath(path)}
                className="w-full flex items-center justify-center gap-2 bg-esg-600 hover:bg-esg-700 text-white py-3 rounded-xl font-bold transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
              >
                {path.buttonText}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StartHere;
