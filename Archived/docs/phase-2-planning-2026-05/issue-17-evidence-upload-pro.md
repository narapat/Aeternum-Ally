# Evidence Direct Upload — Pro Tier Feature

**Type:** Enhancement  
**Priority:** P3 (Low)  
**Labels:** `phase-2`, `premium`, `evidence-vault`, `p3`  
**Milestone:** Phase 2 — Premium Features  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #14 (Evidence API), #16 (Link UI)

---

## Problem

Free tier users can link files, but some users want to upload files directly to the platform for convenience.

---

## Solution

Direct upload feature for Pro/Enterprise tiers:
- Upload files up to 25 MB
- 10 GB storage quota (Pro), 100 GB (Enterprise)
- In-app preview (PDF, images)
- Version history tracking
- Bulk download option

---

## Feature Gate

```typescript
function canUploadDirect(subscription: Subscription): boolean {
  return ['pro', 'enterprise'].includes(subscription.tier);
}

// In UI
{subscription.tier === 'free' && (
  <div className="upgrade-prompt">
    <p>Direct upload requires Pro tier</p>
    <button onClick={goToUpgrade}>Upgrade to Pro — $19/mo</button>
  </div>
)}
```

---

## FileUploadForm Component

```tsx
function FileUploadForm({ 
  linkedToType, 
  linkedToId, 
  onSave 
}: FileUploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const quota = useStorageQuota();
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    
    // Validate size
    const sizeMB = selected.size / 1024 / 1024;
    if (sizeMB > 25) {
      showError('File too large (max 25 MB)');
      return;
    }
    
    // Check quota
    if (quota.available < sizeMB) {
      showError(`Not enough storage (${quota.available.toFixed(1)} MB available)`);
      return;
    }
    
    setFile(selected);
  };
  
  const handleUpload = async () => {
    if (!file) return;
    
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('linked_to_type', linkedToType);
      formData.append('linked_to_id', linkedToId);
      formData.append('notes', notes);
      
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        setProgress((e.loaded / e.total) * 100);
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          onSave();
        } else {
          showError('Upload failed');
        }
      });
      
      xhr.open('POST', '/api/evidence/upload');
      xhr.send(formData);
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div className="upload-form">
      <div className="quota-display">
        Storage: {quota.used.toFixed(1)} / {quota.total.toFixed(0)} GB used
        <div className="quota-bar">
          <div 
            className="fill"
            style={{ width: `${(quota.used / quota.total) * 100}%` }}
          />
        </div>
      </div>
      
      <div className="file-selector">
        <input
          type="file"
          onChange={handleFileSelect}
          accept=".pdf,.xlsx,.xls,.docx,.jpg,.jpeg,.png"
        />
        
        {file && (
          <div className="selected-file">
            <span>{file.name}</span>
            <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
          </div>
        )}
      </div>
      
      <FormField label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormField>
      
      {uploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div 
              className="fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span>{progress.toFixed(0)}%</span>
        </div>
      )}
      
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
      >
        {uploading ? 'Uploading...' : 'Upload File'}
      </button>
    </div>
  );
}
```

---

## In-App Preview (Pro Feature)

```tsx
function EvidencePreview({ evidence }: { evidence: Evidence }) {
  if (evidence.storage_type !== 'supabase_storage') {
    return <ExternalLinkMessage url={evidence.external_url} />;
  }
  
  if (evidence.file_type === 'pdf') {
    return (
      <iframe 
        src={`/api/evidence/preview/${evidence.id}`}
        width="100%"
        height="600px"
      />
    );
  }
  
  if (['jpg', 'jpeg', 'png', 'gif'].includes(evidence.file_type)) {
    return (
      <img 
        src={`/api/evidence/preview/${evidence.id}`}
        alt={evidence.file_name}
      />
    );
  }
  
  return (
    <div className="no-preview">
      <p>Preview not available</p>
      <button onClick={() => download(evidence.id)}>
        Download to view
      </button>
    </div>
  );
}
```

---

## Bulk Download (Pro Feature)

```tsx
function BulkDownloadButton({ 
  linkedToType, 
  linkedToId 
}: {
  linkedToType: string;
  linkedToId: string;
}) {
  const [downloading, setDownloading] = useState(false);
  
  const handleBulkDownload = async () => {
    setDownloading(true);
    
    try {
      // Server creates zip file
      const response = await fetch(
        `/api/evidence/bulk-download?type=${linkedToType}&id=${linkedToId}`
      );
      
      const blob = await response.blob();
      downloadBlob(blob, `evidence-${linkedToId}.zip`);
    } finally {
      setDownloading(false);
    }
  };
  
  return (
    <button onClick={handleBulkDownload} disabled={downloading}>
      {downloading ? 'Preparing download...' : '📥 Download All'}
    </button>
  );
}
```

---

## Upgrade Prompt

```tsx
function UpgradePrompt() {
  return (
    <div className="upgrade-banner">
      <div className="icon">⚡</div>
      <div className="content">
        <h3>Upgrade to Pro for Direct Upload</h3>
        <ul>
          <li>Upload files up to 25 MB</li>
          <li>10 GB storage included</li>
          <li>In-app preview (PDF, images)</li>
          <li>Version history tracking</li>
          <li>Bulk download</li>
        </ul>
        <button onClick={goToUpgrade}>
          Upgrade to Pro — $19/month
        </button>
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

- [ ] Upload form only enabled for Pro/Enterprise
- [ ] Free users see upgrade prompt
- [ ] Upload validates file size (max 25 MB)
- [ ] Upload checks storage quota
- [ ] Progress bar shows upload status
- [ ] Uploaded files stored in Supabase Storage
- [ ] PDF preview works in-app
- [ ] Image preview works in-app
- [ ] Bulk download creates zip file
- [ ] Storage quota enforced

---

## Files to Modify

### Components:
- `components/evidence/FileUploadForm.tsx`
- `components/evidence/EvidencePreview.tsx`
- `components/evidence/BulkDownloadButton.tsx`
- `components/evidence/UpgradePrompt.tsx`

### Backend:
- `netlify/functions/evidence-preview.ts` (create)
- `netlify/functions/evidence-bulk-download.ts` (create)

---

## Testing Checklist

- [ ] Free user sees upload disabled + upgrade prompt
- [ ] Pro user can upload files
- [ ] File >25MB rejected
- [ ] Upload with quota exceeded rejected
- [ ] Upload progress bar works
- [ ] PDF preview renders
- [ ] Image preview renders
- [ ] Bulk download creates zip

---

## Related Issues

- Depends on: #14 (Evidence API)
- Depends on: #16 (Link UI)
- Related to: #18 (AI Quota System)
