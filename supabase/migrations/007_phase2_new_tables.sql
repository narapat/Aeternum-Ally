-- Migration 007: New tables for Phase 2 features
-- Issue: #03 — New Database Tables for Phase 2 Features
--
-- Tables created:
--   tasks, suggested_tasks
--   emission_sources, emission_entries, emission_factors
--   evidence_attachments
--   notification_channels, notification_delivery_log
--
-- Enhancement:
--   ai_usage_log — add quota_type, metadata columns
--
-- Rollback plan:
--   DROP TABLE IF EXISTS notification_delivery_log CASCADE;
--   DROP TABLE IF EXISTS notification_channels CASCADE;
--   DROP TABLE IF EXISTS evidence_attachments CASCADE;
--   DROP TABLE IF EXISTS emission_factors CASCADE;
--   DROP TABLE IF EXISTS emission_entries CASCADE;
--   DROP TABLE IF EXISTS emission_sources CASCADE;
--   DROP TABLE IF EXISTS suggested_tasks CASCADE;
--   DROP TABLE IF EXISTS tasks CASCADE;
--   ALTER TABLE ai_usage_log DROP COLUMN IF EXISTS quota_type;
--   ALTER TABLE ai_usage_log DROP COLUMN IF EXISTS metadata;

-- =============================================================
-- 1. tasks
-- =============================================================

CREATE TABLE tasks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title                text NOT NULL,
  description          text,
  type                 text NOT NULL CHECK (type IN ('fix', 'comply', 'improve')),
  status               text NOT NULL DEFAULT 'todo'
                         CHECK (status IN ('todo', 'in_progress', 'done')),
  priority             text NOT NULL DEFAULT 'medium'
                         CHECK (priority IN ('low', 'medium', 'high')),
  due_date             date,
  assignee_id          uuid REFERENCES organization_members(id) ON DELETE SET NULL,
  source_type          text CHECK (source_type IN ('dma', 'insight_hub', 'kpi', 'manual')),
  source_id            uuid,
  esrs_ref             text,
  external_id          text,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz
);

CREATE INDEX idx_tasks_org_status   ON tasks (organization_id, status);
CREATE INDEX idx_tasks_assignee     ON tasks (assignee_id)              WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_tasks_due_date     ON tasks (due_date)                 WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_source       ON tasks (source_type, source_id)   WHERE source_type IS NOT NULL;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_crud_tasks" ON tasks
  FOR ALL USING (is_org_member(organization_id));

COMMENT ON TABLE  tasks              IS 'Actionable tasks generated from DMA/KPI or created manually';
COMMENT ON COLUMN tasks.type         IS 'fix = from Insight Hub, comply = ESRS requirement, improve = strategic';
COMMENT ON COLUMN tasks.source_type  IS 'Origin of the task for traceability back to DMA/KPI';
COMMENT ON COLUMN tasks.source_id    IS 'Polymorphic FK to assessments or kpis table';

-- =============================================================
-- 2. suggested_tasks
-- =============================================================

CREATE TABLE suggested_tasks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title                text NOT NULL,
  description          text,
  type                 text NOT NULL CHECK (type IN ('fix', 'comply', 'improve')),
  priority             text NOT NULL DEFAULT 'medium'
                         CHECK (priority IN ('low', 'medium', 'high')),
  source_type          text NOT NULL,
  source_id            uuid NOT NULL,
  esrs_ref             text,
  dismissed            boolean NOT NULL DEFAULT false,
  dismissed_at         timestamptz,
  dismissed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_to_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  converted_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_suggested_tasks_org    ON suggested_tasks (organization_id, dismissed);
CREATE INDEX idx_suggested_tasks_source ON suggested_tasks (source_type, source_id);

ALTER TABLE suggested_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_suggested" ON suggested_tasks
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "members_update_suggested" ON suggested_tasks
  FOR UPDATE USING (is_org_member(organization_id));

COMMENT ON TABLE suggested_tasks IS 'AI-generated tasks pending user review (not yet promoted to tasks)';

-- =============================================================
-- 3. emission_sources
-- =============================================================

CREATE TABLE emission_sources (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope                  text NOT NULL CHECK (scope IN ('1', '2', '3')),
  source_name            text NOT NULL,
  fuel_type              text,
  unit                   text NOT NULL,
  emission_factor_value  numeric(12, 6),
  emission_factor_source text,
  active                 boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_emission_sources_org_scope ON emission_sources (organization_id, scope, active);

ALTER TABLE emission_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_crud_sources" ON emission_sources
  FOR ALL USING (is_org_member(organization_id));

COMMENT ON TABLE  emission_sources                     IS 'Configured GHG emission sources per organization';
COMMENT ON COLUMN emission_sources.scope               IS '1 = direct, 2 = purchased energy, 3 = value chain';
COMMENT ON COLUMN emission_sources.emission_factor_source IS 'e.g. IPCC 2021, DEFRA 2024, TGO';

-- =============================================================
-- 4. emission_entries
-- =============================================================

CREATE TABLE emission_entries (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id                   uuid NOT NULL REFERENCES emission_sources(id) ON DELETE CASCADE,
  period_start                date NOT NULL,
  period_end                  date NOT NULL,
  activity_data               numeric(12, 2) NOT NULL,
  calculated_emissions_kgco2e numeric(12, 2) NOT NULL,
  notes                       text,
  created_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_emission_entries_org_period ON emission_entries (organization_id, period_start DESC);
CREATE INDEX idx_emission_entries_source     ON emission_entries (source_id, period_start DESC);

ALTER TABLE emission_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_crud_entries" ON emission_entries
  FOR ALL USING (is_org_member(organization_id));

COMMENT ON TABLE  emission_entries                          IS 'Recurring GHG emission data entries';
COMMENT ON COLUMN emission_entries.activity_data            IS 'Raw consumption figure (in the source unit)';
COMMENT ON COLUMN emission_entries.calculated_emissions_kgco2e IS 'activity_data × emission_factor_value';

-- =============================================================
-- 5. emission_factors  (reference data — no RLS, read-only for users)
-- =============================================================

CREATE TABLE emission_factors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuel_type       text        NOT NULL,
  scope           text        NOT NULL,
  unit            text        NOT NULL,
  kgco2e_per_unit numeric(12, 6) NOT NULL,
  source          text        NOT NULL,
  year            int         NOT NULL,
  region          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_emission_factors_lookup
  ON emission_factors (fuel_type, unit, year DESC);

COMMENT ON TABLE  emission_factors IS 'Standard emission factors from IPCC / DEFRA / TGO (read-only reference)';
COMMENT ON COLUMN emission_factors.source IS 'e.g. IPCC, DEFRA, TGO';
COMMENT ON COLUMN emission_factors.region IS 'e.g. Global, Thailand, EU — more specific wins at lookup time';

-- =============================================================
-- 6. evidence_attachments
-- =============================================================

CREATE TABLE evidence_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_name       text NOT NULL,
  file_type       text,
  file_size_mb    numeric(8, 2),
  storage_type    text NOT NULL
                    CHECK (storage_type IN (
                      'google_drive', 'onedrive', 'dropbox', 'url',
                      'supabase_storage', 's3'
                    )),
  external_url    text,
  external_id     text,
  storage_path    text,
  linked_to_type  text NOT NULL
                    CHECK (linked_to_type IN (
                      'assessment', 'kpi', 'task', 'emission_entry'
                    )),
  linked_to_id    uuid NOT NULL,
  notes           text,
  uploaded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evidence_org     ON evidence_attachments (organization_id);
CREATE INDEX idx_evidence_linked  ON evidence_attachments (linked_to_type, linked_to_id);
CREATE INDEX idx_evidence_storage ON evidence_attachments (storage_type);

ALTER TABLE evidence_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_crud_evidence" ON evidence_attachments
  FOR ALL USING (is_org_member(organization_id));

COMMENT ON TABLE  evidence_attachments            IS 'Evidence files and external links attached to assessments, KPIs, tasks or emissions';
COMMENT ON COLUMN evidence_attachments.storage_type IS 'google_drive/onedrive/url = free tier link; supabase_storage = Pro tier upload';
COMMENT ON COLUMN evidence_attachments.external_id  IS 'Cloud provider file ID (Drive file ID, OneDrive item ID, etc.)';

-- =============================================================
-- 7. notification_channels
-- =============================================================

CREATE TABLE notification_channels (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_type       text NOT NULL
                       CHECK (channel_type IN (
                         'in_app', 'email', 'line', 'slack', 'webhook'
                       )),
  channel_config     jsonb NOT NULL DEFAULT '{}',
  enabled            boolean NOT NULL DEFAULT true,
  notification_types jsonb NOT NULL DEFAULT '[]',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_channels_org  ON notification_channels (organization_id, enabled);
CREATE INDEX idx_notification_channels_user ON notification_channels (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_crud_channels" ON notification_channels
  FOR ALL USING (
    is_org_member(organization_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

COMMENT ON TABLE  notification_channels                  IS 'Per-user/per-org notification channel configuration';
COMMENT ON COLUMN notification_channels.user_id          IS 'NULL = org-level default; set = user-specific preference';
COMMENT ON COLUMN notification_channels.channel_config   IS '{ "line_user_id": "...", "webhook_url": "...", ... }';
COMMENT ON COLUMN notification_channels.notification_types IS '["task_overdue", "carbon_entry_due", ...]';

-- =============================================================
-- 8. notification_delivery_log  (audit — no RLS)
-- =============================================================

CREATE TABLE notification_delivery_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      uuid REFERENCES notification_channels(id) ON DELETE SET NULL,
  status          text NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  payload         jsonb,
  sent_at         timestamptz,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_delivery_channel ON notification_delivery_log (channel_id, created_at DESC);
CREATE INDEX idx_notification_delivery_status  ON notification_delivery_log (status, created_at DESC);

COMMENT ON TABLE notification_delivery_log IS 'Audit trail for all notification delivery attempts';

-- =============================================================
-- 9. ai_usage_log — add quota_type and metadata columns
-- =============================================================

ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS quota_type text
    CHECK (quota_type IN ('platform_free', 'platform_pro', 'platform_enterprise', 'byok')),
  ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_usage_quota
  ON ai_usage_log (organization_id, quota_type, created_at);

COMMENT ON COLUMN ai_usage_log.quota_type IS 'Track whether call used platform quota or user BYOK key';
COMMENT ON COLUMN ai_usage_log.metadata   IS 'Optional context: { linked_to_type, linked_to_id, prompt_version }';
