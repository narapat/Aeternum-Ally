-- Migration 018: Persist DMA Analysis Jobs for Polling/Background Job
--
-- Changes:
--   dma_analysis_jobs — new singleton-per-org table for DMA analysis status and results
--
-- Rollback plan:
--   DROP TABLE IF EXISTS dma_analysis_jobs CASCADE;

CREATE TABLE IF NOT EXISTS dma_analysis_jobs (
  organization_id     uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  insight_result      jsonb NOT NULL DEFAULT '{}',
  quality_result      jsonb NOT NULL DEFAULT '[]',
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_dma_analysis_jobs_updated_at
  BEFORE UPDATE ON dma_analysis_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE dma_analysis_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_dma_jobs" ON dma_analysis_jobs
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "members_write_dma_jobs" ON dma_analysis_jobs
  FOR ALL USING (is_org_member(organization_id));
