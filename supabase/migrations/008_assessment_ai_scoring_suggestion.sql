-- Migration 008: Store AI scoring suggestion snapshot on assessments
-- Issue: #31 — AI-Guided Scoring (Phase 2)
--
-- Adds ai_scoring_suggestion jsonb to persist the AI-suggested scores and
-- reasoning at the time the assessment was saved.  NULL means the user did
-- not use AI scoring for that assessment.
--
-- Shape stored:
-- {
--   "suggestedAt": "ISO-8601",
--   "impact": {
--     "scale":           { "score": 1-5, "reasoning": "..." },
--     "scope":           { "score": 1-5, "reasoning": "..." },
--     "irremediability": { "score": 1-5, "reasoning": "..." },
--     "likelihood":      { "score": 1-5, "reasoning": "..." }
--   },
--   "financial": {
--     "magnitude": { "score": 1-5, "reasoning": "..." },
--     "likelihood": { "score": 1-5, "reasoning": "..." }
--   }
-- }
--
-- Rollback:
--   ALTER TABLE assessments DROP COLUMN IF EXISTS ai_scoring_suggestion;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS ai_scoring_suggestion jsonb;

COMMENT ON COLUMN assessments.ai_scoring_suggestion IS
  'Snapshot of AI-suggested scores + reasoning at save time. NULL if AI scoring was not used.';
