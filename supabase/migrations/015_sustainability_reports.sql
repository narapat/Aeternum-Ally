-- Migration 015: Persist Sustainability Reports for Polling/Background Job
--
-- Changes:
--   sustainability_reports — new singleton-per-org table for report generation status and results
--
-- Rollback plan:
--   DROP TABLE IF EXISTS sustainability_reports CASCADE;

CREATE TABLE IF NOT EXISTS sustainability_reports (
  organization_id     uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  result              jsonb NOT NULL DEFAULT '{}',
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_sustainability_reports_updated_at
  BEFORE UPDATE ON sustainability_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sustainability_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_reports" ON sustainability_reports
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "members_write_reports" ON sustainability_reports
  FOR ALL USING (is_org_member(organization_id));
