/**
 * netlify/functions/evidence.ts
 *
 * Server-side evidence handler (uses service-role key).
 * Handles:
 *   GET  /?action=quota&organization_id=... — storage quota for the org
 *   POST /                                  — direct file upload (Pro tier)
 *   DELETE /                                — delete file from storage + DB row
 *
 * External links (Drive/OneDrive/URL) are saved client-side via supabase anon key.
 *
 * Storage bucket: 'evidence-files'
 * Create it in Supabase dashboard → Storage → New bucket → evidence-files (private).
 *
 * Quota limits (MB):
 *   free       → 0 (link-only, no direct upload)
 *   pro        → 10 240 (10 GB)
 *   enterprise → 102 400 (100 GB)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL   = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET         = 'evidence-files';
const MAX_MB         = 25;

const QUOTA_MAP: Record<string, number> = {
  free:       0,
  pro:        10_240,
  enterprise: 102_400,
};

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/csv',
  'text/plain',
]);

const json = (code: number, body: unknown) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export const handler = async (event: any) => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(503, { error: 'Server configuration error: missing Supabase credentials.' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Auth — require Bearer token
  const authHeader = (event.headers.authorization || event.headers.Authorization) as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'Authentication required.' });
  }
  const accessToken = authHeader.slice('Bearer '.length);
  const { data: userResp, error: authErr } = await admin.auth.getUser(accessToken);
  if (authErr || !userResp?.user) {
    return json(401, { error: 'Session expired. Please sign in again.' });
  }
  const user = userResp.user;

  // ── GET: quota ──────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const orgId = event.queryStringParameters?.organization_id as string | undefined;
    if (!orgId) return json(400, { error: 'Missing organization_id.' });

    const memberCheck = await isMember(admin, orgId, user.id);
    if (!memberCheck) return json(403, { error: 'Access denied.' });

    const quota = await getStorageQuota(admin, orgId);
    return json(200, quota);
  }

  // ── DELETE: remove storage file + DB row ────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    let body: any;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON.' }); }

    const { id, organization_id } = body as { id?: string; organization_id?: string };
    if (!id || !organization_id) return json(400, { error: 'Missing id or organization_id.' });

    const memberCheck = await isMember(admin, organization_id, user.id);
    if (!memberCheck) return json(403, { error: 'Access denied.' });

    // Fetch the row to get storage_path
    const { data: row, error: fetchErr } = await admin
      .from('evidence_attachments')
      .select('storage_type, storage_path, organization_id')
      .eq('id', id)
      .eq('organization_id', organization_id)
      .single();
    if (fetchErr || !row) return json(404, { error: 'Evidence record not found.' });

    // Delete from storage if applicable
    if (row.storage_type === 'supabase_storage' && row.storage_path) {
      const { error: storageErr } = await admin.storage.from(BUCKET).remove([row.storage_path]);
      if (storageErr) {
        console.warn('Storage delete warning:', storageErr.message);
        // Continue — still delete the DB row even if storage delete fails
      }
    }

    const { error: dbErr } = await admin.from('evidence_attachments').delete().eq('id', id);
    if (dbErr) return json(500, { error: 'Failed to delete evidence record.' });

    return json(200, { success: true });
  }

  // ── POST: direct file upload ─────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    // Netlify passes multipart as base64-encoded body with isBase64Encoded=true
    if (!event.isBase64Encoded && !event.body) {
      return json(400, { error: 'Expected multipart/form-data body.' });
    }

    // Parse multipart/form-data
    let fields: Record<string, string> = {};
    let fileBuffer: Buffer | null = null;
    let fileName = '';
    let fileMimeType = '';

    try {
      const boundary = getBoundary(event.headers['content-type'] || event.headers['Content-Type'] || '');
      if (!boundary) return json(400, { error: 'Missing multipart boundary.' });

      const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : Buffer.from(event.body as string, 'utf-8');

      ({ fields, fileBuffer, fileName, fileMimeType } = parseMultipart(rawBody, boundary));
    } catch (e: any) {
      return json(400, { error: `Failed to parse upload: ${e?.message}` });
    }

    const { organization_id, linked_to_type, linked_to_id, notes } = fields;
    if (!organization_id || !linked_to_type || !linked_to_id) {
      return json(400, { error: 'Missing required fields: organization_id, linked_to_type, linked_to_id.' });
    }
    if (!fileBuffer || !fileName) {
      return json(400, { error: 'No file attached.' });
    }

    // Auth: membership check
    const memberCheck = await isMember(admin, organization_id, user.id);
    if (!memberCheck) return json(403, { error: 'Access denied.' });

    // Tier check: only Pro/Enterprise can upload
    const quota = await getStorageQuota(admin, organization_id);
    if (quota.total_mb === 0) {
      return json(403, { error: 'Direct upload requires a Pro subscription. Link files from Google Drive or a URL instead.' });
    }

    // File type validation
    if (fileMimeType && !ALLOWED_MIME.has(fileMimeType)) {
      return json(415, { error: `File type '${fileMimeType}' is not allowed.` });
    }

    // File size validation
    const fileSizeMb = fileBuffer.byteLength / (1024 * 1024);
    if (fileSizeMb > MAX_MB) {
      return json(413, { error: `File too large (${fileSizeMb.toFixed(1)} MB). Maximum is ${MAX_MB} MB.` });
    }

    // Quota check
    if (quota.available_mb < fileSizeMb) {
      return json(413, {
        error: `Storage quota exceeded. Available: ${quota.available_mb.toFixed(0)} MB, required: ${fileSizeMb.toFixed(1)} MB.`,
      });
    }

    // Upload to Supabase Storage
    const storagePath = `${organization_id}/${Date.now()}-${sanitizeFileName(fileName)}`;
    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: fileMimeType || 'application/octet-stream',
        upsert: false,
      });
    if (uploadErr) {
      console.error('Storage upload error:', uploadErr);
      return json(500, { error: 'File upload failed. Please try again.' });
    }

    // Derive file extension for file_type
    const ext = fileName.split('.').pop()?.toLowerCase() ?? null;

    // Insert DB row
    const { data: row, error: dbErr } = await admin
      .from('evidence_attachments')
      .insert({
        organization_id,
        file_name:      fileName,
        file_type:      ext,
        file_size_mb:   Math.round(fileSizeMb * 100) / 100,
        storage_type:   'supabase_storage',
        external_url:   null,
        external_id:    null,
        storage_path:   storagePath,
        linked_to_type,
        linked_to_id,
        notes:          notes ?? null,
        uploaded_by:    user.id,
      })
      .select()
      .single();

    if (dbErr) {
      // Cleanup: remove the file we just uploaded
      await admin.storage.from(BUCKET).remove([storagePath]);
      return json(500, { error: 'Failed to save evidence record.' });
    }

    return json(201, row);
  }

  return json(405, { error: 'Method not allowed.' });
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function isMember(admin: any, orgId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

async function getOrgTier(admin: any, orgId: string): Promise<string> {
  // Placeholder — when subscription management is added, query it here.
  // For now: all orgs are 'free' (link-only). Set to 'pro' to unlock uploads.
  const { data } = await admin
    .from('organizations')
    .select('subscription_tier')
    .eq('id', orgId)
    .maybeSingle();
  return (data?.subscription_tier as string | null) ?? 'free';
}

async function getStorageQuota(
  admin: any,
  orgId: string,
): Promise<{ used_mb: number; total_mb: number; available_mb: number }> {
  const tier = await getOrgTier(admin, orgId);
  const total_mb = QUOTA_MAP[tier] ?? 0;

  const { data } = await admin
    .from('evidence_attachments')
    .select('file_size_mb')
    .eq('organization_id', orgId)
    .eq('storage_type', 'supabase_storage');

  const used_mb = (data ?? []).reduce(
    (sum: number, r: any) => sum + (Number(r.file_size_mb) || 0),
    0,
  );

  return {
    used_mb:      Math.round(used_mb * 100) / 100,
    total_mb,
    available_mb: Math.max(0, total_mb - used_mb),
  };
}

function getBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
  return match ? (match[1] ?? match[2]) : null;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

/**
 * Minimal multipart/form-data parser.
 * Extracts text fields and the first file part.
 */
function parseMultipart(
  body: Buffer,
  boundary: string,
): {
  fields: Record<string, string>;
  fileBuffer: Buffer | null;
  fileName: string;
  fileMimeType: string;
} {
  const sep = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  let fileBuffer: Buffer | null = null;
  let fileName = '';
  let fileMimeType = '';

  let pos = 0;
  while (pos < body.length) {
    // Find next boundary
    const boundaryPos = indexOfBuffer(body, sep, pos);
    if (boundaryPos === -1) break;
    pos = boundaryPos + sep.length;

    // Check for terminal boundary
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break; // "--"

    // Skip CRLF after boundary
    if (body[pos] === 0x0d) pos++;
    if (body[pos] === 0x0a) pos++;

    // Find end of headers (double CRLF)
    const headerEnd = indexOfBuffer(body, Buffer.from('\r\n\r\n'), pos);
    if (headerEnd === -1) break;
    const headerSection = body.slice(pos, headerEnd).toString('utf-8');
    pos = headerEnd + 4;

    // Find end of part (next boundary or end)
    const nextBoundary = indexOfBuffer(body, sep, pos);
    const partEnd = nextBoundary !== -1 ? nextBoundary - 2 : body.length; // -2 for CRLF before boundary
    const partData = body.slice(pos, partEnd);
    pos = partEnd;

    // Parse Content-Disposition
    const cdMatch = headerSection.match(/Content-Disposition:\s*form-data;(.+?)(?:\r\n|$)/i);
    if (!cdMatch) continue;
    const cdPart = cdMatch[1];

    const nameMatch = cdPart.match(/name="([^"]+)"/i);
    const fileNameMatch = cdPart.match(/filename="([^"]+)"/i);

    if (!nameMatch) continue;
    const fieldName = nameMatch[1];

    if (fileNameMatch) {
      // File part
      fileName = fileNameMatch[1];
      const ctMatch = headerSection.match(/Content-Type:\s*([^\r\n]+)/i);
      fileMimeType = ctMatch ? ctMatch[1].trim() : '';
      fileBuffer = partData;
    } else {
      // Text field
      fields[fieldName] = partData.toString('utf-8');
    }
  }

  return { fields, fileBuffer, fileName, fileMimeType };
}

function indexOfBuffer(haystack: Buffer, needle: Buffer, offset = 0): number {
  for (let i = offset; i <= haystack.length - needle.length; i++) {
    let found = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}
