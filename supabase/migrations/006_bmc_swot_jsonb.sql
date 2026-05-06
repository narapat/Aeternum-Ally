-- Migration 006: Convert BMC and SWOT text fields to jsonb arrays
-- Issue: #01 — Migration: BMC and SWOT Fields to JSONB Arrays
--
-- Rollback plan (run if needed):
--   ALTER TABLE business_model_canvases
--     ALTER COLUMN key_partners TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(key_partners)), E'\n'),
--     ALTER COLUMN key_activities TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(key_activities)), E'\n'),
--     ALTER COLUMN key_resources TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(key_resources)), E'\n'),
--     ALTER COLUMN value_proposition TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(value_proposition)), E'\n'),
--     ALTER COLUMN customer_relationships TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(customer_relationships)), E'\n'),
--     ALTER COLUMN channels TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(channels)), E'\n'),
--     ALTER COLUMN customer_segments TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(customer_segments)), E'\n'),
--     ALTER COLUMN cost_structure TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(cost_structure)), E'\n'),
--     ALTER COLUMN revenue_streams TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(revenue_streams)), E'\n'),
--     ALTER COLUMN eco_social_costs TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(eco_social_costs)), E'\n'),
--     ALTER COLUMN eco_social_benefits TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(eco_social_benefits)), E'\n');
--   ALTER TABLE swot_analyses
--     ALTER COLUMN strengths TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(strengths)), E'\n'),
--     ALTER COLUMN weaknesses TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(weaknesses)), E'\n'),
--     ALTER COLUMN opportunities TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(opportunities)), E'\n'),
--     ALTER COLUMN threats TYPE text USING array_to_string(ARRAY(SELECT jsonb_array_elements_text(threats)), E'\n');
--   DROP FUNCTION IF EXISTS parse_bullet_to_jsonb(text);

-- Step 1: Parser function — converts bullet-list text to jsonb string array
CREATE OR REPLACE FUNCTION parse_bullet_to_jsonb(input_text text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  lines text[];
  cleaned text[];
  line text;
BEGIN
  IF input_text IS NULL OR trim(input_text) = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  lines := string_to_array(input_text, E'\n');

  FOREACH line IN ARRAY lines
  LOOP
    -- Strip leading bullets (•, -, *, –), whitespace
    line := regexp_replace(line, '^[\s•\-\*–]+', '', 'g');
    line := trim(line);
    -- Skip separator lines (e.g. "--- AI Suggestion ---") and blanks
    IF line != '' AND line NOT LIKE '---%' THEN
      cleaned := array_append(cleaned, line);
    END IF;
  END LOOP;

  IF cleaned IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN to_jsonb(cleaned);
END;
$$;

-- Step 2: Drop existing text defaults, migrate columns text → jsonb, set new defaults
ALTER TABLE business_model_canvases
  ALTER COLUMN key_partners           DROP DEFAULT,
  ALTER COLUMN key_activities         DROP DEFAULT,
  ALTER COLUMN key_resources          DROP DEFAULT,
  ALTER COLUMN value_proposition      DROP DEFAULT,
  ALTER COLUMN customer_relationships DROP DEFAULT,
  ALTER COLUMN channels               DROP DEFAULT,
  ALTER COLUMN customer_segments      DROP DEFAULT,
  ALTER COLUMN cost_structure         DROP DEFAULT,
  ALTER COLUMN revenue_streams        DROP DEFAULT,
  ALTER COLUMN eco_social_costs       DROP DEFAULT,
  ALTER COLUMN eco_social_benefits    DROP DEFAULT;

ALTER TABLE business_model_canvases
  ALTER COLUMN key_partners           TYPE jsonb USING parse_bullet_to_jsonb(key_partners),
  ALTER COLUMN key_activities         TYPE jsonb USING parse_bullet_to_jsonb(key_activities),
  ALTER COLUMN key_resources          TYPE jsonb USING parse_bullet_to_jsonb(key_resources),
  ALTER COLUMN value_proposition      TYPE jsonb USING parse_bullet_to_jsonb(value_proposition),
  ALTER COLUMN customer_relationships TYPE jsonb USING parse_bullet_to_jsonb(customer_relationships),
  ALTER COLUMN channels               TYPE jsonb USING parse_bullet_to_jsonb(channels),
  ALTER COLUMN customer_segments      TYPE jsonb USING parse_bullet_to_jsonb(customer_segments),
  ALTER COLUMN cost_structure         TYPE jsonb USING parse_bullet_to_jsonb(cost_structure),
  ALTER COLUMN revenue_streams        TYPE jsonb USING parse_bullet_to_jsonb(revenue_streams),
  ALTER COLUMN eco_social_costs       TYPE jsonb USING parse_bullet_to_jsonb(eco_social_costs),
  ALTER COLUMN eco_social_benefits    TYPE jsonb USING parse_bullet_to_jsonb(eco_social_benefits);

ALTER TABLE business_model_canvases
  ALTER COLUMN key_partners           SET DEFAULT '[]'::jsonb,
  ALTER COLUMN key_activities         SET DEFAULT '[]'::jsonb,
  ALTER COLUMN key_resources          SET DEFAULT '[]'::jsonb,
  ALTER COLUMN value_proposition      SET DEFAULT '[]'::jsonb,
  ALTER COLUMN customer_relationships SET DEFAULT '[]'::jsonb,
  ALTER COLUMN channels               SET DEFAULT '[]'::jsonb,
  ALTER COLUMN customer_segments      SET DEFAULT '[]'::jsonb,
  ALTER COLUMN cost_structure         SET DEFAULT '[]'::jsonb,
  ALTER COLUMN revenue_streams        SET DEFAULT '[]'::jsonb,
  ALTER COLUMN eco_social_costs       SET DEFAULT '[]'::jsonb,
  ALTER COLUMN eco_social_benefits    SET DEFAULT '[]'::jsonb;

-- Step 3: Drop existing text defaults, migrate swot_analyses columns text → jsonb, set new defaults
ALTER TABLE swot_analyses
  ALTER COLUMN strengths     DROP DEFAULT,
  ALTER COLUMN weaknesses    DROP DEFAULT,
  ALTER COLUMN opportunities DROP DEFAULT,
  ALTER COLUMN threats       DROP DEFAULT;

ALTER TABLE swot_analyses
  ALTER COLUMN strengths     TYPE jsonb USING parse_bullet_to_jsonb(strengths),
  ALTER COLUMN weaknesses    TYPE jsonb USING parse_bullet_to_jsonb(weaknesses),
  ALTER COLUMN opportunities TYPE jsonb USING parse_bullet_to_jsonb(opportunities),
  ALTER COLUMN threats       TYPE jsonb USING parse_bullet_to_jsonb(threats);

ALTER TABLE swot_analyses
  ALTER COLUMN strengths     SET DEFAULT '[]'::jsonb,
  ALTER COLUMN weaknesses    SET DEFAULT '[]'::jsonb,
  ALTER COLUMN opportunities SET DEFAULT '[]'::jsonb,
  ALTER COLUMN threats       SET DEFAULT '[]'::jsonb;
