-- Migration 008: Persist DMA quality checks, strategic insights, and suggested tasks
--
-- Changes:
--   assessments       — add quality_check_status, quality_check_issues columns
--   dma_insights      — new singleton-per-org table for strategic insight + recommended actions
--   suggested_tasks   — make source_id nullable; add INSERT policy; add estimated_time column
--
-- Rollback plan:
--   ALTER TABLE assessments DROP COLUMN IF EXISTS quality_check_status;
--   ALTER TABLE assessments DROP COLUMN IF EXISTS quality_check_issues;
--   DROP TABLE IF EXISTS dma_insights CASCADE;
--   ALTER TABLE suggested_tasks ALTER COLUMN source_id SET NOT NULL;
--   ALTER TABLE suggested_tasks DROP COLUMN IF EXISTS estimated_time;
--   DROP POLICY IF EXISTS "members_insert_suggested" ON suggested_tasks;

-- ── 1. Quality check columns on assessments ───────────────────────────────────

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS quality_check_status text
    CHECK (quality_check_status IN ('ok', 'review', 'needs_fix')),
  ADD COLUMN IF NOT EXISTS quality_check_issues  jsonb NOT NULL DEFAULT '[]';

-- ── 2. DMA strategic insight (singleton per org) ──────────────────────────────

CREATE TABLE IF NOT EXISTS dma_insights (
  organization_id     uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  strategic_insight   jsonb NOT NULL DEFAULT '{}',
  recommended_actions jsonb NOT NULL DEFAULT '[]',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_dma_insights_updated_at
  BEFORE UPDATE ON dma_insights FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE dma_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_dma_insights" ON dma_insights
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "members_write_dma_insights" ON dma_insights
  FOR ALL USING (is_org_member(organization_id));

-- ── 3. Fix suggested_tasks for DMA use ───────────────────────────────────────

-- source_id was uuid NOT NULL; DMA actions reference ESRS topic codes, not UUIDs
ALTER TABLE suggested_tasks
  ALTER COLUMN source_id DROP NOT NULL;

-- estimated_time was missing
ALTER TABLE suggested_tasks
  ADD COLUMN IF NOT EXISTS estimated_time text;

-- INSERT policy was missing
CREATE POLICY "members_insert_suggested" ON suggested_tasks
  FOR INSERT WITH CHECK (is_org_member(organization_id));
