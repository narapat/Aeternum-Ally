-- Migration: Add identification_number and asset_number to emission_sources
-- Description: Enhances emission sources to support asset mapping and specific identification (e.g. car registration, generator S/N).

ALTER TABLE emission_sources ADD COLUMN IF NOT EXISTS identification_number TEXT;
ALTER TABLE emission_sources ADD COLUMN IF NOT EXISTS asset_number TEXT;
