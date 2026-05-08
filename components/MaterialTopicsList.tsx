
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { AssessmentData, SuggestedTask } from '../types';
import { Edit2, Trash2, Filter, ArrowUpDown, Layers, CheckCircle2, Circle } from 'lucide-react';
import { fetchSuggestedTasks } from '../services/dbService';
import AmbientTaskBadge from './AmbientTaskBadge';
import EvidenceBadge from './EvidenceBadge';

interface Props {
  assessments: AssessmentData[];
  onEdit: (data: AssessmentData) => void;
  onDelete: (id: string) => void;
  orgId?: string;
  currentUserId?: string;
}

type SortOption = 'score' | 'name';
type GroupOption = 'none' | 'category';

const MaterialTopicsList: React.FC<Props> = ({ assessments, onEdit, onDelete, orgId, currentUserId }) => {
  // Default to TRUE to ensure user sees data immediately after adding
  const [showAll, setShowAll] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('score');
  const [groupBy, setGroupBy] = useState<GroupOption>('category');

  const [suggestedTasks, setSuggestedTasks] = useState<SuggestedTask[]>([]);

  const loadSuggested = useCallback(async () => {
    if (!orgId) return;
    try {
      const tasks = await fetchSuggestedTasks(orgId);
      setSuggestedTasks(tasks.filter(t => t.source_type === 'dma'));
    } catch {}
  }, [orgId]);

  useEffect(() => { loadSuggested(); }, [loadSuggested]);

  // 1. Filter
  const filteredData = useMemo(() => {
    return showAll ? assessments : assessments.filter(a => a.isMaterial);
  }, [assessments, showAll]);

  // 2. Sort
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      if (sortBy === 'score') {
        const maxScoreA = Math.max(a.impactMaterialityValue, a.financialMaterialityValue);
        const maxScoreB = Math.max(b.impactMaterialityValue, b.financialMaterialityValue);
        return maxScoreB - maxScoreA; // Descending
      } else {
        return a.topic.localeCompare(b.topic);
      }
    });
  }, [filteredData, sortBy]);

  // 3. Group
  const groupedData = useMemo<Record<string, AssessmentData[]>>(() => {
    if (groupBy === 'none') return { 'All Topics': sortedData };

    const groups: Record<string, AssessmentData[]> = {
      'Environment (E)': [],
      'Social (S)': [],
      'Governance (G)': [],
    };

    sortedData.forEach(item => {
      if (item.topic.startsWith('E')) groups['Environment (E)'].push(item);
      else if (item.topic.startsWith('S')) groups['Social (S)'].push(item);
      else if (item.topic.startsWith('G')) groups['Governance (G)'].push(item);
      else {
        if (!groups['Other']) groups['Other'] = [];
        groups['Other'].push(item);
      }
    });

    // Remove empty groups
    Object.keys(groups).forEach(key => {
      if (groups[key].length === 0) delete groups[key];
    });

    return groups;
  }, [sortedData, groupBy]);

  if (assessments.length === 0) {
    return (
      <div className="text-center p-8 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
        <p className="text-slate-500 dark:text-slate-400">No assessments recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-full transition-colors">
      {/* Header Controls */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-slate-800 dark:text-white">Assessment List</h3>
          <span className="text-xs font-medium px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-600 dark:text-slate-300">
            {filteredData.length} items
          </span>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 text-sm">
           {/* Filter Toggle */}
           <button 
            onClick={() => setShowAll(!showAll)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors border ${!showAll 
              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-medium'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
           >
              <Filter className="w-3 h-3" />
              {showAll ? "Show All" : "Material Only"}
           </button>

           {/* Sort */}
           <button 
              onClick={() => setSortBy(sortBy === 'score' ? 'name' : 'score')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
           >
              <ArrowUpDown className="w-3 h-3" />
              {sortBy === 'score' ? 'By Score' : 'A-Z'}
           </button>

           {/* Group */}
           <button 
              onClick={() => setGroupBy(groupBy === 'category' ? 'none' : 'category')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border ${groupBy === 'category' 
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 font-medium' 
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
           >
              <Layers className="w-3 h-3" />
              {groupBy === 'category' ? 'Grouped' : 'List'}
           </button>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4 max-h-[500px]">
        {Object.entries(groupedData).map(([groupName, items]) => (
          <div key={groupName} className="space-y-2">
             {groupBy === 'category' && (
                <div className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur px-2 py-1.5 -mx-2 border-y border-slate-100 dark:border-slate-700">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {groupName}
                    </h4>
                </div>
             )}
             {(items as AssessmentData[]).map(item => (
                <TopicItem
                    key={item.id}
                    data={item}
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item.id)}
                    suggestedTasks={orgId ? suggestedTasks.filter(t => t.source_id === item.id) : []}
                    orgId={orgId}
                    currentUserId={currentUserId}
                    onSuggestionsChanged={loadSuggested}
                />
             ))}
          </div>
        ))}
        
        {filteredData.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">
                {showAll ? "No assessments found." : "No material topics found. Switch to 'Show All'."}
            </div>
        )}
      </div>
    </div>
  );
};

const TopicItem: React.FC<{
    data: AssessmentData;
    onEdit: () => void;
    onDelete: () => void;
    suggestedTasks: SuggestedTask[];
    orgId?: string;
    currentUserId?: string;
    onSuggestionsChanged: () => void;
}> = ({ data, onEdit, onDelete, suggestedTasks, orgId, currentUserId, onSuggestionsChanged }) => {
    return (
        <div className={`group relative p-3 rounded-lg border transition-all hover:shadow-md ${data.isMaterial
            ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
            : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 opacity-75'
        }`}>
            <div className="flex justify-between items-start mb-2 pr-20">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h5 className={`font-bold text-sm ${data.isMaterial ? 'text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{data.topic}</h5>
                        {orgId && currentUserId && (
                            <AmbientTaskBadge
                                tasks={suggestedTasks}
                                orgId={orgId}
                                currentUserId={currentUserId}
                                onChanged={onSuggestionsChanged}
                            />
                        )}
                        {orgId && currentUserId && data.id && (
                            <span onClick={e => e.stopPropagation()}>
                                <EvidenceBadge
                                    linkedToType="assessment"
                                    linkedToId={data.id}
                                    orgId={orgId}
                                    currentUserId={currentUserId}
                                />
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{data.impactDescription}</p>
                </div>
            </div>

            {/* Score Bars */}
            <div className="space-y-1.5 mt-3">
                <div className="flex items-center gap-2 text-xs">
                    <span className="w-16 text-slate-500">Impact</span>
                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${data.impactMaterialityValue}%` }} />
                    </div>
                    <span className="w-6 text-right font-medium text-slate-700 dark:text-slate-300">{Math.round(data.impactMaterialityValue)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <span className="w-16 text-slate-500">Financial</span>
                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${data.financialMaterialityValue}%` }} />
                    </div>
                    <span className="w-6 text-right font-medium text-slate-700 dark:text-slate-300">{Math.round(data.financialMaterialityValue)}</span>
                </div>
            </div>

            {/* Badge */}
            <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
                 {data.isMaterial ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" /> Material
                    </span>
                 ) : (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                        <Circle className="w-3 h-3" /> Low Impact
                    </span>
                 )}
            </div>

            {/* Actions */}
            <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-slate-900 pl-2 rounded-l-lg shadow-sm border border-slate-100 dark:border-slate-700">
                <button 
                    onClick={(e) => { e.stopPropagation(); onEdit(); }} 
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition-colors"
                    title="Edit Assessment"
                >
                    <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(); }} 
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                    title="Delete Assessment"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    )
}

export default MaterialTopicsList;
