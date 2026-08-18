-- ============================================================
-- Migration 022 - Google Drive OAuth token isolation
-- ============================================================

BEGIN;

-- OAuth credentials are consumed only by Netlify Functions using the service
-- role. Browser clients must not be able to query them even when the user is an
-- organization Owner or Admin.
DROP POLICY IF EXISTS "admins_manage_integrations" ON organization_integrations;
REVOKE ALL ON TABLE organization_integrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE organization_integrations TO service_role;

COMMENT ON TABLE organization_integrations
  IS 'Server-only OAuth credentials for cloud storage integrations. Never expose rows or token values to browser clients.';

-- Store only a hash of each short-lived, single-use OAuth state. The raw state
-- exists only in the authorization URL returned to an authenticated Owner/Admin.
CREATE TABLE organization_oauth_states (
  state_hash       text        PRIMARY KEY CHECK (char_length(state_hash) = 64),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_type text        NOT NULL CHECK (integration_type = 'google_drive'),
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_organization_oauth_states_expiry
  ON organization_oauth_states (expires_at);

ALTER TABLE organization_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE organization_oauth_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE organization_oauth_states TO service_role;

COMMENT ON TABLE organization_oauth_states
  IS 'Server-only hashes for short-lived, single-use OAuth state parameters.';

COMMIT;
