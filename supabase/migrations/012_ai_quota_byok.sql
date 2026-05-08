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
