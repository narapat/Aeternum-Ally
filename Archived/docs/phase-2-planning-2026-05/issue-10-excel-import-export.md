# Task Excel Import/Export

**Type:** Enhancement  
**Priority:** P1 (High)  
**Labels:** `phase-2`, `task-management`, `integration`, `p1`  
**Milestone:** Phase 2 — Task Management  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #8 (Task Manager UI)

---

## Problem

Traditional managers prefer Excel for task management:
- Want to work offline
- Existing workflows in Excel/Google Sheets
- Bulk operations easier in spreadsheet
- Need to share with external consultants who don't have platform access

---

## Solution

Two-way sync with Excel:
- **Export:** Download all tasks as Excel/CSV
- **Import:** Update task status/assignee via Excel upload
- Validation + error handling
- Clear template with instructions

---

## Export Feature

### Export Button (in Task Manager)

```tsx
function TaskManagerHeader() {
  return (
    <div className="manager-header">
      <h2>Task Manager</h2>
      <div className="actions">
        <button onClick={handleExport}>
          📥 Export to Excel
        </button>
      </div>
    </div>
  );
}
```

### Export Implementation

```typescript
async function exportTasksToExcel(tasks: Task[]): Promise<void> {
  const data = tasks.map(task => ({
    'Task ID': task.id,
    'Title': task.title,
    'Description': task.description,
    'Type': task.type,
    'Status': task.status,
    'Priority': task.priority,
    'Assignee': task.assignee?.name || '',
    'Assignee Email': task.assignee?.email || '',
    'Due Date': task.due_date ? formatDate(task.due_date) : '',
    'ESRS Reference': task.esrs_ref || '',
    'Source Type': task.source_type,
    'Created At': formatDate(task.created_at),
    'Completed At': task.completed_at ? formatDate(task.completed_at) : '',
    'Notes': ''  // Empty column for user to add notes
  }));
  
  // Option 1: CSV (simple, works everywhere)
  const csv = convertToCSV(data);
  downloadFile(csv, `aeternumally-tasks-${formatDate(new Date())}.csv`, 'text/csv');
  
  // Option 2: XLSX (better formatting, requires library like xlsx)
  const workbook = createWorkbook(data);
  downloadWorkbook(workbook, `aeternumally-tasks-${formatDate(new Date())}.xlsx`);
}

function convertToCSV(data: Record<string, any>[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escape commas and quotes
        const escaped = String(value).replace(/"/g, '""');
        return value.includes(',') || value.includes('"') ? `"${escaped}"` : value;
      }).join(',')
    )
  ];
  
  return csvRows.join('\n');
}
```

### Using xlsx Library (Better Option)

```typescript
import * as XLSX from 'xlsx';

function createWorkbook(data: Record<string, any>[]): XLSX.WorkBook {
  // Create worksheet
  const ws = XLSX.utils.json_to_sheet(data);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 36 },  // Task ID
    { wch: 40 },  // Title
    { wch: 60 },  // Description
    { wch: 10 },  // Type
    { wch: 12 },  // Status
    { wch: 10 },  // Priority
    { wch: 20 },  // Assignee
    { wch: 25 },  // Assignee Email
    { wch: 12 },  // Due Date
    { wch: 15 },  // ESRS Reference
    { wch: 15 },  // Source Type
    { wch: 18 },  // Created At
    { wch: 18 },  // Completed At
    { wch: 40 }   // Notes
  ];
  
  // Add instructions sheet
  const instructions = createInstructionsSheet();
  
  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
  XLSX.utils.book_append_sheet(wb, instructions, 'Instructions');
  
  return wb;
}

function createInstructionsSheet(): XLSX.WorkSheet {
  const instructions = [
    ['AeternumAlly Task Export/Import Instructions'],
    [''],
    ['HOW TO UPDATE TASKS:'],
    ['1. Edit ONLY these columns: Status, Assignee Email, Due Date, Notes'],
    ['2. Do NOT edit Task ID, Title, or Type columns'],
    ['3. Valid Status values: todo, in_progress, done'],
    ['4. Due Date format: YYYY-MM-DD (e.g., 2026-12-31)'],
    ['5. Save as Excel (.xlsx) or CSV (.csv)'],
    ['6. Upload via Import button in Task Manager'],
    [''],
    ['NOTES:'],
    ['- Task ID is required for updates (do not delete this column)'],
    ['- Assignee Email must match an organization member'],
    ['- Invalid rows will be skipped with error messages'],
    ['- Completed At will be auto-filled when Status = done']
  ];
  
  return XLSX.utils.aoa_to_sheet(instructions);
}

function downloadWorkbook(workbook: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(workbook, filename);
}
```

---

## Import Feature

### Import Button + File Picker

```tsx
function TaskManagerHeader() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleImport = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImportLoading(true);
    try {
      const result = await importTasksFromExcel(file);
      showImportResults(result);
    } catch (error) {
      showError('Import failed: ' + error.message);
    } finally {
      setImportLoading(false);
    }
  };
  
  return (
    <div className="manager-header">
      <h2>Task Manager</h2>
      <div className="actions">
        <button onClick={handleExport}>📥 Export</button>
        <button onClick={handleImport}>📤 Import</button>
        <input 
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>
    </div>
  );
}
```

### Import Implementation

```typescript
interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{
    row: number;
    taskId: string;
    error: string;
  }>;
}

async function importTasksFromExcel(file: File): Promise<ImportResult> {
  // Parse file
  const data = await parseExcelFile(file);
  
  // Validate structure
  validateImportData(data);
  
  // Process updates
  const result: ImportResult = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    try {
      await updateTaskFromImport(row);
      result.success++;
    } catch (error) {
      result.failed++;
      result.errors.push({
        row: i + 2, // +2 for header row + 0-indexed
        taskId: row['Task ID'],
        error: error.message
      });
    }
  }
  
  return result;
}

async function parseExcelFile(file: File): Promise<Record<string, any>[]> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Detect file type
  if (file.name.endsWith('.csv')) {
    return parseCSV(arrayBuffer);
  } else {
    return parseXLSX(arrayBuffer);
  }
}

function parseCSV(buffer: ArrayBuffer): Record<string, any>[] {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1)
    .filter(line => line.trim())
    .map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      return headers.reduce((obj, header, idx) => {
        obj[header] = values[idx] || '';
        return obj;
      }, {} as Record<string, any>);
    });
}

function parseXLSX(buffer: ArrayBuffer): Record<string, any>[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet);
}

function validateImportData(data: Record<string, any>[]): void {
  if (data.length === 0) {
    throw new Error('File is empty');
  }
  
  const requiredColumns = ['Task ID', 'Status'];
  const headers = Object.keys(data[0]);
  
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));
  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
  }
}

async function updateTaskFromImport(row: Record<string, any>): Promise<void> {
  const taskId = row['Task ID'];
  if (!taskId) {
    throw new Error('Task ID is required');
  }
  
  // Validate status
  const status = row['Status']?.toLowerCase();
  if (status && !['todo', 'in_progress', 'done'].includes(status)) {
    throw new Error(`Invalid status: ${row['Status']}`);
  }
  
  // Validate due date format
  const dueDate = row['Due Date'];
  if (dueDate && !isValidDate(dueDate)) {
    throw new Error(`Invalid date format: ${dueDate}. Use YYYY-MM-DD`);
  }
  
  // Find assignee by email
  let assigneeId = null;
  if (row['Assignee Email']) {
    const member = await findMemberByEmail(row['Assignee Email']);
    if (!member) {
      throw new Error(`Assignee not found: ${row['Assignee Email']}`);
    }
    assigneeId = member.id;
  }
  
  // Update task
  await db.tasks.update({
    where: { id: taskId },
    data: {
      status: status || undefined,
      assignee_id: assigneeId,
      due_date: dueDate || undefined,
      completed_at: status === 'done' ? new Date() : undefined,
      updated_at: new Date()
    }
  });
}

function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}
```

---

## Import Results Modal

```tsx
function ImportResultsModal({ result }: { result: ImportResult }) {
  return (
    <Modal>
      <div className="import-results">
        <h3>Import Complete</h3>
        
        <div className="results-summary">
          <div className="stat success">
            <span className="value">{result.success}</span>
            <span className="label">Tasks Updated</span>
          </div>
          
          {result.failed > 0 && (
            <div className="stat failed">
              <span className="value">{result.failed}</span>
              <span className="label">Failed</span>
            </div>
          )}
        </div>
        
        {result.errors.length > 0 && (
          <div className="errors">
            <h4>Errors:</h4>
            <ul>
              {result.errors.map((err, idx) => (
                <li key={idx}>
                  Row {err.row} (Task: {err.taskId}): {err.error}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <button onClick={closeModal}>Close</button>
      </div>
    </Modal>
  );
}
```

---

## Error Handling

### Common Errors & Solutions

**Error:** "Missing required columns: Task ID"
- **Cause:** User deleted Task ID column
- **Solution:** Task ID is required for updates. Do not modify this column.

**Error:** "Invalid status: Done"
- **Cause:** Status value is capitalized
- **Solution:** Use lowercase: todo, in_progress, done

**Error:** "Invalid date format: 31/12/2026"
- **Cause:** Wrong date format
- **Solution:** Use YYYY-MM-DD format (e.g., 2026-12-31)

**Error:** "Assignee not found: john@example.com"
- **Cause:** Email doesn't match any org member
- **Solution:** Check spelling or add member to organization first

**Error:** "Task ID not found: abc-123"
- **Cause:** Task was deleted or ID is wrong
- **Solution:** Only update tasks from the exported file

---

## Acceptance Criteria

- [ ] Export button downloads Excel file
- [ ] Exported file contains all task data
- [ ] Exported file includes Instructions sheet
- [ ] Import button accepts .xlsx and .csv files
- [ ] Import validates required columns
- [ ] Import validates status values
- [ ] Import validates date format
- [ ] Import finds assignee by email
- [ ] Import results show success/failed counts
- [ ] Import errors list specific issues per row
- [ ] Updated tasks reflect changes in UI immediately

---

## Files to Modify

### Frontend:
- `components/task-manager/TaskManager.tsx`
  - Add export/import buttons
  - Add file input handler
  - Add import results modal

### Backend:
- `services/taskExportService.ts` (create)
  - `exportTasksToExcel()`
  - `createWorkbook()`
  - `createInstructionsSheet()`

- `services/taskImportService.ts` (create)
  - `importTasksFromExcel()`
  - `parseExcelFile()`
  - `validateImportData()`
  - `updateTaskFromImport()`

### Dependencies:
- Add `xlsx` library to package.json
  ```bash
  npm install xlsx
  npm install --save-dev @types/xlsx
  ```

---

## Testing Checklist

- [ ] Export 10 tasks → file downloads successfully
- [ ] Open exported file → all columns present
- [ ] Read Instructions sheet → clear guidance
- [ ] Edit Status column → import updates successfully
- [ ] Edit Assignee Email → import finds member correctly
- [ ] Edit Due Date → import accepts YYYY-MM-DD format
- [ ] Invalid Status → import shows error
- [ ] Invalid Date → import shows error
- [ ] Missing Task ID → import shows error
- [ ] Unknown Assignee → import shows error
- [ ] CSV file → import works
- [ ] XLSX file → import works
- [ ] 100 tasks → export/import performs well

---

## Future Enhancements (Not in Phase 2)

- Bulk create (not just update) via import
- Import validation preview before committing
- Export filters (only Fix tasks, only overdue, etc.)
- Google Sheets integration (live sync)
- Export to other formats (PDF, Markdown)

---

## Related Issues

- Depends on: #8 (Task Manager UI)
- Enhances task management workflow for traditional managers
