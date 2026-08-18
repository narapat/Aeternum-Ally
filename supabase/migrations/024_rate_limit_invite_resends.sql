-- Issue #167: centrally rate-limit unauthenticated invite resend requests.

ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS last_email_sent_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_organization_invites_resend_lookup
  ON public.organization_invites (email, expires_at DESC, created_at DESC);

CREATE OR REPLACE FUNCTION public.claim_pending_invite_resend(p_email text)
RETURNS TABLE (id uuid, email text, organization_id uuid)
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  WITH candidate AS (
    SELECT invite.id
    FROM public.organization_invites AS invite
    WHERE invite.email = lower(btrim(p_email))
      AND invite.expires_at > now()
      AND invite.last_email_sent_at <= now() - interval '5 minutes'
    ORDER BY invite.created_at DESC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.organization_invites AS invite
  SET last_email_sent_at = now()
  FROM candidate
  WHERE invite.id = candidate.id
  RETURNING invite.id, invite.email, invite.organization_id;
$function$;

REVOKE ALL ON FUNCTION public.claim_pending_invite_resend(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_invite_resend(text)
  TO service_role;

COMMENT ON COLUMN public.organization_invites.last_email_sent_at IS
  'Atomic cooldown marker for invitation email delivery attempts.';
COMMENT ON FUNCTION public.claim_pending_invite_resend(text) IS
  'Claims at most one pending invite for resend after a five-minute cooldown; service role only.';
