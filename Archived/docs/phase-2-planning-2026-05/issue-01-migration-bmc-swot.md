# Migration: BMC and SWOT Fields to JSONB Arrays

**Type:** Enhancement  
**Priority:** P0 (Critical - Blocker)  
**Labels:** `phase-2`, `database`, `migration`, `p0`  
**Milestone:** Phase 2 — Foundation  
**Epic:** #[EPIC_NUMBER]

---

## Problem

ปัจจุบัน BMC (11 fields) และ SWOT (4 fields) เก็บเป็น `text` (bullet list)
- AI ต้อง parse text → ไม่แม่น
- ไม่มี traceability (link item → assessment → task)
- ไม่สามารถ iterate ทีละ item ได้

---

## Solution

Migrate เป็น `jsonb` arrays:
```sql
-- Before (text)
key_activities: "• ผลิตชิ้นส่วน\n• ขนส่ง\n• ซ่อมบำรุง"

-- After (jsonb)
key_activities: ["ผลิตชิ้นส่วนโลหะ", "ขนส่งไปยัง OEM", "ซ่อมบำรุงเครื่องจักร"]
```

---

## Technical Details

### Tables to Migrate

**business_model_canvases:**
- `key_partners`
- `key_activities`
- `key_resources`
- `value_proposition`
- `customer_relationships`
- `channels`
- `customer_segments`
- `cost_structure`
- `revenue_streams`
- `eco_social_costs`
- `eco_social_benefits`

**swot_analyses:**
- `strengths`
- `weaknesses`
- `opportunities`
- `threats`

---

## Migration Strategy

### Step 1: Create Parser Function

```sql
CREATE OR REPLACE FUNCTION parse_bullet_to_jsonb(input_text text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  lines text[];
  cleaned_lines text[];
  line text;
BEGIN
  IF input_text IS NULL OR input_text = '' THEN
    RETURN '[]'::jsonb;
  END IF;
  
  -- Split by newline
  lines := string_to_array(input_text, E'\n');
  
  -- Clean each line (remove bullets, trim)
  FOREACH line IN ARRAY lines
  LOOP
    line := regexp_replace(line, '^[\s•\-\*]+', '', 'g');
    line := trim(line);
    IF line != '' THEN
      cleaned_lines := array_append(cleaned_lines, line);
    END IF;
  END LOOP;
  
  RETURN to_jsonb(cleaned_lines);
END;
$$;
```

### Step 2: Test on Staging

```sql
-- Test sample data
SELECT 
  id,
  key_activities as original,
  parse_bullet_to_jsonb(key_activities) as parsed
FROM business_model_canvases
LIMIT 5;
```

### Step 3: Apply Migration

```sql
-- business_model_canvases
ALTER TABLE business_model_canvases
  ALTER COLUMN key_partners TYPE jsonb 
    USING parse_bullet_to_jsonb(key_partners),
  ALTER COLUMN key_activities TYPE jsonb
    USING parse_bullet_to_jsonb(key_activities),
  ALTER COLUMN key_resources TYPE jsonb
    USING parse_bullet_to_jsonb(key_resources),
  ALTER COLUMN value_proposition TYPE jsonb
    USING parse_bullet_to_jsonb(value_proposition),
  ALTER COLUMN customer_relationships TYPE jsonb
    USING parse_bullet_to_jsonb(customer_relationships),
  ALTER COLUMN channels TYPE jsonb
    USING parse_bullet_to_jsonb(channels),
  ALTER COLUMN customer_segments TYPE jsonb
    USING parse_bullet_to_jsonb(customer_segments),
  ALTER COLUMN cost_structure TYPE jsonb
    USING parse_bullet_to_jsonb(cost_structure),
  ALTER COLUMN revenue_streams TYPE jsonb
    USING parse_bullet_to_jsonb(revenue_streams),
  ALTER COLUMN eco_social_costs TYPE jsonb
    USING parse_bullet_to_jsonb(eco_social_costs),
  ALTER COLUMN eco_social_benefits TYPE jsonb
    USING parse_bullet_to_jsonb(eco_social_benefits);

-- swot_analyses
ALTER TABLE swot_analyses
  ALTER COLUMN strengths TYPE jsonb
    USING parse_bullet_to_jsonb(strengths),
  ALTER COLUMN weaknesses TYPE jsonb
    USING parse_bullet_to_jsonb(weaknesses),
  ALTER COLUMN opportunities TYPE jsonb
    USING parse_bullet_to_jsonb(opportunities),
  ALTER COLUMN threats TYPE jsonb
    USING parse_bullet_to_jsonb(threats);
```

---

## Acceptance Criteria

- [ ] Parser function created and tested
- [ ] Migration tested on staging with sample data
- [ ] No data loss after migration (verify row counts)
- [ ] Frontend can read both old format (during transition) and new format
- [ ] AI prompts updated to return JSON arrays
- [ ] Migration applied to: staging → demo → production

---

## Files to Modify

### Database:
- `supabase/migrations/00X_bmc_swot_to_jsonb.sql`

### Backend:
- `services/dbService.ts` — update mappers (fromDb/toDb)
- `netlify/functions/api.ts` — update AI response handling

### Frontend:
- `components/BusinessModelCanvas.tsx` — render items
- `components/SwotAnalysis.tsx` — render items

---

## Testing Checklist

- [ ] Run migration on local dev
- [ ] Verify existing data still renders
- [ ] Create new BMC/SWOT via AI suggest
- [ ] Manually add/edit/delete items
- [ ] Verify items link correctly to assessments

---

## Rollback Plan

```sql
-- If migration fails, rollback:
ALTER TABLE business_model_canvases
  ALTER COLUMN key_partners TYPE text
    USING array_to_string(
      ARRAY(SELECT jsonb_array_elements_text(key_partners)), 
      E'\n• '
    );
-- (repeat for all columns)
```

---

## Related Issues

- Blocks: #2 (AI Structured Output)
- Blocks: #4 (AI-Guided Scoring)
- Blocks: #7 (Task Generator)
