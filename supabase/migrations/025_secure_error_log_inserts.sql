-- Prevent anonymous callers and authenticated non-members from forging
-- tenant-scoped or server-originated error records.

BEGIN;

DROP POLICY IF EXISTS "users_insert_errors" ON public.error_log;

REVOKE INSERT ON public.error_log FROM PUBLIC, anon;
GRANT INSERT ON public.error_log TO authenticated;

CREATE POLICY "users_insert_errors" ON public.error_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND source = 'client'
    AND (
      organization_id IS NULL
      OR public.is_org_member(organization_id)
    )
  );

COMMIT;
