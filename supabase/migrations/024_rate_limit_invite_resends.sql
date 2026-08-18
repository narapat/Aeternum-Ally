-- Issue #167: centrally rate-limit unauthenticated invite resend requests.

ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS last_email_sent_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.invite_resend_rate_limits (
  client_hash       text PRIMARY KEY
                    CHECK (client_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count     integer NOT NULL DEFAULT 1
                    CHECK (request_count > 0),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_resend_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invite_resend_rate_limits
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invite_resend_rate_limits
  TO service_role;

CREATE INDEX IF NOT EXISTS idx_organization_invites_resend_lookup
  ON public.organization_invites (email, expires_at DESC, created_at DESC);

DROP FUNCTION IF EXISTS public.claim_pending_invite_resend(text);

CREATE OR REPLACE FUNCTION public.claim_pending_invite_resend(
  p_email text,
  p_client_hash text
)
RETURNS TABLE (id uuid, email text, organization_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  request_allowed boolean;
BEGIN
  IF p_client_hash IS NULL OR p_client_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  INSERT INTO public.invite_resend_rate_limits AS rate_limit (
    client_hash,
    window_started_at,
    request_count,
    updated_at
  )
  VALUES (p_client_hash, now(), 1, now())
  ON CONFLICT (client_hash) DO UPDATE
  SET
    window_started_at = CASE
      WHEN rate_limit.window_started_at <= now() - interval '60 seconds'
        THEN now()
      ELSE rate_limit.window_started_at
    END,
    request_count = CASE
      WHEN rate_limit.window_started_at <= now() - interval '60 seconds'
        THEN 1
      ELSE LEAST(rate_limit.request_count::bigint + 1, 2147483647)::integer
    END,
    updated_at = now()
  RETURNING rate_limit.request_count <= 10 INTO request_allowed;

  IF NOT request_allowed THEN
    RETURN;
  END IF;

  RETURN QUERY
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
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_pending_invite_resend(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_invite_resend(text, text)
  TO service_role;

COMMENT ON COLUMN public.organization_invites.last_email_sent_at IS
  'Atomic cooldown marker for invitation email delivery attempts.';
COMMENT ON FUNCTION public.claim_pending_invite_resend(text, text) IS
  'Applies a per-client request limit and claims at most one pending invite after its email cooldown.';
