-- Migration 010: Change source_id from uuid to text
--
-- tasks.source_id and suggested_tasks.source_id had no FK constraint —
-- just a uuid cast. The AI generator stores ESRS topic codes ("E1", "S1")
-- and KPI names, which are not UUIDs, so we relax the type to text.
--
-- Rollback plan:
--   ALTER TABLE tasks ALTER COLUMN source_id TYPE uuid USING source_id::uuid;
--   ALTER TABLE suggested_tasks ALTER COLUMN source_id TYPE uuid USING source_id::uuid;

ALTER TABLE tasks
  ALTER COLUMN source_id TYPE text USING source_id::text;

ALTER TABLE suggested_tasks
  ALTER COLUMN source_id TYPE text USING source_id::text;
