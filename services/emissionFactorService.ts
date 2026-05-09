/**
 * emissionFactorService.ts
 *
 * Auto-select logic for emission factors and CRUD helpers for
 * emission sources and entries.
 *
 * Selection priority (same fuel_type + unit):
 *   1. Exact country match, newest year
 *   2. Region match (EU, ASEAN, etc.), newest year
 *   3. Global fallback, newest year
 */

import { supabase } from '../lib/supabaseClient';
import { EmissionFactor, EmissionSource, EmissionEntry, EmissionScope } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Region → country membership (lightweight client-side mapping)
// ─────────────────────────────────────────────────────────────────────────────

const REGION_MAP: Record<string, string[]> = {
  EU: [
    'Austria','Belgium','Bulgaria','Croatia','Cyprus','Czech Republic','Denmark',
    'Estonia','Finland','France','Germany','Greece','Hungary','Ireland','Italy',
    'Latvia','Lithuania','Luxembourg','Malta','Netherlands','Poland','Portugal',
    'Romania','Slovakia','Slovenia','Spain','Sweden',
  ],
  ASEAN: [
    'Brunei','Cambodia','Indonesia','Laos','Malaysia','Myanmar','Philippines',
    'Singapore','Thailand','Timor-Leste','Vietnam',
  ],
};

function countryToRegions(country: string): string[] {
  return Object.entries(REGION_MAP)
    .filter(([, members]) => members.some(m => m.toLowerCase() === country.toLowerCase()))
    .map(([region]) => region);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch all emission factors for a given fuel type + unit combo. */
export async function fetchEmissionFactorsForFuel(
  fuelType: string,
  unit: string,
): Promise<EmissionFactor[]> {
  const { data, error } = await supabase
    .from('emission_factors')
    .select('*')
    .eq('fuel_type', fuelType)
    .eq('unit', unit)
    .order('year', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmissionFactor[];
}

/** Fetch every emission factor (for picker / admin). */
export async function fetchAllEmissionFactors(): Promise<EmissionFactor[]> {
  const { data, error } = await supabase
    .from('emission_factors')
    .select('*')
    .order('fuel_type', { ascending: true })
    .order('year', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmissionFactor[];
}

/** Distinct fuel types that have at least one factor row. */
export async function fetchDistinctFuelTypes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('emission_factors')
    .select('fuel_type')
    .order('fuel_type', { ascending: true });
  if (error) throw error;
  const unique = Array.from(new Set((data ?? []).map((r: any) => r.fuel_type as string)));
  return unique;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-select best factor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the best emission factor for a fuel + unit given an org's country.
 * Priority: exact country > regional (EU/ASEAN) > Global — newest year wins.
 * Returns null if no factor found.
 */
export async function getBestEmissionFactor(
  fuelType: string,
  unit: string,
  organizationCountry: string,
): Promise<EmissionFactor | null> {
  const factors = await fetchEmissionFactorsForFuel(fuelType, unit);
  if (factors.length === 0) return null;

  const country = organizationCountry.trim().toLowerCase();

  // 1. Exact country match (newest year first — already ordered)
  const countryMatch = factors.find(f => (f.region ?? '').toLowerCase() === country);
  if (countryMatch) return countryMatch;

  // 2. Any region this country belongs to
  const regions = countryToRegions(organizationCountry);
  for (const region of regions) {
    const regionMatch = factors.find(f => (f.region ?? '').toLowerCase() === region.toLowerCase());
    if (regionMatch) return regionMatch;
  }

  // 3. Global fallback
  const globalMatch = factors.find(f => (f.region ?? '').toLowerCase() === 'global');
  if (globalMatch) return globalMatch;

  // 4. Whatever is newest
  return factors[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Emission Sources CRUD
// ─────────────────────────────────────────────────────────────────────────────

const fromDbSource = (row: any): EmissionSource => ({
  id: row.id,
  organization_id: row.organization_id,
  scope: row.scope as EmissionScope,
  source_name: row.source_name,
  fuel_type: row.fuel_type ?? null,
  unit: row.unit,
  emission_factor_value: row.emission_factor_value ?? null,
  emission_factor_source: row.emission_factor_source ?? null,
  active: row.active ?? true,
  created_at: row.created_at,
  updated_at: row.updated_at,
  identification_number: row.identification_number ?? null,
  asset_number: row.asset_number ?? null,
});

export async function fetchEmissionSources(orgId: string): Promise<EmissionSource[]> {
  const { data, error } = await supabase
    .from('emission_sources')
    .select('*')
    .eq('organization_id', orgId)
    .eq('active', true)
    .order('scope', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(fromDbSource);
}

export async function upsertEmissionSource(
  orgId: string,
  source: Partial<EmissionSource> & Pick<EmissionSource, 'scope' | 'source_name' | 'unit'>,
): Promise<EmissionSource> {
  const payload: any = {
    organization_id: orgId,
    scope: source.scope,
    source_name: source.source_name,
    fuel_type: source.fuel_type ?? null,
    unit: source.unit,
    emission_factor_value: source.emission_factor_value ?? null,
    emission_factor_source: source.emission_factor_source ?? null,
    active: source.active ?? true,
    updated_at: new Date().toISOString(),
    identification_number: source.identification_number ?? null,
    asset_number: source.asset_number ?? null,
  };
  if (source.id) payload.id = source.id;

  const { data, error } = await supabase
    .from('emission_sources')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return fromDbSource(data);
}

export async function deleteEmissionSource(id: string): Promise<void> {
  // Soft-delete: set active = false
  const { error } = await supabase
    .from('emission_sources')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Emission Entries CRUD
// ─────────────────────────────────────────────────────────────────────────────

const fromDbEntry = (row: any): EmissionEntry => ({
  id: row.id,
  organization_id: row.organization_id,
  source_id: row.source_id,
  period_start: row.period_start,
  period_end: row.period_end,
  activity_data: Number(row.activity_data),
  calculated_emissions_kgco2e: Number(row.calculated_emissions_kgco2e),
  notes: row.notes ?? null,
  created_by: row.created_by ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export async function fetchEmissionEntries(orgId: string): Promise<EmissionEntry[]> {
  const { data, error } = await supabase
    .from('emission_entries')
    .select('*')
    .eq('organization_id', orgId)
    .order('period_start', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDbEntry);
}

export async function upsertEmissionEntry(
  orgId: string,
  entry: Partial<EmissionEntry> & Pick<EmissionEntry, 'source_id' | 'period_start' | 'period_end' | 'activity_data' | 'calculated_emissions_kgco2e'>,
  userId: string,
): Promise<EmissionEntry> {
  const payload: any = {
    organization_id: orgId,
    source_id: entry.source_id,
    period_start: entry.period_start,
    period_end: entry.period_end,
    activity_data: entry.activity_data,
    calculated_emissions_kgco2e: entry.calculated_emissions_kgco2e,
    notes: entry.notes ?? null,
    created_by: userId,
    updated_at: new Date().toISOString(),
  };
  if (entry.id) payload.id = entry.id;

  const { data, error } = await supabase
    .from('emission_entries')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return fromDbEntry(data);
}

export async function deleteEmissionEntry(id: string): Promise<void> {
  const { error } = await supabase.from('emission_entries').delete().eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculation helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate kgCO2e given activity data and a factor value.
 * Returns rounded to 3 decimal places.
 */
export function calculateEmissions(activityData: number, factorKgco2ePerUnit: number): number {
  return Math.round(activityData * factorKgco2ePerUnit * 1000) / 1000;
}
