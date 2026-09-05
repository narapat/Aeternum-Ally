-- ============================================================
-- Migration 028 — emission_factors reference access
-- ============================================================
-- `emission_factors` is shared reference data that every tenant's carbon
-- numbers depend on. Its access rules were never declared anywhere:
-- migration 007 created the table with the comment "no RLS, read-only for
-- users" but neither enabled RLS nor revoked anything, and no policy has ever
-- existed in the repository.
--
-- That left two wrong states at once:
--
--   * A fresh install from schema.sql gets RLS OFF with the default Supabase
--     grants, so any signed-in user of any tenant could UPDATE or DELETE the
--     factors every other tenant calculates with.
--   * Production has RLS ON (enabled outside the repository) with no policy,
--     which denies every browser role — including the SELECT the carbon
--     wizard and dashboard need to find a factor at all.
--
-- This declares the intended state so both converge: readable by any signed-in
-- user, writable only by platform admins through netlify/functions/admin.ts,
-- which uses service_role and bypasses RLS.
--
-- Rollback:
--   DROP POLICY IF EXISTS "authenticated_read_emission_factors" ON public.emission_factors;
--   ALTER TABLE public.emission_factors DISABLE ROW LEVEL SECURITY;
-- ============================================================

ALTER TABLE public.emission_factors ENABLE ROW LEVEL SECURITY;

-- Reference data is global and non-sensitive: every tenant reads the same rows.
-- There is deliberately no INSERT/UPDATE/DELETE policy — writes are a
-- platform-admin operation, not a tenant one.
DROP POLICY IF EXISTS "authenticated_read_emission_factors" ON public.emission_factors;
CREATE POLICY "authenticated_read_emission_factors"
  ON public.emission_factors
  FOR SELECT
  TO authenticated
  USING (true);

-- Defence in depth: even with RLS on, leaving the default write grants in
-- place means one accidental permissive policy would expose every tenant's
-- calculation basis.
REVOKE ALL ON public.emission_factors FROM PUBLIC;
REVOKE ALL ON public.emission_factors FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.emission_factors FROM authenticated;
GRANT SELECT ON public.emission_factors TO authenticated;

COMMENT ON TABLE public.emission_factors
  IS 'Shared reference factors (IPCC / DEFRA / TGO / IEA). Readable by any signed-in user; written only by platform admins via service_role.';
