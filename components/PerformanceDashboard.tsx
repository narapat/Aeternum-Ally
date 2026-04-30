
import React, { useState } from 'react';
import { KPI, BSCPerspective, RACI } from '../types';
import { generateKPISuggestions } from '../services/geminiService';
import {
  TrendingUp, Users, Settings, BookOpen, Plus,
  Link, ArrowUpRight, User, Loader2, Save, Trash2
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface Props {
  kpis: KPI[];
  onSaveKpi: (kpi: KPI) => Promise<void>;
  onDeleteKpi: (id: string) => Promise<void>;
  companyDescription: string;
}

const PERSPECTIVE_CONFIG = {
  [BSCPerspective.FINANCIAL]: { color: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-200', icon: <TrendingUp className="w-5 h-5" /> },
  [BSCPerspective.CUSTOMER]: { color: 'bg-blue-100 text-blue-800', border: 'border-blue-200', icon: <Users className="w-5 h-5" /> },
  [BSCPerspective.INTERNAL]: { color: 'bg-amber-100 text-amber-800', border: 'border-amber-200', icon: <Settings className="w-5 h-5" /> },
  [BSCPerspective.LEARNING]: { color: 'bg-purple-100 text-purple-800', border: 'border-purple-200', icon: <BookOpen className="w-5 h-5" /> },
};

const PerformanceDashboard: React.FC<Props> = ({ kpis, onSaveKpi, onDeleteKpi, companyDescription }) => {
  const [viewMode, setViewMode] = useState<'map' | 'tracking'>('map');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingKpi, setEditingKpi] = useState<KPI | null>(null);

  const handleDelete = async (id: string) => {
    await onDeleteKpi(id);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Performance Management</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Balanced Scorecard & Strategy Map</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
           <div className="bg-slate-100 dark:bg-slate-700 p-1 rounded-lg flex text-sm font-medium mr-2">
              <button 
                  onClick={() => setViewMode('map')} 
                  className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-all ${viewMode === 'map' ? 'bg-white dark:bg-slate-600 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                  <Link className="w-4 h-4" /> Strategy Map
              </button>
              <button 
                  onClick={() => setViewMode('tracking')} 
                  className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-all ${viewMode === 'tracking' ? 'bg-white dark:bg-slate-600 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                  <TrendingUp className="w-4 h-4" /> Tracking
              </button>
           </div>
           <button 
            onClick={() => { setEditingKpi(null); setIsFormOpen(true); }}
            className="flex items-center gap-2 bg-esg-600 text-white px-4 py-2 rounded-lg hover:bg-esg-700 transition-colors text-sm font-medium shadow-sm flex-1 sm:flex-none justify-center"
           >
              <Plus className="w-4 h-4" /> New KPI
          </button>
        </div>
      </div>

      {isFormOpen && (
        <KPIForm
            initialData={editingKpi}
            onClose={() => setIsFormOpen(false)}
            onSave={async (kpi) => {
                await onSaveKpi(kpi);
                setIsFormOpen(false);
            }}
            companyDescription={companyDescription}
            allKpis={kpis}
        />
      )}

      {viewMode === 'map' ? (
        <StrategyMap kpis={kpis} onEdit={(k) => { setEditingKpi(k); setIsFormOpen(true); }} />
      ) : (
        <TrackingList kpis={kpis} onEdit={(k) => { setEditingKpi(k); setIsFormOpen(true); }} onDelete={handleDelete} />
      )}
    </div>
  );
};

// --- Sub-Component: Strategy Map View ---
const StrategyMap: React.FC<{ kpis: KPI[], onEdit: (k: KPI) => void }> = ({ kpis, onEdit }) => {
    const perspectives = [
        BSCPerspective.FINANCIAL,
        BSCPerspective.CUSTOMER,
        BSCPerspective.INTERNAL,
        BSCPerspective.LEARNING
    ];

    return (
        <div className="space-y-8 relative">
            {perspectives.map((p, idx) => {
                const pKpis = kpis.filter(k => k.perspective === p);
                const config = PERSPECTIVE_CONFIG[p];

                return (
                    <div key={p} className="relative">
                        {/* Connector Line to next section */}
                        {idx < perspectives.length - 1 && (
                             <div className="absolute left-8 bottom-[-32px] h-8 border-l-2 border-dashed border-slate-300 dark:border-slate-600 z-0"></div>
                        )}
                        
                        <div className={`rounded-xl border ${config.border} bg-white dark:bg-slate-800 shadow-sm overflow-hidden relative z-10`}>
                            <div className={`px-4 py-2 ${config.color} font-bold text-sm flex items-center gap-2 uppercase tracking-wide`}>
                                {config.icon} {p} Perspective
                            </div>
                            <div className="p-4 min-h-[120px]">
                                {pKpis.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-sm italic border border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-4">
                                        No KPIs defined yet.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {pKpis.map(kpi => (
                                            <StrategyCard key={kpi.id} kpi={kpi} allKpis={kpis} onClick={() => onEdit(kpi)} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const StrategyCard: React.FC<{ kpi: KPI, allKpis: KPI[], onClick: () => void }> = ({ kpi, allKpis, onClick }) => {
    const progress = (kpi.currentValue / kpi.targetValue) * 100;
    const linked = allKpis.filter(k => kpi.linkedKpiIds.includes(k.id));
    
    return (
        <div 
            onClick={onClick}
            className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-esg-400 cursor-pointer hover:shadow-md transition-all bg-slate-50 dark:bg-slate-900/50 group"
        >
            <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-slate-800 dark:text-white text-sm group-hover:text-esg-600 transition-colors">{kpi.name}</h4>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${progress >= 100 ? 'bg-emerald-100 text-emerald-800' : progress >= 70 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                    {Math.round(progress)}%
                </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3 h-8">{kpi.description}</p>
            
            <div className="flex items-center justify-between text-xs text-slate-400">
                 <div className="flex items-center gap-1" title="Responsible Owner">
                    <User className="w-3 h-3" /> {kpi.raci.responsible || 'Unassigned'}
                 </div>
                 {linked.length > 0 && (
                    <div className="flex items-center gap-1 text-indigo-500" title="Influences other KPIs">
                        <ArrowUpRight className="w-3 h-3" /> {linked.length} Linked
                    </div>
                 )}
            </div>
        </div>
    );
};

// --- Sub-Component: Tracking List ---
const TrackingList: React.FC<{ kpis: KPI[], onEdit: (k: KPI) => void, onDelete: (id: string) => void }> = ({ kpis, onEdit, onDelete }) => {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                            <th className="p-4 text-left">KPI Name</th>
                            <th className="p-4 text-left">Perspective</th>
                            <th className="p-4 text-left">Target</th>
                            <th className="p-4 text-left">Current</th>
                            <th className="p-4 text-left">Status</th>
                            <th className="p-4 text-left">Owner (R)</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {kpis.map(kpi => {
                            const progress = (kpi.currentValue / kpi.targetValue) * 100;
                            return (
                                <tr key={kpi.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200">
                                    <td className="p-4 font-medium">{kpi.name}</td>
                                    <td className="p-4 text-xs uppercase tracking-wide text-slate-500">{kpi.perspective}</td>
                                    <td className="p-4 font-mono text-slate-600 dark:text-slate-400">{kpi.targetValue.toLocaleString()} {kpi.unit}</td>
                                    <td className="p-4 font-mono font-bold">{kpi.currentValue.toLocaleString()}</td>
                                    <td className="p-4">
                                        <div className="w-24 h-2 bg-slate-100 dark:bg-slate-600 rounded-full overflow-hidden mb-1">
                                            <div 
                                                className={`h-full rounded-full ${progress >= 100 ? 'bg-emerald-500' : progress >= 75 ? 'bg-blue-500' : progress >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} 
                                                style={{ width: `${Math.min(progress, 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-slate-500">{Math.round(progress)}%</span>
                                    </td>
                                    <td className="p-4 text-slate-500">{kpi.raci.responsible}</td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => onEdit(kpi)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-blue-600">
                                                <Settings className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => onDelete(kpi.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-slate-500 hover:text-red-600">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

interface KPIFormProps {
  initialData: KPI | null;
  onClose: () => void;
  onSave: (kpi: KPI) => Promise<void> | void;
  companyDescription: string;
  allKpis: KPI[];
}

// --- Sub-Component: KPI Form (Modal) ---
const KPIForm: React.FC<KPIFormProps> = ({ initialData, onClose, onSave, companyDescription, allKpis }) => {
    const [formData, setFormData] = useState<KPI>(initialData || {
        id: '',
        name: '',
        description: '',
        perspective: BSCPerspective.FINANCIAL,
        frequency: 'Monthly',
        unit: '',
        targetValue: 0,
        currentValue: 0,
        linkedKpiIds: [],
        raci: { responsible: '', accountable: '', consulted: '', informed: '' },
        history: []
    });
    const [loadingAi, setLoadingAi] = useState(false);

    const handleAiSuggest = async () => {
        setLoadingAi(true);
        const suggestions = await generateKPISuggestions(companyDescription, formData.perspective);
        if (suggestions && suggestions.length > 0) {
            // Take the first one or ask user (Simplified: Take first)
            const s = suggestions[0];
            setFormData(prev => ({
                ...prev,
                name: s.name,
                description: s.description,
                unit: s.unit,
                targetValue: s.targetSuggestion
            }));
        }
        setLoadingAi(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSave({
            ...formData,
            id: formData.id || '',
            history: formData.history.length ? formData.history : [{ date: new Date().toISOString().split('T')[0], value: formData.currentValue }]
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="flex justify-between items-start">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white">{initialData ? 'Edit KPI' : 'New Strategic KPI'}</h3>
                        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <span className="sr-only">Close</span>
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    {/* Section 1: Basics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                             <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">BSC Perspective</label>
                             <select 
                                value={formData.perspective}
                                onChange={e => setFormData({...formData, perspective: e.target.value as BSCPerspective})}
                                className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                             >
                                {Object.values(BSCPerspective).map(p => <option key={p} value={p}>{p}</option>)}
                             </select>
                        </div>

                        <div className="md:col-span-2">
                             <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">KPI Name</label>
                                <button 
                                    type="button" 
                                    onClick={handleAiSuggest}
                                    disabled={loadingAi}
                                    className="text-xs bg-esg-100 text-esg-700 dark:bg-esg-900 dark:text-esg-300 px-2 py-1 rounded flex items-center gap-1 hover:bg-esg-200"
                                >
                                    {loadingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Settings className="w-3 h-3" />}
                                    AI Suggest
                                </button>
                             </div>
                             <input 
                                required
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                                placeholder="e.g. Quarterly Revenue Growth"
                             />
                        </div>

                        <div className="md:col-span-2">
                             <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Description</label>
                             <textarea 
                                value={formData.description}
                                onChange={e => setFormData({...formData, description: e.target.value})}
                                className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white h-20"
                                placeholder="Why is this KPI important?"
                             />
                        </div>
                    </div>

                    {/* Section 2: Measures */}
                    <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
                        <div>
                             <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Unit</label>
                             <input 
                                value={formData.unit}
                                onChange={e => setFormData({...formData, unit: e.target.value})}
                                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                                placeholder="%"
                             />
                        </div>
                        <div>
                             <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Target</label>
                             <input 
                                type="number"
                                value={formData.targetValue}
                                onChange={e => setFormData({...formData, targetValue: parseFloat(e.target.value)})}
                                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                             />
                        </div>
                        <div>
                             <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Current</label>
                             <input 
                                type="number"
                                value={formData.currentValue}
                                onChange={e => setFormData({...formData, currentValue: parseFloat(e.target.value)})}
                                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                             />
                        </div>
                        <div>
                             <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Frequency</label>
                             <select 
                                value={formData.frequency}
                                onChange={e => setFormData({...formData, frequency: e.target.value as any})}
                                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                             >
                                <option value="Monthly">Monthly</option>
                                <option value="Quarterly">Quarterly</option>
                                <option value="Annually">Annually</option>
                             </select>
                        </div>
                    </div>

                    {/* Section 3: RACI & Linkage */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                             <h4 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"><Users className="w-4 h-4" /> RACI Matrix</h4>
                             <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Responsible (Doer)</label>
                                    <input 
                                        placeholder="Role/Name" 
                                        value={formData.raci.responsible} 
                                        onChange={e => setFormData({...formData, raci: {...formData.raci, responsible: e.target.value}})} 
                                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Accountable (Owner)</label>
                                    <input 
                                        placeholder="Role/Name" 
                                        value={formData.raci.accountable} 
                                        onChange={e => setFormData({...formData, raci: {...formData.raci, accountable: e.target.value}})} 
                                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Consulted (Expert)</label>
                                    <input 
                                        placeholder="Role/Name" 
                                        value={formData.raci.consulted} 
                                        onChange={e => setFormData({...formData, raci: {...formData.raci, consulted: e.target.value}})} 
                                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Informed (Notify)</label>
                                    <input 
                                        placeholder="Role/Name" 
                                        value={formData.raci.informed} 
                                        onChange={e => setFormData({...formData, raci: {...formData.raci, informed: e.target.value}})} 
                                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm" 
                                    />
                                </div>
                             </div>
                        </div>
                        <div className="space-y-2">
                             <h4 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"><Link className="w-4 h-4" /> Strategy Linkage</h4>
                             <p className="text-xs text-slate-500">Select KPIs that this KPI influences (Success here drives success there).</p>
                             <div className="h-32 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded p-2 bg-slate-50 dark:bg-slate-950">
                                {allKpis.filter(k => k.id !== formData.id).map(k => (
                                    <label key={k.id} className="flex items-center gap-2 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={formData.linkedKpiIds.includes(k.id)}
                                            onChange={e => {
                                                if(e.target.checked) {
                                                    setFormData({...formData, linkedKpiIds: [...formData.linkedKpiIds, k.id]});
                                                } else {
                                                    setFormData({...formData, linkedKpiIds: formData.linkedKpiIds.filter(id => id !== k.id)});
                                                }
                                            }}
                                            className="rounded text-esg-600 focus:ring-esg-500"
                                        />
                                        <span className="text-sm truncate">{k.name}</span>
                                    </label>
                                ))}
                                {allKpis.length <= (formData.id ? 1 : 0) && <span className="text-xs text-slate-400 italic">No other KPIs to link.</span>}
                             </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-esg-600 text-white font-medium rounded-lg hover:bg-esg-700 flex items-center gap-2">
                            <Save className="w-4 h-4" /> Save KPI
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default PerformanceDashboard;
