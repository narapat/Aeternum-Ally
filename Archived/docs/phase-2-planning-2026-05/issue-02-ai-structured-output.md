# AI Structured Output: Update Prompts to Return JSON Arrays

**Type:** Enhancement  
**Priority:** P0 (Critical - Blocker)  
**Labels:** `phase-2`, `ai`, `backend`, `p0`  
**Milestone:** Phase 2 — Foundation  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #1 (BMC/SWOT Migration)

---

## Problem

ปัจจุบัน AI returns plain text with bullets:
```
"• Item 1\n• Item 2\n• Item 3"
```

ทำให้:
- Frontend ต้อง parse text เอง (error-prone)
- ไม่สามารถ validate structure ได้
- Item-level traceability ทำไม่ได้

---

## Solution

Update AI prompts ให้ return **pure JSON arrays**:

```json
["Item 1", "Item 2", "Item 3"]
```

**ข้อดี:**
- Type-safe parsing
- Easy validation
- Item-level operations (edit, delete, link)
- Better error handling

---

## Technical Details

### Actions to Update

All AI actions that generate lists:

1. **generateCanvasSuggestion** (BMC items)
2. **generateSwotSuggestion** (SWOT items)
3. **generateAssessmentSuggestions** (IRO descriptions)
4. **generateKPISuggestions** (KPI list)

---

## Example: Before vs After

### Before (v1)

**Prompt:**
```
Generate key activities for a metal parts manufacturer.
Return as bullet points.
```

**Response:**
```
• ผลิตชิ้นส่วนโลหะตามแบบ
• ตรวจสอบคุณภาพด้วย CMM
• ขนส่งไปยัง OEM
```

**Frontend parsing:**
```typescript
const items = response.split('\n')
  .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
  .filter(Boolean);
```

---

### After (Phase 2)

**Prompt:**
```
Generate key activities for a metal parts manufacturer.

CRITICAL: Return ONLY a valid JSON array of strings. 
No markdown, no backticks, no explanation.

Example format:
["Activity 1", "Activity 2", "Activity 3"]
```

**Response:**
```json
["ผลิตชิ้นส่วนโลหะตามแบบ", "ตรวจสอบคุณภาพด้วย CMM", "ขนส่งไปยัง OEM"]
```

**Frontend parsing:**
```typescript
const items = JSON.parse(response); // type-safe!
```

---

## Prompt Template

```typescript
const STRUCTURED_OUTPUT_INSTRUCTION = `
CRITICAL INSTRUCTION:
- Return ONLY a valid JSON array of strings
- No markdown code fences (\`\`\`json)
- No preamble or explanation
- No trailing text
- Each item should be concise (max 100 chars)
- Return empty array [] if no suggestions

Example valid format:
["Item 1", "Item 2", "Item 3"]
`;
```

---

## Implementation

### File: `netlify/functions/api.ts`

```typescript
// Update generateCanvasSuggestion
case 'generateCanvasSuggestion': {
  const { block, context } = body;
  
  const prompt = `
You are an ESRS sustainability expert helping SMEs build their Sustainable Business Model Canvas.

Company context:
${JSON.stringify(context, null, 2)}

Generate 3-5 ${block} items.

${STRUCTURED_OUTPUT_INSTRUCTION}
`;

  const result = await callGemini(prompt);
  
  // Validate JSON
  let items;
  try {
    items = JSON.parse(result);
    if (!Array.isArray(items)) {
      throw new Error('Response is not an array');
    }
  } catch (err) {
    // Fallback: try to extract JSON from markdown
    const match = result.match(/\[.*\]/s);
    if (match) {
      items = JSON.parse(match[0]);
    } else {
      throw new Error('Invalid JSON response from AI');
    }
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({ items })
  };
}
```

---

## Validation Rules

```typescript
function validateAIArrayResponse(response: string, maxLength = 100): string[] {
  // Parse JSON
  const items = JSON.parse(response);
  
  // Must be array
  if (!Array.isArray(items)) {
    throw new Error('AI response must be JSON array');
  }
  
  // Must contain strings
  if (!items.every(item => typeof item === 'string')) {
    throw new Error('All items must be strings');
  }
  
  // Max length per item
  const tooLong = items.filter(item => item.length > maxLength);
  if (tooLong.length > 0) {
    console.warn('Some items exceed max length:', tooLong);
  }
  
  return items.map(item => item.substring(0, maxLength));
}
```

---

## Acceptance Criteria

- [ ] All AI actions return pure JSON arrays
- [ ] Prompts include STRUCTURED_OUTPUT_INSTRUCTION
- [ ] Response validation with try/catch
- [ ] Fallback parser for markdown-wrapped JSON
- [ ] Frontend receives typed arrays (no parsing needed)
- [ ] Error handling logs malformed responses

---

## Files to Modify

### Backend:
- `netlify/functions/api.ts`
  - Update all `case` blocks that return lists
  - Add JSON validation
  - Add fallback parser

### Types:
- `types/ai.ts` (create if not exists)
  ```typescript
  export interface AIArrayResponse {
    items: string[];
  }
  ```

### Utilities:
- `utils/aiHelpers.ts` (create)
  ```typescript
  export const STRUCTURED_OUTPUT_INSTRUCTION = "...";
  export function validateAIArrayResponse(response: string): string[];
  export function parseAIResponse(response: string): string[];
  ```

---

## Testing Checklist

- [ ] Test each AI action with real prompts
- [ ] Verify JSON parsing works
- [ ] Test fallback for markdown-wrapped JSON
- [ ] Test error handling for malformed responses
- [ ] Verify empty array [] case
- [ ] Load test: 100 requests with varied prompts

---

## Example Test Cases

```typescript
describe('AI Structured Output', () => {
  it('should parse valid JSON array', () => {
    const response = '["Item 1", "Item 2"]';
    const items = parseAIResponse(response);
    expect(items).toEqual(["Item 1", "Item 2"]);
  });
  
  it('should handle markdown-wrapped JSON', () => {
    const response = '```json\n["Item 1"]\n```';
    const items = parseAIResponse(response);
    expect(items).toEqual(["Item 1"]);
  });
  
  it('should throw on invalid JSON', () => {
    const response = 'Not a JSON array';
    expect(() => parseAIResponse(response)).toThrow();
  });
  
  it('should truncate long items', () => {
    const longItem = 'x'.repeat(150);
    const response = JSON.stringify([longItem]);
    const items = validateAIArrayResponse(response, 100);
    expect(items[0].length).toBe(100);
  });
});
```

---

## Rollback Plan

If AI consistently returns malformed responses:
1. Revert prompts to v1 (bullet text)
2. Keep frontend parser for backward compatibility
3. Re-evaluate prompt engineering strategy

---

## Related Issues

- Depends on: #1 (BMC/SWOT Migration must complete first)
- Blocks: #4 (AI-Guided Scoring)
- Blocks: #5 (DMA Insight Hub Backend)
