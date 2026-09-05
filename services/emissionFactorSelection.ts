/**
 * emissionFactorSelection.ts
 *
 * Pure factor-selection rules, kept free of the Supabase client so they can be
 * tested directly.
 *
 * Two things decide which factor applies:
 *
 *   Geography — the most specific match wins: country, then a region the
 *   country belongs to, then a global default.
 *
 *   Period — the factor that applied during the reporting year. Selecting the
 *   newest publication regardless of period silently restates a figure that
 *   was already reported, which breaks year-on-year comparison.
 */

import type { EmissionFactor } from '../types';

export const REGION_MAP: Record<string, string[]> = {
  EU: [
    'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic', 'Denmark',
    'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland', 'Italy',
    'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Poland', 'Portugal',
    'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden',
  ],
  ASEAN: [
    'Brunei', 'Cambodia', 'Indonesia', 'Laos', 'Malaysia', 'Myanmar', 'Philippines',
    'Singapore', 'Thailand', 'Timor-Leste', 'Vietnam',
  ],
};

export function countryToRegions(country: string): string[] {
  return Object.entries(REGION_MAP)
    .filter(([, members]) => members.some(m => m.toLowerCase() === country.toLowerCase()))
    .map(([region]) => region);
}

/**
 * @param factors      candidates for one fuel type and unit
 * @param country      the organization's country
 * @param reportingYear year the activity took place; omit to accept any
 */
export function selectBestFactor(
  factors: EmissionFactor[],
  country: string,
  reportingYear?: number,
): EmissionFactor | null {
  if (factors.length === 0) return null;

  // Newest first, so the first geographic match is also the most recent one
  // that applies.
  const ordered = [...factors].sort((a, b) => b.year - a.year);

  // Prefer factors published no later than the reporting year. If none exist
  // — a period earlier than any published factor — fall back rather than
  // refuse to calculate.
  const inPeriod = reportingYear
    ? ordered.filter(f => f.year <= reportingYear)
    : ordered;
  const candidates = inPeriod.length > 0 ? inPeriod : ordered;

  const target = country.trim().toLowerCase();

  const exact = candidates.find(f => (f.region ?? '').toLowerCase() === target);
  if (exact) return exact;

  for (const region of countryToRegions(country)) {
    const match = candidates.find(
      f => (f.region ?? '').toLowerCase() === region.toLowerCase(),
    );
    if (match) return match;
  }

  const global = candidates.find(f => (f.region ?? '').toLowerCase() === 'global');
  if (global) return global;

  return candidates[0];
}
