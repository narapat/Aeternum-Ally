-- ============================================================
-- AETERNUM ALLY — DATABASE SCHEMA
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
  address          text NOT NULL DEFAULT '',
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
