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

import React, { useState, useEffect, useRef, useCallback, DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { Paperclip, ExternalLink, Trash2, Plus, X, Link, Loader2, FileText, Image, File, AlertCircle, ChevronLeft, UploadCloud, Zap, Search, FolderOpen, RefreshCw } from 'lucide-react';
import {
  fetchEvidence,
  countEvidence,
  linkExternalEvidence,
  deleteEvidence,
  uploadDirectEvidence,
  getStorageQuota,
} from '../services/evidenceService';
import {
  getGoogleDriveStatus,
  connectGoogleDrive,
  listGoogleDriveFiles,
  mimeToExtension,
  type DriveFile,
} from '../services/googleDriveService';
import {
  canAutoLoadEvidencePreview,
  getSafeEvidenceUrl,
  normalizeEvidenceUrl,
  type ExternalEvidenceStorageType,
} from '../services/evidenceUrlSecurity';
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
type ModalView = 'list' | 'add_method' | 'add_url' | 'browse_drive' | 'add_drive' | 'add_upload';

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
  const [driveConfigured, setDriveConfigured] = useState<boolean | null>(null);
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);
  const [driveCanManage, setDriveCanManage] = useState(false);
  const [driveCheckDone, setDriveCheckDone] = useState(false);
  const [driveStatusError, setDriveStatusError] = useState<string | null>(null);

  // Storage quota (fetched lazily when upload view is first opened)
  const [quota, setQuota]             = useState<{ used_mb: number; total_mb: number; available_mb: number } | null>(null);
  const [quotaLoaded, setQuotaLoaded] = useState(false);

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
  const loadDriveStatus = useCallback(async () => {
    setDriveCheckDone(false);
    setDriveStatusError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Please sign in again.');
      const status = await getGoogleDriveStatus(orgId, token);
      setDriveConfigured(status.configured);
      setDriveConnected(status.connected);
      setDriveCanManage(status.canManage);
    } catch (e: any) {
      setDriveConfigured(null);
      setDriveConnected(null);
      setDriveCanManage(false);
      setDriveStatusError(e?.message ?? 'Could not check Google Drive connection.');
    } finally {
      setDriveCheckDone(true);
    }
  }, [orgId]);

  useEffect(() => {
    void loadDriveStatus();
  }, [loadDriveStatus]);

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

  const handleConnectDrive = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Please sign in again.');
      await connectGoogleDrive(orgId, token);
    } catch (e: any) {
      setError(e?.message ?? 'Could not connect Google Drive.');
    } finally {
      setBusy(false);
    }
  };

  const [driveFile, setDriveFile] = useState<DriveFile | null>(null);

  // ── Load storage quota (lazy, on upload view open) ────────────────────────
  const loadQuota = useCallback(async () => {
    if (quotaLoaded) return;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const q = await getStorageQuota(orgId, token);
      setQuota(q);
    } catch {
      // quota unavailable — server will enforce limits
    } finally {
      setQuotaLoaded(true);
    }
  }, [orgId, quotaLoaded]);

  const openUploadView = () => {
    setView('add_upload');
    loadQuota();
  };

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
                  !driveCheckDone
                    ? 'Checking connection…'
                    : driveStatusError
                    ? 'Could not check the Google Drive connection'
                    : !driveConfigured
                    ? 'Google Drive not configured on this server'
                    : driveConnected
                    ? 'Browse files through the secure Drive connection'
                    : driveCanManage
                    ? 'Connect Drive to select a file'
                    : 'Ask an Owner or Admin to connect Drive'
                }
                disabled={Boolean(driveStatusError) || driveConfigured !== true || driveConnected !== true}
                onClick={() => setView('browse_drive')}
              />

              {driveCheckDone && driveStatusError && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{driveStatusError}</span>
                  <button
                    type="button"
                    onClick={() => void loadDriveStatus()}
                    title="Retry Google Drive status"
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-amber-700 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              )}

              {driveCheckDone && driveConfigured && !driveConnected && driveCanManage && (
                <button
                  type="button"
                  onClick={handleConnectDrive}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-blue-300 dark:border-blue-700 text-sm font-medium text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Connect Google Drive
                </button>
              )}

              <MethodCard
                icon="🔗"
                title="Paste a URL"
                subtitle="Link to any web page, document, or resource"
                onClick={() => setView('add_url')}
              />

              <MethodCard
                icon="📤"
                title="Upload File"
                subtitle="Direct upload up to 25 MB — Pro tier"
                badge={<span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded font-medium">Pro</span>}
                onClick={openUploadView}
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

          {/* GOOGLE DRIVE FILE BROWSER */}
          {view === 'browse_drive' && (
            <DriveFilePicker
              orgId={orgId}
              onSelect={file => {
                setDriveFile(file);
                setView('add_drive');
              }}
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

          {/* DIRECT UPLOAD */}
          {view === 'add_upload' && (
            <FileUploadForm
              linkedToType={linkedToType}
              linkedToId={linkedToId}
              orgId={orgId}
              quota={quota}
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

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

const EvidenceItem: React.FC<{
  item: EvidenceAttachment;
  onDelete: () => void;
  busy: boolean;
}> = ({ item, onDelete, busy }) => {
  const ext = (item.file_type ?? '').toLowerCase();
  const isImage = IMAGE_EXTS.has(ext);
  const isPdf   = ext === 'pdf';
  const isExternal = !['supabase_storage', 's3'].includes(item.storage_type);
  const safeExternalUrl = isExternal
    ? getSafeEvidenceUrl(
        item.external_url,
        item.storage_type as ExternalEvidenceStorageType,
      )
    : null;
  const previewUrl = safeExternalUrl
    && canAutoLoadEvidencePreview(item.storage_type as ExternalEvidenceStorageType)
    ? safeExternalUrl
    : null;
  const openUrl = safeExternalUrl
    ?? (item.storage_path ? `/.netlify/functions/evidence/download/${item.id}` : null);
  const blockedExternalUrl = Boolean(item.external_url) && !safeExternalUrl;

  const handleOpen = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
    if (
      item.storage_type === 'url'
      && safeExternalUrl
      && !window.confirm(`Open external website ${new URL(safeExternalUrl).hostname}?`)
    ) {
      event.preventDefault();
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 overflow-hidden group">
      {/* Image preview strip */}
      {isImage && previewUrl && (
        <div className="relative h-24 bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <img
            src={previewUrl}
            alt={item.file_name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
        </div>
      )}
      {isPdf && previewUrl && (
        <div className="h-10 bg-red-50 dark:bg-red-900/20 flex items-center gap-2 px-3">
          <FileText className="w-4 h-4 text-red-500" />
          <span className="text-xs text-red-600 dark:text-red-400 font-medium">PDF Document</span>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-red-500 hover:underline"
            onClick={handleOpen}
          >
            Open ↗
          </a>
        </div>
      )}
      <div className="flex items-start gap-3 p-3">
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
          {blockedExternalUrl && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              Unsafe or invalid external link blocked
            </p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">Added {fmtDate(item.uploaded_at)}</p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-500 transition-colors"
              title="Open file"
              onClick={handleOpen}
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
    </div>
  );
};

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
  const [urlError, setUrlError] = useState<string | null>(null);

  const validateUrl = (): string | null => {
    try {
      const normalized = normalizeEvidenceUrl(url, 'url');
      setUrlError(null);
      return normalized;
    } catch (e: any) {
      setUrlError(e?.message ?? 'Enter a valid HTTPS URL.');
      return null;
    }
  };

  const handleSave = async () => {
    if (!url.trim() || !name.trim()) return;
    const normalizedUrl = validateUrl();
    if (!normalizedUrl) return;
    setSaving(true);
    try {
      await linkExternalEvidence(orgId, {
        file_name:      name.trim(),
        file_type:      fileType.trim() || undefined,
        storage_type:   'url',
        external_url:   normalizedUrl,
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
          onChange={e => { setUrl(e.target.value); setUrlError(null); }}
          onBlur={() => { if (url.trim()) validateUrl(); }}
          placeholder="https://docs.google.com/…"
          aria-invalid={urlError ? 'true' : 'false'}
          aria-describedby={urlError ? 'evidence-url-error' : undefined}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {urlError && (
          <p id="evidence-url-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {urlError}
          </p>
        )}
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
          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </FormField>
      <button
        onClick={handleSave}
        disabled={!url.trim() || !name.trim() || Boolean(urlError) || saving}
        className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Save Evidence
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Google Drive file browser
// ─────────────────────────────────────────────────────────────────────────────

const DriveFilePicker: React.FC<{
  orgId: string;
  onSelect: (file: DriveFile) => void;
  onError: (msg: string) => void;
}> = ({ orgId, onSelect, onError }) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPage = useCallback(async (
    pageToken: string | null,
    replace: boolean,
    query: string,
  ) => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Please sign in again.');
      const page = await listGoogleDriveFiles(orgId, token, {
        search: query || undefined,
        pageToken,
      });
      setFiles(current => replace ? page.files : [...current, ...page.files]);
      setNextPageToken(page.nextPageToken);
    } catch (e: any) {
      onError(e?.message ?? 'Could not load Google Drive files.');
    } finally {
      setLoading(false);
    }
  }, [orgId, onError]);

  useEffect(() => {
    void loadPage(null, true, '');
  }, [loadPage]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    setActiveSearch(query);
    void loadPage(null, true, query);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={submitSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            maxLength={100}
            placeholder="Search Drive files"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          title="Search Google Drive"
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </form>

      {!loading && files.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          <FolderOpen className="w-9 h-9 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          {activeSearch ? 'No matching Drive files found.' : 'No Drive files are available.'}
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          {files.map(file => (
            <button
              type="button"
              key={file.id}
              onClick={() => onSelect(file)}
              className="w-full min-h-14 flex items-center gap-3 px-3 py-2 text-left bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              {fileIcon(mimeToExtension(file.mimeType))}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-slate-800 dark:text-white truncate">
                  {file.name}
                </span>
                <span className="block text-xs text-slate-400 truncate">
                  {mimeToExtension(file.mimeType).toUpperCase() || 'FILE'}
                  {file.modifiedTime ? ` · ${fmtDate(file.modifiedTime)}` : ''}
                </span>
              </span>
              <ChevronLeft className="w-4 h-4 rotate-180 text-slate-400" />
            </button>
          ))}
        </div>
      )}

      {nextPageToken && (
        <button
          type="button"
          onClick={() => void loadPage(nextPageToken, false, activeSearch)}
          disabled={loading}
          className="w-full py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Google Drive Confirm Form (pre-fills from server-proxied selection)
// ─────────────────────────────────────────────────────────────────────────────

const DriveConfirmForm: React.FC<{
  driveFile:    DriveFile;
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
          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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

// ─────────────────────────────────────────────────────────────────────────────
// FileUploadForm — Pro tier direct upload
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_EXTS = ['pdf', 'xlsx', 'xls', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'csv', 'txt'];
const MAX_SIZE_MB  = 25;

const FileUploadForm: React.FC<{
  linkedToType: EvidenceLinkedToType;
  linkedToId:   string;
  orgId:        string;
  quota:        { used_mb: number; total_mb: number; available_mb: number } | null;
  onSaved:      () => void;
  onError:      (msg: string) => void;
}> = ({ linkedToType, linkedToId, orgId, quota, onSaved, onError }) => {
  const [file,          setFile]          = useState<File | null>(null);
  const [notes,         setNotes]         = useState('');
  const [uploading,     setUploading]     = useState(false);
  const [progress,      setProgress]      = useState(0);
  const [isDragging,    setIsDragging]    = useState(false);
  const [upgradeNeeded, setUpgradeNeeded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (f: File): string | null => {
    const sizeMb = f.size / (1024 * 1024);
    if (sizeMb > MAX_SIZE_MB) return `File too large (${sizeMb.toFixed(1)} MB). Max is ${MAX_SIZE_MB} MB.`;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTS.includes(ext)) return `File type .${ext} is not allowed.`;
    return null;
  };

  const pickFile = (f: File) => {
    const err = validateFile(f);
    if (err) { onError(err); return; }
    setFile(f);
    setUpgradeNeeded(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(10);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      setProgress(40);
      await uploadDirectEvidence(orgId, {
        file,
        linked_to_type: linkedToType,
        linked_to_id:   linkedToId,
        notes:          notes.trim() || undefined,
      }, token);
      setProgress(100);
      onSaved();
    } catch (e: any) {
      const msg: string = e?.message ?? 'Upload failed.';
      if (msg.toLowerCase().includes('pro') || msg.toLowerCase().includes('subscription') || msg.toLowerCase().includes('tier')) {
        setUpgradeNeeded(true);
      } else {
        onError(msg);
      }
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  // Upgrade prompt — shown when server returns a tier error
  if (upgradeNeeded) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mx-auto">
          <Zap className="w-6 h-6 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h4 className="font-bold text-slate-800 dark:text-white mb-1">Pro tier required</h4>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Direct uploads are available on the Pro plan.
          </p>
        </div>
        <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1 text-left max-w-xs mx-auto">
          {['Upload files up to 25 MB', '10 GB storage included', 'In-app image & PDF preview', 'Bulk management'].map(f => (
            <li key={f} className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 text-violet-500">✓</span> {f}
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-400">
          In the meantime, use "Paste a URL" to link cloud-hosted files.
        </p>
      </div>
    );
  }

  const fileSizeMb = file ? file.size / (1024 * 1024) : 0;

  return (
    <div className="space-y-3">
      {/* Quota bar */}
      {quota && quota.total_mb > 0 && (
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Storage used</span>
            <span>{quota.used_mb.toFixed(0)} / {quota.total_mb >= 1024 ? `${(quota.total_mb / 1024).toFixed(0)} GB` : `${quota.total_mb} MB`}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${quota.used_mb / quota.total_mb > 0.9 ? 'bg-red-500' : 'bg-violet-500'}`}
              style={{ width: `${Math.min(100, (quota.used_mb / quota.total_mb) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Drop zone */}
      {!file ? (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
            ${isDragging
              ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/20'
              : 'border-slate-300 dark:border-slate-600 hover:border-violet-400 hover:bg-slate-50 dark:hover:bg-slate-900/40'
            }`}
        >
          <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Drop file here or click to browse</p>
          <p className="text-xs text-slate-400 mt-1">PDF, Word, Excel, images • Max {MAX_SIZE_MB} MB</p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={ALLOWED_EXTS.map(e => `.${e}`).join(',')}
            onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-800">
          <FileText className="w-5 h-5 text-violet-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{file.name}</p>
            <p className="text-xs text-slate-500">{fileSizeMb.toFixed(1)} MB</p>
          </div>
          <button onClick={() => setFile(null)} className="text-slate-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-center text-slate-400">Uploading… {progress}%</p>
        </div>
      )}

      <FormField label="Notes (optional)">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any additional context…"
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </FormField>

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
        {uploading ? 'Uploading…' : 'Upload File'}
      </button>
    </div>
  );
};

export default EvidenceBadge;
