-- ============================================================
-- Migration 027 — Ad-hoc AI quota grants
-- ============================================================
-- Migration 026 made the monthly allowance enforceable. This adds the release
-- valve: a temporary top-up that expires, so raising a ceiling to unblock a
-- customer today does not silently become their permanent plan.
--
--   organization_ai_settings.soft_quota_monthly  standing override (deliberate)
--   ai_quota_grants                              temporary top-up (expires)
--
-- Effective ceiling = standing limit + sum(active grants).
--
-- `source = 'auto_burst'` marks the automatic one-off top-up granted the first
-- time an organization crosses its ceiling in a month, so a customer is never
-- hard-stopped before a human has had a chance to look. The partial unique
-- index is what makes that "once per organization per month" — it is the
-- concurrency guard, not application logic.
--
-- Service-role only: the browser never reads or writes grants. The effective
-- ceiling reaches the tenant through byok-settings, already computed.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.ai_quota_grants;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_quota_grants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  additional_calls  int  NOT NULL CHECK (additional_calls > 0 AND additional_calls <= 1000000),
  source            text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'auto_burst')),
  reason            text CHECK (reason IS NULL OR length(reason) <= 500),
  granted_by        text CHECK (granted_by IS NULL OR length(granted_by) <= 320),
  -- First day of the UTC month the grant belongs to; drives the auto-burst
  -- uniqueness guard below.
  period_month      date NOT NULL,
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_quota_grants_active
  ON public.ai_quota_grants (organization_id, expires_at);

-- At most one automatic burst per organization per month. A second concurrent
-- request loses this race with a unique violation and is refused, which is the
-- intended outcome.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_quota_grants_one_auto_burst
  ON public.ai_quota_grants (organization_id, period_month)
  WHERE source = 'auto_burst';

ALTER TABLE public.ai_quota_grants ENABLE ROW LEVEL SECURITY;

-- No policies: RLS with zero policies denies every browser role. Grants are
-- written and read only by service-role functions.
REVOKE ALL ON public.ai_quota_grants FROM PUBLIC;
REVOKE ALL ON public.ai_quota_grants FROM anon;
REVOKE ALL ON public.ai_quota_grants FROM authenticated;

COMMENT ON TABLE public.ai_quota_grants
  IS 'Temporary additions to an organization monthly AI allowance. Expiring, audited, service-role only.';
COMMENT ON COLUMN public.ai_quota_grants.source
  IS 'admin = granted by a platform admin; auto_burst = automatic one-off top-up on first breach in a month';
COMMENT ON COLUMN public.ai_quota_grants.period_month
  IS 'First day of the UTC month this grant belongs to; enforces one auto_burst per org per month';
