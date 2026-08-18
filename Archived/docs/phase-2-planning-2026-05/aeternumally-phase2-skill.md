# AeternumAlly Phase 2 Implementation

## Skill Purpose

This skill helps Claude Code implement Phase 2 features for AeternumAlly, a sustainability reporting SaaS platform targeting SMEs with EU CSRD/ESRS compliance focus.

## When to Use This Skill

Use this skill when working on:
- Database migrations (BMC/SWOT to jsonb, new tables for tasks/carbon/evidence)
- AI integration improvements (structured output, guided scoring, quality analysis)
- Task management system (generator, manager, suggested tasks, Excel import/export)
- Carbon accounting (gamified wizard, recurring dashboard, emission factors)
- Evidence vault (link-based free tier, upload Pro tier, Google Drive OAuth)
- Premium features (storage quota, AI quota system)

## Tech Stack Context

**Stack:**
- Frontend: React 19 + Vite 6 + TypeScript SPA (Netlify hosting)
- Backend: Netlify Functions (serverless)
- Database: Supabase (PostgreSQL + Row Level Security)
- AI: Google Gemini API (server-side only, via Netlify Functions proxy)
- Auth: Supabase magic-link authentication
- License: AGPL-3.0

**Architecture:**
- Multi-tenant via `organization_id` + Postgres RLS
- All API calls go through `/netlify/functions/api.ts` (single serverless function)
- No CORS issues (Netlify Functions same-origin)
- AI calls proxied server-side (API key never exposed to frontend)

**Database Patterns:**
- Singleton tables (1 per org): `company_profiles`, `business_model_canvases`, `swot_analyses`
- Array tables (many per org): `assessments`, `kpis`, `tasks`, `emission_entries`
- RLS helpers: `is_org_member(org_id)`, `user_org_role(org_id)`
- Organization creation: `create_organization_with_owner()` RPC (SECURITY DEFINER)

## Key Principles

1. **Multi-tenancy First**: Every table has `organization_id`, every query filters by org
2. **RLS Always On**: Never disable RLS, use SECURITY DEFINER RPCs when needed
3. **AI Server-Side Only**: API keys never exposed to frontend, always proxy through Netlify Functions
4. **Structured AI Output**: AI returns JSON arrays/objects, validate before storing
5. **Traceability**: Every entity links back to source (tasks→assessments, evidence→kpis, etc.)
6. **Tier Gating**: Check subscription tier before allowing Pro features (upload, advanced AI)

## Phase 2 Feature Roadmap

### P0 — Foundation (Do First)
1. **Issue #1**: Migrate BMC (11 fields) + SWOT (4 fields) from text to jsonb arrays
   - Create `parse_bullet_to_jsonb()` SQL function
   - Test on staging before production
   - Update frontend to render arrays

2. **Issue #2**: Update AI prompts to return JSON arrays
   - Add `STRUCTURED_OUTPUT_INSTRUCTION` constant
   - Validate JSON response with try-catch
   - Fallback parser for markdown-wrapped JSON

3. **Issue #3**: Create new tables
   - `tasks`, `suggested_tasks`
   - `emission_sources`, `emission_entries`, `emission_factors`
   - `evidence_attachments`
   - `notification_channels`, `notification_delivery_log`
   - Enhance `ai_usage_log` (add `quota_type`, `metadata` columns)

### P1 — DMA Enhancements
4. **Issue #4**: AI-guided scoring in DMA
   - New action: `generateAssessmentScoring`
   - Input: Company Profile + BMC + SWOT + ESRS guidance
   - Output: Suggested scores (1-5) with reasoning per criterion

5. **Issue #5**: DMA Insight Hub backend
   - New action: `analyzeDMAQuality`
   - Output: Quality checks (🔴🟡🟢), strategic insight, recommended actions
   - Validate response structure before returning

6. **Issue #6**: DMA Insight Hub UI
   - Full-screen between DMA and KPI
   - Components: ScoreBanner, QualityCheckSection, StrategicInsightPanel, RecommendedActions
   - Navigation: [← Back to Fix] or [Continue to KPI →]

### P1 — Task Management
7. **Issue #7**: Task generator backend
   - New action: `generateTasks`
   - 3 types: Fix (from Insight Hub), Comply (from material topics), Improve (from KPIs/SWOT)
   - Save to `suggested_tasks` (not `tasks` directly)

8. **Issue #8**: Task manager UI
   - Two tabs: Generator (selection flow) + Manager (table view)
   - Generator: group by type, select/deselect, adjust assignee/due date
   - Manager: filters, inline status updates, link to source

9. **Issue #9**: Suggested tasks system (ambient badges)
   - Badge: `[✨ 3 AI Tasks]` appears on assessments/KPIs/tasks
   - Click → modal to promote to real task or dismiss
   - Dismissed tasks can be restored via settings

10. **Issue #10**: Excel import/export
    - Export: download all tasks as XLSX/CSV
    - Import: update status/assignee via Excel upload
    - Validation + error handling with row-level feedback

### P2 — Carbon Accounting
11. **Issue #11**: Carbon wizard (gamified)
    - "🌍 Carbon Quest" with 3 missions: Scope 2 → 1 → 3 (optional)
    - Start with easiest (electricity) to build confidence
    - AI copilot, achievements, celebration animations

12. **Issue #12**: Carbon dashboard (recurring)
    - Quick-add modals (<1 min per entry)
    - Trend chart (month-over-month)
    - Year-over-year comparison when multi-year data exists
    - Bulk Excel upload

13. **Issue #13**: Emission factors database
    - Seed table with IPCC 2021, TGO 2024, DEFRA 2024 factors
    - Auto-select best factor: country-specific > regional > global
    - User can override via picker modal

### P2 — Evidence Vault
14. **Issue #14**: Evidence schema + API
    - Link external (Google Drive/OneDrive/URL) — free tier
    - Direct upload (Supabase Storage) — Pro tier only
    - Polymorphic linking: evidence → assessment/kpi/task/emission_entry

15. **Issue #15**: Google Drive OAuth
    - OAuth flow to get access token
    - Store in `organization_integrations` table
    - Google Picker to select files
    - Auto-refresh expired tokens

16. **Issue #16**: Evidence link UI (ambient badges)
    - Badge: `📎 Evidence (2)` on every assessment/KPI/task
    - Click → modal to view/add evidence
    - 4 methods: Google Drive, OneDrive, URL, Upload (Pro)

### P3 — Premium Features
17. **Issue #17**: Evidence upload (Pro tier)
    - Direct upload to Supabase Storage
    - 10 GB quota (Pro), 100 GB (Enterprise)
    - In-app preview (PDF, images)
    - Bulk download (zip)

18. **Issue #18**: AI quota system
    - Free: 50 calls/month, Pro: 500 calls/month, Enterprise: unlimited
    - Soft limit (allow overage but prompt upgrade)
    - BYOK option (user's own API key)
    - Usage dashboard (Owner/Admin only)

## Common Implementation Patterns

### Database Migration Pattern
```sql
-- Always test on staging first
-- Create parser function
CREATE OR REPLACE FUNCTION parse_bullet_to_jsonb(text) RETURNS jsonb AS $$
  -- Implementation
$$ LANGUAGE plpgsql;

-- Test on sample data
SELECT parse_bullet_to_jsonb('• Item 1\n• Item 2') as result;

-- Apply migration
ALTER TABLE table_name 
  ALTER COLUMN field_name TYPE jsonb 
  USING parse_bullet_to_jsonb(field_name);

-- Rollback plan (keep in comments)
-- ALTER TABLE table_name ALTER COLUMN field_name TYPE text ...
```

### AI Call Pattern (Netlify Functions)
```typescript
// netlify/functions/api.ts

case 'actionName': {
  const { param1, param2 } = body;
  
  // Build prompt
  const prompt = `
    You are an ESRS expert...
    
    CRITICAL: Return ONLY valid JSON with this structure:
    { ... }
    
    No markdown, no backticks, no explanation.
  `;
  
  // Call AI
  const response = await callGemini(prompt);
  
  // Validate JSON
  let parsed;
  try {
    parsed = JSON.parse(response);
  } catch {
    // Fallback: strip markdown fences
    const match = response.match(/\[.*\]/s);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error('Invalid JSON from AI');
  }
  
  // Validate structure
  validateStructure(parsed);
  
  // Log usage
  await logAIUsage({
    organization_id: organizationId,
    action: 'actionName',
    quota_type: 'platform_free', // or platform_pro, byok
    success: true
  });
  
  return { statusCode: 200, body: JSON.stringify(parsed) };
}
```

### RLS Policy Pattern
```sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Members can read their org's data
CREATE POLICY "members_read" ON table_name
  FOR SELECT USING (is_org_member(organization_id));

-- Members can insert/update their org's data
CREATE POLICY "members_write" ON table_name
  FOR ALL USING (is_org_member(organization_id));

-- OR role-specific (Owner/Admin only)
CREATE POLICY "admins_only" ON table_name
  FOR ALL USING (
    is_org_member(organization_id) 
    AND user_org_role(organization_id) IN ('Owner', 'Admin')
  );
```

### Component Pattern (Ambient Badge)
```tsx
function AmbientBadge({ linkedToType, linkedToId }: Props) {
  const [count, setCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  
  useEffect(() => {
    loadCount(linkedToType, linkedToId).then(setCount);
  }, [linkedToType, linkedToId]);
  
  if (count === 0) return null; // Don't show badge if empty
  
  return (
    <>
      <button className="badge" onClick={() => setShowModal(true)}>
        ✨ {count} Item{count > 1 ? 's' : ''}
      </button>
      
      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          {/* Modal content */}
        </Modal>
      )}
    </>
  );
}
```

## Critical Gotchas to Avoid

1. **Never expose API keys to frontend**: All AI calls must go through Netlify Functions
2. **Always filter by organization_id**: Multi-tenant means every query needs org filter
3. **Don't fork code for tiers**: Use feature flags and tier checks, not separate codebases
4. **Validate AI JSON responses**: Always try-catch and fallback parser for markdown-wrapped JSON
5. **Test RLS policies**: Use `SET LOCAL ROLE` to test as different users
6. **Migrations are one-way**: Test thoroughly on staging, have rollback plan
7. **Soft limits for quotas**: Hard blocks frustrate users, soft limits with prompts work better
8. **Link back to source**: Every generated entity (task, evidence) must link to origin

## File Structure Reference

```
src/
├── components/
│   ├── AssessmentForm.tsx (add AI-guided scoring)
│   ├── DMAInsightHub.tsx (new)
│   ├── TaskManagement.tsx (new)
│   ├── CarbonWizard.tsx (new)
│   ├── CarbonDashboard.tsx (new)
│   └── evidence/
│       ├── EvidenceBadge.tsx (new)
│       └── EvidenceModal.tsx (new)
├── services/
│   ├── dbService.ts (update for jsonb)
│   ├── taskService.ts (new)
│   ├── carbonService.ts (new)
│   └── evidenceService.ts (new)
├── types/
│   ├── task.ts (new)
│   ├── carbon.ts (new)
│   └── evidence.ts (new)
└── netlify/functions/
    ├── api.ts (add new actions)
    ├── google-callback.ts (new, OAuth)
    └── evidence-upload.ts (new, Pro tier)

supabase/
├── migrations/
│   ├── 00X_bmc_swot_jsonb.sql
│   ├── 00X_phase2_tables.sql
│   └── 00X_organization_integrations.sql
└── seeds/
    └── emission_factors.sql
```

## Testing Checklist Template

For each feature implementation, verify:
- [ ] Works for Free tier user (feature accessible or properly gated)
- [ ] Works for Pro tier user (premium features enabled)
- [ ] RLS policies protect data (can't access other org's data)
- [ ] AI calls logged to `ai_usage_log`
- [ ] Mobile responsive (test at 375px width)
- [ ] Error handling shows friendly messages
- [ ] Loading states during async operations
- [ ] Links back to source work (click E1 → goes to E1 assessment)

## Priority Guidance

When multiple features are pending:
1. Always complete P0 Foundation issues first (#1-3)
2. P1 features can be parallelized if they don't share dependencies
3. P2 features can wait until P1 is tested in production
4. P3 features are polish — skip if time-constrained

## Success Metrics

After Phase 2 implementation, measure:
- Conversion rate Free → Pro (target: 18%)
- Time to complete DMA (target: -30% vs Phase 1)
- Task completion rate (target: >60%)
- Carbon data entry frequency (target: monthly for 80% of orgs with E1 material)
- AI quota usage (ensure <10% exceed quota unintentionally)

## When to Ask for Help

If encountering:
- RLS policies blocking legitimate queries → check `is_org_member()` logic
- AI returning malformed JSON repeatedly → review prompt's CRITICAL instruction section
- Migrations failing on production → rollback and test more thoroughly on staging
- Performance issues with large orgs → add indexes on frequently queried columns

## Related Documentation

- [ESRS Standards](https://www.efrag.org/lab6) — for understanding materiality assessment requirements
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security) — for policy patterns
- [Gemini API Docs](https://ai.google.dev/docs) — for AI integration
- [Netlify Functions](https://docs.netlify.com/functions/overview/) — for serverless backend

---

**This skill should be used alongside the 18 GitHub issues created in `/home/claude/phase2-issues/`. Each issue provides detailed implementation specs for its specific feature.**
