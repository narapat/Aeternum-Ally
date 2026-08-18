# Task Manager — Frontend UI Implementation

**Type:** Enhancement  
**Priority:** P1 (High)  
**Labels:** `phase-2`, `task-management`, `ui`, `frontend`, `p1`  
**Milestone:** Phase 2 — Task Management  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #3 (tasks table), #7 (Task Generator Backend)

---

## Problem

Tasks are generated but users need a way to:
- Review AI-suggested tasks before creating them
- Manage ongoing tasks (assign, track progress, complete)
- Link tasks back to their source (assessment/KPI)
- Export for external tools (Excel for traditional managers)

---

## Solution

Two-tab interface:

**Tab 1: Generator** (one-time selection flow)
- Preview all AI-suggested tasks
- Select which ones to create
- Adjust assignee/due date before creating
- Bulk actions (select all Fix tasks, etc.)

**Tab 2: Manager** (ongoing task tracking)
- Table view with filters
- Inline status updates
- Link to source (click "E1" → jumps to assessment)
- Progress tracking
- Excel export/import

**Mockup reference:** `/mnt/user-data/outputs/task-manager.html`

---

## User Journey

### First Time (Generator Flow)

```
User clicks "Generate Tasks" from Insight Hub
  ↓
Loading: "Generating actionable tasks..."
  ↓
Generator tab opens with 3 groups:
  - 🔴 Fix (2 tasks)
  - 🟡 Comply (5 tasks)
  - 🟢 Improve (3 tasks)
  ↓
User reviews:
  - Reads each task
  - Selects tasks to create (checkboxes)
  - Adjusts assignee (dropdown)
  - Sets due date (date picker)
  ↓
Click [Create 7 Selected Tasks]
  ↓
Tasks created → redirect to Manager tab
  ↓
Unselected tasks saved as suggested_tasks
```

### Ongoing (Manager Flow)

```
User navigates to Task Manager
  ↓
Manager tab shows active tasks (table)
  ↓
User actions:
  - Filter by type/status/assignee
  - Update status (dropdown: todo → in_progress → done)
  - Click task → view details + source link
  - Mark task complete
  - Export to Excel
  ↓
Task completion tracked in database
```

---

## Component Structure

```
<TaskManagement>
  <TabBar>
    <Tab active={tab === 'generator'}>Generator</Tab>
    <Tab active={tab === 'manager'}>Manager</Tab>
  </TabBar>
  
  {tab === 'generator' && (
    <TaskGenerator 
      suggestedTasks={suggestedTasks}
      onCreateTasks={handleCreateTasks}
    />
  )}
  
  {tab === 'manager' && (
    <TaskManager 
      tasks={tasks}
      onUpdateTask={handleUpdateTask}
    />
  )}
</TaskManagement>
```

---

## Tab 1: Task Generator

### TaskGenerator Component

```tsx
interface SuggestedTask {
  id: string;
  type: 'fix' | 'comply' | 'improve';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  source_type: string;
  source_id: string | null;
  esrs_ref?: string;
  estimated_time?: string;
  suggested_assignee?: string;
}

function TaskGenerator({ 
  suggestedTasks, 
  onCreateTasks 
}: {
  suggestedTasks: SuggestedTask[];
  onCreateTasks: (selected: TaskCreationData[]) => void;
}) {
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [dueDates, setDueDates] = useState<Record<string, string>>({});
  
  const grouped = {
    fix: suggestedTasks.filter(t => t.type === 'fix'),
    comply: suggestedTasks.filter(t => t.type === 'comply'),
    improve: suggestedTasks.filter(t => t.type === 'improve')
  };
  
  const handleCreate = () => {
    const tasksToCreate = Array.from(selectedTasks).map(taskId => {
      const task = suggestedTasks.find(t => t.id === taskId)!;
      return {
        ...task,
        assignee_id: assignments[taskId] || null,
        due_date: dueDates[taskId] || null
      };
    });
    
    onCreateTasks(tasksToCreate);
  };
  
  return (
    <div className="task-generator">
      <div className="generator-header">
        <h2>Review & Select Tasks</h2>
        <div className="actions">
          <button onClick={() => setSelectedTasks(new Set(suggestedTasks.map(t => t.id)))}>
            Select All
          </button>
          <button onClick={() => setSelectedTasks(new Set())}>
            Deselect All
          </button>
        </div>
      </div>
      
      <TaskGroup 
        title="🔴 Fix (Before Statement)"
        tasks={grouped.fix}
        selectedTasks={selectedTasks}
        onToggle={toggleTask}
        assignments={assignments}
        dueDates={dueDates}
        onAssign={setAssignments}
        onSetDueDate={setDueDates}
      />
      
      <TaskGroup 
        title="🟡 Comply (ESRS Required)"
        tasks={grouped.comply}
        selectedTasks={selectedTasks}
        onToggle={toggleTask}
        assignments={assignments}
        dueDates={dueDates}
        onAssign={setAssignments}
        onSetDueDate={setDueDates}
      />
      
      <TaskGroup 
        title="🟢 Improve (Strategic)"
        tasks={grouped.improve}
        selectedTasks={selectedTasks}
        onToggle={toggleTask}
        assignments={assignments}
        dueDates={dueDates}
        onAssign={setAssignments}
        onSetDueDate={setDueDates}
      />
      
      <div className="generator-footer">
        <button 
          className="create-button"
          disabled={selectedTasks.size === 0}
          onClick={handleCreate}
        >
          Create {selectedTasks.size} Selected Tasks
        </button>
      </div>
    </div>
  );
}
```

### TaskGroup Component

```tsx
function TaskGroup({
  title,
  tasks,
  selectedTasks,
  onToggle,
  assignments,
  dueDates,
  onAssign,
  onSetDueDate
}: TaskGroupProps) {
  return (
    <div className="task-group">
      <h3>{title}</h3>
      <div className="tasks-list">
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            selected={selectedTasks.has(task.id)}
            onToggle={() => onToggle(task.id)}
            assignee={assignments[task.id]}
            dueDate={dueDates[task.id]}
            onAssign={(assigneeId) => onAssign(prev => ({
              ...prev,
              [task.id]: assigneeId
            }))}
            onSetDueDate={(date) => onSetDueDate(prev => ({
              ...prev,
              [task.id]: date
            }))}
          />
        ))}
      </div>
    </div>
  );
}
```

### TaskCard Component

```tsx
function TaskCard({
  task,
  selected,
  onToggle,
  assignee,
  dueDate,
  onAssign,
  onSetDueDate
}: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className={`task-card ${selected ? 'selected' : ''}`}>
      <div className="card-header">
        <input 
          type="checkbox" 
          checked={selected}
          onChange={onToggle}
        />
        <div className="title" onClick={() => setExpanded(!expanded)}>
          {task.title}
        </div>
        <span className={`priority-badge ${task.priority}`}>
          {task.priority}
        </span>
      </div>
      
      {expanded && (
        <div className="card-body">
          <div className="description">{task.description}</div>
          
          {task.esrs_ref && (
            <div className="esrs-ref">ESRS: {task.esrs_ref}</div>
          )}
          
          {task.estimated_time && (
            <div className="time-estimate">⏱ {task.estimated_time}</div>
          )}
          
          <div className="task-controls">
            <label>
              Assign to:
              <select 
                value={assignee || ''} 
                onChange={(e) => onAssign(e.target.value)}
              >
                <option value="">Unassigned</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
            
            <label>
              Due date:
              <input 
                type="date" 
                value={dueDate || ''}
                onChange={(e) => onSetDueDate(e.target.value)}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Tab 2: Task Manager

### TaskManager Component

```tsx
interface Task {
  id: string;
  title: string;
  type: 'fix' | 'comply' | 'improve';
  status: 'todo' | 'in_progress' | 'done';
  priority: 'high' | 'medium' | 'low';
  assignee?: { id: string; name: string };
  due_date?: string;
  source_type: string;
  source_id?: string;
  esrs_ref?: string;
  created_at: string;
  completed_at?: string;
}

function TaskManager({ 
  tasks, 
  onUpdateTask 
}: {
  tasks: Task[];
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
}) {
  const [filters, setFilters] = useState({
    type: 'all',
    status: 'all',
    assignee: 'all'
  });
  
  const filteredTasks = tasks.filter(task => {
    if (filters.type !== 'all' && task.type !== filters.type) return false;
    if (filters.status !== 'all' && task.status !== filters.status) return false;
    if (filters.assignee !== 'all' && task.assignee?.id !== filters.assignee) return false;
    return true;
  });
  
  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    completion_rate: Math.round((tasks.filter(t => t.status === 'done').length / tasks.length) * 100)
  };
  
  return (
    <div className="task-manager">
      <div className="manager-header">
        <h2>Task Manager</h2>
        <div className="actions">
          <button onClick={exportToExcel}>
            📥 Export Excel
          </button>
          <button onClick={importFromExcel}>
            📤 Import Excel
          </button>
        </div>
      </div>
      
      <ProgressBar stats={stats} />
      
      <div className="filters">
        <select value={filters.type} onChange={(e) => setFilters(prev => ({
          ...prev,
          type: e.target.value
        }))}>
          <option value="all">All Types</option>
          <option value="fix">Fix</option>
          <option value="comply">Comply</option>
          <option value="improve">Improve</option>
        </select>
        
        <select value={filters.status} onChange={(e) => setFilters(prev => ({
          ...prev,
          status: e.target.value
        }))}>
          <option value="all">All Status</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        
        <select value={filters.assignee} onChange={(e) => setFilters(prev => ({
          ...prev,
          assignee: e.target.value
        }))}>
          <option value="all">All Assignees</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
      
      <TaskTable 
        tasks={filteredTasks}
        onUpdateTask={onUpdateTask}
      />
    </div>
  );
}
```

### TaskTable Component

```tsx
function TaskTable({ 
  tasks, 
  onUpdateTask 
}: {
  tasks: Task[];
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
}) {
  return (
    <table className="task-table">
      <thead>
        <tr>
          <th>Task</th>
          <th>Type</th>
          <th>Status</th>
          <th>Priority</th>
          <th>Assignee</th>
          <th>Due Date</th>
          <th>Source</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map(task => (
          <TaskRow 
            key={task.id}
            task={task}
            onUpdateTask={onUpdateTask}
          />
        ))}
      </tbody>
    </table>
  );
}

function TaskRow({ 
  task, 
  onUpdateTask 
}: {
  task: Task;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
}) {
  return (
    <tr className={`task-row status-${task.status}`}>
      <td className="task-title">
        {task.title}
        {task.esrs_ref && (
          <span className="esrs-badge">{task.esrs_ref}</span>
        )}
      </td>
      
      <td>
        <span className={`type-badge ${task.type}`}>
          {task.type}
        </span>
      </td>
      
      <td>
        <select 
          value={task.status}
          onChange={(e) => onUpdateTask(task.id, { 
            status: e.target.value as Task['status'],
            completed_at: e.target.value === 'done' ? new Date().toISOString() : null
          })}
        >
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </td>
      
      <td>
        <span className={`priority-badge ${task.priority}`}>
          {task.priority}
        </span>
      </td>
      
      <td>{task.assignee?.name || 'Unassigned'}</td>
      
      <td>{task.due_date ? formatDate(task.due_date) : '-'}</td>
      
      <td>
        {task.source_id ? (
          <button 
            className="source-link"
            onClick={() => navigateToSource(task.source_type, task.source_id)}
          >
            {task.source_type === 'dma' && 'View Assessment'}
            {task.source_type === 'kpi' && 'View KPI'}
            {task.source_type === 'insight_hub' && 'View Issue'}
          </button>
        ) : (
          <span>Manual</span>
        )}
      </td>
      
      <td>
        <button onClick={() => deleteTask(task.id)}>🗑️</button>
      </td>
    </tr>
  );
}
```

### ProgressBar Component

```tsx
function ProgressBar({ stats }: { stats: TaskStats }) {
  return (
    <div className="progress-section">
      <div className="progress-bar">
        <div 
          className="progress-fill"
          style={{ width: `${stats.completion_rate}%` }}
        />
      </div>
      <div className="progress-stats">
        <span>{stats.completion_rate}% Complete</span>
        <span>{stats.done} / {stats.total} tasks done</span>
      </div>
    </div>
  );
}
```

---

## Excel Export/Import

### Export

```typescript
async function exportToExcel(tasks: Task[]) {
  const data = tasks.map(task => ({
    'Task ID': task.id,
    'Title': task.title,
    'Type': task.type,
    'Status': task.status,
    'Priority': task.priority,
    'Assignee': task.assignee?.name || '',
    'Due Date': task.due_date || '',
    'ESRS Ref': task.esrs_ref || '',
    'Created': formatDate(task.created_at),
    'Completed': task.completed_at ? formatDate(task.completed_at) : ''
  }));
  
  // Use library like xlsx or export as CSV
  const csv = convertToCSV(data);
  downloadFile(csv, 'tasks.csv');
}
```

### Import

```typescript
async function importFromExcel(file: File) {
  const data = await parseExcelFile(file);
  
  // Validate columns
  const requiredColumns = ['Task ID', 'Status'];
  validateColumns(data, requiredColumns);
  
  // Update tasks
  for (const row of data) {
    await updateTask(row['Task ID'], {
      status: row['Status'],
      assignee: row['Assignee'],
      due_date: row['Due Date']
    });
  }
}
```

---

## Acceptance Criteria

- [ ] Generator tab displays grouped suggested tasks
- [ ] User can select/deselect tasks
- [ ] User can adjust assignee and due date before creating
- [ ] Create button creates actual task records
- [ ] Unselected tasks saved as suggested_tasks
- [ ] Manager tab shows task table
- [ ] Filters work (type, status, assignee)
- [ ] Status dropdown updates task in real-time
- [ ] Click source link navigates to assessment/KPI
- [ ] Progress bar shows completion %
- [ ] Excel export downloads CSV
- [ ] Excel import updates task status

---

## Files to Create/Modify

### New Components:
- `components/TaskManagement.tsx` (main container)
- `components/task-manager/TaskGenerator.tsx`
- `components/task-manager/TaskManager.tsx`
- `components/task-manager/TaskCard.tsx`
- `components/task-manager/TaskTable.tsx`
- `components/task-manager/ProgressBar.tsx`

### Services:
- `services/taskService.ts`
  - `fetchSuggestedTasks()`
  - `createTasks()`
  - `fetchTasks()`
  - `updateTask()`
  - `exportToExcel()`
  - `importFromExcel()`

### Routing:
- `pages/tasks.tsx` (new route)

### Styling:
- `styles/task-manager.css`

---

## Testing Checklist

- [ ] Generate 10 tasks → all appear in Generator
- [ ] Select 5 tasks → create button shows "Create 5 Selected Tasks"
- [ ] Adjust assignee → reflected in created task
- [ ] Create tasks → redirects to Manager tab
- [ ] Manager shows created tasks
- [ ] Update status → saved to database
- [ ] Filter by type → shows correct tasks
- [ ] Click source link → navigates correctly
- [ ] Export Excel → downloads CSV
- [ ] Import Excel → updates tasks
- [ ] Mobile responsive

---

## Related Issues

- Depends on: #7 (Task Generator Backend)
- Relates to: #9 (Suggested tasks ambient badges)
