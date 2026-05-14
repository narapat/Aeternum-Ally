import React from 'react';
import { Clock, ChevronRight, TrendingUp, Leaf, Globe, FileText, Info, AlertCircle } from 'lucide-react';

export type StartHerePathId = 'start_here_esg' | 'start_here_carbon' | 'start_here_stakeholder';

interface StartHereProps {
  onSelectPath: (path: StartHerePathId) => void;
}

const PATHS = [
  {
    id: 'start_here_esg' as StartHerePathId,
    icon: <TrendingUp className="w-6 h-6" />,
    color: 'esg',
    title: 'ESG Readiness',
    description: 'For SMEs starting their sustainability journey and looking for a structured place to begin.',
    bestFor: [
      'SMEs new to sustainability',
      'Companies without a dedicated ESG team',
      'Organizations building initial sustainability structure',
    ],
    estimatedTime: '60–90 minutes',
    outcomes: [
      'Sustainability strategy baseline',
      'Risks and opportunities overview',
      'Initial materiality understanding',
      'KPI structure',
      'Suggested sustainability tasks',
      'AI-Assisted Baseline Sustainability Statement',
    ],
    note: 'This path helps organizations build an initial sustainability structure that can support generation of a draft baseline sustainability statement.',
    cta: 'Start ESG Readiness',
  },
  {
    id: 'start_here_carbon' as StartHerePathId,
    icon: <Leaf className="w-6 h-6" />,
    color: 'amber',
    title: 'Carbon Starter',
    description: 'For organizations beginning Scope 1 and Scope 2 carbon tracking.',
    bestFor: [
      'SMEs asked about emissions',
      'Companies starting carbon tracking',
      'Organizations preparing for future carbon reporting',
    ],
    estimatedTime: '45–60 minutes',
    outcomes: [
      'Basic Scope 1 and Scope 2 tracking',
      'Monthly emissions records',
      'Carbon activity overview',
      'Initial emissions hotspot visibility',
      'Carbon data that can support future sustainability statements and climate-related disclosures',
    ],
    note: 'Carbon information recorded in this workflow can contribute to future AI-assisted sustainability statements and climate-related reporting preparation.',
    cta: 'Start Carbon Starter',
  },
  {
    id: 'start_here_stakeholder' as StartHerePathId,
    icon: <Globe className="w-6 h-6" />,
    color: 'blue',
    title: 'Stakeholder Request Readiness',
    description: 'For suppliers and SMEs responding to sustainability-related requests from customers, investors, or business partners.',
    bestFor: [
      'Suppliers',
      'Exporters',
      'SMEs receiving ESG information requests',
      'Companies preparing sustainability evidence',
    ],
    estimatedTime: '45–90 minutes',
    outcomes: [
      'Structured sustainability information',
      'Relevant KPI overview',
      'Evidence links attached to records',
      'Better visibility of missing information',
      'Draft baseline sustainability statement for stakeholder discussion support',
    ],
    note: 'This path helps organizations organize sustainability-related information and supporting evidence links that may assist in customer, investor, or partner sustainability discussions.',
    cta: 'Start Stakeholder Readiness',
  },
] as const;

const COLOR_MAP = {
  esg: {
    iconBg: 'bg-esg-50 dark:bg-esg-900/30',
    iconText: 'text-esg-600 dark:text-esg-400',
    badge: 'bg-esg-50 text-esg-700 dark:bg-esg-900/40 dark:text-esg-300 border border-esg-100 dark:border-esg-800',
    highlightBadge: 'bg-esg-100 text-esg-800 dark:bg-esg-900/60 dark:text-esg-200 border border-esg-300 dark:border-esg-700 font-semibold',
    button: 'bg-esg-600 hover:bg-esg-700 focus-visible:ring-esg-500 text-white',
    cardHover: 'hover:border-esg-200 dark:hover:border-esg-800',
    note: 'bg-esg-50 dark:bg-esg-900/20 border-esg-100 dark:border-esg-800 text-esg-700 dark:text-esg-300',
  },
  amber: {
    iconBg: 'bg-amber-50 dark:bg-amber-900/30',
    iconText: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-100 dark:border-amber-800',
    highlightBadge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700 font-semibold',
    button: 'bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-400 text-white',
    cardHover: 'hover:border-amber-200 dark:hover:border-amber-800',
    note: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800 text-amber-700 dark:text-amber-300',
  },
  blue: {
    iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    iconText: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-100 dark:border-blue-800',
    highlightBadge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-300 dark:border-blue-700 font-semibold',
    button: 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500 text-white',
    cardHover: 'hover:border-blue-200 dark:hover:border-blue-800',
    note: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800 text-blue-700 dark:text-blue-300',
  },
};

const STATEMENT_OUTPUTS = [
  'Internal sustainability review',
  'ESG readiness planning',
  'Customer and stakeholder discussions',
  'Identification of sustainability gaps and next steps',
];

const StartHere: React.FC<StartHereProps> = ({ onSelectPath }) => (
  <div className="animate-in fade-in duration-500 space-y-8 max-w-6xl mx-auto">

    {/* Header */}
    <div className="text-center space-y-3 pt-2 pb-2">
      <h1 className="text-3xl md:text-4xl font-bold text-slate-800 dark:text-white">Start Here</h1>
      <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
        Choose the sustainability path that best matches your current business need.
      </p>
    </div>

    {/* What You Can Generate */}
    <div className="bg-gradient-to-br from-esg-50 to-slate-50 dark:from-esg-900/20 dark:to-slate-800/50 rounded-2xl border border-esg-100 dark:border-esg-800/50 p-6 flex flex-col sm:flex-row gap-5">
      <div className="w-12 h-12 rounded-xl bg-esg-100 dark:bg-esg-900/50 flex items-center justify-center flex-shrink-0">
        <FileText className="w-6 h-6 text-esg-600 dark:text-esg-400" />
      </div>
      <div className="space-y-3 flex-1 min-w-0">
        <h2 className="text-base font-bold text-slate-800 dark:text-white">What You Can Generate</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          After completing the recommended modules, organizations can generate an <span className="font-semibold text-esg-700 dark:text-esg-300">AI-Assisted Baseline Sustainability Statement</span> based on the sustainability information available in their workspace.
        </p>
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">This draft statement is designed to support</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {STATEMENT_OUTPUTS.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-esg-400 dark:bg-esg-500 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed border-t border-esg-100 dark:border-esg-800/50 pt-3">
          The statement is AI-assisted and generated from available organizational data — including company profile, double materiality assessments, KPI structures, carbon tracking records, and user-entered sustainability information.
        </p>
      </div>
    </div>

    {/* Path cards */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {PATHS.map((path) => {
        const c = COLOR_MAP[path.color];
        const regularOutcomes = path.outcomes.slice(0, -1);
        const highlightOutcome = path.outcomes[path.outcomes.length - 1];
        return (
          <div
            key={path.id}
            className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 ${c.cardHover} p-6 flex flex-col gap-5 shadow-sm hover:shadow-md transition-all duration-200`}
          >
            {/* Icon + title */}
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${c.iconBg}`}>
                <span className={c.iconText}>{path.icon}</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white leading-tight">{path.title}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{path.description}</p>
              </div>
            </div>

            {/* Best for */}
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Best for</p>
              <ul className="space-y-1.5">
                {path.bestFor.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Estimated time */}
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-sm text-slate-500 dark:text-slate-400">{path.estimatedTime}</span>
            </div>

            {/* Expected outcomes */}
            <div className="flex-1 space-y-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Expected outcomes</p>
              <div className="flex flex-wrap gap-1.5">
                {regularOutcomes.map((outcome) => (
                  <span key={outcome} className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.badge}`}>
                    {outcome}
                  </span>
                ))}
              </div>
              {/* Highlighted final outcome */}
              <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${c.highlightBadge}`}>
                <FileText className="w-3 h-3 flex-shrink-0" />
                {highlightOutcome}
              </span>
            </div>

            {/* Path note */}
            <div className={`rounded-xl border p-3 ${c.note}`}>
              <div className="flex gap-2">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">{path.note}</p>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => onSelectPath(path.id)}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${c.button}`}
            >
              {path.cta}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>

    {/* Important Notice */}
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 flex gap-4">
      <div className="flex-shrink-0 mt-0.5">
        <AlertCircle className="w-5 h-5 text-slate-400 dark:text-slate-500" />
      </div>
      <div className="space-y-1.5 min-w-0">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Important Notice</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          The AI-Assisted Baseline Sustainability Statement generated by AeternumAlly is intended as a draft baseline document generated from available organizational sustainability information. The generated statement may contain incomplete information, missing policies, or missing quantitative indicators depending on the data available in the workspace. The document is not externally assured and should be reviewed internally before external use or formal sustainability disclosure.
        </p>
      </div>
    </div>

  </div>
);

export default StartHere;
