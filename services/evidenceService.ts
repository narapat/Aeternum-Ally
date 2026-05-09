/**
 * evidenceService.ts
 *
 * Client-side CRUD helpers for evidence_attachments.
 *
 * External links (google_drive, onedrive, dropbox, url) are saved directly
 * via the Supabase anon key — RLS ensures org isolation.
 *
 * Direct uploads (supabase_storage) require the Netlify function at
 * /.netlify/functions/evidence which uses the service-role key to write
 * to Supabase Storage and enforce Pro-tier quota limits.
 */

import { supabase } from '../lib/supabaseClient';
import {
  EvidenceAttachment,
  EvidenceLinkedToType,
  StorageType,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// DB ↔ TS mapping
// ─────────────────────────────────────────────────────────────────────────────

const fromDbRow = (row: any): EvidenceAttachment => ({
  id:              row.id,
  organization_id: row.organization_id,
  file_name:       row.file_name,
  file_type:       row.file_type    ?? null,
  file_size_mb:    row.file_size_mb != null ? Number(row.file_size_mb) : null,
  storage_type:    row.storage_type as StorageType,
  external_url:    row.external_url  ?? null,
  external_id:     row.external_id   ?? null,
  storage_path:    row.storage_path  ?? null,
  linked_to_type:  row.linked_to_type as EvidenceLinkedToType,
  linked_to_id:    row.linked_to_id,
  notes:           row.notes         ?? null,
  uploaded_by:     row.uploaded_by   ?? null,
  uploaded_at:     row.uploaded_at,
});

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch all evidence attached to a specific entity. */
export async function fetchEvidence(
  orgId: string,
  linkedToType: EvidenceLinkedToType,
  linkedToId: string,
): Promise<EvidenceAttachment[]> {
  const { data, error } = await supabase
    .from('evidence_attachments')
    .select('*')
    .eq('organization_id', orgId)
    .eq('linked_to_type', linkedToType)
    .eq('linked_to_id', linkedToId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDbRow);
}

/** Count evidence items for a badge. Cheaper than a full select. */
export async function countEvidence(
  orgId: string,
  linkedToType: EvidenceLinkedToType,
  linkedToId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('evidence_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('linked_to_type', linkedToType)
    .eq('linked_to_id', linkedToId);
  if (error) throw error;
  return count ?? 0;
}

/** Batch-count evidence across many entity IDs in one query. */
export async function batchCountEvidence(
  orgId: string,
  linkedToType: EvidenceLinkedToType,
  linkedToIds: string[],
): Promise<Record<string, number>> {
  if (linkedToIds.length === 0) return {};

  const { data, error } = await supabase
    .from('evidence_attachments')
    .select('linked_to_id')
    .eq('organization_id', orgId)
    .eq('linked_to_type', linkedToType)
    .in('linked_to_id', linkedToIds);
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const id of linkedToIds) counts[id] = 0;
  for (const row of data ?? []) {
    counts[row.linked_to_id] = (counts[row.linked_to_id] ?? 0) + 1;
  }
  return counts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Write helpers — external links (free tier)
// ─────────────────────────────────────────────────────────────────────────────

export interface LinkEvidencePayload {
  file_name:      string;
  file_type?:     string;
  file_size_mb?:  number;
  storage_type:   Exclude<StorageType, 'supabase_storage' | 's3'>;
  external_url?:  string;
  external_id?:   string;   // cloud provider file ID (Drive ID, OneDrive item ID…)
  linked_to_type: EvidenceLinkedToType;
  linked_to_id:   string;
  notes?:         string;
}

/** Save a link to an external file (Google Drive / OneDrive / Dropbox / URL). */
export async function linkExternalEvidence(
  orgId: string,
  payload: LinkEvidencePayload,
  userId: string,
): Promise<EvidenceAttachment> {
  const { data, error } = await supabase
    .from('evidence_attachments')
    .insert({
      organization_id: orgId,
      file_name:       payload.file_name,
      file_type:       payload.file_type    ?? null,
      file_size_mb:    payload.file_size_mb ?? null,
      storage_type:    payload.storage_type,
      external_url:    payload.external_url ?? null,
      external_id:     payload.external_id  ?? null,
      storage_path:    null,
      linked_to_type:  payload.linked_to_type,
      linked_to_id:    payload.linked_to_id,
      notes:           payload.notes        ?? null,
      uploaded_by:     userId,
    })
    .select()
    .single();
  if (error) throw error;
  return fromDbRow(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Write helpers — direct upload (Pro tier, via Netlify function)
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadEvidencePayload {
  file:           File;
  linked_to_type: EvidenceLinkedToType;
  linked_to_id:   string;
  notes?:         string;
}

/**
 * Upload a file directly to Supabase Storage (Pro tier only).
 * Calls /.netlify/functions/evidence which:
 *   1. Checks the org's subscription tier (Pro/Enterprise only)
 *   2. Enforces storage quota
 *   3. Uploads to the 'evidence-files' bucket using the service-role key
 *   4. Inserts the evidence_attachments row
 */
export async function uploadDirectEvidence(
  orgId: string,
  payload: UploadEvidencePayload,
  accessToken: string,
): Promise<EvidenceAttachment> {
  const form = new FormData();
  form.append('file', payload.file);
  form.append('organization_id', orgId);
  form.append('linked_to_type', payload.linked_to_type);
  form.append('linked_to_id', payload.linked_to_id);
  if (payload.notes) form.append('notes', payload.notes);

  const resp = await fetch('/.netlify/functions/evidence', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  const body = await resp.json().catch(() => ({ error: 'Invalid response' }));
  if (!resp.ok) throw new Error(body.error ?? 'Upload failed');
  return fromDbRow(body);
}

/** Check the org's current storage usage and quota (Pro tier). */
export async function getStorageQuota(
  orgId: string,
  accessToken: string,
): Promise<{ used_mb: number; total_mb: number; available_mb: number }> {
  const resp = await fetch(
    `/.netlify/functions/evidence?action=quota&organization_id=${encodeURIComponent(orgId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const body = await resp.json().catch(() => ({ error: 'Invalid response' }));
  if (!resp.ok) throw new Error(body.error ?? 'Could not fetch quota');
  return body;
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete an evidence record.
 * - External links: deletes only the DB row (client-side).
 * - Direct uploads: calls the Netlify function to also remove the file from
 *   Supabase Storage before deleting the DB row.
 */
export async function deleteEvidence(
  id: string,
  orgId: string,
  storageType: StorageType,
  accessToken?: string,
): Promise<void> {
  if (storageType === 'supabase_storage' && accessToken) {
    // Server-side: deletes storage file + DB row
    const resp = await fetch('/.netlify/functions/evidence', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ id, organization_id: orgId }),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body.error ?? 'Failed to delete file from storage');
    }
    return;
  }

  // External link / URL — delete DB row directly
  const { error } = await supabase
    .from('evidence_attachments')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/** Delete all evidence attached to a specific entity. */
export async function deleteEvidenceByEntity(
  orgId: string,
  linkedToType: EvidenceLinkedToType,
  linkedToId: string,
): Promise<void> {
  const { data: items, error } = await supabase
    .from('evidence_attachments')
    .select('id, storage_type')
    .eq('organization_id', orgId)
    .eq('linked_to_type', linkedToType)
    .eq('linked_to_id', linkedToId);
  if (error) throw error;

  if (!items || items.length === 0) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  for (const item of items) {
    await deleteEvidence(item.id, orgId, item.storage_type as StorageType, token);
  }
}
