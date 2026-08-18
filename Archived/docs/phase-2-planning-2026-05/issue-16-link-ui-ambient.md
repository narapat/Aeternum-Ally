# Evidence Link UI — Ambient Badges

**Type:** Enhancement  
**Priority:** P2 (Medium)  
**Labels:** `phase-2`, `evidence-vault`, `ui`, `p2`  
**Milestone:** Phase 2 — Evidence Vault  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #14 (Evidence API), #15 (Google Drive OAuth)

---

## Problem

Evidence management should be seamless, not disruptive. Users shouldn't have to navigate to separate "Evidence Vault" screen.

---

## Solution

**Ambient badges** appear on every relevant section:
- Assessment cards: 📎 Evidence (2)
- KPI cards: 📎 Evidence (1)
- Task rows: 📎 Evidence (0)
- Emission entries: 📎 Evidence (1)

Click badge → modal to view/add evidence

---

## Badge Placement

### 1. Assessment Cards

```tsx
function AssessmentCard({ assessment }: { assessment: Assessment }) {
  return (
    <div className="assessment-card">
      <h3>
        {assessment.topic} {assessment.topicTitle}
        <EvidenceBadge 
          linkedToType="assessment" 
          linkedToId={assessment.id} 
        />
      </h3>
      {/* ... rest of card */}
    </div>
  );
}
```

### 2. KPI Cards

```tsx
function KPICard({ kpi }: { kpi: KPI }) {
  return (
    <div className="kpi-card">
      <h3>
        {kpi.name}
        <EvidenceBadge 
          linkedToType="kpi" 
          linkedToId={kpi.id} 
        />
      </h3>
      {/* ... rest of card */}
    </div>
  );
}
```

### 3. Task Manager Table

```tsx
function TaskRow({ task }: { task: Task }) {
  return (
    <tr>
      <td>{task.title}</td>
      <td>
        <EvidenceBadge 
          linkedToType="task" 
          linkedToId={task.id} 
        />
      </td>
      {/* ... other columns */}
    </tr>
  );
}
```

---

## EvidenceBadge Component

```tsx
function EvidenceBadge({ 
  linkedToType, 
  linkedToId 
}: { 
  linkedToType: string; 
  linkedToId: string;
}) {
  const [count, setCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  
  useEffect(() => {
    loadEvidenceCount(linkedToType, linkedToId).then(setCount);
  }, [linkedToType, linkedToId]);
  
  return (
    <>
      <button 
        className="evidence-badge"
        onClick={() => setShowModal(true)}
      >
        📎 Evidence ({count})
      </button>
      
      {showModal && (
        <EvidenceModal
          linkedToType={linkedToType}
          linkedToId={linkedToId}
          onClose={() => setShowModal(false)}
          onUpdate={() => setCount(c => c + 1)}
        />
      )}
    </>
  );
}
```

---

## EvidenceModal Component

```tsx
function EvidenceModal({ 
  linkedToType, 
  linkedToId, 
  onClose,
  onUpdate
}: EvidenceModalProps) {
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [addMode, setAddMode] = useState(false);
  
  useEffect(() => {
    loadEvidence(linkedToType, linkedToId).then(setEvidence);
  }, [linkedToType, linkedToId]);
  
  return (
    <Modal onClose={onClose}>
      <div className="evidence-modal">
        <h3>Evidence</h3>
        
        {evidence.length === 0 && !addMode && (
          <div className="empty-state">
            <p>No evidence attached yet</p>
            <button onClick={() => setAddMode(true)}>
              + Add First Evidence
            </button>
          </div>
        )}
        
        {evidence.length > 0 && (
          <div className="evidence-list">
            {evidence.map(item => (
              <EvidenceItem 
                key={item.id}
                evidence={item}
                onDelete={() => handleDelete(item.id)}
              />
            ))}
          </div>
        )}
        
        {evidence.length > 0 && !addMode && (
          <button onClick={() => setAddMode(true)}>
            + Add More Evidence
          </button>
        )}
        
        {addMode && (
          <AddEvidenceForm
            linkedToType={linkedToType}
            linkedToId={linkedToId}
            onSave={() => {
              setAddMode(false);
              loadEvidence(linkedToType, linkedToId).then(setEvidence);
              onUpdate();
            }}
            onCancel={() => setAddMode(false)}
          />
        )}
      </div>
    </Modal>
  );
}
```

---

## EvidenceItem Component

```tsx
function EvidenceItem({ 
  evidence, 
  onDelete 
}: { 
  evidence: Evidence; 
  onDelete: () => void;
}) {
  const icon = {
    google_drive: '📁',
    onedrive: '☁️',
    dropbox: '📦',
    url: '🔗',
    supabase_storage: '📄'
  }[evidence.storage_type];
  
  return (
    <div className="evidence-item">
      <div className="file-info">
        <span className="icon">{icon}</span>
        <div className="details">
          <div className="file-name">{evidence.file_name}</div>
          <div className="meta">
            {evidence.file_type && <span>{evidence.file_type.toUpperCase()}</span>}
            {evidence.file_size_mb && <span>{evidence.file_size_mb.toFixed(1)} MB</span>}
            <span>Added {formatDate(evidence.uploaded_at)}</span>
          </div>
          {evidence.notes && (
            <div className="notes">{evidence.notes}</div>
          )}
        </div>
      </div>
      
      <div className="actions">
        <a 
          href={evidence.external_url || `/api/evidence/download/${evidence.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View
        </a>
        <button onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}
```

---

## AddEvidenceForm Component

```tsx
function AddEvidenceForm({ 
  linkedToType, 
  linkedToId, 
  onSave, 
  onCancel 
}: AddEvidenceFormProps) {
  const [method, setMethod] = useState<string | null>(null);
  const subscription = useSubscription();
  
  return (
    <div className="add-evidence-form">
      <h4>Add Evidence</h4>
      
      {!method && (
        <div className="method-selection">
          <button 
            className="method-card"
            onClick={() => setMethod('google_drive')}
          >
            📁 Link from Google Drive
          </button>
          
          <button 
            className="method-card"
            onClick={() => setMethod('onedrive')}
          >
            ☁️ Link from OneDrive
          </button>
          
          <button 
            className="method-card"
            onClick={() => setMethod('url')}
          >
            🔗 Paste URL
          </button>
          
          <button 
            className="method-card"
            onClick={() => setMethod('upload')}
            disabled={subscription.tier === 'free'}
          >
            📤 Upload File
            {subscription.tier === 'free' && (
              <span className="badge">Pro</span>
            )}
          </button>
        </div>
      )}
      
      {method === 'google_drive' && (
        <GoogleDrivePicker onSelect={handleGoogleDriveSelect} />
      )}
      
      {method === 'url' && (
        <URLForm onSave={handleURLSave} />
      )}
      
      {method === 'upload' && (
        <FileUploadForm onSave={handleUploadSave} />
      )}
      
      <button onClick={onCancel}>Cancel</button>
    </div>
  );
}
```

---

## URLForm Component

```tsx
function URLForm({ onSave }: { onSave: (data: any) => void }) {
  const [url, setUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [notes, setNotes] = useState('');
  
  const handleSave = async () => {
    await createEvidence({
      storage_type: 'url',
      external_url: url,
      file_name: fileName,
      notes,
      linked_to_type: linkedToType,
      linked_to_id: linkedToId
    });
    
    onSave();
  };
  
  return (
    <div className="url-form">
      <FormField label="URL">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
      </FormField>
      
      <FormField label="File Name">
        <input
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          placeholder="e.g., Carbon Audit Report 2025"
        />
      </FormField>
      
      <FormField label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional context..."
        />
      </FormField>
      
      <button 
        onClick={handleSave}
        disabled={!url || !fileName}
      >
        Save Evidence
      </button>
    </div>
  );
}
```

---

## Styling

```css
.evidence-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: #3b82f6;
  color: white;
  border-radius: 8px;
  font-size: 0.75rem;
  border: none;
  cursor: pointer;
}

.evidence-item {
  display: flex;
  justify-content: space-between;
  padding: 1rem;
  background: #f3f4f6;
  border-radius: 8px;
  margin-bottom: 0.5rem;
}

.method-card {
  padding: 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.method-card:hover {
  border-color: #3b82f6;
}

.method-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

---

## Acceptance Criteria

- [ ] Badge appears on all assessments/KPIs/tasks
- [ ] Badge count reflects actual evidence count
- [ ] Click badge opens modal
- [ ] Empty state shows "Add First Evidence"
- [ ] Method selection shows 4 options
- [ ] Google Drive picker works
- [ ] URL form saves link
- [ ] Upload option disabled for Free tier
- [ ] Evidence list shows all attached files
- [ ] Delete removes evidence
- [ ] View opens file in new tab

---

## Files to Create

### Components:
- `components/evidence/EvidenceBadge.tsx`
- `components/evidence/EvidenceModal.tsx`
- `components/evidence/EvidenceItem.tsx`
- `components/evidence/AddEvidenceForm.tsx`
- `components/evidence/URLForm.tsx`
- `components/evidence/FileUploadForm.tsx`

---

## Testing Checklist

- [ ] Badge appears on assessment card
- [ ] Click badge → modal opens
- [ ] Add evidence via Google Drive
- [ ] Add evidence via URL
- [ ] View evidence → opens in new tab
- [ ] Delete evidence → count updates
- [ ] Upload disabled for Free tier
- [ ] Mobile responsive

---

## Related Issues

- Depends on: #14 (Evidence API)
- Depends on: #15 (Google Drive OAuth)
- Related to: #17 (Upload feature Pro tier)
