-- ============================================================
-- 001 — Atomic "create org + first owner + profile" RPC
--
-- Without this, RLS blocks new users from creating their first
-- organization (chicken-and-egg: they're not yet an Owner, so
-- the organization_members INSERT policy rejects them).
--
-- This function runs as SECURITY DEFINER, bypassing RLS only for
-- this carefully-scoped operation. It only creates rows for the
-- caller (auth.uid()) and only acts when the caller is signed in.
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

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_organization_with_owner(text) TO authenticated;
