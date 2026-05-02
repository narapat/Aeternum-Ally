-- Centralised error log for server-side and client-side errors.
--
-- Key columns for troubleshooting:
--   source   → 'server' (Netlify function) | 'client' (browser)
--   context  → feature area: 'invite' | 'accept-invite' | 'db-save' | 'db-load'
--              | 'member-management' | 'org-setup'
--   action   → specific operation: 'send_email' | 'create_invite' | 'add_member'
--              | 'save_canvas' | 'deactivate_member' | 'update_role' | etc.
--   http_status → upstream HTTP code when applicable (503, 500, 404 …)
--   metadata → jsonb bag for extra debugging context (table name, ids, etc.)
--
-- Useful queries:
--
--   -- All invite email failures in the last 7 days
--   SELECT * FROM error_log
--   WHERE context = 'invite' AND action = 'send_email'
--     AND created_at > now() - interval '7 days'
--   ORDER BY created_at DESC;
--
--   -- Orgs with repeated DB save failures
--   SELECT organization_id, count(*) AS failures
--   FROM error_log
--   WHERE context = 'db-save'
--   GROUP BY organization_id ORDER BY failures DESC;

CREATE TABLE error_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        REFERENCES organizations(id) ON DELETE SET NULL,
  user_id         uuid        REFERENCES auth.users(id)   ON DELETE SET NULL,
  user_email      text,
  source          text        NOT NULL CHECK (source IN ('server', 'client')),
  context         text        NOT NULL,
  action          text,
  error_message   text        NOT NULL,
  http_status     int,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_log_org_date    ON error_log (organization_id, created_at DESC);
CREATE INDEX idx_error_log_context     ON error_log (context, action);
CREATE INDEX idx_error_log_created_at  ON error_log (created_at DESC);

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;

-- Owners and Admins can read their org's errors.
CREATE POLICY "admins_read_errors" ON error_log
  FOR SELECT USING (
    organization_id IS NOT NULL
    AND user_org_role(organization_id) IN ('Owner', 'Admin')
  );

-- Any authenticated user can insert their own errors.
CREATE POLICY "users_insert_errors" ON error_log
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR user_id IS NULL
  );
