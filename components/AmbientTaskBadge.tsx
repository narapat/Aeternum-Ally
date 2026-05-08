
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { SuggestedTask, TaskType, TaskPriority } from '../types';
import { promoteSuggestedTask, dismissSuggestedTask } from '../services/dbService';

// ─────────────────────────────────────────────────────────────────────────────
// Badge
// ─────────────────────────────────────────────────────────────────────────────

interface AmbientTaskBadgeProps {
  tasks: SuggestedTask[];
  orgId: string;
  currentUserId: string;
  onChanged: () => void;
}

const AmbientTaskBadge: React.FC<AmbientTaskBadgeProps> = ({ tasks, orgId, currentUserId, onChanged }) => {
  const [showModal, setShowModal] = useState(false);

  const active = tasks.filter(t => !t.dismissed && !t.converted_to_task_id);
  if (active.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setShowModal(true); }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700 hover:bg-violet-200 dark:hover:bg-violet-800/60 transition-colors cursor-pointer whitespace-nowrap"
        title="View AI-suggested tasks"
      >
        <Sparkles className="w-3 h-3" />
        {active.length} AI Task{active.length > 1 ? 's' : ''}
      </button>

      {showModal && createPortal(
        <SuggestedTasksModal
          tasks={active}
          orgId={orgId}
          currentUserId={currentUserId}
          onClose={() => setShowModal(false)}
          onChanged={() => { onChanged(); setShowModal(false); }}
        />,
        document.body
      )}
    </>
  );
};

export default AmbientTaskBadge;

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

interface ModalProps {
  tasks: SuggestedTask[];
  orgId: string;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}

const TYPE_LABELS: Record<TaskType, { label: string; color: string }> = {
  fix:     { label: 'Fix',     color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  comply:  { label: 'Comply',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  improve: { label: 'Improve', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
};

const PRIORITY_ICONS: Record<TaskPriority, React.ReactNode> = {
  high:   <AlertCircle className="w-3 h-3 text-red-500" />,
  medium: <Clock className="w-3 h-3 text-amber-500" />,
  low:    <CheckCircle className="w-3 h-3 text-slate-400" />,
};

const SuggestedTasksModal: React.FC<ModalProps> = ({ tasks, orgId, currentUserId, onClose, onChanged }) => {
  const [busy, setBusy] = useState<string | null>(null);

  const handleCreate = async (task: SuggestedTask) => {
    setBusy(task.id);
    try {
      await promoteSuggestedTask(orgId, task);
      onChanged();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setBusy(null);
    }
  };

  const handleDismiss = async (task: SuggestedTask) => {
    setBusy(task.id);
    try {
      await dismissSuggestedTask(task.id, currentUserId);
      onChanged();
    } catch (err) {
      console.error('Failed to dismiss task:', err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <h3 className="font-bold text-slate-900 dark:text-white">AI-Suggested Tasks</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Generated but not yet created — review and accept or dismiss.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Task list */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {tasks.map(task => {
            const typeCfg = TYPE_LABELS[task.type] ?? TYPE_LABELS.improve;
            const isBusy = busy === task.id;

            return (
              <div
                key={task.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 space-y-2"
              >
                {/* Type + priority row */}
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${typeCfg.color}`}>
                    {typeCfg.label}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 capitalize">
                    {PRIORITY_ICONS[task.priority]}
                    {task.priority}
                  </span>
                  {task.esrs_ref && (
                    <span className="ml-auto text-[10px] font-mono text-slate-400 dark:text-slate-500">
                      {task.esrs_ref}
                    </span>
                  )}
                </div>

                {/* Title */}
                <p className="font-semibold text-sm text-slate-800 dark:text-white leading-snug">
                  {task.title}
                </p>

                {/* Description */}
                {task.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                    {task.description}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleCreate(task)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Create Task
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDismiss(task)}
                    className="px-3 py-1.5 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-500 dark:text-slate-400 text-xs font-medium rounded-lg transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
