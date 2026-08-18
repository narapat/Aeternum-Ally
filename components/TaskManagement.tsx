import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Task, SuggestedTask, TaskType, TaskStatus, TaskPriority,
  AssessmentData, KPI, SwotAnalysis, CompanyProfile, InsightHubResponse, OrgMember, QualityCheck,
} from '../types';
import {
  fetchTasks, upsertTask, deleteTask,
  fetchSuggestedTasks, dismissSuggestedTask, promoteSuggestedTask, saveSuggestedTasks,
  restoreSuggestedTask, fetchDismissedSuggestedTasks,
} from '../services/dbService';
import { generateTasks } from '../services/geminiService';
import { downloadSpreadsheet, parseSpreadsheetFile } from '../services/spreadsheetService';
import EvidenceBadge from './EvidenceBadge';
import {
  Sparkles, ListChecks, RefreshCw, CheckCircle2, Circle, Clock,
  AlertCircle, Loader2, ChevronDown, ChevronUp, Trash2, ArrowUpRight,
  Filter, Plus, CheckSquare, Square, User, CalendarDays, Tag, Shield, TrendingUp,
  ArrowUpDown, MessageSquare, UserPlus, ChevronRight, Download, Upload, X, CheckCircle,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  orgId: string;
  assessments: AssessmentData[];
  kpis: KPI[];
  swotData: SwotAnalysis;
  profile: CompanyProfile;
  cachedInsight: InsightHubResponse | null;
  members: OrgMember[];
  currentUserId: string;
  isSidebarCollapsed?: boolean;
  onNavigateToInsightHub?: () => void;
  // topicCode e.g. "E1" — opens that specific assessment in the form
  onNavigateToDMARecord?: (topicCode: string | null) => void;
  onNavigateToKPI?: () => void;
  targetTaskId?: string | null;
}

type Tab = 'generator' | 'manager';
type GeneratorSort = 'priority' | 'type' | 'time';
type ManagerSort = 'created' | 'priority' | 'due_date' | 'status';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_META: Record<TaskType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  fix:     { label: 'Fix',     color: 'text-red-600 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',    icon: <AlertCircle className="w-4 h-4" /> },
  comply:  { label: 'Comply',  color: 'text-blue-600 dark:text-blue-400',  bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',  icon: <Shield className="w-4 h-4" /> },
  improve: { label: 'Improve', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800', icon: <TrendingUp className="w-4 h-4" /> },
};

const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  high:   { label: 'High',   color: 'text-red-600 dark:text-red-400' },
  medium: { label: 'Medium', color: 'text-amber-600 dark:text-amber-400' },
  low:    { label: 'Low',    color: 'text-slate-500 dark:text-slate-400' },
};

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = { todo: 'in_progress', in_progress: 'done', done: 'todo' };

const STATUS_META: Record<TaskStatus, { label: string; icon: React.ReactNode; color: string }> = {
  todo:        { label: 'To Do',       icon: <Circle className="w-4 h-4" />,        color: 'text-slate-400' },
  in_progress: { label: 'In Progress', icon: <Clock className="w-4 h-4" />,         color: 'text-amber-500' },
  done:        { label: 'Done',        icon: <CheckCircle2 className="w-4 h-4" />,  color: 'text-emerald-500' },
};

const TYPE_ORDER: TaskType[] = ['fix', 'comply', 'improve'];
const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

function sortSuggested(tasks: SuggestedTask[], by: GeneratorSort): SuggestedTask[] {
  return [...tasks].sort((a, b) => {
    if (by === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (by === 'type') return TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
    if (by === 'time') {
      // parse "N hours/days/weeks" to minutes for comparison
      const toMins = (s: string | null) => {
        if (!s) return 99999;
        const m = s.match(/(\d+)\s*(hour|day|week)/i);
        if (!m) return 99999;
        const n = Number(m[1]);
        if (/week/i.test(m[2])) return n * 5 * 8 * 60;
        if (/day/i.test(m[2])) return n * 8 * 60;
        return n * 60;
      };
      return toMins(a.estimated_time) - toMins(b.estimated_time);
    }
    return 0;
  });
}

function sortTasks(tasks: Task[], by: ManagerSort): Task[] {
  return [...tasks].sort((a, b) => {
    if (by === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (by === 'status') {
      const order: Record<TaskStatus, number> = { todo: 0, in_progress: 1, done: 2 };
      return order[a.status] - order[b.status];
    }
    if (by === 'due_date') {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    }
    // created (default) — already ordered by DB descending
    return 0;
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

const TypeBadge: React.FC<{ type: TaskType }> = ({ type }) => {
  const m = TYPE_META[type];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${m.color} ${m.bg}`}>
      {m.icon}{m.label}
    </span>
  );
};

const PriorityDot: React.FC<{ priority: TaskPriority }> = ({ priority }) => {
  const m = PRIORITY_META[priority];
  return <span className={`text-xs font-medium ${m.color}`}>{m.label}</span>;
};

// ── Generator Tab ─────────────────────────────────────────────────────────────

interface GeneratorProps {
  orgId: string;
  assessments: AssessmentData[];
  kpis: KPI[];
  swotData: SwotAnalysis;
  profile: CompanyProfile;
  cachedInsight: InsightHubResponse | null;
  members: OrgMember[];
  currentUserId: string;
  onTasksCreated: () => void;
  onNavigateToInsightHub?: () => void;
  onNavigateToDMARecord?: (topicCode: string | null) => void;
  onNavigateToKPI?: (kpiIdOrName: string | null) => void;
}

const GeneratorTab: React.FC<GeneratorProps> = ({
  orgId, assessments, kpis, swotData, profile, cachedInsight,
  members, currentUserId, onTasksCreated, onNavigateToInsightHub,
  onNavigateToDMARecord, onNavigateToKPI,
}) => {
  const [suggested, setSuggested] = useState<SuggestedTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [promoting, setPromoting] = useState(false);
  // Per-task overrides for assignee / due-date before promoting
  const [overrides, setOverrides] = useState<Record<string, { assignee_id?: string | null; due_date?: string | null }>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<TaskType>>(new Set(TYPE_ORDER));
  const [sortBy, setSortBy] = useState<GeneratorSort>('priority');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSuggestedTasks(orgId);
      setSuggested(data);
      setSelected(new Set(data.map(t => t.id)));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load suggested tasks');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    if (!profile.name) { setError('Please complete your Company Profile first.'); return; }
    if (assessments.length === 0) { setError('Complete at least one DMA assessment first.'); return; }
    setGenerating(true);
    setError(null);
    try {
      const qualityChecks: QualityCheck[] = (cachedInsight?.qualityChecks ?? []);
      const raw = await generateTasks(qualityChecks, assessments, kpis, swotData, profile);
      if (!raw || raw.length === 0) throw new Error('AI returned no tasks. Try again.');
      await saveSuggestedTasks(orgId, raw as any);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Task generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleDismiss = async (id: string) => {
    await dismissSuggestedTask(id, currentUserId);
    setSuggested(prev => prev.filter(t => t.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const handlePromoteSelected = async () => {
    const toPromote = suggested.filter(t => selected.has(t.id));
    if (toPromote.length === 0) return;
    setPromoting(true);
    setError(null);
    try {
      for (const t of toPromote) {
        const ov = overrides[t.id] ?? {};
        await promoteSuggestedTask(orgId, t, ov);
      }
      await load();
      onTasksCreated();
    } catch (e: any) {
      setError(e.message ?? 'Promotion failed');
    } finally {
      setPromoting(false);
    }
  };

  const toggleGroup = (type: TaskType) => {
    setExpandedGroups(prev => {
      const n = new Set(prev);
      if (n.has(type)) n.delete(type); else n.add(type);
      return n;
    });
  };

  const toggleAll = (type: TaskType, ids: string[]) => {
    setSelected(prev => {
      const n = new Set(prev);
      const allSelected = ids.every(id => n.has(id));
      ids.forEach(id => allSelected ? n.delete(id) : n.add(id));
      return n;
    });
  };

  const sortedSuggested = sortSuggested(suggested, sortBy);
  const grouped = TYPE_ORDER.reduce<Record<TaskType, SuggestedTask[]>>((acc, type) => {
    acc[type] = sortedSuggested.filter(t => t.type === type);
    return acc;
  }, { fix: [], comply: [], improve: [] });

  const selectedCount = selected.size;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-esg-500" />
        <span className="ml-2 text-slate-500">Loading suggested tasks…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">AI Task Generator</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            AI analyses your DMA quality checks, material topics, and KPIs to generate an action list.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {suggested.length > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <select
                className="border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none text-sm"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as GeneratorSort)}
              >
                <option value="priority">Sort: Priority</option>
                <option value="type">Sort: Type</option>
                <option value="time">Sort: Est. Time</option>
              </select>
            </div>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-esg-600 hover:bg-esg-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Generating…' : (suggested.length > 0 ? 'Re-generate' : 'Generate Tasks')}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!cachedInsight && suggested.length === 0 && (
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Run the{' '}
            <button className="underline font-medium" onClick={onNavigateToInsightHub}>DMA Insight Hub</button>
            {' '}first to get quality checks — they make "Fix" tasks much more targeted.
          </span>
        </div>
      )}

      {suggested.length === 0 && !generating && (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <CheckCircle className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No suggested tasks yet</p>
          <p className="text-sm mt-1">Click "Generate Tasks" to let AI build your action list.</p>
        </div>
      )}

      {suggested.length > 0 && (
        <>
          {/* Promote bar */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <span className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-semibold">{selectedCount}</span> of {suggested.length} selected
            </span>
            <button
              onClick={handlePromoteSelected}
              disabled={selectedCount === 0 || promoting}
              className="flex items-center gap-2 px-3 py-1.5 bg-esg-600 hover:bg-esg-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {promoting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
              {promoting ? 'Adding…' : `Add ${selectedCount > 0 ? selectedCount : ''} to Task Manager`}
            </button>
          </div>

          {/* Grouped task cards */}
          {TYPE_ORDER.map(type => {
            const group = grouped[type];
            if (group.length === 0) return null;
            const m = TYPE_META[type];
            const ids = group.map(t => t.id);
            const allSelected = ids.every(id => selected.has(id));
            const expanded = expandedGroups.has(type);

            return (
              <div key={type} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Group header */}
                <div
                  className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750"
                  onClick={() => toggleGroup(type)}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={e => { e.stopPropagation(); toggleAll(type, ids); }}
                      className="text-slate-400 hover:text-esg-600 transition-colors"
                    >
                      {allSelected ? <CheckSquare className="w-4 h-4 text-esg-600" /> : <Square className="w-4 h-4" />}
                    </button>
                    <TypeBadge type={type} />
                    <span className="text-sm text-slate-500 dark:text-slate-400">{group.length} tasks</span>
                  </div>
                  {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>

                {expanded && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {group.map(task => {
                      const isSelected = selected.has(task.id);
                      const ov = overrides[task.id] ?? {};
                      return (
                        <div key={task.id} className={`p-4 bg-white dark:bg-slate-800 transition-colors ${isSelected ? '' : 'opacity-50'}`}>
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => setSelected(prev => {
                                const n = new Set(prev);
                                if (n.has(task.id)) n.delete(task.id); else n.add(task.id);
                                return n;
                              })}
                              className="mt-0.5 text-slate-400 hover:text-esg-600 transition-colors flex-shrink-0"
                            >
                              {isSelected ? <CheckSquare className="w-4 h-4 text-esg-600" /> : <Square className="w-4 h-4" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-slate-800 dark:text-white text-sm">{task.title}</span>
                                <PriorityDot priority={task.priority} />
                                {task.esrs_ref && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-mono">
                                    {task.esrs_ref}
                                  </span>
                                )}
                              </div>
                              {task.description && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{task.description}</p>
                              )}
                              {task.estimated_time && (
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />{task.estimated_time}
                                </p>
                              )}
                              {/* Source link */}
                              {task.source_type && task.source_type !== 'manual' && (
                                <div className="mt-1.5">
                                  <SourceLink
                                    sourceType={task.source_type}
                                    sourceId={task.source_id}
                                    esrsRef={task.esrs_ref}
                                    onNavigateToDMARecord={onNavigateToDMARecord}
                                    onNavigateToInsightHub={onNavigateToInsightHub}
                                    onNavigateToKPI={onNavigateToKPI}
                                    kpis={kpis}
                                  />
                                </div>
                              )}
                              {/* Assignee + due date overrides */}
                              <div className="flex flex-wrap gap-3 mt-2">
                                <div className="flex items-center gap-1">
                                  <User className="w-3.5 h-3.5 text-slate-400" />
                                  <select
                                    className="text-xs bg-transparent text-slate-500 dark:text-slate-400 border-0 outline-none cursor-pointer"
                                    value={ov.assignee_id ?? ''}
                                    onChange={e => setOverrides(prev => ({ ...prev, [task.id]: { ...prev[task.id], assignee_id: e.target.value || null } }))}
                                  >
                                    <option value="">Unassigned</option>
                                    {members.map(m => (
                                      <option key={m.id} value={m.id}>{m.email ?? m.user_id}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex items-center gap-1">
                                  <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                                  <input
                                    type="date"
                                    className="text-xs bg-transparent text-slate-500 dark:text-slate-400 border-0 outline-none cursor-pointer"
                                    value={ov.due_date ?? ''}
                                    onChange={e => setOverrides(prev => ({ ...prev, [task.id]: { ...prev[task.id], due_date: e.target.value || null } }))}
                                  />
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDismiss(task.id)}
                              className="flex-shrink-0 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
                              title="Dismiss"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};

// ── Source Link ────────────────────────────────────────────────────────────────

const SOURCE_TYPE_META: Record<string, { label: string; color: string }> = {
  insight_hub: { label: 'Insight Hub',  color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' },
  dma:         { label: 'DMA',          color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
  kpi:         { label: 'KPI',          color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
};

interface SourceLinkProps {
  sourceType: string;
  sourceId: string | null;
  esrsRef: string | null;
  onNavigateToDMARecord?: (topicCode: string | null) => void;
  onNavigateToInsightHub?: () => void;
  onNavigateToKPI?: (kpiIdOrName: string | null) => void;
  kpis?: KPI[];
}

const SourceLink: React.FC<SourceLinkProps> = ({
  sourceType, sourceId, esrsRef, onNavigateToDMARecord, onNavigateToInsightHub, onNavigateToKPI, kpis = [],
}) => {
  const meta = SOURCE_TYPE_META[sourceType];
  if (!meta) return null;

  // Show human-readable topic code (not raw UUIDs)
  const isUUID = sourceId ? /^[0-9a-f-]{36}$/i.test(sourceId) : true;
  let topicLabel = !isUUID ? sourceId : null;

  if (sourceType === 'kpi' && isUUID && kpis.length > 0) {
    const kpi = kpis.find(k => k.id === sourceId);
    if (kpi) topicLabel = kpi.name;
  }

  const label = [meta.label, topicLabel, esrsRef].filter(Boolean).join(' · ');

  const navigate =
    sourceType === 'insight_hub' ? onNavigateToInsightHub :
    sourceType === 'dma' ? () => onNavigateToDMARecord?.(topicLabel) :
    sourceType === 'kpi' ? () => onNavigateToKPI?.(sourceId) : undefined;

  return (
    <button
      onClick={navigate}
      disabled={!navigate}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-opacity ${meta.color} ${navigate ? 'hover:opacity-80 cursor-pointer' : 'cursor-default opacity-70'}`}
      title={navigate ? `Go to ${meta.label}${topicLabel ? ` · ${topicLabel}` : ''}` : undefined}
    >
      <ChevronRight className="w-3 h-3" />{label}
    </button>
  );
};

// ── Manager Tab ───────────────────────────────────────────────────────────────

interface ManagerProps {
  orgId: string;
  members: OrgMember[];
  currentUserId: string;
  refreshTrigger: number;
  onGoToGenerator: () => void;
  onNavigateToDMARecord?: (topicCode: string | null) => void;
  onNavigateToInsightHub?: () => void;
  onNavigateToKPI?: (kpiIdOrName: string | null) => void;
  targetTaskId?: string | null;
  kpis: KPI[];
}

const ManagerTab: React.FC<ManagerProps> = ({
  orgId, members, currentUserId, refreshTrigger, onGoToGenerator,
  onNavigateToDMARecord, onNavigateToInsightHub, onNavigateToKPI, targetTaskId, kpis,
}) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [onlyMyTasks, setOnlyMyTasks] = useState(false);
  const [filterType, setFilterType] = useState<TaskType | 'all'>('all');
  const [sortBy, setSortBy] = useState<ManagerSort>('created');
  const [showAddModal, setShowAddModal] = useState(false);
  // Track which task's note is being edited (expanded state)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  // Draft note text per task (unsaved until blur)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  // Import/export
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTasks(orgId);
      setTasks(data);
    } catch (e: any) {
      console.error('fetchTasks failed:', e);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load, refreshTrigger]);

  useEffect(() => {
    if (targetTaskId && tasks.length > 0) {
      setFilterStatus('all');
      setFilterType('all');
      setTimeout(() => {
        const el = document.getElementById(`task-${targetTaskId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-esg-500', 'ring-offset-2', 'dark:ring-offset-slate-900', 'transition-all', 'duration-1000');
          setTimeout(() => el.classList.remove('ring-2', 'ring-esg-500', 'ring-offset-2', 'dark:ring-offset-slate-900', 'transition-all', 'duration-1000'), 2000);
        }
      }, 100);
    }
  }, [targetTaskId, tasks.length]);

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    const headers = [
      'Task ID', 'Title', 'Description', 'Type', 'Status', 'Priority',
      'Assignee Email', 'Due Date', 'ESRS Reference', 'Source', 'Notes',
      'Created At', 'Completed At',
    ];
    const rows = tasks.map(t => [
      t.id,
      t.title,
      t.description ?? '',
      t.type,
      t.status,
      t.priority,
      members.find(m => m.id === t.assignee_id)?.email ?? '',
      t.due_date ?? '',
      t.esrs_ref ?? '',
      t.source_type,
      t.notes ?? '',
      t.created_at.slice(0, 10),
      t.completed_at?.slice(0, 10) ?? '',
    ]);

    const instructions = [
      ['AeternumAlly — Task Export/Import'],
      [''],
      ['HOW TO UPDATE TASKS:'],
      ['1. Edit ONLY: Status, Assignee Email, Due Date, Notes'],
      ['2. Do NOT edit: Task ID, Title, Type (required for matching)'],
      ['3. Valid Status values: todo  |  in_progress  |  done'],
      ['4. Due Date format: YYYY-MM-DD (e.g. 2026-12-31)'],
      ['5. Assignee Email must match an existing organisation member'],
      ['6. Save file and upload via the Import button'],
      [''],
      ['NOTES:'],
      ['- Rows with a blank Task ID are skipped'],
      ['- Invalid rows are skipped and listed in the results summary'],
      ['- Completed At is set automatically when Status = done'],
    ];

    const date = new Date().toISOString().slice(0, 10);
    setExporting(true);
    try {
      await downloadSpreadsheet(`aeternumally-tasks-${date}.xlsx`, [
        {
          name: 'Tasks',
          rows: [headers, ...rows],
          columnWidths: [36, 40, 60, 10, 12, 10, 28, 12, 15, 12, 40, 12, 12],
        },
        { name: 'Instructions', rows: instructions, columnWidths: [80] },
      ]);
    } catch (err: any) {
      setImportResult({
        success: 0,
        failed: 0,
        errors: [{ row: 0, taskId: '', error: err?.message ?? 'Export failed' }],
      });
    } finally {
      setExporting(false);
    }
  };

  // ── Import ──────────────────────────────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const result = await parseAndApplyImport(file, tasks, members, orgId);
      await load();
      setImportResult(result);
    } catch (err: any) {
      setImportResult({ success: 0, failed: 0, errors: [{ row: 0, taskId: '', error: err?.message ?? 'Unknown error' }] });
    } finally {
      setImporting(false);
    }
  };

  const cycleStatus = async (task: Task) => {
    const next = STATUS_CYCLE[task.status];
    const updated = await upsertTask(orgId, { ...task, status: next });
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return;
    await deleteTask(id, orgId);
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const toggleNote = (id: string, currentNote: string | null) => {
    setExpandedNotes(prev => {
      const n = new Set(prev);
      if (n.has(id)) { n.delete(id); } else {
        n.add(id);
        setNoteDrafts(d => ({ ...d, [id]: currentNote ?? '' }));
      }
      return n;
    });
  };

  const saveNote = async (task: Task) => {
    const draft = noteDrafts[task.id] ?? task.notes ?? '';
    if (draft === (task.notes ?? '')) return; // no change
    const updated = await upsertTask(orgId, { ...task, notes: draft || null });
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
  };

  const handleAssign = async (task: Task, memberId: string | null) => {
    const now = new Date().toISOString();
    const updated = await upsertTask(orgId, {
      ...task,
      assignee_id: memberId,              // organization_members.id
      assigned_by: memberId ? currentUserId : null, // auth.users.id
      assigned_at: memberId ? now : null,
    });
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
  };

  // The current user's member row id (for "pick up")
  const currentMemberId = members.find(m => m.user_id === currentUserId)?.id ?? null;

  // Pick up = assign to self using this user's member row id
  const handlePickUp = (task: Task) => {
    if (!currentMemberId) return;
    handleAssign(task, currentMemberId);
  };

  const filtered = sortTasks(
    tasks.filter(t =>
      (filterStatus === 'all' || t.status === filterStatus) &&
      (filterType === 'all' || t.type === filterType) &&
      (!onlyMyTasks || t.assignee_id === currentMemberId),
    ),
    sortBy,
  );

  const stats = {
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  };

  // assignee_id references organization_members.id (the row UUID)
  const memberByMemberId = (memberId: string | null) =>
    memberId ? members.find(m => m.id === memberId) : null;
  // assigned_by references auth.users.id
  const memberByUserId = (userId: string | null) =>
    userId ? members.find(m => m.user_id === userId) : null;

  const assigneeName = (memberId: string | null) =>
    memberByMemberId(memberId)?.email ?? (memberId ? '…' : null);
  const assignedByName = (userId: string | null) =>
    memberByUserId(userId)?.email ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-esg-500" />
        <span className="ml-2 text-slate-500">Loading tasks…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(stats) as [TaskStatus, number][]).map(([status, count]) => {
          const m = STATUS_META[status];
          return (
            <div key={status} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
              <span className={m.color}>{m.icon}</span>
              <div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{count}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{m.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters + sort + add */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <select
          className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none"
          value={onlyMyTasks ? 'mine' : 'all'}
          onChange={e => setOnlyMyTasks(e.target.value === 'mine')}
        >
          <option value="all">All tasks</option>
          <option value="mine">Only my tasks</option>
        </select>
        <select
          className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as any)}
        >
          <option value="all">All statuses</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <select
          className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none"
          value={filterType}
          onChange={e => setFilterType(e.target.value as any)}
        >
          <option value="all">All types</option>
          <option value="fix">Fix</option>
          <option value="comply">Comply</option>
          <option value="improve">Improve</option>
        </select>
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <select
            className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as ManagerSort)}
          >
            <option value="created">Newest first</option>
            <option value="priority">Priority</option>
            <option value="status">Status</option>
            <option value="due_date">Due Date</option>
          </select>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => void handleExport()}
          disabled={tasks.length === 0 || exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 text-sm font-medium rounded-lg transition-colors"
          title="Export tasks to Excel"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 text-sm font-medium rounded-lg transition-colors"
          title="Import tasks from Excel or CSV"
        >
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-esg-600 hover:bg-esg-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />Add Task
        </button>
        <button
          onClick={load}
          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Import results */}
      {importResult && (
        <ImportResultsBanner result={importResult} onClose={() => setImportResult(null)} />
      )}

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <CheckCircle className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-4" />
          <p className="font-semibold text-slate-700 dark:text-slate-200 text-base">No tasks yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-5 max-w-xs">
            Let AI analyse your DMA quality checks and material topics to suggest an action plan.
          </p>
          <button
            onClick={onGoToGenerator}
            className="flex items-center gap-2 px-4 py-2 bg-esg-600 hover:bg-esg-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <CheckCircle className="w-4 h-4" />Go to Generator
          </button>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
            Or add a task manually using the button above.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const sm = STATUS_META[task.status];
            const noteExpanded = expandedNotes.has(task.id);
            const noteDraft = noteDrafts[task.id] ?? task.notes ?? '';
            const taskAssigneeName = assigneeName(task.assignee_id);
            const taskAssignedByName = assignedByName(task.assigned_by);
            const isSelfAssigned = currentMemberId != null && task.assignee_id === currentMemberId;

            return (
              <div
                key={task.id}
                id={`task-${task.id}`}
                className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 transition-opacity ${task.status === 'done' ? 'opacity-60' : ''}`}
              >
                {/* Main row */}
                <div className="p-4 flex items-start gap-3">
                  {/* Status toggle */}
                  <button
                    onClick={() => cycleStatus(task)}
                    className={`mt-0.5 flex-shrink-0 ${sm.color} hover:scale-110 transition-transform`}
                    title={`Status: ${sm.label} — click to advance`}
                  >
                    {sm.icon}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium text-sm ${task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800 dark:text-white'}`}>
                        {task.title}
                      </span>
                      <TypeBadge type={task.type} />
                      <PriorityDot priority={task.priority} />
                      {task.esrs_ref && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-mono">
                          {task.esrs_ref}
                        </span>
                      )}
                      <span onClick={e => e.stopPropagation()}>
                        <EvidenceBadge
                          linkedToType="task"
                          linkedToId={task.id}
                          orgId={orgId}
                          currentUserId={currentUserId}
                        />
                      </span>
                    </div>

                    {task.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{task.description}</p>
                    )}

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                      {/* Assignee selector — value uses organization_members.id */}
                      <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <User className="w-3 h-3" />
                        <select
                          className="bg-transparent outline-none cursor-pointer hover:text-esg-600 dark:hover:text-esg-400 transition-colors max-w-[140px] truncate"
                          value={task.assignee_id ?? ''}
                          onChange={e => handleAssign(task, e.target.value || null)}
                        >
                          <option value="">Unassigned</option>
                          {members.map(m => (
                            <option key={m.id} value={m.id}>{m.email ?? m.user_id}</option>
                          ))}
                        </select>
                        {/* "Pick up" shortcut for unassigned tasks */}
                        {!task.assignee_id && currentMemberId && (
                          <button
                            onClick={() => handlePickUp(task)}
                            className="ml-1 flex items-center gap-0.5 text-xs text-esg-500 hover:text-esg-700 dark:text-esg-400 transition-colors font-medium"
                            title="Assign to me"
                          >
                            <UserPlus className="w-3 h-3" />Pick up
                          </button>
                        )}
                      </div>

                      {/* Assignment audit trail */}
                      {task.assigned_by && task.assigned_at && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          by {taskAssignedByName ?? '…'} · {new Date(task.assigned_at).toLocaleDateString()}
                        </span>
                      )}

                      {task.due_date && (
                        <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                          <CalendarDays className="w-3 h-3" />{new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}

                      {/* Source link — navigates back to the inspiring record */}
                      {task.source_type && task.source_type !== 'manual' && (
                        <SourceLink
                          sourceType={task.source_type}
                          sourceId={task.source_id}
                          esrsRef={task.esrs_ref}
                          onNavigateToDMARecord={onNavigateToDMARecord}
                          onNavigateToInsightHub={onNavigateToInsightHub}
                          onNavigateToKPI={onNavigateToKPI}
                          kpis={kpis}
                        />
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleNote(task.id, task.notes)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        noteExpanded || task.notes
                          ? 'text-esg-500 dark:text-esg-400 bg-esg-50 dark:bg-esg-900/20'
                          : 'text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400'
                      }`}
                      title={noteExpanded ? 'Hide notes' : 'Add / view notes'}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Notes panel — expands inline */}
                {noteExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700 pt-3">
                    <textarea
                      className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-esg-500 resize-none placeholder:text-slate-400"
                      rows={3}
                      placeholder="Add notes, links, context… (saved on blur)"
                      value={noteDraft}
                      onChange={e => setNoteDrafts(d => ({ ...d, [task.id]: e.target.value }))}
                      onBlur={() => saveNote(task)}
                    />
                    {task.notes && noteDraft === task.notes && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Saved</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <AddTaskModal
          orgId={orgId}
          members={members}
          onClose={() => setShowAddModal(false)}
          onSaved={(task) => { setTasks(prev => [task, ...prev]); setShowAddModal(false); }}
        />
      )}

      <DismissedSuggestionsPanel orgId={orgId} currentUserId={currentUserId} />
    </div>
  );
};

// ── Import helpers + result UI ────────────────────────────────────────────────

interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; taskId: string; error: string }>;
}

async function parseAndApplyImport(
  file: File,
  existingTasks: Task[],
  members: OrgMember[],
  orgId: string,
): Promise<ImportResult> {
  const rows = await parseSpreadsheetFile(file);

  const required = ['Task ID', 'Status'];
  const missing = required.filter(c => !Object.keys(rows[0] ?? {}).includes(c));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`);

  const taskById = new Map(existingTasks.map(t => [t.id, t]));
  const memberByEmail = new Map(members.map(m => [m.email.toLowerCase(), m]));

  const result: ImportResult = { success: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const taskId = String(row['Task ID'] ?? '').trim();
    if (!taskId) continue;

    const existing = taskById.get(taskId);
    if (!existing) {
      result.failed++;
      result.errors.push({ row: rowNum, taskId, error: 'Task ID not found' });
      continue;
    }

    try {
      const rawStatus = String(row['Status'] ?? '').trim().toLowerCase();
      const validStatuses: TaskStatus[] = ['todo', 'in_progress', 'done'];
      if (rawStatus && !validStatuses.includes(rawStatus as TaskStatus))
        throw new Error(`Invalid status "${row['Status']}" — use: todo, in_progress, done`);

      const rawDate = String(row['Due Date'] ?? '').trim();
      if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate))
        throw new Error(`Invalid date "${rawDate}" — use YYYY-MM-DD`);

      let assigneeId: string | null = existing.assignee_id;
      const rawEmail = String(row['Assignee Email'] ?? '').trim().toLowerCase();
      if (rawEmail) {
        const member = memberByEmail.get(rawEmail);
        if (!member) throw new Error(`Assignee not found: ${rawEmail}`);
        assigneeId = member.id;
      } else if (row['Assignee Email'] === '') {
        assigneeId = null;
      }

      const status = (rawStatus || existing.status) as TaskStatus;
      const completedAt = status === 'done' && existing.status !== 'done'
        ? new Date().toISOString()
        : status !== 'done' ? null : existing.completed_at;

      await upsertTask(orgId, {
        ...existing,
        status,
        assignee_id: assigneeId,
        due_date: rawDate || existing.due_date,
        notes: row['Notes'] !== undefined && String(row['Notes']).trim() !== ''
          ? String(row['Notes']).trim()
          : existing.notes,
        completed_at: completedAt,
      });

      result.success++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ row: rowNum, taskId, error: err?.message ?? 'Update failed' });
    }
  }

  return result;
}

const ImportResultsBanner: React.FC<{ result: ImportResult; onClose: () => void }> = ({ result, onClose }) => {
  const [showErrors, setShowErrors] = useState(false);
  const allOk = result.failed === 0;

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${allOk ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {allOk
            ? <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            : <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />}
          <div>
            <p className={`font-semibold text-sm ${allOk ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>
              Import complete — {result.success} updated{result.failed > 0 ? `, ${result.failed} failed` : ''}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {result.errors.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowErrors(v => !v)}
            className="text-xs text-amber-700 dark:text-amber-400 underline"
          >
            {showErrors ? 'Hide' : 'Show'} {result.errors.length} error{result.errors.length > 1 ? 's' : ''}
          </button>
          {showErrors && (
            <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5 pl-4 list-disc">
              {result.errors.map((e, i) => (
                <li key={i}>
                  {e.row > 0 ? `Row ${e.row}` : 'File'}{e.taskId ? ` (${e.taskId.slice(0, 8)}…)` : ''}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

// ── Dismissed Suggestions Panel ───────────────────────────────────────────────

const DismissedSuggestionsPanel: React.FC<{ orgId: string; currentUserId: string }> = ({ orgId, currentUserId }) => {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<SuggestedTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchDismissedSuggestedTasks(orgId)
      .then(setDismissed)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, orgId]);

  const handleRestore = async (id: string) => {
    setBusy(id);
    try {
      await restoreSuggestedTask(id);
      setDismissed(prev => prev.filter(t => t.id !== id));
    } catch {}
    setBusy(null);
  };

  return (
    <div className="mt-6 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Dismissed Suggestions
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : dismissed.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
              No dismissed suggestions.
            </p>
          ) : (
            <div className="space-y-2">
              {dismissed.map(task => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{task.title}</p>
                    {task.esrs_ref && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">{task.esrs_ref}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busy === task.id}
                    onClick={() => handleRestore(task.id)}
                    className="flex-shrink-0 flex items-center gap-1 px-3 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Add Task Modal ────────────────────────────────────────────────────────────

interface AddTaskModalProps {
  orgId: string;
  members: OrgMember[];
  onClose: () => void;
  onSaved: (task: Task) => void;
}

const AddTaskModal: React.FC<AddTaskModalProps> = ({ orgId, members, onClose, onSaved }) => {
  const [form, setForm] = useState({
    title: '',
    description: '',
    notes: '',
    type: 'comply' as TaskType,
    priority: 'medium' as TaskPriority,
    due_date: '',
    assignee_id: '',
    esrs_ref: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const task = await upsertTask(orgId, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        type: form.type,
        status: 'todo',
        priority: form.priority,
        due_date: form.due_date || null,
        assignee_id: form.assignee_id || null,
        esrs_ref: form.esrs_ref.trim() || null,
        source_type: 'manual',
      });
      onSaved(task);
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-800 dark:text-white">Add Task</h3>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Title *</label>
            <input
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-esg-500"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Task title"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Description</label>
            <textarea
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-esg-500 resize-none"
              rows={2}
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Notes</label>
            <textarea
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-esg-500 resize-none"
              rows={2}
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Links, context, references… (optional)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Type</label>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none"
                value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value as TaskType }))}
              >
                <option value="fix">Fix</option>
                <option value="comply">Comply</option>
                <option value="improve">Improve</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Priority</label>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none"
                value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: e.target.value as TaskPriority }))}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Assignee</label>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none"
                value={form.assignee_id}
                onChange={e => setForm(p => ({ ...p, assignee_id: e.target.value }))}
              >
                <option value="">Unassigned</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.email ?? m.user_id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Due Date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none"
                value={form.due_date}
                onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">ESRS Reference</label>
            <input
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-esg-500"
              value={form.esrs_ref}
              onChange={e => setForm(p => ({ ...p, esrs_ref: e.target.value }))}
              placeholder="e.g. ESRS E1-6"
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-esg-600 hover:bg-esg-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Add Task'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const TaskManagement: React.FC<Props> = ({
  orgId, assessments, kpis, swotData, profile, cachedInsight,
  members, currentUserId, isSidebarCollapsed, targetTaskId,
  onNavigateToInsightHub, onNavigateToDMARecord, onNavigateToKPI,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('manager');
  const [managerRefresh, setManagerRefresh] = useState(0);

  return (
    <div className={`mx-auto space-y-6 transition-all duration-300 ${isSidebarCollapsed ? 'max-w-7xl' : 'max-w-5xl'}`}>
      {/* Tab bar — Manager first (left), Generator second (right) */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
        <button
          onClick={() => setActiveTab('manager')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'manager'
              ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <ListChecks className="w-4 h-4" />Manager
        </button>
        <button
          onClick={() => setActiveTab('generator')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'generator'
              ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4" />Generator
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'generator' && (
        <GeneratorTab
          orgId={orgId}
          assessments={assessments}
          kpis={kpis}
          swotData={swotData}
          profile={profile}
          cachedInsight={cachedInsight}
          members={members}
          currentUserId={currentUserId}
          onNavigateToInsightHub={onNavigateToInsightHub}
          onNavigateToDMARecord={onNavigateToDMARecord}
          onNavigateToKPI={onNavigateToKPI}
          onTasksCreated={() => setManagerRefresh(n => n + 1)}
        />
      )}
      {activeTab === 'manager' && (
        <ManagerTab
          orgId={orgId}
          members={members}
          currentUserId={currentUserId}
          refreshTrigger={managerRefresh}
          onGoToGenerator={() => setActiveTab('generator')}
          onNavigateToDMARecord={onNavigateToDMARecord}
          onNavigateToInsightHub={onNavigateToInsightHub}
          onNavigateToKPI={onNavigateToKPI}
          targetTaskId={targetTaskId}
          kpis={kpis}
        />
      )}
    </div>
  );
};

export default TaskManagement;
