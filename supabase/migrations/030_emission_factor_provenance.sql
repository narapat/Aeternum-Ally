-- ============================================================
-- Migration 030 — reproducible emission figures
-- ============================================================
-- An emission entry recorded its result but never which factor produced it.
-- The factor lived denormalised on emission_sources.emission_factor_value,
-- which is mutable and shared by every entry for that source: change it and
-- past figures keep a number nobody can explain. "How did you arrive at
-- 12,345 kgCO2e?" had no answer, which fails any assurance or bank request.
--
-- Entries now snapshot the factor at the moment of calculation. The snapshot,
-- not the pointer, is the record — factor_id deliberately has no foreign key,
-- because reference data may later be corrected or withdrawn and that must
-- never rewrite or delete history.
--
-- emission_factors also had no unique constraint, so the seed file's promise
-- that it is "safe to re-run" was false: ON CONFLICT DO NOTHING had nothing to
-- conflict against and every re-run duplicated all ~100 rows. This dedupes and
-- adds the missing natural key.
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_emission_factors_natural_key;
--   ALTER TABLE public.emission_entries
--     DROP COLUMN IF EXISTS factor_id,
--     DROP COLUMN IF EXISTS factor_kgco2e_per_unit,
--     DROP COLUMN IF EXISTS factor_source,
--     DROP COLUMN IF EXISTS factor_year;
-- ============================================================

ALTER TABLE public.emission_entries
  ADD COLUMN IF NOT EXISTS factor_id              uuid,
  ADD COLUMN IF NOT EXISTS factor_kgco2e_per_unit numeric(12, 6),
  ADD COLUMN IF NOT EXISTS factor_source          text,
  ADD COLUMN IF NOT EXISTS factor_year            int;

-- Best available reconstruction for rows written before provenance existed:
-- the factor currently on the source is what produced them, unless it has been
-- edited since. Rows written from here on record it at save time instead.
UPDATE public.emission_entries e
SET factor_kgco2e_per_unit = s.emission_factor_value,
    factor_source          = s.emission_factor_source
FROM public.emission_sources s
WHERE e.source_id = s.id
  AND e.factor_kgco2e_per_unit IS NULL;

-- Deduplicate before the natural key can be enforced (keeps the earliest row).
DELETE FROM public.emission_factors a
USING public.emission_factors b
WHERE a.id > b.id
  AND a.fuel_type = b.fuel_type
  AND a.unit      = b.unit
  AND a.source    = b.source
  AND a.year      = b.year
  AND coalesce(a.region, '') = coalesce(b.region, '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_emission_factors_natural_key
  ON public.emission_factors (fuel_type, unit, source, year, coalesce(region, ''));

COMMENT ON COLUMN public.emission_entries.factor_id
  IS 'Pointer to the factor used. Intentionally not a foreign key: the snapshot columns are the record, and correcting reference data must not rewrite history.';
COMMENT ON COLUMN public.emission_entries.factor_kgco2e_per_unit
  IS 'Factor value at the moment of calculation. calculated_emissions_kgco2e = activity_data x this.';
