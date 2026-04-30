-- ============================================================
-- 002 — Per-org AI model selection + usage tracking
-- ============================================================

-- ------------------------------------------------------------
-- AI settings (one row per org)
-- ------------------------------------------------------------
CREATE TABLE organization_ai_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'gemini' CHECK (provider IN ('gemini')),
  model           text NOT NULL DEFAULT 'gemini-2.5-flash'
                  CHECK (model IN ('gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro')),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_ai_settings_updated_at
  BEFORE UPDATE ON organization_ai_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE organization_ai_settings ENABLE ROW LEVEL SECURITY;

-- Members can view; Owner/Admin can change
CREATE POLICY "members_read_ai_settings" ON organization_ai_settings
  FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "admins_insert_ai_settings" ON organization_ai_settings
  FOR INSERT WITH CHECK (user_org_role(organization_id) IN ('Owner','Admin'));
CREATE POLICY "admins_update_ai_settings" ON organization_ai_settings
  FOR UPDATE USING (user_org_role(organization_id) IN ('Owner','Admin'));

-- ------------------------------------------------------------
-- AI usage log (one row per AI call)
-- Inserted only by the server (service role). Members can SELECT.
-- ------------------------------------------------------------
CREATE TABLE ai_usage_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email          text,                         -- snapshot, in case user is later deleted
  action              text NOT NULL,                -- 'generateAssessmentSuggestions', etc.
  provider            text NOT NULL DEFAULT 'gemini',
  model               text NOT NULL,
  input_tokens        int,
  output_tokens       int,
  duration_ms         int,
  success             boolean NOT NULL DEFAULT true,
  error_message       text,
  estimated_cost_usd  numeric(12, 6),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_org_date    ON ai_usage_log (organization_id, created_at DESC);
CREATE INDEX idx_ai_usage_org_action  ON ai_usage_log (organization_id, action);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Members can read; nobody writes from the client (service role bypasses RLS)
CREATE POLICY "members_read_usage" ON ai_usage_log
  FOR SELECT USING (is_org_member(organization_id));

-- ------------------------------------------------------------
-- Update create_organization_with_owner() to seed AI settings.
-- Existing orgs without a settings row will be backfilled below.
-- ------------------------------------------------------------
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

  INSERT INTO organizations DEFAULT VALUES RETURNING id INTO v_org_id;

  INSERT INTO organization_members (organization_id, user_id, role, email)
    VALUES (v_org_id, v_user_id, 'Owner', v_email);

  INSERT INTO company_profiles (organization_id, name)
    VALUES (v_org_id, COALESCE(NULLIF(p_company_name, ''), ''));

  -- NEW: default AI settings
  INSERT INTO organization_ai_settings (organization_id) VALUES (v_org_id);

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization_with_owner(text) TO authenticated;

-- Backfill: any pre-existing org without settings gets defaults
INSERT INTO organization_ai_settings (organization_id)
SELECT id FROM organizations
WHERE id NOT IN (SELECT organization_id FROM organization_ai_settings);
