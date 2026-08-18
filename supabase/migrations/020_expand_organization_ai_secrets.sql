-- ============================================================
-- 020 - Expand BYOK storage into a server-only table
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

-- Defense in depth: browser roles have neither table grants nor RLS policies.
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
