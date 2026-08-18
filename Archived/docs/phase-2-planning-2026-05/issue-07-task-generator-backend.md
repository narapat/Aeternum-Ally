# Task Generator — Backend Implementation

**Type:** Enhancement  
**Priority:** P1 (High)  
**Labels:** `phase-2`, `task-management`, `backend`, `ai`, `p1`  
**Milestone:** Phase 2 — Task Management  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #3 (tasks table), #5 (Insight Hub Backend)

---

## Problem

Compliance requirements are abstract — users don't know what concrete actions to take:
- "E1 is material" → what does that mean I need to DO?
- Quality flags in Insight Hub → how do I actually fix them?
- Strategic opportunities identified → what are the actual next steps?

---

## Solution

AI generates concrete, actionable tasks from:
1. **Insight Hub flags** → Fix tasks (e.g., "Complete E1 transition risk analysis")
2. **Material topics** → Comply tasks (e.g., "Prepare GHG inventory Scope 1+2")
3. **KPI gaps + opportunities** → Improve tasks (e.g., "Set 2030 carbon reduction target")

Each task includes:
- ESRS traceability (which requirement it addresses)
- Link back to source (assessment/KPI/SWOT)
- Time estimate
- Pre-filled assignee suggestion

---

## API Specification

### New Action: `generateTasks`

**Endpoint:** `POST /.netlify/functions/api`

**Request:**
```json
{
  "action": "generateTasks",
  "assessments": [
    {
      "id": "uuid-e1",
      "topic": "E1",
      "is_material": true,
      "impact_score": 16,
      "financial_score": 16
    }
    // ... all assessments
  ],
  "insightHubFlags": [
    {
      "topic": "E1",
      "status": "needs_fix",
      "issues": [
        {
          "title": "Missing transition risk coverage",
          "description": "...",
          "esrs_ref": "ESRS E1-6"
        }
      ]
    }
  ],
  "kpis": [
    {
      "id": "uuid-kpi-1",
      "name": "Carbon Intensity",
      "current_value": null,
      "target_value": null,
      "linked_topics": ["E1"]
    }
  ],
  "swotOpportunities": [
    "Energy efficiency upgrades",
    "Green manufacturing positioning"
  ]
}
```

**Response:**
```json
{
  "tasks": [
    {
      "id": "task-1",
      "type": "fix",
      "priority": "high",
      "title": "Complete E1 transition risk analysis",
      "description": "Add coverage of technology shifts, carbon pricing impacts, and green tech investment needs to meet ESRS E1-6 disclosure requirements. Current assessment only mentions regulatory fines.",
      "source_type": "insight_hub",
      "source_id": "uuid-e1",
      "esrs_ref": "ESRS E1-6",
      "estimated_time": "2 hours",
      "suggested_assignee": null
    },
    {
      "id": "task-2",
      "type": "comply",
      "priority": "high",
      "title": "Prepare GHG inventory (Scope 1+2)",
      "description": "E1 Climate Change is material. ESRS requires baseline carbon footprint covering direct emissions (Scope 1) and purchased electricity (Scope 2). Set up monthly data collection process.",
      "source_type": "dma",
      "source_id": "uuid-e1",
      "esrs_ref": "ESRS E1-4",
      "estimated_time": "4-6 hours initial setup, 30 min/month ongoing",
      "suggested_assignee": "sustainability_manager"
    },
    {
      "id": "task-3",
      "type": "comply",
      "priority": "high",
      "title": "Document OHS policies and procedures",
      "description": "S1 Own Workforce is material. ESRS requires documented health and safety policies, incident reporting procedures, and training programs.",
      "source_type": "dma",
      "source_id": "uuid-s1",
      "esrs_ref": "ESRS S1-14",
      "estimated_time": "6-8 hours",
      "suggested_assignee": "hr_manager"
    },
    {
      "id": "task-4",
      "type": "improve",
      "priority": "medium",
      "title": "Set 2030 carbon reduction target",
      "description": "Strategic opportunity identified: 15-20% energy savings potential. Set science-based carbon reduction target aligned with Paris Agreement. This positions company for green OEM requirements.",
      "source_type": "swot",
      "source_id": null,
      "esrs_ref": "ESRS E1-5",
      "estimated_time": "3 hours",
      "suggested_assignee": "sustainability_manager"
    },
    {
      "id": "task-5",
      "type": "improve",
      "priority": "low",
      "title": "Establish baseline for Carbon Intensity KPI",
      "description": "KPI 'Carbon Intensity' has no current value. Collect 12 months of emissions and production data to calculate baseline tCO2e per unit.",
      "source_type": "kpi",
      "source_id": "uuid-kpi-1",
      "esrs_ref": null,
      "estimated_time": "2 hours",
      "suggested_assignee": "sustainability_manager"
    }
  ]
}
```

---

## Prompt Engineering

### System Prompt

```
You are a sustainability implementation consultant helping SMEs convert ESRS requirements into concrete, actionable tasks.

Input provided:
- Double Materiality Assessment results (all 10 topics)
- Insight Hub quality flags
- KPI list with current/target values
- SWOT opportunities

Your role:
Generate 3 types of tasks:

1. FIX tasks (from Insight Hub flags):
   - Address quality issues before statement
   - High priority
   - Link to specific assessment + ESRS reference
   
2. COMPLY tasks (from material topics):
   - ESRS required disclosures/actions
   - One task per material topic minimum
   - Include data collection, documentation, policy requirements
   - High priority if external audit coming, medium otherwise
   
3. IMPROVE tasks (from KPIs + SWOT):
   - Strategic opportunities
   - KPIs without baseline → "Establish baseline for [KPI name]"
   - KPIs without target → "Set target for [KPI name]"
   - SWOT opportunities → concrete implementation tasks
   - Medium/low priority

Task requirements:
- Title: Action verb + specific deliverable (max 80 chars)
- Description: What to do, why it matters, what's included (100-200 words)
- Time estimate: Realistic (consider SME resource constraints)
- Assignee suggestion: "sustainability_manager", "hr_manager", "finance_manager", or null

Output format: JSON array of tasks

Quality rules:
- Each material topic → at least 1 comply task
- Each Insight Hub flag → 1 fix task
- Prioritize by urgency: external deadlines > internal improvement
- Time estimates: be realistic (SMEs have limited resources)
```

### Task Generation Logic

```typescript
async function generateTasks(params: {
  assessments: Assessment[];
  insightHubFlags: QualityCheck[];
  kpis: KPI[];
  swotOpportunities: string[];
}): Promise<Task[]> {
  const prompt = buildTaskGenerationPrompt(params);
  
  const response = await callGemini(prompt);
  const parsed = JSON.parse(response);
  
  // Validate structure
  if (!Array.isArray(parsed.tasks)) {
    throw new Error('Response must contain tasks array');
  }
  
  // Validate each task
  parsed.tasks.forEach(validateTask);
  
  return parsed.tasks;
}

function validateTask(task: any): void {
  const requiredFields = ['type', 'priority', 'title', 'description', 'source_type'];
  const missingFields = requiredFields.filter(field => !task[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Task missing fields: ${missingFields.join(', ')}`);
  }
  
  if (!['fix', 'comply', 'improve'].includes(task.type)) {
    throw new Error(`Invalid task type: ${task.type}`);
  }
  
  if (!['high', 'medium', 'low'].includes(task.priority)) {
    throw new Error(`Invalid priority: ${task.priority}`);
  }
  
  if (task.title.length > 80) {
    throw new Error('Task title too long (max 80 chars)');
  }
}
```

---

## Task Categorization Rules

### FIX Tasks (from Insight Hub)
```typescript
function generateFixTasks(flags: QualityCheck[]): Task[] {
  return flags
    .filter(f => f.status === 'needs_fix')
    .flatMap(flag => 
      flag.issues.map(issue => ({
        type: 'fix',
        priority: issue.severity === 'high' ? 'high' : 'medium',
        title: `Fix ${flag.topic}: ${issue.title}`,
        description: issue.description + '\n\n' + issue.fix_suggestion,
        source_type: 'insight_hub',
        source_id: flag.assessmentId,
        esrs_ref: issue.esrs_ref
      }))
    );
}
```

### COMPLY Tasks (from Material Topics)
```typescript
function generateComplyTasks(assessments: Assessment[]): Task[] {
  const materialTopics = assessments.filter(a => a.is_material);
  
  const taskTemplates = {
    'E1': [
      {
        title: 'Prepare GHG inventory (Scope 1+2)',
        description: 'Calculate baseline carbon footprint...',
        esrs_ref: 'ESRS E1-4'
      },
      {
        title: 'Assess climate-related risks and opportunities',
        description: 'Document physical and transition risks...',
        esrs_ref: 'ESRS E1-6'
      }
    ],
    'S1': [
      {
        title: 'Document OHS policies and procedures',
        description: 'Formalize health and safety management...',
        esrs_ref: 'ESRS S1-14'
      }
    ],
    // ... templates for all topics
  };
  
  return materialTopics.flatMap(topic => 
    (taskTemplates[topic.topic] || []).map(template => ({
      type: 'comply',
      priority: 'high',
      ...template,
      source_type: 'dma',
      source_id: topic.id
    }))
  );
}
```

### IMPROVE Tasks (from KPIs + SWOT)
```typescript
function generateImproveTasks(
  kpis: KPI[], 
  opportunities: string[]
): Task[] {
  const kpiTasks = kpis
    .filter(kpi => !kpi.current_value || !kpi.target_value)
    .map(kpi => ({
      type: 'improve',
      priority: kpi.current_value ? 'low' : 'medium',
      title: kpi.current_value 
        ? `Set target for ${kpi.name}` 
        : `Establish baseline for ${kpi.name}`,
      description: `KPI '${kpi.name}' needs ${kpi.current_value ? 'target' : 'baseline'}...`,
      source_type: 'kpi',
      source_id: kpi.id
    }));
  
  const opportunityTasks = opportunities.map(opp => ({
    type: 'improve',
    priority: 'medium',
    title: `Implement: ${opp}`,
    description: `Strategic opportunity identified in SWOT: ${opp}...`,
    source_type: 'swot',
    source_id: null
  }));
  
  return [...kpiTasks, ...opportunityTasks];
}
```

---

## Database Operations

Tasks are NOT created immediately — they're stored as `suggested_tasks` first.

```typescript
async function saveSuggestedTasks(
  organizationId: string,
  tasks: Task[]
): Promise<void> {
  await db.suggested_tasks.createMany({
    data: tasks.map(task => ({
      organization_id: organizationId,
      title: task.title,
      description: task.description,
      type: task.type,
      priority: task.priority,
      source_type: task.source_type,
      source_id: task.source_id,
      esrs_ref: task.esrs_ref,
      estimated_time: task.estimated_time,
      suggested_assignee: task.suggested_assignee
    }))
  });
}
```

User reviews in UI, selects which to create → then actual `tasks` records created (see Issue #8)

---

## AI Usage Logging

```typescript
await logAIUsage({
  organizationId,
  userId,
  action: 'generateTasks',
  model: 'gemini-2.5-flash',
  inputTokens: estimateTokens(prompt),
  outputTokens: estimateTokens(response),
  durationMs: elapsed,
  quotaType: determineQuotaType(organizationId),
  success: true,
  metadata: {
    material_topics: assessments.filter(a => a.is_material).length,
    tasks_generated: tasks.length,
    task_breakdown: {
      fix: tasks.filter(t => t.type === 'fix').length,
      comply: tasks.filter(t => t.type === 'comply').length,
      improve: tasks.filter(t => t.type === 'improve').length
    }
  }
});
```

---

## Acceptance Criteria

- [ ] API action `generateTasks` implemented
- [ ] Generates Fix tasks from Insight Hub flags
- [ ] Generates Comply tasks from material topics (1+ per topic)
- [ ] Generates Improve tasks from KPIs + SWOT
- [ ] Each task has: type, priority, title, description, source link
- [ ] ESRS references included where applicable
- [ ] Time estimates realistic for SMEs
- [ ] Assignee suggestions appropriate
- [ ] Tasks saved to `suggested_tasks` table
- [ ] AI usage logged with metadata
- [ ] Response validation with error handling

---

## Files to Modify

### Backend:
- `netlify/functions/api.ts`
  - Add `case 'generateTasks'`
  
- `services/taskGenerationService.ts` (create)
  - `generateTasks()`
  - `generateFixTasks()`
  - `generateComplyTasks()`
  - `generateImproveTasks()`
  - `validateTask()`

### Database:
- `services/dbService.ts`
  - `saveSuggestedTasks()`

### Types:
- `types/task.ts` (create)
  ```typescript
  export interface Task {
    id: string;
    type: 'fix' | 'comply' | 'improve';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    source_type: 'dma' | 'insight_hub' | 'kpi' | 'swot';
    source_id: string | null;
    esrs_ref?: string;
    estimated_time?: string;
    suggested_assignee?: string;
  }
  ```

---

## Testing Checklist

- [ ] Test with E1 material → generates GHG inventory task
- [ ] Test with S1 material → generates OHS policy task
- [ ] Test with 3 Insight Hub flags → generates 3 fix tasks
- [ ] Test with KPI without baseline → generates baseline task
- [ ] Test with 2 SWOT opportunities → generates 2 improve tasks
- [ ] Verify all tasks have required fields
- [ ] Verify ESRS references accurate
- [ ] Verify time estimates reasonable
- [ ] Test error handling (AI timeout, malformed response)
- [ ] Performance: response within 15 seconds

---

## Related Issues

- Depends on: #3 (tasks table schema)
- Depends on: #5 (Insight Hub provides flags)
- Feeds into: #8 (Task Manager displays suggested tasks)
