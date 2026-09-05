-- ============================================================
-- Migration 031 — structured company context
-- ============================================================
-- Dogfooding showed the free-text Business Description was acting as the
-- grounding layer for every AI feature: naming an infrastructure provider
-- there was the difference between SBMC returning Key Partners and returning
-- nothing at all.
--
-- Prose is a poor place for facts. It cannot distinguish what a company does
-- from what it is considering, and it cannot say that a standard is referenced
-- rather than partnered with. This column holds those facts as items:
--
--   { id, category, name, role, status, source, updatedAt }
--
-- One shape serves all six categories (business, operating, technology,
-- commercial, ecosystem, standards) because they differ only in what `name`
-- and `role` mean. `status` (current | planned | exploring | not_established)
-- is what stops a plan being reported as a fact; `source` records provenance
-- so grounding stays auditable as AI-assisted entry is added later.
--
-- Unknown is represented by absence — there is deliberately no "unknown"
-- status, because a user should never have to invent an answer.
--
-- Additive and backward compatible: existing profiles default to an empty
-- array, and the rendered AI context is then byte-identical to today's.
--
-- Rollback:
--   ALTER TABLE public.company_profiles DROP COLUMN IF EXISTS structured_context;
-- ============================================================

ALTER TABLE public.company_profiles
  ADD COLUMN IF NOT EXISTS structured_context jsonb NOT NULL DEFAULT '[]'::jsonb;

-- The shape is enforced in application code; the database guarantees only that
-- this is a list, so a malformed value cannot be read back as a single fact.
ALTER TABLE public.company_profiles
  DROP CONSTRAINT IF EXISTS company_profiles_structured_context_is_array;
ALTER TABLE public.company_profiles
  ADD CONSTRAINT company_profiles_structured_context_is_array
  CHECK (jsonb_typeof(structured_context) = 'array');

COMMENT ON COLUMN public.company_profiles.structured_context
  IS 'Company facts as items {id, category, name, role, status, source, updatedAt}. Absence means unknown; status keeps plans from being reported as current facts.';
