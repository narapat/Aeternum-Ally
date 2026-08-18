# Suggested Tasks System — Ambient Discovery (Option C)

**Type:** Enhancement  
**Priority:** P1 (High)  
**Labels:** `phase-2`, `task-management`, `ux`, `p1`  
**Milestone:** Phase 2 — Task Management  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #7 (Task Generator), #8 (Task Manager UI)

---

## Problem

When user generates tasks but doesn't select all of them:
- Unselected tasks disappear → lost opportunity
- User might change mind later but has no way to recover them
- No "soft suggestion" mechanism → it's all-or-nothing

---

## Solution: Option C — Ambient Discovery

Unselected tasks don't vanish. They appear as **ambient badges** at their source locations:

```
E1 Climate Change Assessment  [✨ 3 AI Tasks]
                               ↑ clickable badge

KPI: Carbon Intensity  [✨ 2 suggested tasks]
```

User can:
- Click badge → see suggested tasks in modal
- Promote to real task (one-click)
- Dismiss permanently (X button)
- Re-generate if dismissed by mistake

---

## User Experience

### Scenario 1: User Dismissed Tasks During Generation

```
Generator: User unchecks "Set 2030 carbon target"
  ↓
[Create 7 Selected Tasks]
  ↓
Task "Set 2030 carbon target" saved to suggested_tasks
  dismissed = false
  ↓
Later, user visits E1 Assessment:
  Shows badge: [✨ 1 AI Task]
  ↓
User clicks badge → modal shows:
  "Set 2030 carbon reduction target"
  [Create Task] [Dismiss Forever]
```

### Scenario 2: User Never Generated Tasks

```
User skips Task Generator entirely
  ↓
Visits E1 Assessment
  No badge (no suggested tasks exist)
  ↓
[Optional] Tooltip: "You can generate tasks from Insight Hub"
```

### Scenario 3: User Dismissed Then Changed Mind

```
User clicks [Dismiss Forever] on "Set carbon target"
  dismissed = true, dismissed_at = now
  ↓
Badge disappears
  ↓
User goes to Task Manager → Settings:
  "Show dismissed suggestions" toggle
  ↓
Toggle ON → dismissed tasks reappear with badge
  [↻ Restore Task]
```

---

## Technical Implementation

### Database Schema (from Issue #3)

```sql
suggested_tasks
├── id
├── organization_id
├── title
├── description
├── type (fix / comply / improve)
├── priority
├── source_type (dma / kpi / insight_hub)
├── source_id
├── esrs_ref
├── dismissed (boolean, default false)
├── dismissed_at
├── dismissed_by
├── converted_to_task_id (FK to tasks.id)
├── converted_at
```

### Badge Logic

```typescript
// Fetch suggested tasks for a specific source
async function getSuggestedTasksForSource(
  sourceType: string,
  sourceId: string
): Promise<SuggestedTask[]> {
  return await db.suggested_tasks.findMany({
    where: {
      organization_id: currentOrgId,
      source_type: sourceType,
      source_id: sourceId,
      dismissed: false,
      converted_to_task_id: null
    }
  });
}

// Count for badge
async function getSuggestedTaskCount(
  sourceType: string,
  sourceId: string
): Promise<number> {
  return await db.suggested_tasks.count({
    where: {
      organization_id: currentOrgId,
      source_type: sourceType,
      source_id: sourceId,
      dismissed: false,
      converted_to_task_id: null
    }
  });
}
```

### Badge Component

```tsx
interface AmbientTaskBadgeProps {
  sourceType: 'dma' | 'kpi' | 'insight_hub';
  sourceId: string;
}

function AmbientTaskBadge({ sourceType, sourceId }: AmbientTaskBadgeProps) {
  const [count, setCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  
  useEffect(() => {
    loadSuggestedTaskCount(sourceType, sourceId).then(setCount);
  }, [sourceType, sourceId]);
  
  if (count === 0) return null;
  
  return (
    <>
      <button 
        className="task-badge"
        onClick={() => setShowModal(true)}
      >
        ✨ {count} AI Task{count > 1 ? 's' : ''}
      </button>
      
      {showModal && (
        <SuggestedTasksModal
          sourceType={sourceType}
          sourceId={sourceId}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
```

---

## Modal UI

```tsx
function SuggestedTasksModal({
  sourceType,
  sourceId,
  onClose
}: SuggestedTasksModalProps) {
  const [tasks, setTasks] = useState<SuggestedTask[]>([]);
  
  useEffect(() => {
    loadSuggestedTasks(sourceType, sourceId).then(setTasks);
  }, [sourceType, sourceId]);
  
  const handleCreateTask = async (task: SuggestedTask) => {
    // Create actual task
    const newTask = await createTask({
      title: task.title,
      description: task.description,
      type: task.type,
      priority: task.priority,
      source_type: task.source_type,
      source_id: task.source_id,
      esrs_ref: task.esrs_ref
    });
    
    // Mark as converted
    await markAsConverted(task.id, newTask.id);
    
    // Refresh list
    const updated = tasks.filter(t => t.id !== task.id);
    setTasks(updated);
    
    showNotification('Task created successfully!');
  };
  
  const handleDismiss = async (taskId: string) => {
    await dismissTask(taskId);
    const updated = tasks.filter(t => t.id !== taskId);
    setTasks(updated);
  };
  
  return (
    <Modal onClose={onClose}>
      <div className="suggested-tasks-modal">
        <h3>AI-Suggested Tasks</h3>
        <p>These tasks were generated but not created yet.</p>
        
        <div className="tasks-list">
          {tasks.map(task => (
            <div key={task.id} className="suggested-task-card">
              <div className="task-header">
                <span className={`type-badge ${task.type}`}>
                  {task.type}
                </span>
                <span className={`priority-badge ${task.priority}`}>
                  {task.priority}
                </span>
              </div>
              
              <h4>{task.title}</h4>
              <p>{task.description}</p>
              
              {task.esrs_ref && (
                <div className="esrs-ref">ESRS: {task.esrs_ref}</div>
              )}
              
              <div className="task-actions">
                <button 
                  className="create-button"
                  onClick={() => handleCreateTask(task)}
                >
                  ✓ Create Task
                </button>
                <button 
                  className="dismiss-button"
                  onClick={() => handleDismiss(task.id)}
                >
                  ✕ Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
```

---

## Badge Placement

### 1. Assessment Cards (DMA)

```tsx
function AssessmentCard({ assessment }: { assessment: Assessment }) {
  return (
    <div className="assessment-card">
      <h3>
        {assessment.topic} {assessment.topicTitle}
        <AmbientTaskBadge 
          sourceType="dma" 
          sourceId={assessment.id} 
        />
      </h3>
      {/* ... rest of card */}
    </div>
  );
}
```

### 2. KPI Dashboard

```tsx
function KPICard({ kpi }: { kpi: KPI }) {
  return (
    <div className="kpi-card">
      <h3>
        {kpi.name}
        <AmbientTaskBadge 
          sourceType="kpi" 
          sourceId={kpi.id} 
        />
      </h3>
      {/* ... rest of card */}
    </div>
  );
}
```

### 3. Insight Hub Quality Checks

```tsx
function QualityCheckCard({ check }: { check: QualityCheck }) {
  return (
    <div className="check-card">
      <h3>
        {check.topic}
        <AmbientTaskBadge 
          sourceType="insight_hub" 
          sourceId={check.assessmentId} 
        />
      </h3>
      {/* ... rest of card */}
    </div>
  );
}
```

---

## Dismissed Tasks Management

### Settings Panel

```tsx
function TaskSettings() {
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissedTasks, setDismissedTasks] = useState<SuggestedTask[]>([]);
  
  useEffect(() => {
    if (showDismissed) {
      loadDismissedTasks().then(setDismissedTasks);
    }
  }, [showDismissed]);
  
  const handleRestore = async (taskId: string) => {
    await restoreTask(taskId); // set dismissed = false
    const updated = dismissedTasks.filter(t => t.id !== taskId);
    setDismissedTasks(updated);
  };
  
  return (
    <div className="task-settings">
      <h3>Suggested Tasks Settings</h3>
      
      <label>
        <input 
          type="checkbox"
          checked={showDismissed}
          onChange={(e) => setShowDismissed(e.target.checked)}
        />
        Show dismissed suggestions
      </label>
      
      {showDismissed && dismissedTasks.length > 0 && (
        <div className="dismissed-tasks-list">
          <h4>Dismissed Tasks</h4>
          {dismissedTasks.map(task => (
            <div key={task.id} className="dismissed-task">
              <span>{task.title}</span>
              <button onClick={() => handleRestore(task.id)}>
                ↻ Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## API Endpoints

### Get Suggested Tasks

```typescript
// GET /api/suggested-tasks?source_type=dma&source_id=uuid
async function getSuggestedTasks(
  sourceType: string,
  sourceId: string
): Promise<SuggestedTask[]> {
  return await db.suggested_tasks.findMany({
    where: {
      organization_id: currentOrgId,
      source_type: sourceType,
      source_id: sourceId,
      dismissed: false,
      converted_to_task_id: null
    },
    orderBy: { priority: 'asc' }
  });
}
```

### Create Task from Suggestion

```typescript
// POST /api/tasks/from-suggestion
async function createTaskFromSuggestion(
  suggestionId: string
): Promise<Task> {
  const suggestion = await db.suggested_tasks.findUnique({
    where: { id: suggestionId }
  });
  
  if (!suggestion) {
    throw new Error('Suggestion not found');
  }
  
  // Create actual task
  const task = await db.tasks.create({
    data: {
      organization_id: suggestion.organization_id,
      title: suggestion.title,
      description: suggestion.description,
      type: suggestion.type,
      status: 'todo',
      priority: suggestion.priority,
      source_type: suggestion.source_type,
      source_id: suggestion.source_id,
      esrs_ref: suggestion.esrs_ref,
      created_by: currentUserId
    }
  });
  
  // Mark suggestion as converted
  await db.suggested_tasks.update({
    where: { id: suggestionId },
    data: {
      converted_to_task_id: task.id,
      converted_at: new Date()
    }
  });
  
  return task;
}
```

### Dismiss Suggestion

```typescript
// POST /api/suggested-tasks/:id/dismiss
async function dismissSuggestion(suggestionId: string): Promise<void> {
  await db.suggested_tasks.update({
    where: { id: suggestionId },
    data: {
      dismissed: true,
      dismissed_at: new Date(),
      dismissed_by: currentUserId
    }
  });
}
```

### Restore Suggestion

```typescript
// POST /api/suggested-tasks/:id/restore
async function restoreSuggestion(suggestionId: string): Promise<void> {
  await db.suggested_tasks.update({
    where: { id: suggestionId },
    data: {
      dismissed: false,
      dismissed_at: null,
      dismissed_by: null
    }
  });
}
```

---

## Styling

```css
.task-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  color: white;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: transform 0.2s;
}

.task-badge:hover {
  transform: scale(1.05);
}

.suggested-tasks-modal {
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}

.suggested-task-card {
  background: #1a1f2e;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.task-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.create-button {
  flex: 1;
  background: #10b981;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: none;
  cursor: pointer;
}

.dismiss-button {
  background: #ef4444;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: none;
  cursor: pointer;
}
```

---

## Acceptance Criteria

- [ ] Badge appears on assessments/KPIs with suggested tasks
- [ ] Badge count reflects actual suggested tasks (dismissed excluded)
- [ ] Click badge opens modal with task list
- [ ] "Create Task" converts suggestion to actual task
- [ ] "Dismiss" hides suggestion permanently
- [ ] Converted tasks marked with converted_to_task_id
- [ ] Settings panel shows dismissed tasks when toggled
- [ ] Restore button re-enables dismissed tasks
- [ ] Badge disappears when no suggestions remain

---

## Files to Create/Modify

### New Components:
- `components/AmbientTaskBadge.tsx`
- `components/SuggestedTasksModal.tsx`
- `components/task-manager/TaskSettings.tsx`

### Modified Components:
- `components/AssessmentCard.tsx` (add badge)
- `components/KPICard.tsx` (add badge)
- `components/insight-hub/QualityCheckCard.tsx` (add badge)

### API:
- `netlify/functions/api.ts`
  - Add routes for suggested tasks CRUD

---

## Testing Checklist

- [ ] Generate 10 tasks, select 5 → 5 remain as suggested
- [ ] Badge appears with count "5"
- [ ] Click badge → modal shows 5 tasks
- [ ] Create 1 task → badge updates to "4"
- [ ] Dismiss 1 task → badge updates to "3"
- [ ] Toggle "Show dismissed" → dismissed task appears
- [ ] Restore dismissed task → badge reappears
- [ ] All suggested tasks converted → badge disappears

---

## Related Issues

- Depends on: #7 (Task Generator creates suggested_tasks)
- Depends on: #8 (Task Manager UI)
- Enhances: #6 (Insight Hub can show task badges)
