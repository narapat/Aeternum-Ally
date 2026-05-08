-- =============================================================================
-- Emission Factors Reference Seed Data
-- Sources: IPCC 2021, TGO 2024, DEFRA 2024, EU Grid Mix 2024, EPA 2024
--
-- Apply once to production. Safe to re-run (INSERT ... ON CONFLICT DO NOTHING).
-- =============================================================================

INSERT INTO emission_factors (fuel_type, scope, unit, kgco2e_per_unit, source, year, region)
VALUES

  -- ─────────────────────────────────────────────────────────────────────────
  -- IPCC 2021 — Global Defaults  (Scope 1 combustion)
  -- Source: IPCC 2006 GL, 2019 Refinement & AR6 WG3 Annex II
  -- ─────────────────────────────────────────────────────────────────────────
  ('Gasoline',              '1', 'L',   2.31,  'IPCC 2021', 2021, 'Global'),
  ('Diesel',                '1', 'L',   2.68,  'IPCC 2021', 2021, 'Global'),
  ('LPG',                   '1', 'kg',  3.00,  'IPCC 2021', 2021, 'Global'),
  ('Natural Gas',           '1', 'm3',  1.88,  'IPCC 2021', 2021, 'Global'),
  ('Fuel Oil',              '1', 'L',   2.96,  'IPCC 2021', 2021, 'Global'),
  ('Coal (Bituminous)',     '1', 'kg',  2.42,  'IPCC 2021', 2021, 'Global'),
  ('Coal (Sub-bituminous)', '1', 'kg',  1.97,  'IPCC 2021', 2021, 'Global'),
  ('Lignite',               '1', 'kg',  1.55,  'IPCC 2021', 2021, 'Global'),
  ('Kerosene',              '1', 'L',   2.54,  'IPCC 2021', 2021, 'Global'),
  ('Aviation Fuel (Jet A)', '1', 'L',   2.55,  'IPCC 2021', 2021, 'Global'),
  ('Biomass Wood',          '1', 'kg',  0.00,  'IPCC 2021', 2021, 'Global'),   -- biogenic neutral
  ('Ethanol (E100)',        '1', 'L',   0.00,  'IPCC 2021', 2021, 'Global'),   -- biogenic neutral

  -- Scope 2 — Grid electricity (global average, IEA 2021)
  ('Grid Electricity',      '2', 'kWh', 0.475, 'IEA 2021',  2021, 'Global'),

  -- Scope 3 — common upstream transport
  ('Road Transport (Diesel HGV)', '3', 'tonne.km', 0.163, 'IPCC 2021', 2021, 'Global'),
  ('Air Freight',                  '3', 'tonne.km', 0.602, 'IPCC 2021', 2021, 'Global'),
  ('Sea Freight (Container)',      '3', 'tonne.km', 0.016, 'IPCC 2021', 2021, 'Global'),
  ('Rail Freight',                 '3', 'tonne.km', 0.028, 'IPCC 2021', 2021, 'Global'),

  -- ─────────────────────────────────────────────────────────────────────────
  -- TGO 2024 — Thailand Greenhouse Gas Organisation
  -- Source: Thailand National GHG Inventory 2024 (https://tgo.or.th)
  -- ─────────────────────────────────────────────────────────────────────────
  ('Grid Electricity',     '2', 'kWh', 0.5213, 'TGO 2024',  2024, 'Thailand'),
  ('Gasoline',             '1', 'L',   2.34,   'TGO 2024',  2024, 'Thailand'),
  ('Diesel B7',            '1', 'L',   2.65,   'TGO 2024',  2024, 'Thailand'),
  ('Diesel B10',           '1', 'L',   2.61,   'TGO 2024',  2024, 'Thailand'),
  ('LPG',                  '1', 'kg',  3.02,   'TGO 2024',  2024, 'Thailand'),
  ('Natural Gas (CNG)',    '1', 'm3',  1.91,   'TGO 2024',  2024, 'Thailand'),
  ('Fuel Oil',             '1', 'L',   3.01,   'TGO 2024',  2024, 'Thailand'),
  ('Coal',                 '1', 'kg',  2.44,   'TGO 2024',  2024, 'Thailand'),
  ('Kerosene',             '1', 'L',   2.57,   'TGO 2024',  2024, 'Thailand'),
  ('E20 Ethanol Blend',    '1', 'L',   1.88,   'TGO 2024',  2024, 'Thailand'),
  ('E85 Ethanol Blend',    '1', 'L',   0.37,   'TGO 2024',  2024, 'Thailand'),

  -- ─────────────────────────────────────────────────────────────────────────
  -- DEFRA 2024 — UK Department for Environment Food & Rural Affairs
  -- Source: https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2024
  -- ─────────────────────────────────────────────────────────────────────────
  ('Grid Electricity',             '2', 'kWh', 0.193,  'DEFRA 2024', 2024, 'UK'),
  ('Gasoline',                     '1', 'L',   2.169,  'DEFRA 2024', 2024, 'UK'),
  ('Diesel',                       '1', 'L',   2.519,  'DEFRA 2024', 2024, 'UK'),
  ('LPG',                          '1', 'kg',  2.944,  'DEFRA 2024', 2024, 'UK'),
  ('Natural Gas',                  '1', 'm3',  2.040,  'DEFRA 2024', 2024, 'UK'),
  ('Fuel Oil (Heavy)',             '1', 'L',   3.179,  'DEFRA 2024', 2024, 'UK'),
  ('Coal (Industrial)',            '1', 'kg',  2.353,  'DEFRA 2024', 2024, 'UK'),
  ('Kerosene',                     '1', 'L',   2.544,  'DEFRA 2024', 2024, 'UK'),
  ('Aviation Fuel (Jet A)',        '1', 'L',   2.520,  'DEFRA 2024', 2024, 'UK'),
  ('Road Transport (Petrol Car)',  '3', 'km',  0.166,  'DEFRA 2024', 2024, 'UK'),
  ('Road Transport (Diesel Car)',  '3', 'km',  0.162,  'DEFRA 2024', 2024, 'UK'),
  ('Road Transport (EV)',          '3', 'km',  0.053,  'DEFRA 2024', 2024, 'UK'),

  -- ─────────────────────────────────────────────────────────────────────────
  -- EU Grid Mix 2024 — European Environment Agency
  -- Source: EEA Greenhouse Gas Data Viewer 2024
  -- ─────────────────────────────────────────────────────────────────────────
  ('Grid Electricity', '2', 'kWh', 0.276, 'EEA 2024', 2024, 'EU'),

  -- Country-specific EU electricity (selected markets)
  ('Grid Electricity', '2', 'kWh', 0.364, 'EEA 2024', 2024, 'Germany'),
  ('Grid Electricity', '2', 'kWh', 0.052, 'EEA 2024', 2024, 'France'),
  ('Grid Electricity', '2', 'kWh', 0.196, 'EEA 2024', 2024, 'Spain'),
  ('Grid Electricity', '2', 'kWh', 0.226, 'EEA 2024', 2024, 'Italy'),

  -- ─────────────────────────────────────────────────────────────────────────
  -- US EPA 2024 — eGRID & Mobile Combustion Factors
  -- Source: EPA Emission Factors for Greenhouse Gas Inventories (2024)
  -- ─────────────────────────────────────────────────────────────────────────
  ('Grid Electricity', '2', 'kWh', 0.386, 'EPA 2024', 2024, 'USA'),
  ('Gasoline',         '1', 'L',   2.346, 'EPA 2024', 2024, 'USA'),
  ('Diesel',           '1', 'L',   2.703, 'EPA 2024', 2024, 'USA'),
  ('Natural Gas',      '1', 'm3',  1.931, 'EPA 2024', 2024, 'USA'),
  ('LPG',              '1', 'kg',  2.982, 'EPA 2024', 2024, 'USA'),
  ('Coal',             '1', 'kg',  2.303, 'EPA 2024', 2024, 'USA'),

  -- ─────────────────────────────────────────────────────────────────────────
  -- Southeast Asia Regional (ASEAN) — IEA 2024
  -- ─────────────────────────────────────────────────────────────────────────
  ('Grid Electricity', '2', 'kWh', 0.621, 'IEA 2024', 2024, 'Vietnam'),
  ('Grid Electricity', '2', 'kWh', 0.760, 'IEA 2024', 2024, 'Indonesia'),
  ('Grid Electricity', '2', 'kWh', 0.585, 'IEA 2024', 2024, 'Malaysia'),
  ('Grid Electricity', '2', 'kWh', 0.500, 'IEA 2024', 2024, 'Philippines'),
  ('Grid Electricity', '2', 'kWh', 0.530, 'IEA 2024', 2024, 'Singapore'),

  -- ─────────────────────────────────────────────────────────────────────────
  -- Refrigerants (Scope 1 — fugitive emissions)
  -- Source: IPCC AR6 Table 7.SM.7
  -- ─────────────────────────────────────────────────────────────────────────
  ('R-410A (Refrigerant)', '1', 'kg', 2088, 'IPCC AR6', 2021, 'Global'),
  ('R-22 (Refrigerant)',   '1', 'kg', 1810, 'IPCC AR6', 2021, 'Global'),
  ('R-134a (Refrigerant)', '1', 'kg', 1430, 'IPCC AR6', 2021, 'Global'),
  ('R-32 (Refrigerant)',   '1', 'kg',  675, 'IPCC AR6', 2021, 'Global'),

  -- ─────────────────────────────────────────────────────────────────────────
  -- Waste (Scope 3 — downstream processing)
  -- Source: IPCC 2006 GL Vol. 5
  -- ─────────────────────────────────────────────────────────────────────────
  ('Landfill Waste',      '3', 'tonne', 467, 'IPCC 2021', 2021, 'Global'),
  ('Wastewater Treatment','3', 'm3',    0.44,'IPCC 2021', 2021, 'Global'),
  ('Composting',          '3', 'tonne',  8.0,'IPCC 2021', 2021, 'Global')

ON CONFLICT DO NOTHING;
