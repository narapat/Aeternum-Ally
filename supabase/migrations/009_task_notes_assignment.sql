-- Migration 009: Add notes, assigned_by, assigned_at to tasks
--
-- Changes:
--   tasks — add notes text, assigned_by uuid, assigned_at timestamptz
--
-- Rollback plan:
--   ALTER TABLE tasks DROP COLUMN IF EXISTS notes;
--   ALTER TABLE tasks DROP COLUMN IF EXISTS assigned_by;
--   ALTER TABLE tasks DROP COLUMN IF EXISTS assigned_at;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS notes       text,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
