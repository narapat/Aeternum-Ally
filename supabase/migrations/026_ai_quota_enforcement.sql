-- ============================================================
-- Migration 026 — AI quota enforcement
-- ============================================================
-- The monthly platform AI allowance is now enforced (HTTP 429) rather than
-- logged and ignored. Two supporting changes:
--
--   1. quota_type gains 'platform_starter'. Migration 015 introduced four
--      tiers but the quota_type CHECK from 007 only covered three, so usage
--      rows for a starter organization would have been rejected.
--   2. soft_quota_monthly is documented as the enforced ceiling it now is.
--      NULL still means "use the tier default".
--
-- Rollback:
--   ALTER TABLE public.ai_usage_log DROP CONSTRAINT ai_usage_log_quota_type_check;
--   ALTER TABLE public.ai_usage_log ADD CONSTRAINT ai_usage_log_quota_type_check
--     CHECK (quota_type IN ('platform_free','platform_pro','platform_enterprise','byok'));
-- ============================================================

ALTER TABLE public.ai_usage_log
  DROP CONSTRAINT IF EXISTS ai_usage_log_quota_type_check;

ALTER TABLE public.ai_usage_log
  ADD CONSTRAINT ai_usage_log_quota_type_check
  CHECK (quota_type IN (
    'platform_free',
    'platform_starter',
    'platform_pro',
    'platform_enterprise',
    'byok'
  ));

COMMENT ON COLUMN public.ai_usage_log.quota_type
  IS 'Allowance the call drew from: platform_<organizations.tier> or byok';

COMMENT ON COLUMN public.organization_ai_settings.soft_quota_monthly
  IS 'Enforced monthly platform AI call ceiling for this organization. NULL = tier default from netlify/functions/_shared/aiQuota.js. 0 suspends platform AI.';
