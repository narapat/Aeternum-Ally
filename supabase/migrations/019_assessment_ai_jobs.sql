-- Migration 019: Persist Assessment AI Jobs for Polling/Background Job
--
-- Changes:
--   assessment_ai_jobs — new table for tracking autofill and scoring jobs per assessment
--
-- Rollback plan:
--   DROP TABLE IF EXISTS assessment_ai_jobs CASCADE;

CREATE TABLE IF NOT EXISTS assessment_ai_jobs (
  organization_id     uuid REFERENCES organizations(id) ON DELETE CASCADE,
  assessment_id       text NOT NULL,
  topic               text NOT NULL,
  autofill_status     text NOT NULL DEFAULT 'idle' CHECK (autofill_status IN ('idle', 'processing', 'completed', 'failed')),
  autofill_result     jsonb NOT NULL DEFAULT '{}',
  scoring_status      text NOT NULL DEFAULT 'idle' CHECK (scoring_status IN ('idle', 'processing', 'completed', 'failed')),
  scoring_result      jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, assessment_id)
);

CREATE TRIGGER trg_assessment_ai_jobs_updated_at
  BEFORE UPDATE ON assessment_ai_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE assessment_ai_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_assessment_jobs" ON assessment_ai_jobs
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "members_write_assessment_jobs" ON assessment_ai_jobs
  FOR ALL USING (is_org_member(organization_id));
