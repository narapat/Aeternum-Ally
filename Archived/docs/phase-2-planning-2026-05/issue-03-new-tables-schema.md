# New Database Tables for Phase 2 Features

**Type:** Enhancement  
**Priority:** P0 (Critical - Blocker)  
**Labels:** `phase-2`, `database`, `schema`, `p0`  
**Milestone:** Phase 2 — Foundation  
**Epic:** #[EPIC_NUMBER]

---

## Problem

Phase 2 features ต้องการ tables ใหม่:
- Tasks (Fix/Comply/Improve)
- Suggested tasks (unselected)
- Carbon accounting (sources, entries, factors)
- Evidence attachments
- Notifications (multi-channel architecture)

---

## Solution

สร้าง tables พร้อม indexes, RLS policies, และ foreign keys

---

## New Tables

### 1. tasks

```sql
CREATE TABLE tasks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text,
  type                text NOT NULL CHECK (type IN ('fix', 'comply', 'improve')),
  status              text NOT NULL DEFAULT 'todo' 
                        CHECK (status IN ('todo', 'in_progress', 'done')),
  priority            text NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high')),
  due_date            date,
  assignee_id         uuid REFERENCES organization_members(id) ON DELETE SET NULL,
  source_type         text CHECK (source_type IN ('dma', 'insight_hub', 'kpi', 'manual')),
  source_id           uuid,  -- polymorphic FK to assessments/kpis
  esrs_ref            text,  -- e.g., "ESRS E1-6"
  external_id         text,  -- for future API integrations
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

CREATE INDEX idx_tasks_org_status ON tasks (organization_id, status);
CREATE INDEX idx_tasks_assignee ON tasks (assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_tasks_due_date ON tasks (due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_source ON tasks (source_type, source_id) WHERE source_type IS NOT NULL;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_crud_tasks" ON tasks
  FOR ALL USING (is_org_member(organization_id));

COMMENT ON TABLE tasks IS 'Actionable tasks generated from DMA/KPI or created manually';
COMMENT ON COLUMN tasks.type IS 'fix = from Insight Hub, comply = ESRS requirement, improve = strategic';
```

---

### 2. suggested_tasks

```sql
CREATE TABLE suggested_tasks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text,
  type                text NOT NULL CHECK (type IN ('fix', 'comply', 'improve')),
  priority            text NOT NULL DEFAULT 'medium',
  source_type         text NOT NULL,
  source_id           uuid NOT NULL,
  esrs_ref            text,
  dismissed           boolean NOT NULL DEFAULT false,
  dismissed_at        timestamptz,
  dismissed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_to_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  converted_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_suggested_tasks_org ON suggested_tasks (organization_id, dismissed);
CREATE INDEX idx_suggested_tasks_source ON suggested_tasks (source_type, source_id);

ALTER TABLE suggested_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read_suggested" ON suggested_tasks
  FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "members_update_suggested" ON suggested_tasks
  FOR UPDATE USING (is_org_member(organization_id));

COMMENT ON TABLE suggested_tasks IS 'AI-generated tasks that user has not yet selected';
```

---

### 3. emission_sources

```sql
CREATE TABLE emission_sources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope               text NOT NULL CHECK (scope IN ('1', '2', '3')),
  source_name         text NOT NULL,  -- e.g., "Company Vehicles", "Electricity"
  fuel_type           text,  -- e.g., "Gasoline", "Diesel", "Grid Electricity"
  unit                text NOT NULL,  -- "L", "kWh", "kg", etc.
  emission_factor_value  numeric(12, 6),
  emission_factor_source text,  -- "IPCC 2021", "DEFRA 2024", "TGO"
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_emission_sources_org_scope ON emission_sources (organization_id, scope, active);

ALTER TABLE emission_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_crud_sources" ON emission_sources
  FOR ALL USING (is_org_member(organization_id));

COMMENT ON TABLE emission_sources IS 'Configured emission sources per organization';
```

---

### 4. emission_entries

```sql
CREATE TABLE emission_entries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id           uuid NOT NULL REFERENCES emission_sources(id) ON DELETE CASCADE,
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  activity_data       numeric(12, 2) NOT NULL,  -- actual consumption
  calculated_emissions_kgco2e numeric(12, 2) NOT NULL,
  notes               text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_emission_entries_org_period ON emission_entries (organization_id, period_start DESC);
CREATE INDEX idx_emission_entries_source ON emission_entries (source_id, period_start DESC);

ALTER TABLE emission_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_crud_entries" ON emission_entries
  FOR ALL USING (is_org_member(organization_id));

COMMENT ON TABLE emission_entries IS 'Actual emission data entries (recurring)';
```

---

### 5. emission_factors

Reference data table (pre-populated, read-only for users)

```sql
CREATE TABLE emission_factors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuel_type           text NOT NULL,
  scope               text NOT NULL,
  unit                text NOT NULL,
  kgco2e_per_unit     numeric(12, 6) NOT NULL,
  source              text NOT NULL,  -- "IPCC", "DEFRA", "TGO", etc.
  year                int NOT NULL,
  region              text,  -- "Global", "Thailand", "EU", etc.
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_emission_factors_lookup 
  ON emission_factors (fuel_type, unit, year DESC);

-- No RLS (read-only reference data)

COMMENT ON TABLE emission_factors IS 'Standard emission factors from IPCC/DEFRA/TGO';
```

---

### 6. evidence_attachments

```sql
CREATE TABLE evidence_attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_name           text NOT NULL,
  file_type           text,  -- "pdf", "xlsx", "jpg", etc.
  file_size_mb        numeric(8, 2),
  storage_type        text NOT NULL 
                        CHECK (storage_type IN (
                          'google_drive', 'onedrive', 'dropbox', 'url',
                          'supabase_storage', 's3'
                        )),
  external_url        text,  -- for cloud links
  external_id         text,  -- Drive file ID, OneDrive item ID, etc.
  storage_path        text,  -- for direct uploads
  linked_to_type      text NOT NULL
                        CHECK (linked_to_type IN (
                          'assessment', 'kpi', 'action_plan', 
                          'emission_entry', 'task'
                        )),
  linked_to_id        uuid NOT NULL,
  notes               text,
  uploaded_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evidence_org ON evidence_attachments (organization_id);
CREATE INDEX idx_evidence_linked ON evidence_attachments (linked_to_type, linked_to_id);
CREATE INDEX idx_evidence_storage ON evidence_attachments (storage_type);

ALTER TABLE evidence_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_crud_evidence" ON evidence_attachments
  FOR ALL USING (is_org_member(organization_id));

COMMENT ON TABLE evidence_attachments IS 'Evidence files/links attached to various entities';
```

---

### 7. notification_channels

```sql
CREATE TABLE notification_channels (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- null = org-level
  channel_type        text NOT NULL
                        CHECK (channel_type IN (
                          'in_app', 'email', 'line', 'slack', 'webhook'
                        )),
  channel_config      jsonb NOT NULL,  -- { line_user_id, webhook_url, etc. }
  enabled             boolean NOT NULL DEFAULT true,
  notification_types  jsonb NOT NULL,  -- ["carbon_entry_due", "task_overdue", ...]
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_channels_org ON notification_channels (organization_id, enabled);
CREATE INDEX idx_notification_channels_user ON notification_channels (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_crud_channels" ON notification_channels
  FOR ALL USING (
    is_org_member(organization_id) 
    AND (user_id IS NULL OR user_id = auth.uid())
  );

COMMENT ON TABLE notification_channels IS 'Multi-channel notification configuration';
```

---

### 8. notification_delivery_log

```sql
CREATE TABLE notification_delivery_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id     uuid,  -- FK to notifications table (to be created)
  channel_id          uuid REFERENCES notification_channels(id) ON DELETE SET NULL,
  status              text NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at             timestamptz,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_delivery_channel ON notification_delivery_log (channel_id, created_at DESC);
CREATE INDEX idx_notification_delivery_status ON notification_delivery_log (status, created_at DESC);

-- No RLS (internal audit log)

COMMENT ON TABLE notification_delivery_log IS 'Audit trail for notification delivery';
```

---

### 9. AI Usage Log Enhancement

```sql
-- Add columns to existing table
ALTER TABLE ai_usage_log
  ADD COLUMN quota_type text CHECK (quota_type IN ('platform_free', 'platform_pro', 'platform_enterprise', 'byok')),
  ADD COLUMN metadata jsonb;

CREATE INDEX idx_ai_usage_quota ON ai_usage_log (organization_id, quota_type, created_at);

COMMENT ON COLUMN ai_usage_log.quota_type IS 'Track whether call used platform quota or BYOK';
COMMENT ON COLUMN ai_usage_log.metadata IS 'Additional context: linked_to_type, linked_to_id, prompt_version';
```

---

## Acceptance Criteria

- [ ] All tables created with correct columns
- [ ] All indexes created
- [ ] RLS policies applied
- [ ] Foreign keys validated
- [ ] Comments added for documentation
- [ ] Migration tested on staging
- [ ] No breaking changes to existing tables

---

## Files to Create

- `supabase/migrations/00X_phase2_new_tables.sql`

---

## Testing Checklist

- [ ] Verify RLS: members can only access their org data
- [ ] Test FK constraints (cascade deletes work)
- [ ] Insert sample data for each table
- [ ] Query performance test on indexed columns
- [ ] Verify ai_usage_log enhancement doesn't break existing queries

---

## Related Issues

- Blocks: #6 (Task Generator needs tasks table)
- Blocks: #10 (Carbon Wizard needs emission tables)
- Blocks: #14 (Evidence Vault needs evidence_attachments)
- Blocks: #13 (Notifications need channels table)
