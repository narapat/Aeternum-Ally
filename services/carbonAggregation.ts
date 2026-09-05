/**
 * carbonAggregation.ts
 *
 * Pure aggregation rules for emission entries, kept out of the dashboard
 * component so they can be tested directly.
 *
 * The rule that matters: Carbon Quest writes one annualised `estimate` per
 * source covering the whole year, while measured months arrive later as
 * `actual`. Summing both double counts the year, and plotting an estimate
 * against its start month invents a January spike. So an estimate counts only
 * for a source with no measurement yet, and never appears in the trend.
 */

// Type-only: erased at runtime, so the module loads under node --test.
import type { EmissionEntry, EmissionSource } from '../types';

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface MonthlyTrendPoint {
  month: string;
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
}

/** Every entry whose period starts in the given year, regardless of basis. */
export function entriesForYear(entries: EmissionEntry[], year: number): EmissionEntry[] {
  return entries.filter(e => new Date(e.period_start).getFullYear() === year);
}

/**
 * The entries that should contribute to a year's total: all measurements,
 * plus an estimate only for a source that has none.
 */
export function countableForYear(entries: EmissionEntry[], year: number): EmissionEntry[] {
  const inYear = entriesForYear(entries, year);
  const measured = new Set(
    inYear.filter(e => e.basis === 'actual').map(e => e.source_id),
  );
  return inYear.filter(e => e.basis === 'actual' || !measured.has(e.source_id));
}

/** Sources in the year whose figure is still an annualised estimate. */
export function sourcesOnEstimate(entries: EmissionEntry[], year: number): Set<string> {
  return new Set(
    countableForYear(entries, year)
      .filter(e => e.basis === 'estimate')
      .map(e => e.source_id),
  );
}

/** Totals in tonnes CO2e per scope, per month. Measurements only. */
export function buildMonthlyTrend(
  entries: EmissionEntry[],
  sources: EmissionSource[],
  year: number,
): MonthlyTrendPoint[] {
  const scopeOf = Object.fromEntries(sources.map(s => [s.id, s.scope]));

  return MONTH_LABELS.map((label, monthIndex) => {
    const monthEntries = entries.filter(e => {
      const d = new Date(e.period_start);
      return e.basis === 'actual'
        && d.getFullYear() === year
        && d.getMonth() === monthIndex;
    });

    const s: Record<string, number> = { '1': 0, '2': 0, '3': 0 };
    for (const e of monthEntries) {
      const scope = scopeOf[e.source_id] ?? '1';
      s[scope] = (s[scope] ?? 0) + e.calculated_emissions_kgco2e / 1000;
    }

    return {
      month: label,
      scope1: Math.round(s['1'] * 100) / 100,
      scope2: Math.round(s['2'] * 100) / 100,
      scope3: Math.round(s['3'] * 100) / 100,
      total: Math.round((s['1'] + s['2'] + s['3']) * 100) / 100,
    };
  });
}

/**
 * Entries for the same source and basis whose period overlaps the one given.
 *
 * A second entry for a period is legitimate — a correction, an adjustment, a
 * second invoice for one meter — so this exists to warn and to require an
 * explanation, not to block.
 */
export function overlappingEntries(
  entries: EmissionEntry[],
  sourceId: string,
  basis: EmissionEntry['basis'],
  periodStart: string,
  periodEnd: string,
  excludeEntryId?: string,
): EmissionEntry[] {
  if (!periodStart || !periodEnd || periodStart > periodEnd) return [];

  return entries.filter(e =>
    e.source_id === sourceId
    && e.basis === basis
    && e.id !== excludeEntryId
    // Inclusive ranges overlap unless one ends before the other starts.
    && e.period_start <= periodEnd
    && e.period_end >= periodStart,
  );
}
