import React from 'react';
import { Clock, ChevronRight, TrendingUp, Leaf, Globe } from 'lucide-react';

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
    ],
    cta: 'Start ESG Readiness',
  },
  {
    id: 'start_here_carbon' as StartHerePathId,
    icon: <Leaf className="w-6 h-6" />,
    color: 'green',
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
    ],
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
    ],
    cta: 'Start Stakeholder Readiness',
  },
] as const;

const COLOR_MAP = {
  esg: {
    iconBg: 'bg-esg-50 dark:bg-esg-900/30',
    iconText: 'text-esg-600 dark:text-esg-400',
    badge: 'bg-esg-50 text-esg-700 dark:bg-esg-900/40 dark:text-esg-300 border border-esg-100 dark:border-esg-800',
    button: 'bg-esg-600 hover:bg-esg-700 focus-visible:ring-esg-500 text-white',
    cardHover: 'hover:border-esg-200 dark:hover:border-esg-800',
  },
  green: {
    iconBg: 'bg-green-50 dark:bg-green-900/30',
    iconText: 'text-green-600 dark:text-green-400',
    badge: 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300 border border-green-100 dark:border-green-800',
    button: 'bg-green-600 hover:bg-green-700 focus-visible:ring-green-500 text-white',
    cardHover: 'hover:border-green-200 dark:hover:border-green-800',
  },
  blue: {
    iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    iconText: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-100 dark:border-blue-800',
    button: 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500 text-white',
    cardHover: 'hover:border-blue-200 dark:hover:border-blue-800',
  },
};

const StartHere: React.FC<StartHereProps> = ({ onSelectPath }) => (
  <div className="animate-in fade-in duration-500 space-y-8 max-w-6xl mx-auto">
    {/* Header */}
    <div className="text-center space-y-3 pt-2 pb-2">
      <h1 className="text-3xl md:text-4xl font-bold text-slate-800 dark:text-white">Start Here</h1>
      <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
        Choose the sustainability path that best matches your current business need.
      </p>
    </div>

    {/* Path cards */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {PATHS.map((path) => {
        const c = COLOR_MAP[path.color];
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
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Expected outcomes</p>
              <div className="flex flex-wrap gap-1.5">
                {path.outcomes.map((outcome) => (
                  <span key={outcome} className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.badge}`}>
                    {outcome}
                  </span>
                ))}
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
  </div>
);

export default StartHere;
