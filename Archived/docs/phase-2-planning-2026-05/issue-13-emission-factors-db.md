# Emission Factors Reference Database

**Type:** Enhancement  
**Priority:** P2 (Medium)  
**Labels:** `phase-2`, `carbon-accounting`, `database`, `data`, `p2`  
**Milestone:** Phase 2 — Carbon Accounting  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #3 (emission_factors table)

---

## Problem

Carbon calculations require emission factors:
- kgCO2e per liter of gasoline
- kgCO2e per kWh of electricity
- Different factors per region/year
- Standards update regularly (IPCC, DEFRA, TGO)

Users should NOT have to look these up manually.

---

## Solution

Pre-populated **emission_factors** table with standard factors from:
- IPCC 2021 Guidelines
- DEFRA 2024 Database (UK)
- Thailand Greenhouse Gas Organization (TGO) 2024

Auto-suggest appropriate factor based on:
- Fuel type selected
- Country/region
- Most recent year available

---

## Database Schema (from Issue #3)

```sql
emission_factors
├── id
├── fuel_type  -- "Gasoline", "Diesel", "Grid Electricity", etc.
├── scope  -- "1", "2", "3"
├── unit  -- "L", "kWh", "kg", "m3"
├── kgco2e_per_unit  -- emission factor value
├── source  -- "IPCC 2021", "DEFRA 2024", "TGO 2024"
├── year  -- 2024, 2021, etc.
├── region  -- "Global", "Thailand", "UK", "EU", etc.
├── created_at
```

---

## Data Sources

### 1. IPCC 2021 (Global Defaults)

```json
[
  {
    "fuel_type": "Gasoline",
    "scope": "1",
    "unit": "L",
    "kgco2e_per_unit": 2.31,
    "source": "IPCC 2021",
    "year": 2021,
    "region": "Global"
  },
  {
    "fuel_type": "Diesel",
    "scope": "1",
    "unit": "L",
    "kgco2e_per_unit": 2.68,
    "source": "IPCC 2021",
    "year": 2021,
    "region": "Global"
  },
  {
    "fuel_type": "LPG",
    "scope": "1",
    "unit": "kg",
    "kgco2e_per_unit": 3.00,
    "source": "IPCC 2021",
    "year": 2021,
    "region": "Global"
  },
  {
    "fuel_type": "Natural Gas",
    "scope": "1",
    "unit": "m3",
    "kgco2e_per_unit": 1.88,
    "source": "IPCC 2021",
    "year": 2021,
    "region": "Global"
  }
]
```

### 2. TGO 2024 (Thailand-Specific)

```json
[
  {
    "fuel_type": "Grid Electricity",
    "scope": "2",
    "unit": "kWh",
    "kgco2e_per_unit": 0.5213,
    "source": "TGO 2024",
    "year": 2024,
    "region": "Thailand"
  },
  {
    "fuel_type": "Gasoline",
    "scope": "1",
    "unit": "L",
    "kgco2e_per_unit": 2.34,
    "source": "TGO 2024",
    "year": 2024,
    "region": "Thailand"
  },
  {
    "fuel_type": "Diesel B7",
    "scope": "1",
    "unit": "L",
    "kgco2e_per_unit": 2.65,
    "source": "TGO 2024",
    "year": 2024,
    "region": "Thailand"
  }
]
```

### 3. DEFRA 2024 (UK)

```json
[
  {
    "fuel_type": "Grid Electricity",
    "scope": "2",
    "unit": "kWh",
    "kgco2e_per_unit": 0.193,
    "source": "DEFRA 2024",
    "year": 2024,
    "region": "UK"
  },
  {
    "fuel_type": "Gasoline",
    "scope": "1",
    "unit": "L",
    "kgco2e_per_unit": 2.17,
    "source": "DEFRA 2024",
    "year": 2024,
    "region": "UK"
  }
]
```

---

## Seed Data Script

```sql
-- supabase/seeds/emission_factors.sql

INSERT INTO emission_factors 
  (fuel_type, scope, unit, kgco2e_per_unit, source, year, region)
VALUES
  -- IPCC 2021 (Global)
  ('Gasoline', '1', 'L', 2.31, 'IPCC 2021', 2021, 'Global'),
  ('Diesel', '1', 'L', 2.68, 'IPCC 2021', 2021, 'Global'),
  ('LPG', '1', 'kg', 3.00, 'IPCC 2021', 2021, 'Global'),
  ('Natural Gas', '1', 'm3', 1.88, 'IPCC 2021', 2021, 'Global'),
  ('Fuel Oil', '1', 'L', 2.96, 'IPCC 2021', 2021, 'Global'),
  ('Coal', '1', 'kg', 2.42, 'IPCC 2021', 2021, 'Global'),
  
  -- TGO 2024 (Thailand)
  ('Grid Electricity', '2', 'kWh', 0.5213, 'TGO 2024', 2024, 'Thailand'),
  ('Gasoline', '1', 'L', 2.34, 'TGO 2024', 2024, 'Thailand'),
  ('Diesel B7', '1', 'L', 2.65, 'TGO 2024', 2024, 'Thailand'),
  ('LPG', '1', 'kg', 3.02, 'TGO 2024', 2024, 'Thailand'),
  ('Natural Gas', '1', 'm3', 1.91, 'TGO 2024', 2024, 'Thailand'),
  
  -- DEFRA 2024 (UK)
  ('Grid Electricity', '2', 'kWh', 0.193, 'DEFRA 2024', 2024, 'UK'),
  ('Gasoline', '1', 'L', 2.17, 'DEFRA 2024', 2024, 'UK'),
  ('Diesel', '1', 'L', 2.52, 'DEFRA 2024', 2024, 'UK'),
  
  -- More sources to be added...
  ('Grid Electricity', '2', 'kWh', 0.385, 'EU Grid Mix', 2024, 'EU'),
  ('Grid Electricity', '2', 'kWh', 0.417, 'US Grid Mix', 2024, 'USA');
```

---

## Factor Selection Logic

### Auto-Select Best Factor

```typescript
async function getBestEmissionFactor(
  fuelType: string,
  unit: string,
  organizationCountry: string
): Promise<EmissionFactor> {
  // Priority:
  // 1. Country-specific, most recent year
  // 2. Regional (e.g., EU), most recent year
  // 3. Global (IPCC), most recent year
  
  const factors = await db.emission_factors.findMany({
    where: {
      fuel_type: fuelType,
      unit: unit
    },
    orderBy: [
      { year: 'desc' },
      // Prioritize by region match
    ]
  });
  
  // Try exact country match first
  const countryMatch = factors.find(f => 
    f.region.toLowerCase() === organizationCountry.toLowerCase()
  );
  if (countryMatch) return countryMatch;
  
  // Try regional match (EU, ASEAN, etc.)
  const regionalMatch = factors.find(f => 
    isInRegion(organizationCountry, f.region)
  );
  if (regionalMatch) return regionalMatch;
  
  // Fallback to global
  const globalMatch = factors.find(f => 
    f.region.toLowerCase() === 'global'
  );
  if (globalMatch) return globalMatch;
  
  throw new Error(`No emission factor found for ${fuelType} (${unit})`);
}

function isInRegion(country: string, region: string): boolean {
  const regionMappings = {
    'EU': ['Germany', 'France', 'Spain', 'Italy', 'Poland', ...],
    'ASEAN': ['Thailand', 'Vietnam', 'Indonesia', 'Malaysia', ...],
    // ...
  };
  
  return regionMappings[region]?.includes(country) || false;
}
```

---

## User-Facing UI

### Factor Display in Source Creation

```tsx
function EmissionSourceForm({ onSave }: { onSave: (source: EmissionSource) => void }) {
  const [fuelType, setFuelType] = useState('');
  const [unit, setUnit] = useState('');
  const [factor, setFactor] = useState<EmissionFactor | null>(null);
  
  useEffect(() => {
    if (fuelType && unit) {
      loadBestFactor(fuelType, unit, organizationCountry)
        .then(setFactor);
    }
  }, [fuelType, unit]);
  
  return (
    <form>
      <FormField label="Fuel Type">
        <select value={fuelType} onChange={(e) => setFuelType(e.target.value)}>
          <option value="">Select...</option>
          <option value="Gasoline">Gasoline</option>
          <option value="Diesel">Diesel</option>
          <option value="Grid Electricity">Electricity</option>
          <option value="LPG">LPG</option>
          <option value="Natural Gas">Natural Gas</option>
        </select>
      </FormField>
      
      <FormField label="Unit">
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="">Select...</option>
          <option value="L">Liters</option>
          <option value="kWh">kWh</option>
          <option value="kg">Kilograms</option>
          <option value="m3">Cubic meters</option>
        </select>
      </FormField>
      
      {factor && (
        <div className="emission-factor-display">
          <label>Emission Factor (auto-selected)</label>
          <div className="factor-card">
            <div className="value">
              {factor.kgco2e_per_unit} kgCO2e per {factor.unit}
            </div>
            <div className="source">
              Source: {factor.source} ({factor.year})
            </div>
            <div className="region">
              Region: {factor.region}
            </div>
            <button 
              type="button"
              onClick={() => openFactorPicker(fuelType, unit)}
            >
              Change Factor
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
```

### Factor Picker Modal (Advanced)

```tsx
function EmissionFactorPicker({ 
  fuelType, 
  unit, 
  onSelect 
}: {
  fuelType: string;
  unit: string;
  onSelect: (factor: EmissionFactor) => void;
}) {
  const [factors, setFactors] = useState<EmissionFactor[]>([]);
  
  useEffect(() => {
    loadAllFactorsForFuel(fuelType, unit).then(setFactors);
  }, [fuelType, unit]);
  
  return (
    <Modal>
      <h3>Select Emission Factor</h3>
      <p>Choose the most appropriate factor for your region:</p>
      
      <div className="factor-list">
        {factors.map(factor => (
          <div 
            key={factor.id}
            className="factor-option"
            onClick={() => onSelect(factor)}
          >
            <div className="factor-value">
              {factor.kgco2e_per_unit} kgCO2e/{factor.unit}
            </div>
            <div className="factor-meta">
              <span className="region">{factor.region}</span>
              <span className="source">{factor.source}</span>
              <span className="year">{factor.year}</span>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
```

---

## Update Process

### Annual Factor Updates

```typescript
// Script to update factors annually
async function updateEmissionFactors() {
  // 1. Fetch latest from TGO API
  const tgoFactors = await fetchTGOFactors();
  
  // 2. Upsert to database
  for (const factor of tgoFactors) {
    await db.emission_factors.upsert({
      where: {
        fuel_type_unit_region_year: {
          fuel_type: factor.fuel_type,
          unit: factor.unit,
          region: 'Thailand',
          year: factor.year
        }
      },
      update: {
        kgco2e_per_unit: factor.value
      },
      create: {
        fuel_type: factor.fuel_type,
        scope: factor.scope,
        unit: factor.unit,
        kgco2e_per_unit: factor.value,
        source: 'TGO',
        year: factor.year,
        region: 'Thailand'
      }
    });
  }
  
  // 3. Notify orgs using old factors
  await notifyOrgsAboutUpdates();
}
```

---

## Testing Data

For development/testing:

```sql
-- Test data with obvious differences
INSERT INTO emission_factors 
  (fuel_type, scope, unit, kgco2e_per_unit, source, year, region)
VALUES
  -- Test: Same fuel, different regions
  ('Test Fuel', '1', 'L', 1.00, 'Test Source', 2024, 'Test Country A'),
  ('Test Fuel', '1', 'L', 2.00, 'Test Source', 2024, 'Test Country B'),
  ('Test Fuel', '1', 'L', 1.50, 'Test Source', 2024, 'Global'),
  
  -- Test: Same fuel, different years
  ('Test Fuel 2', '1', 'kg', 3.00, 'Test Source', 2020, 'Global'),
  ('Test Fuel 2', '1', 'kg', 3.20, 'Test Source', 2024, 'Global');
```

---

## Acceptance Criteria

- [ ] emission_factors table seeded with 50+ factors
- [ ] Includes IPCC, TGO, DEFRA sources
- [ ] Auto-select logic prefers country > region > global
- [ ] Auto-select logic prefers newer year
- [ ] UI displays selected factor with source/year
- [ ] User can manually change factor via picker
- [ ] Factor picker shows all available options
- [ ] Calculations use selected factor value
- [ ] Update script can refresh factors annually

---

## Files to Create

### Seed Data:
- `supabase/seeds/emission_factors.sql`

### Services:
- `services/emissionFactorService.ts`
  - `getBestEmissionFactor()`
  - `loadAllFactorsForFuel()`
  - `updateEmissionFactors()`

### Components:
- `components/carbon/EmissionFactorDisplay.tsx`
- `components/carbon/EmissionFactorPicker.tsx`

---

## Data Sources Documentation

Keep updated list of official sources:

```markdown
# Emission Factor Sources

## IPCC 2021
- URL: https://www.ipcc-nggip.iges.or.jp/
- Update frequency: ~5 years
- Coverage: Global defaults

## TGO (Thailand)
- URL: http://tgo.or.th
- Update frequency: Annual
- Coverage: Thailand-specific factors

## DEFRA (UK)
- URL: https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2024
- Update frequency: Annual
- Coverage: UK + international transport

## EPA (USA)
- URL: https://www.epa.gov/ghgemissions
- Update frequency: Annual
- Coverage: USA grid factors
```

---

## Future Enhancements (Not in Phase 2)

- API to fetch live updates from TGO/DEFRA
- User can add custom factors (for Scope 3)
- Factor version history (audit trail)
- Notification when factor updated mid-year
- Bulk factor import from Excel

---

## Related Issues

- Depends on: #3 (emission_factors table schema)
- Used by: #11 (Wizard calculations)
- Used by: #12 (Dashboard calculations)
