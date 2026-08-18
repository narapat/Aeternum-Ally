# Evidence Vault — Schema and API Implementation

**Type:** Enhancement  
**Priority:** P2 (Medium)  
**Labels:** `phase-2`, `evidence-vault`, `backend`, `p2`  
**Milestone:** Phase 2 — Evidence Vault  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #3 (evidence_attachments table)

---

## Problem

Users need to attach evidence to assessments, KPIs, tasks, and emission entries for audit trail, but currently no system exists for this.

---

## Solution

Backend API for evidence management:
- Link evidence from Google Drive/OneDrive/Dropbox/URL (free tier)
- Direct upload to Supabase Storage (Pro tier only)
- Polymorphic linking (evidence → any entity type)
- Audit trail (who attached, when)

---

## Database Schema (from Issue #3)

```sql
evidence_attachments
├── id
├── organization_id
├── file_name
├── file_type (pdf, xlsx, jpg, etc.)
├── file_size_mb
├── storage_type (google_drive / onedrive / dropbox / url / supabase_storage / s3)
├── external_url (for cloud links)
├── external_id (Drive file ID, etc.)
├── storage_path (for direct uploads)
├── linked_to_type (assessment / kpi / action_plan / emission_entry / task)
├── linked_to_id
├── notes
├── uploaded_by
├── uploaded_at
```

---

## API Endpoints

### 1. Link External File

```typescript
// POST /api/evidence/link
{
  "storage_type": "google_drive",
  "external_url": "https://drive.google.com/file/d/...",
  "external_id": "1a2b3c4d5e6f",
  "file_name": "Carbon Audit 2025.pdf",
  "file_type": "pdf",
  "file_size_mb": 2.3,
  "linked_to_type": "assessment",
  "linked_to_id": "uuid-e1",
  "notes": "Annual carbon audit report"
}

Response:
{
  "id": "uuid",
  "file_name": "Carbon Audit 2025.pdf",
  "storage_type": "google_drive",
  "external_url": "...",
  "uploaded_at": "2026-05-06T10:30:00Z"
}
```

### 2. Upload Direct File (Pro Only)

```typescript
// POST /api/evidence/upload
// FormData with file + metadata

if (!isProTier(organizationId)) {
  return { error: 'Direct upload requires Pro tier' };
}

const quota = await getStorageQuota(organizationId);
if (quota.used + fileSizeMB > quota.total) {
  return { error: 'Storage quota exceeded' };
}

const path = await uploadToSupabase(file, organizationId);

return {
  id: "uuid",
  file_name: file.name,
  storage_type: "supabase_storage",
  storage_path: path,
  uploaded_at: new Date()
};
```

### 3. List Evidence for Entity

```typescript
// GET /api/evidence?linked_to_type=assessment&linked_to_id=uuid

const evidence = await db.evidence_attachments.findMany({
  where: {
    organization_id: currentOrgId,
    linked_to_type: params.linked_to_type,
    linked_to_id: params.linked_to_id
  },
  orderBy: { uploaded_at: 'desc' }
});

return evidence;
```

### 4. Delete Evidence

```typescript
// DELETE /api/evidence/:id

const evidence = await db.evidence_attachments.findUnique({
  where: { id: params.id }
});

// If direct upload, delete from storage
if (evidence.storage_type === 'supabase_storage') {
  await deleteFromSupabase(evidence.storage_path);
}

await db.evidence_attachments.delete({
  where: { id: params.id }
});

return { success: true };
```

---

## Storage Quota Management

```typescript
async function getStorageQuota(organizationId: string) {
  const subscription = await getSubscription(organizationId);
  
  const quotaMap = {
    free: 0,  // link-only
    pro: 10 * 1024,  // 10 GB in MB
    enterprise: 100 * 1024  // 100 GB
  };
  
  const total = quotaMap[subscription.tier];
  
  const used = await db.evidence_attachments.aggregate({
    where: {
      organization_id: organizationId,
      storage_type: 'supabase_storage'
    },
    _sum: { file_size_mb: true }
  });
  
  return {
    used: used._sum.file_size_mb || 0,
    total,
    available: total - (used._sum.file_size_mb || 0)
  };
}
```

---

## File Upload to Supabase Storage

```typescript
import { createClient } from '@supabase/supabase-js';

async function uploadToSupabase(
  file: File,
  organizationId: string
): Promise<string> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  
  const fileName = `${organizationId}/${Date.now()}-${file.name}`;
  const bucket = 'evidence-files';
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, file, {
      contentType: file.type,
      upsert: false
    });
  
  if (error) throw error;
  
  return data.path;
}

async function deleteFromSupabase(path: string): Promise<void> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  
  await supabase.storage
    .from('evidence-files')
    .remove([path]);
}
```

---

## Validation

```typescript
const MAX_FILE_SIZE_MB = 25;
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/gif'
];

function validateFile(file: File): void {
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new Error(`File too large (max ${MAX_FILE_SIZE_MB}MB)`);
  }
  
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('File type not allowed');
  }
}
```

---

## Acceptance Criteria

- [ ] API endpoint to link external files
- [ ] API endpoint to upload direct files (Pro only)
- [ ] API endpoint to list evidence per entity
- [ ] API endpoint to delete evidence
- [ ] Storage quota enforcement
- [ ] Supabase Storage upload works
- [ ] File validation (size, type)
- [ ] RLS policies protect evidence by org
- [ ] Audit trail (uploaded_by, uploaded_at)

---

## Files to Modify

### Backend:
- `netlify/functions/api.ts`
  - Add evidence endpoints
  
- `services/evidenceService.ts` (create)
  - `linkExternalFile()`
  - `uploadDirectFile()`
  - `listEvidence()`
  - `deleteEvidence()`
  - `getStorageQuota()`

---

## Testing Checklist

- [ ] Link Google Drive file → saves metadata
- [ ] Upload direct file (Pro) → saves to Supabase
- [ ] Upload direct file (Free) → returns error
- [ ] Exceed quota → returns error
- [ ] List evidence for assessment → returns correct items
- [ ] Delete linked file → removes metadata only
- [ ] Delete uploaded file → removes from storage
- [ ] RLS: can't access other org's evidence

---

## Related Issues

- Depends on: #3 (evidence_attachments table)
- Used by: #15 (Google Drive OAuth)
- Used by: #16 (Link UI)
