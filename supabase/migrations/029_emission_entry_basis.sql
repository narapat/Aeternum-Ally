-- ============================================================
-- Migration 029 — estimated vs actual emission entries
-- ============================================================
-- Carbon Quest asks for a monthly average, multiplies it by twelve, and stores
-- the result as one entry spanning 1 Jan – 31 Dec. The dashboard buckets the
-- monthly trend by period_start, so that annualised figure lands entirely in
-- January, and it is then summed alongside any real monthly entries the
-- organization records afterwards — double counting the year.
--
-- The two are different kinds of number, so the table now says which is which:
--
--   estimate = an annualised figure derived from a typical period
--   actual   = measured consumption for the period stated
--
-- Aggregation counts every actual, and counts an estimate only for a source
-- that has no actuals in that year.
--
-- A second entry for the same period is legitimate — a correction, an
-- adjustment, a second invoice for one meter — so it is allowed rather than
-- blocked. What it must carry is an explanation: when an entry overlaps
-- another for the same source and basis, a note becomes mandatory. The UI
-- warns before saving; this trigger is what makes the rule hold for the
-- spreadsheet importer and any future path too.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS emission_entries_require_note_on_overlap ON public.emission_entries;
--   DROP FUNCTION IF EXISTS public.require_note_on_overlapping_entry();
--   ALTER TABLE public.emission_entries DROP COLUMN IF EXISTS basis;
-- ============================================================

ALTER TABLE public.emission_entries
  ADD COLUMN IF NOT EXISTS basis text NOT NULL DEFAULT 'actual';

ALTER TABLE public.emission_entries
  DROP CONSTRAINT IF EXISTS emission_entries_basis_check;
ALTER TABLE public.emission_entries
  ADD CONSTRAINT emission_entries_basis_check
  CHECK (basis IN ('estimate', 'actual'));

-- Existing wizard rows span a full year; genuine measurements never do.
UPDATE public.emission_entries
SET basis = 'estimate'
WHERE period_end - period_start >= 180;

-- An overlapping entry is allowed, but it has to say why.
CREATE OR REPLACE FUNCTION public.require_note_on_overlapping_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(btrim(NEW.notes), '') = '' AND EXISTS (
    SELECT 1
    FROM public.emission_entries existing
    WHERE existing.source_id = NEW.source_id
      AND existing.basis     = NEW.basis
      AND existing.id       <> NEW.id
      AND daterange(existing.period_start, existing.period_end, '[]')
       && daterange(NEW.period_start, NEW.period_end, '[]')
  ) THEN
    RAISE EXCEPTION
      'Another entry already covers this period for this source. Add a note explaining why this one exists (for example: correction, adjustment, second invoice).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS emission_entries_require_note_on_overlap ON public.emission_entries;
CREATE TRIGGER emission_entries_require_note_on_overlap
  BEFORE INSERT OR UPDATE ON public.emission_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.require_note_on_overlapping_entry();

-- Existing overlapping rows are left as they are: this rule governs what is
-- written from here on, and is not a reason to reject history.
ALTER TABLE public.emission_entries
  DROP CONSTRAINT IF EXISTS emission_entries_no_overlap;

COMMENT ON COLUMN public.emission_entries.basis
  IS 'estimate = annualised from a typical period (Carbon Quest); actual = measured for the stated period. An estimate counts only for a source with no actuals that year.';
