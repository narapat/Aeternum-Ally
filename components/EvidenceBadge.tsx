/**
 * EvidenceBadge.tsx
 *
 * Ambient badge that shows evidence count for any entity (assessment / kpi /
 * task / emission_entry) and opens a full evidence management modal on click.
 *
 * Usage:
 *   <EvidenceBadge
 *     linkedToType="assessment"
 *     linkedToId={assessment.id}
 *     orgId={orgId}
 *     currentUserId={userId}
 *   />
 *
 * Performance: each badge fetches its own count on mount.
 * For lists (10+ items) prefer passing `initialCount` from a parent that
 * calls batchCountEvidence() once and distributes the results.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Paperclip, ExternalLink, Trash2, Plus, X, Link, Loader2, FileText, Image, File, AlertCircle, ChevronLeft } from 'lucide-react';
import {
  fetchEvidence,
  countEvidence,
  linkExternalEvidence,
  deleteEvidence,
} from '../services/evidenceService';
import {
  isGoogleDriveConfigured,
  getGoogleDriveStatus,
  getGoogleDriveAccessToken,
  connectGoogleDrive,
  openGooglePicker,
  mimeToExtension,
} from '../services/googleDriveService';
import { supabase } from '../lib/supabaseClient';
import { EvidenceAttachment, EvidenceLinkedToType, StorageType } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  linkedToType:   EvidenceLinkedToType;
  linkedToId:     string;
  orgId:          string;
  currentUserId:  string;
  /** Pre-loaded count from a parent's batchCountEvidence call — skips initial fetch */
  initialCount?:  number;
}

type AddMethod = 'url' | 'google_drive' | 'onedrive';
type ModalView = 'list' | 'add_method' | 'add_url' | 'add_drive';

const STORAGE_ICONS: Record<StorageType, React.ReactNode> = {
  google_drive:     <span className="text-blue-500">▲</span>,
  onedrive:         <span className="text-blue-600">☁</span>,
  dropbox:          <span className="text-blue-700">◆</span>,
  url:              <Link className="w-3.5 h-3.5 text-slate-400" />,
  supabase_storage: <FileText className="w-3.5 h-3.5 text-violet-500" />,
  s3:               <File className="w-3.5 h-3.5 text-orange-500" />,
};

function fileIcon(fileType: string | null): React.ReactNode {
  const t = (fileType ?? '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(t)) return <Image className="w-4 h-4 text-pink-500" />;
  if (t === 'pdf') return <FileText className="w-4 h-4 text-red-500" />;
  return <File className="w-4 h-4 text-slate-400" />;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

// ─────────────────────────────────────────────────────────────────────────────
// EvidenceBadge
// ─────────────────────────────────────────────────────────────────────────────

const EvidenceBadge: React.FC<Props> = ({
  linkedToType, linkedToId, orgId, currentUserId, initialCount,
}) => {
  const [count, setCount]         = useState<number>(initialCount ?? 0);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (initialCount !== undefined) { setCount(initialCount); return; }
    countEvidence(orgId, linkedToType, linkedToId)
      .then(setCount)
      .catch(() => {/* silent */});
  }, [orgId, linkedToType, linkedToId, initialCount]);

  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setShowModal(true); }}
        title={count === 0 ? 'Add evidence' : `${count} evidence file${count !== 1 ? 's' : ''}`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors
          ${count > 0
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/60'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
      >
        <Paperclip className="w-3 h-3" />
        {count > 0 ? count : '+'}
      </button>

      {showModal && createPortal(
        <EvidenceModal
          linkedToType={linkedToType}
          linkedToId={linkedToId}
          orgId={orgId}
          currentUserId={currentUserId}
          onClose={() => setShowModal(false)}
          onCountChanged={setCount}
        />,
        document.body,
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// EvidenceModal
// ─────────────────────────────────────────────────────────────────────────────

interface ModalProps {
  linkedToType:    EvidenceLinkedToType;
  linkedToId:      string;
  orgId:           string;
  currentUserId:   string;
  onClose:         () => void;
  onCountChanged:  (n: number) => void;
}

const EvidenceModal: React.FC<ModalProps> = ({
  linkedToType, linkedToId, orgId, currentUserId, onClose, onCountChanged,
}) => {
  const [view, setView]               = useState<ModalView>('list');
  const [items, setItems]             = useState<EvidenceAttachment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Google Drive state
  const [driveConfigured]             = useState(isGoogleDriveConfigured);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveCheckDone, setDriveCheckDone] = useState(false);

  // ── Load evidence list ───────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEvidence(orgId, linkedToType, linkedToId);
      setItems(data);
      onCountChanged(data.length);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load evidence.');
    } finally {
      setLoading(false);
    }
  }, [orgId, linkedToType, linkedToId, onCountChanged]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ── Check Google Drive connection status ─────────────────────────────────
  useEffect(() => {
    if (!driveConfigured) { setDriveCheckDone(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) { setDriveCheckDone(true); return; }
      getGoogleDriveStatus(orgId, token)
        .then(setDriveConnected)
        .catch(() => {})
        .finally(() => setDriveCheckDone(true));
    });
  }, [orgId, driveConfigured]);

  // ── Delete an item ────────────────────────────────────────────────────────
  const handleDelete = async (item: EvidenceAttachment) => {
    if (!window.confirm(`Remove "${item.file_name}" from evidence?`)) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      await deleteEvidence(item.id, orgId, item.storage_type, token);
      await loadItems();
    } catch (e: any) {
      setError(e?.message ?? 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  // ── Google Drive picker ───────────────────────────────────────────────────
  const handlePickFromDrive = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const supaToken = data.session?.access_token ?? '';
      const driveToken = await getGoogleDriveAccessToken(orgId, supaToken);
      const file = await openGooglePicker(driveToken);
      if (!file) { setBusy(false); return; }
      // Pre-fill and show the link form so user can add notes
      setDriveFile(file);
      setView('add_drive');
    } catch (e: any) {
      setError(e?.message ?? 'Could not open Google Drive picker.');
    } finally {
      setBusy(false);
    }
  };

  const [driveFile, setDriveFile] = useState<{
    id: string; name: string; url: string; mimeType: string; sizeBytes: number | null;
  } | null>(null);

  // ── Navigate back ─────────────────────────────────────────────────────────
  const back = () => { setView('list'); setError(null); };

  const entityLabel =
    linkedToType === 'assessment' ? 'Assessment'
    : linkedToType === 'kpi'      ? 'KPI'
    : linkedToType === 'task'     ? 'Task'
    : 'Emission Entry';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            {view !== 'list' && (
              <button onClick={back} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <Paperclip className="w-4 h-4 text-blue-500" />
            <h3 className="font-bold text-slate-800 dark:text-white text-sm">
              Evidence — {entityLabel}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
              <button className="ml-auto text-red-400 hover:text-red-600" onClick={() => setError(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* LIST VIEW */}
          {view === 'list' && (
            loading ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8">
                <Paperclip className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">No evidence yet</p>
                <p className="text-slate-400 dark:text-slate-500 text-xs mb-4">Link files from Google Drive, OneDrive, or paste a URL.</p>
                <button
                  onClick={() => setView('add_method')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  + Add First Evidence
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <EvidenceItem
                    key={item.id}
                    item={item}
                    onDelete={() => handleDelete(item)}
                    busy={busy}
                  />
                ))}
              </div>
            )
          )}

          {/* METHOD PICKER */}
          {view === 'add_method' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">Choose how to add evidence:</p>

              <MethodCard
                icon="📁"
                title="Link from Google Drive"
                subtitle={
                  !driveConfigured
                    ? 'Google Drive not configured on this server'
                    : !driveCheckDone
                    ? 'Checking connection…'
                    : driveConnected
                    ? 'Your Drive is connected'
                    : 'Connect Drive first'
                }
                disabled={!driveConfigured || !driveConnected}
                badge={!driveConfigured || !driveConnected ? (
                  driveConfigured && !driveConnected ? (
                    <button
                      className="text-xs text-blue-500 hover:underline"
                      onClick={() => connectGoogleDrive(orgId, currentUserId)}
                    >
                      Connect
                    </button>
                  ) : undefined
                ) : undefined}
                onClick={handlePickFromDrive}
              />

              <MethodCard
                icon="🔗"
                title="Paste a URL"
                subtitle="Link to any web page, document, or resource"
                onClick={() => setView('add_url')}
              />

              <MethodCard
                icon="📤"
                title="Upload File"
                subtitle="Direct upload — Pro tier only"
                disabled
                badge={<span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded font-medium">Pro</span>}
              />
            </div>
          )}

          {/* URL FORM */}
          {view === 'add_url' && (
            <URLForm
              linkedToType={linkedToType}
              linkedToId={linkedToId}
              orgId={orgId}
              userId={currentUserId}
              onSaved={() => { back(); loadItems(); }}
              onError={setError}
            />
          )}

          {/* GOOGLE DRIVE CONFIRM */}
          {view === 'add_drive' && driveFile && (
            <DriveConfirmForm
              driveFile={driveFile}
              linkedToType={linkedToType}
              linkedToId={linkedToId}
              orgId={orgId}
              userId={currentUserId}
              onSaved={() => { back(); loadItems(); }}
              onError={setError}
            />
          )}
        </div>

        {/* Footer */}
        {view === 'list' && items.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
            <button
              onClick={() => setView('add_method')}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add More Evidence
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const EvidenceItem: React.FC<{
  item: EvidenceAttachment;
  onDelete: () => void;
  busy: boolean;
}> = ({ item, onDelete, busy }) => (
  <div className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 group">
    <div className="flex-shrink-0 mt-0.5">{fileIcon(item.file_type)}</div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-medium text-sm text-slate-800 dark:text-white truncate max-w-[240px]">
          {item.file_name}
        </span>
        {item.file_type && (
          <span className="text-xs text-slate-400 uppercase font-mono">{item.file_type}</span>
        )}
        <span className="flex-shrink-0">{STORAGE_ICONS[item.storage_type]}</span>
      </div>
      {item.file_size_mb != null && (
        <p className="text-xs text-slate-400">{item.file_size_mb.toFixed(1)} MB</p>
      )}
      {item.notes && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 italic">{item.notes}</p>
      )}
      <p className="text-xs text-slate-400 mt-0.5">Added {fmtDate(item.uploaded_at)}</p>
    </div>
    <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {(item.external_url || item.storage_path) && (
        <a
          href={item.external_url ?? `/.netlify/functions/evidence/download/${item.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-500 transition-colors"
          title="Open file"
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
      <button
        onClick={onDelete}
        disabled={busy}
        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
        title="Remove evidence"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);

const MethodCard: React.FC<{
  icon: string;
  title: string;
  subtitle: string;
  disabled?: boolean;
  badge?: React.ReactNode;
  onClick?: () => void;
}> = ({ icon, title, subtitle, disabled, badge, onClick }) => (
  <button
    onClick={!disabled ? onClick : undefined}
    disabled={disabled}
    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all
      ${disabled
        ? 'border-slate-200 dark:border-slate-700 opacity-50 cursor-not-allowed'
        : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer'
      }`}
  >
    <span className="text-2xl">{icon}</span>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-slate-800 dark:text-white">{title}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
    </div>
    {badge}
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// URL Form
// ─────────────────────────────────────────────────────────────────────────────

const URLForm: React.FC<{
  linkedToType: EvidenceLinkedToType;
  linkedToId:   string;
  orgId:        string;
  userId:       string;
  onSaved:      () => void;
  onError:      (msg: string) => void;
}> = ({ linkedToType, linkedToId, orgId, userId, onSaved, onError }) => {
  const [url,      setUrl]      = useState('');
  const [name,     setName]     = useState('');
  const [fileType, setFileType] = useState('');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);

  const handleSave = async () => {
    if (!url.trim() || !name.trim()) return;
    setSaving(true);
    try {
      await linkExternalEvidence(orgId, {
        file_name:      name.trim(),
        file_type:      fileType.trim() || undefined,
        storage_type:   'url',
        external_url:   url.trim(),
        linked_to_type: linkedToType,
        linked_to_id:   linkedToId,
        notes:          notes.trim() || undefined,
      }, userId);
      onSaved();
    } catch (e: any) {
      onError(e?.message ?? 'Failed to save evidence.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <FormField label="URL *">
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://docs.google.com/…"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </FormField>
      <FormField label="File / Link name *">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g., Carbon Audit Report 2025"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </FormField>
      <FormField label="File type (optional)">
        <input
          value={fileType}
          onChange={e => setFileType(e.target.value)}
          placeholder="e.g., pdf, xlsx, docx"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </FormField>
      <FormField label="Notes (optional)">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any additional context…"
          rows={2}
          className="form-input resize-none"
        />
      </FormField>
      <button
        onClick={handleSave}
        disabled={!url.trim() || !name.trim() || saving}
        className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Save Evidence
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Google Drive Confirm Form (pre-fills from picker selection)
// ─────────────────────────────────────────────────────────────────────────────

const DriveConfirmForm: React.FC<{
  driveFile:    { id: string; name: string; url: string; mimeType: string; sizeBytes: number | null };
  linkedToType: EvidenceLinkedToType;
  linkedToId:   string;
  orgId:        string;
  userId:       string;
  onSaved:      () => void;
  onError:      (msg: string) => void;
}> = ({ driveFile, linkedToType, linkedToId, orgId, userId, onSaved, onError }) => {
  const [name,   setName]   = useState(driveFile.name);
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);

  const sizeMb = driveFile.sizeBytes != null ? driveFile.sizeBytes / (1024 * 1024) : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await linkExternalEvidence(orgId, {
        file_name:      name.trim() || driveFile.name,
        file_type:      mimeToExtension(driveFile.mimeType) || undefined,
        file_size_mb:   sizeMb != null ? Math.round(sizeMb * 100) / 100 : undefined,
        storage_type:   'google_drive',
        external_url:   driveFile.url,
        external_id:    driveFile.id,
        linked_to_type: linkedToType,
        linked_to_id:   linkedToId,
        notes:          notes.trim() || undefined,
      }, userId);
      onSaved();
    } catch (e: any) {
      onError(e?.message ?? 'Failed to save Drive evidence.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
        <span className="text-lg flex-shrink-0">📁</span>
        <div>
          <p className="font-medium">{driveFile.name}</p>
          {sizeMb != null && (
            <p className="text-xs opacity-75">{sizeMb.toFixed(1)} MB · {mimeToExtension(driveFile.mimeType).toUpperCase()}</p>
          )}
        </div>
      </div>

      <FormField label="Display name">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </FormField>

      <FormField label="Notes (optional)">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any additional context…"
          rows={2}
          className="form-input resize-none"
        />
      </FormField>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Link to Drive File
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FormField helper
// ─────────────────────────────────────────────────────────────────────────────

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
    {children}
  </div>
);

export default EvidenceBadge;
