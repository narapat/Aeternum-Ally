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
