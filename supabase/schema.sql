-- ============================================================
-- AETERNUM ALLY — DATABASE SCHEMA
-- Version: 1.1.0
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ORGANIZATION MEMBERS
-- ============================================================
CREATE TABLE organization_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'Manager'
                  CHECK (role IN ('Owner', 'Admin', 'Manager', 'Consultant')),
  email           text,            -- stored at invite/join time for display
  invited_by      uuid REFERENCES auth.users(id),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- ============================================================
-- ORGANIZATION INVITES
-- token = row id (UUID sent in invite email link)
-- ============================================================
CREATE TABLE organization_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           text NOT NULL,
  role            text NOT NULL DEFAULT 'Manager'
                  CHECK (role IN ('Admin', 'Manager', 'Consultant')),
  invited_by      uuid NOT NULL REFERENCES auth.users(id),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- COMPANY PROFILES  (1 per org)
-- ============================================================
CREATE TABLE company_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL DEFAULT '',
  tax_id           text NOT NULL DEFAULT '',
  industry         text NOT NULL DEFAULT '',
  isic_code        text NOT NULL DEFAULT '',
  founding_year    text NOT NULL DEFAULT '',
  website          text NOT NULL DEFAULT '',
  address          text NOT NULL DEFAULT '',  -- legacy free-text, superseded by structured fields below
  address_street      text NOT NULL DEFAULT '',
  address_city        text NOT NULL DEFAULT '',
  address_state       text NOT NULL DEFAULT '',
  address_postal_code text NOT NULL DEFAULT '',
  address_country     text NOT NULL DEFAULT '',
  contact_email       text NOT NULL DEFAULT '',
  contact_phone       text NOT NULL DEFAULT '',
  employee_count   text NOT NULL DEFAULT '',
  revenue_range    text NOT NULL DEFAULT '',
  description      text NOT NULL DEFAULT '',
  mission          text NOT NULL DEFAULT '',
  vision           text NOT NULL DEFAULT '',
  products_services text NOT NULL DEFAULT '',
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- BUSINESS MODEL CANVASES  (1 per org)
-- ============================================================
CREATE TABLE business_model_canvases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  key_partners           text NOT NULL DEFAULT '',
  key_activities         text NOT NULL DEFAULT '',
  key_resources          text NOT NULL DEFAULT '',
  value_proposition      text NOT NULL DEFAULT '',
  customer_relationships text NOT NULL DEFAULT '',
  channels               text NOT NULL DEFAULT '',
  customer_segments      text NOT NULL DEFAULT '',
  cost_structure         text NOT NULL DEFAULT '',
  revenue_streams        text NOT NULL DEFAULT '',
  eco_social_costs       text NOT NULL DEFAULT '',
  eco_social_benefits    text NOT NULL DEFAULT '',
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SWOT ANALYSES  (1 per org)
-- ============================================================
CREATE TABLE swot_analyses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  strengths       text NOT NULL DEFAULT '',
  weaknesses      text NOT NULL DEFAULT '',
  opportunities   text NOT NULL DEFAULT '',
  threats         text NOT NULL DEFAULT '',
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ASSESSMENTS  (many per org)
-- ============================================================
CREATE TABLE assessments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  topic                       text NOT NULL,
  impact_description          text NOT NULL DEFAULT '',
  financial_description       text NOT NULL DEFAULT '',
  impact_score                jsonb NOT NULL DEFAULT '{"scale":1,"scope":1,"irremediability":1,"likelihood":1}',
  financial_score             jsonb NOT NULL DEFAULT '{"magnitude":1,"likelihood":1}',
  impact_materiality_value    numeric NOT NULL DEFAULT 0,
  financial_materiality_value numeric NOT NULL DEFAULT 0,
  is_material                 boolean NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- KPIS  (many per org)
-- ============================================================
CREATE TABLE kpis (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL DEFAULT '',
  description     text NOT NULL DEFAULT '',
  perspective     text NOT NULL DEFAULT 'Financial',
  frequency       text NOT NULL DEFAULT 'Monthly',
  unit            text NOT NULL DEFAULT '',
  target_value    numeric NOT NULL DEFAULT 0,
  current_value   numeric NOT NULL DEFAULT 0,
  linked_kpi_ids  uuid[] NOT NULL DEFAULT '{}',
  raci            jsonb NOT NULL DEFAULT '{"responsible":"","accountable":"","consulted":"","informed":""}',
  history         jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- USER PREFERENCES  (personal, not shared with org)
-- ============================================================
CREATE TABLE user_preferences (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dark_mode         boolean NOT NULL DEFAULT false,
  sidebar_collapsed boolean NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orgs_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON company_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_canvases_updated_at
  BEFORE UPDATE ON business_model_canvases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_swot_updated_at
  BEFORE UPDATE ON swot_analyses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_assessments_updated_at
  BEFORE UPDATE ON assessments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_kpis_updated_at
  BEFORE UPDATE ON kpis FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_user_prefs_updated_at
  BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE organizations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invites   ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_model_canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE swot_analyses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpis                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences       ENABLE ROW LEVEL SECURITY;

-- Helpers (SECURITY DEFINER so they can read org_members without looping RLS)
CREATE OR REPLACE FUNCTION is_org_member(org_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION user_org_role(org_id uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT role FROM organization_members
  WHERE organization_id = org_id AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Organizations: visible to members
CREATE POLICY "view_own_orgs" ON organizations
  FOR SELECT USING (is_org_member(id));

-- Members: all members can view the member list
CREATE POLICY "members_view_members" ON organization_members
  FOR SELECT USING (is_org_member(organization_id));

-- Members: Owner/Admin can insert (invite), update roles, remove
CREATE POLICY "admins_insert_members" ON organization_members
  FOR INSERT WITH CHECK (user_org_role(organization_id) IN ('Owner', 'Admin'));
CREATE POLICY "admins_update_members" ON organization_members
  FOR UPDATE USING (user_org_role(organization_id) IN ('Owner', 'Admin'));
CREATE POLICY "admins_delete_members" ON organization_members
  FOR DELETE USING (user_org_role(organization_id) IN ('Owner', 'Admin'));

-- Invites: Owner/Admin can manage
CREATE POLICY "admins_manage_invites" ON organization_invites
  FOR ALL USING (
    is_org_member(organization_id)
    AND user_org_role(organization_id) IN ('Owner', 'Admin')
  );

-- Invites: an authenticated user can read their OWN pending invite
-- (needed for auto-join on sign-in before they are a member of any org).
-- Uses auth.jwt() to read email from the JWT — querying auth.users directly
-- fails because the `authenticated` role has no SELECT on auth.users.
CREATE POLICY "invitee_read_own_invite" ON organization_invites
  FOR SELECT USING (
    lower(email) = lower(auth.jwt() ->> 'email')
  );

-- Data tables: all members can read; Owner/Admin/Manager can write
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'company_profiles','business_model_canvases',
    'swot_analyses','assessments','kpis'
  ] LOOP
    EXECUTE format($f$
      CREATE POLICY "members_read_%1$s"   ON %1$s FOR SELECT
        USING (is_org_member(organization_id));
      CREATE POLICY "editors_insert_%1$s" ON %1$s FOR INSERT
        WITH CHECK (user_org_role(organization_id) IN ('Owner','Admin','Manager'));
      CREATE POLICY "editors_update_%1$s" ON %1$s FOR UPDATE
        USING (user_org_role(organization_id) IN ('Owner','Admin','Manager'));
      CREATE POLICY "editors_delete_%1$s" ON %1$s FOR DELETE
        USING (user_org_role(organization_id) IN ('Owner','Admin','Manager'));
    $f$, tbl);
  END LOOP;
END;
$$;

-- User preferences: each user owns their own row
CREATE POLICY "user_owns_prefs" ON user_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- AI SETTINGS (1 row per org) + USAGE LOG
-- ============================================================
CREATE TABLE organization_ai_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'gemini' CHECK (provider IN ('gemini')),
  model           text NOT NULL DEFAULT 'gemini-2.5-flash'
                  CHECK (model IN ('gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro')),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_ai_settings_updated_at
  BEFORE UPDATE ON organization_ai_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE organization_ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read_ai_settings" ON organization_ai_settings
  FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "admins_insert_ai_settings" ON organization_ai_settings
  FOR INSERT WITH CHECK (user_org_role(organization_id) IN ('Owner','Admin'));
CREATE POLICY "admins_update_ai_settings" ON organization_ai_settings
  FOR UPDATE USING (user_org_role(organization_id) IN ('Owner','Admin'));

CREATE TABLE ai_usage_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email          text,
  action              text NOT NULL,
  provider            text NOT NULL DEFAULT 'gemini',
  model               text NOT NULL,
  input_tokens        int,
  output_tokens       int,
  duration_ms         int,
  success             boolean NOT NULL DEFAULT true,
  error_message       text,
  http_status         int,
  estimated_cost_usd  numeric(12, 6),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_usage_org_date   ON ai_usage_log (organization_id, created_at DESC);
CREATE INDEX idx_ai_usage_org_action ON ai_usage_log (organization_id, action);
CREATE INDEX idx_ai_usage_status     ON ai_usage_log (http_status) WHERE http_status IS NOT NULL;

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read_usage" ON ai_usage_log
  FOR SELECT USING (is_org_member(organization_id));
-- (No INSERT/UPDATE/DELETE policies — only the server's service role can write)

CREATE TABLE error_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        REFERENCES organizations(id) ON DELETE SET NULL,
  user_id         uuid        REFERENCES auth.users(id)   ON DELETE SET NULL,
  user_email      text,
  source          text        NOT NULL CHECK (source IN ('server', 'client')),
  context         text        NOT NULL,
  action          text,
  error_message   text        NOT NULL,
  http_status     int,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_error_log_org_date    ON error_log (organization_id, created_at DESC);
CREATE INDEX idx_error_log_context     ON error_log (context, action);
CREATE INDEX idx_error_log_created_at  ON error_log (created_at DESC);

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_errors" ON error_log
  FOR SELECT USING (
    organization_id IS NOT NULL
    AND user_org_role(organization_id) IN ('Owner', 'Admin')
  );
CREATE POLICY "users_insert_errors" ON error_log
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- ============================================================
-- ATOMIC ORG CREATION RPC
-- Bypasses RLS only for this scoped flow: a signed-in user
-- creates an org, becomes its Owner, gets an empty profile,
-- and gets default AI settings.
-- ============================================================
CREATE OR REPLACE FUNCTION create_organization_with_owner(
  p_company_name text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id  uuid;
  v_user_id uuid;
  v_email   text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  INSERT INTO organizations DEFAULT VALUES
    RETURNING id INTO v_org_id;

  INSERT INTO organization_members (organization_id, user_id, role, email)
    VALUES (v_org_id, v_user_id, 'Owner', v_email);

  INSERT INTO company_profiles (organization_id, name)
    VALUES (v_org_id, COALESCE(NULLIF(p_company_name, ''), ''));

  INSERT INTO organization_ai_settings (organization_id) VALUES (v_org_id);

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization_with_owner(text) TO authenticated;
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
-- Migration 008: Persist DMA quality checks, strategic insights, and suggested tasks
--
-- Changes:
--   assessments       — add quality_check_status, quality_check_issues columns
--   dma_insights      — new singleton-per-org table for strategic insight + recommended actions
--   suggested_tasks   — make source_id nullable; add INSERT policy; add estimated_time column
--
-- Rollback plan:
--   ALTER TABLE assessments DROP COLUMN IF EXISTS quality_check_status;
--   ALTER TABLE assessments DROP COLUMN IF EXISTS quality_check_issues;
--   DROP TABLE IF EXISTS dma_insights CASCADE;
--   ALTER TABLE suggested_tasks ALTER COLUMN source_id SET NOT NULL;
--   ALTER TABLE suggested_tasks DROP COLUMN IF EXISTS estimated_time;
--   DROP POLICY IF EXISTS "members_insert_suggested" ON suggested_tasks;

-- ── 1. Quality check columns on assessments ───────────────────────────────────

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS quality_check_status text
    CHECK (quality_check_status IN ('ok', 'review', 'needs_fix')),
  ADD COLUMN IF NOT EXISTS quality_check_issues  jsonb NOT NULL DEFAULT '[]';

-- ── 2. DMA strategic insight (singleton per org) ──────────────────────────────

CREATE TABLE IF NOT EXISTS dma_insights (
  organization_id     uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  strategic_insight   jsonb NOT NULL DEFAULT '{}',
  recommended_actions jsonb NOT NULL DEFAULT '[]',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_dma_insights_updated_at
  BEFORE UPDATE ON dma_insights FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE dma_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_dma_insights" ON dma_insights
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "members_write_dma_insights" ON dma_insights
  FOR ALL USING (is_org_member(organization_id));

-- ── 3. Fix suggested_tasks for DMA use ───────────────────────────────────────

-- source_id was uuid NOT NULL; DMA actions reference ESRS topic codes, not UUIDs
ALTER TABLE suggested_tasks
  ALTER COLUMN source_id DROP NOT NULL;

-- estimated_time was missing
ALTER TABLE suggested_tasks
  ADD COLUMN IF NOT EXISTS estimated_time text;

-- INSERT policy was missing
CREATE POLICY "members_insert_suggested" ON suggested_tasks
  FOR INSERT WITH CHECK (is_org_member(organization_id));
-- Migration 009: Add notes, assigned_by, assigned_at to tasks
--
-- Changes:
--   tasks — add notes text, assigned_by uuid, assigned_at timestamptz
--
-- Rollback plan:
--   ALTER TABLE tasks DROP COLUMN IF EXISTS notes;
--   ALTER TABLE tasks DROP COLUMN IF EXISTS assigned_by;
--   ALTER TABLE tasks DROP COLUMN IF EXISTS assigned_at;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS notes       text,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
-- Migration 010: Change source_id from uuid to text
--
-- tasks.source_id and suggested_tasks.source_id had no FK constraint —
-- just a uuid cast. The AI generator stores ESRS topic codes ("E1", "S1")
-- and KPI names, which are not UUIDs, so we relax the type to text.
--
-- Rollback plan:
--   ALTER TABLE tasks ALTER COLUMN source_id TYPE uuid USING source_id::uuid;
--   ALTER TABLE suggested_tasks ALTER COLUMN source_id TYPE uuid USING source_id::uuid;

ALTER TABLE tasks
  ALTER COLUMN source_id TYPE text USING source_id::text;

ALTER TABLE suggested_tasks
  ALTER COLUMN source_id TYPE text USING source_id::text;
-- Migration 011: organization_integrations table
-- Issue: #41 (Evidence Vault API) / #42 (Google Drive OAuth)
--
-- Stores OAuth tokens for Google Drive, OneDrive, and Dropbox integrations.
-- Tokens are stored encrypted at rest by Supabase (vault optional for extra
-- security — swap access_token/refresh_token columns for vault secret IDs).
--
-- Rollback:
--   DROP TABLE IF EXISTS organization_integrations CASCADE;

CREATE TABLE organization_integrations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_type text        NOT NULL
                     CHECK (integration_type IN ('google_drive', 'onedrive', 'dropbox')),
  access_token     text        NOT NULL,
  refresh_token    text,
  expires_at       timestamptz,
  connected_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, integration_type)
);

CREATE INDEX idx_org_integrations_org
  ON organization_integrations (organization_id, integration_type);

ALTER TABLE organization_integrations ENABLE ROW LEVEL SECURITY;

-- Only Owner/Admin can connect/disconnect integrations
CREATE POLICY "admins_manage_integrations" ON organization_integrations
  FOR ALL USING (
    is_org_member(organization_id)
    AND user_org_role(organization_id) IN ('Owner', 'Admin')
  );

COMMENT ON TABLE  organization_integrations IS 'OAuth tokens for cloud storage integrations (Drive, OneDrive, Dropbox)';
COMMENT ON COLUMN organization_integrations.integration_type IS 'google_drive | onedrive | dropbox';
COMMENT ON COLUMN organization_integrations.access_token     IS 'Short-lived OAuth access token';
COMMENT ON COLUMN organization_integrations.refresh_token    IS 'Long-lived token for refreshing access_token';
COMMENT ON COLUMN organization_integrations.expires_at       IS 'When access_token expires; refresh before this time';
-- ============================================================
-- 012 — AI quota tracking + BYOK (Bring Your Own Key)
-- ============================================================
-- Adds BYOK columns to organization_ai_settings so orgs can
-- supply their own Gemini API key to bypass platform quota.
-- Adds a soft_quota_monthly column so admins can override the
-- per-org monthly call allowance (NULL = use platform default).
-- ============================================================

ALTER TABLE organization_ai_settings
  ADD COLUMN IF NOT EXISTS use_byok          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS byok_provider     text
    CHECK (byok_provider IN ('gemini', 'openai')),
  ADD COLUMN IF NOT EXISTS byok_api_key      text,           -- encrypted at rest by Supabase
  ADD COLUMN IF NOT EXISTS soft_quota_monthly int             -- NULL = use platform default
    CHECK (soft_quota_monthly IS NULL OR soft_quota_monthly >= 0);

COMMENT ON COLUMN organization_ai_settings.use_byok
  IS 'When true the server uses byok_api_key instead of the platform key';
COMMENT ON COLUMN organization_ai_settings.byok_provider
  IS 'Provider for the BYOK key — currently only gemini is supported';
COMMENT ON COLUMN organization_ai_settings.byok_api_key
  IS 'User-supplied API key; stored encrypted. Never returned to the browser.';
COMMENT ON COLUMN organization_ai_settings.soft_quota_monthly
  IS 'Per-org monthly call soft limit override. NULL = server default (100 for free orgs).';
-- Migration 013: user_profiles table
-- Stores per-user profile information (display name, phone, mobile, notes).
-- Separate from auth.users so it can be extended without touching Supabase Auth.

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  phone       text,
  mobile      text,
  notes       text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Keep updated_at current automatically.
-- Reuses the existing update_updated_at() function defined in schema.sql /
-- migration 001 so we don't create a duplicate trigger function.
DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS: each user can only read and write their own row
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles_select_own" ON public.user_profiles;
CREATE POLICY "user_profiles_select_own"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_profiles_insert_own" ON public.user_profiles;
CREATE POLICY "user_profiles_insert_own"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_profiles_update_own" ON public.user_profiles;
CREATE POLICY "user_profiles_update_own"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = user_id);
-- Migration 014: platform_admins table
-- Stores Platform Admin accounts (separate from tenant users / org_members).
-- RLS is NOT enabled — all access goes through the Netlify admin.ts function
-- using the service-role key.  No tenant-side code ever touches this table.

CREATE TABLE IF NOT EXISTS public.platform_admins (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL UNIQUE,
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES public.platform_admins(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast email lookups on every admin request
CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON public.platform_admins(email);

-- Note: the first admin row is seeded at runtime by admin.ts when
-- PLATFORM_ADMIN_EMAIL is set and the table is empty.
-- No seed SQL here so the email stays out of version control.
-- ============================================================
-- Migration 015 — Organization tier + active status
-- ============================================================

-- 1. Add tier column (free / starter / pro / enterprise)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free'
  CHECK (tier IN ('free','starter','pro','enterprise'));

-- 2. Add is_active flag (true = accessible, false = suspended)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 3. Update is_org_member() helper to also gate on org being active.
--    All existing RLS policies that call is_org_member() will
--    automatically respect deactivation — no policy edits needed.
CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.organization_id = org_id
      AND om.user_id         = auth.uid()
      AND o.is_active        = true
  );
$$;
-- Migration: Add identification_number and asset_number to emission_sources
-- Description: Enhances emission sources to support asset mapping and specific identification (e.g. car registration, generator S/N).

ALTER TABLE emission_sources ADD COLUMN IF NOT EXISTS identification_number TEXT;
ALTER TABLE emission_sources ADD COLUMN IF NOT EXISTS asset_number TEXT;
-- Migration 017: Persist Sustainability Reports for Polling/Background Job
--
-- Changes:
--   sustainability_reports — new singleton-per-org table for report generation status and results
--
-- Rollback plan:
--   DROP TABLE IF EXISTS sustainability_reports CASCADE;

CREATE TABLE IF NOT EXISTS sustainability_reports (
  organization_id     uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  result              jsonb NOT NULL DEFAULT '{}',
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_sustainability_reports_updated_at
  BEFORE UPDATE ON sustainability_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sustainability_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_reports" ON sustainability_reports
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "members_write_reports" ON sustainability_reports
  FOR ALL USING (is_org_member(organization_id));
-- Migration 018: Persist DMA Analysis Jobs for Polling/Background Job
--
-- Changes:
--   dma_analysis_jobs — new singleton-per-org table for DMA analysis status and results
--
-- Rollback plan:
--   DROP TABLE IF EXISTS dma_analysis_jobs CASCADE;

CREATE TABLE IF NOT EXISTS dma_analysis_jobs (
  organization_id     uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  insight_result      jsonb NOT NULL DEFAULT '{}',
  quality_result      jsonb NOT NULL DEFAULT '[]',
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_dma_analysis_jobs_updated_at
  BEFORE UPDATE ON dma_analysis_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE dma_analysis_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_dma_jobs" ON dma_analysis_jobs
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "members_write_dma_jobs" ON dma_analysis_jobs
  FOR ALL USING (is_org_member(organization_id));

-- ============================================================
-- Migration 020 - Expand BYOK storage into a server-only table
-- ============================================================
-- This is the expand phase of an expand/migrate/contract rollout.
-- The legacy organization_ai_settings.byok_api_key column remains until
-- application code has switched to this table and production is verified.

CREATE TABLE IF NOT EXISTS organization_ai_secrets (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  byok_api_key     text NOT NULL CHECK (char_length(byok_api_key) <= 2048),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_ai_secrets_updated_at
  BEFORE UPDATE ON organization_ai_secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE organization_ai_secrets ENABLE ROW LEVEL SECURITY;

-- Browser roles have neither table grants nor RLS policies.
-- Only trusted service-role clients may access raw credentials.
REVOKE ALL ON TABLE organization_ai_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE organization_ai_secrets TO service_role;

COMMENT ON TABLE organization_ai_secrets
  IS 'Server-only organization credentials. Never expose rows or raw values to browser clients.';
COMMENT ON COLUMN organization_ai_secrets.byok_api_key
  IS 'Organization-owned AI provider credential. Service-role access only.';

-- Preserve existing customer keys. The legacy column is intentionally retained
-- for the expand phase and will be removed by a separate contract migration.
INSERT INTO organization_ai_secrets (organization_id, byok_api_key)
SELECT organization_id, byok_api_key
FROM organization_ai_settings
WHERE NULLIF(trim(byok_api_key), '') IS NOT NULL
ON CONFLICT (organization_id) DO UPDATE
SET byok_api_key = EXCLUDED.byok_api_key,
    updated_at = now();
