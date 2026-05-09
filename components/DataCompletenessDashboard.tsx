
import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { SustainabilityBusinessModel, SwotAnalysis, AssessmentData, Task } from '../types';
import { CheckCircle, Circle, AlertCircle, ArrowRight, Layout, Target, FileText, ListChecks } from 'lucide-react';

interface Props {
  bmcData: SustainabilityBusinessModel;
  swotData: SwotAnalysis;
  assessments: AssessmentData[];
  onNavigate: (view: any) => void;
  tasks: Task[];
  currentMemberId?: string | null;
}

const DataCompletenessDashboard: React.FC<Props> = ({ bmcData, swotData, assessments, onNavigate, tasks, currentMemberId }) => {
  
  // --- Calculation Logic ---

  // 1. BMC Completeness (11 Fields)
  const bmcKeys = Object.keys(bmcData) as (keyof SustainabilityBusinessModel)[];
  const filledBmc = bmcKeys.filter(k => bmcData[k] && bmcData[k].length > 10).length;
  const totalBmc = bmcKeys.length;
  const bmcPercent = Math.round((filledBmc / totalBmc) * 100);

  // 2. SWOT Completeness (4 Fields)
  const swotKeys = ['strengths', 'weaknesses', 'opportunities', 'threats'] as (keyof SwotAnalysis)[];
  const filledSwot = swotKeys.filter(k => swotData[k] && swotData[k].length > 10).length;
  const totalSwot = 4;
  const swotPercent = Math.round((filledSwot / totalSwot) * 100);

  // 3. Assessments (Target: At least 5 assessments analyzed)
  const assessmentTarget = 5;
  const assessmentCount = assessments.length;
  const materialCount = assessments.filter(a => a.isMaterial).length;
  const assessmentPercent = Math.min(100, Math.round((assessmentCount / assessmentTarget) * 100));

  // 4. Overall Score
  const overallScore = Math.round((bmcPercent * 0.4) + (swotPercent * 0.2) + (assessmentPercent * 0.4));

  // Chart Data
  const gaugeData = [
    { name: 'Completed', value: overallScore },
    { name: 'Remaining', value: 100 - overallScore },
  ];
  const COLORS = ['#10b981', '#e2e8f0']; // Emerald-500, Slate-200
  const DARK_COLORS = ['#10b981', '#334155']; // Emerald-500, Slate-700

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="mb-4 md:mb-8">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">System Overview</h2>
        <p className="text-slate-500 dark:text-slate-400">Track the completeness of your sustainability profile and ESRS readiness.</p>
      </div>

      {/* Top Section: Overall Score & Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        
        {/* Overall Readiness Card */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center relative overflow-hidden min-h-[300px]">
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 absolute top-6 left-6">ESRS Readiness Score</h3>
          <div className="h-64 w-full flex items-center justify-center relative">
             <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={gaugeData}
                  cx="50%"
                  cy="50%"
                  startAngle={180}
                  endAngle={0}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={0}
                  dataKey="value"
                  stroke="none"
                >
                  {gaugeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? COLORS[0] : 'currentColor'} className={index === 1 ? "text-slate-200 dark:text-slate-700" : ""} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-4 text-center">
              <span className="text-4xl font-extrabold text-slate-800 dark:text-white">{overallScore}%</span>
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">Complete</p>
            </div>
          </div>
          <div className="w-full mt-[-40px] text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                {overallScore < 50 ? "Needs Attention" : overallScore < 80 ? "Good Progress" : "Ready for Report"}
            </p>
          </div>
        </div>

        {/* Status Detail Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* BMC Status */}
            <StatusCard 
                title="Business Model"
                icon={<Layout className="w-5 h-5 text-blue-500" />}
                percent={bmcPercent}
                detail={`${filledBmc}/${totalBmc} Blocks Filled`}
                actionLabel={bmcPercent < 100 ? "Continue Editing" : "View Canvas"}
                onClick={() => onNavigate('canvas')}
                colorClass="bg-blue-500"
            />

            {/* SWOT Status */}
            <StatusCard 
                title="SWOT Analysis"
                icon={<Target className="w-5 h-5 text-amber-500" />}
                percent={swotPercent}
                detail={`${filledSwot}/${totalSwot} Quadrants Analyzed`}
                actionLabel={swotPercent < 100 ? "Complete Analysis" : "View Matrix"}
                onClick={() => onNavigate('swot')}
                colorClass="bg-amber-500"
            />

            {/* Assessment Status */}
            <div className="sm:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                            <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <h4 className="font-bold text-slate-800 dark:text-white">Double Materiality</h4>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                        You have identified <strong className="text-slate-800 dark:text-white">{materialCount} material topics</strong> out of {assessmentCount} assessments.
                    </p>
                    <div className="flex items-center gap-4">
                         <div className="h-2 w-48 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                             <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${assessmentPercent}%` }} />
                         </div>
                         <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{assessmentPercent}% Target</span>
                    </div>
                </div>
                <button
                    onClick={() => onNavigate('dm_dashboard')}
                    className="px-5 py-2.5 bg-slate-900 dark:bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors flex items-center gap-2 w-full sm:w-auto justify-center"
                >
                    Go to Dashboard <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Company Task Status */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-bold text-slate-800 dark:text-white">Company Task Status</h3>
            </div>
            <div className="p-6 grid grid-cols-1 gap-4">
                <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl text-center">
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">{tasks.filter(t => t.status === 'todo').length}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mt-1">To Do</p>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl text-center">
                    <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{tasks.filter(t => t.status === 'in_progress').length}</p>
                    <p className="text-xs text-indigo-500 dark:text-indigo-300 uppercase font-semibold mt-1">In Progress</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl text-center">
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{tasks.filter(t => t.status === 'done').length}</p>
                    <p className="text-xs text-emerald-500 dark:text-emerald-300 uppercase font-semibold mt-1">Done</p>
                </div>
            </div>
          </div>
          <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
              <button onClick={() => onNavigate('tasks')} className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium flex items-center gap-1">
                  Go to Task Manager <ArrowRight className="w-4 h-4" />
              </button>
          </div>
        </div>

        {/* Action List */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-slate-800 dark:text-white">Recommended Actions</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {bmcPercent < 100 && (
                  <ActionItem 
                      title="Complete Business Model Canvas"
                      desc="Define your key partners and eco-social costs to improve AI accuracy."
                      onClick={() => onNavigate('canvas')}
                  />
              )}
              {swotPercent < 100 && (
                  <ActionItem 
                      title="Finalize SWOT Analysis"
                      desc="Identify external opportunities and threats using the AI search tool."
                      onClick={() => onNavigate('swot')}
                  />
              )}
              {assessmentCount < 3 && (
                  <ActionItem 
                      title="Conduct More Materiality Assessments"
                      desc="We recommend analyzing at least 3-5 topics to build a report."
                      onClick={() => onNavigate('assess')}
                  />
              )}
              {overallScore >= 80 && (
                  <div className="p-4 flex items-center gap-4 bg-emerald-50 dark:bg-emerald-900/10">
                      <div className="text-emerald-600 dark:text-emerald-400"><CheckCircle className="w-6 h-6" /></div>
                      <div>
                          <p className="font-bold text-slate-800 dark:text-white">You are ready to report!</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">Generate your Sustainability Statement now.</p>
                      </div>
                       <button 
                          onClick={() => onNavigate('report')}
                          className="ml-auto text-sm font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                          View Report
                      </button>
                  </div>
              )}
               {overallScore === 100 && assessmentCount >= 5 && (
                  <div className="p-6 text-center text-slate-400 italic">All recommended actions completed. Great job!</div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusCard = ({ title, icon, percent, detail, actionLabel, onClick, colorClass }: any) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-between h-full">
        <div>
            <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700">
                    {icon}
                </div>
                <span className="text-2xl font-bold text-slate-800 dark:text-white">{percent}%</span>
            </div>
            <h4 className="font-bold text-slate-700 dark:text-slate-200">{title}</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{detail}</p>
            
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full mt-4 overflow-hidden">
                <div className={`h-full ${colorClass} transition-all duration-1000`} style={{ width: `${percent}%` }} />
            </div>
        </div>
        <button 
            onClick={onClick}
            className="mt-6 w-full py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
            {actionLabel}
        </button>
    </div>
);

const ActionItem = ({ title, desc, onClick }: any) => (
    <div className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between group cursor-pointer" onClick={onClick}>
        <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
                <p className="font-medium text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 md:line-clamp-none">{desc}</p>
            </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors flex-shrink-0 ml-2" />
    </div>
);

export default DataCompletenessDashboard;
