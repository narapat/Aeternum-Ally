-- Migration 011: organization_integrations table
-- Issue: #41 (Evidence Vault API) / #42 (Google Drive OAuth)
--
-- Stores OAuth tokens for Google Drive, OneDrive, and Dropbox integrations.
-- Tokens are stored encrypted at rest by Supabase (vault optional for extra
-- security — swap access_token/refresh_token columns for vault secret IDs).
--
-- Rollback:
--   DROP TABLE IF EXISTS organization_integrations CASCADE;

CREATE TABLE organization_integrations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_type text        NOT NULL
                     CHECK (integration_type IN ('google_drive', 'onedrive', 'dropbox')),
  access_token     text        NOT NULL,
  refresh_token    text,
  expires_at       timestamptz,
  connected_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, integration_type)
);

CREATE INDEX idx_org_integrations_org
  ON organization_integrations (organization_id, integration_type);

ALTER TABLE organization_integrations ENABLE ROW LEVEL SECURITY;

-- Only Owner/Admin can connect/disconnect integrations
CREATE POLICY "admins_manage_integrations" ON organization_integrations
  FOR ALL USING (
    is_org_member(organization_id)
    AND user_org_role(organization_id) IN ('Owner', 'Admin')
  );

COMMENT ON TABLE  organization_integrations IS 'OAuth tokens for cloud storage integrations (Drive, OneDrive, Dropbox)';
COMMENT ON COLUMN organization_integrations.integration_type IS 'google_drive | onedrive | dropbox';
COMMENT ON COLUMN organization_integrations.access_token     IS 'Short-lived OAuth access token';
COMMENT ON COLUMN organization_integrations.refresh_token    IS 'Long-lived token for refreshing access_token';
COMMENT ON COLUMN organization_integrations.expires_at       IS 'When access_token expires; refresh before this time';
