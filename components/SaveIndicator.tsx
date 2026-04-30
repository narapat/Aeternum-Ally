import React from "react";
import { Loader2, CheckCircle2, AlertCircle, Save } from "lucide-react";
import type { SaveStatus } from "../hooks/useOrgData";

interface Props {
  status: SaveStatus;
  isDirty: boolean;
  onSave: () => void;
  errorMessage?: string | null;
  /** Show only the status text (no save button). */
  textOnly?: boolean;
}

/** Reusable "Unsaved / Saving / Saved" pill with optional manual Save button. */
const SaveIndicator: React.FC<Props> = ({ status, isDirty, onSave, errorMessage, textOnly }) => {
  return (
    <div className="flex items-center gap-3">
      {status === "saving" && (
        <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
        </span>
      )}
      {status === "saved" && (
        <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" /> Saved
        </span>
      )}
      {status === "error" && (
        <span
          title={errorMessage ?? "Save failed"}
          className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
        >
          <AlertCircle className="w-3.5 h-3.5" /> Save failed
        </span>
      )}
      {status === "idle" && isDirty && (
        <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved changes
        </span>
      )}

      {!textOnly && (
        <button
          type="button"
          onClick={onSave}
          disabled={status === "saving"}
          className="flex items-center gap-2 bg-esg-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-esg-700 transition-colors shadow-sm disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          Save
        </button>
      )}
    </div>
  );
};

export default SaveIndicator;
