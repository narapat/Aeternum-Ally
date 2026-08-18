# DMA Insight Hub — Backend API Implementation

**Type:** Enhancement  
**Priority:** P1 (High)  
**Labels:** `phase-2`, `ai`, `backend`, `p1`  
**Milestone:** Phase 2 — DMA Enhancements  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #4 (AI-Guided Scoring)

---

## Problem

After completing DMA, users don't get quality feedback or actionable guidance:
- No validation of assessment completeness
- No strategic analysis of results
- User must manually figure out next steps

---

## Solution

Post-DMA analysis API that returns:
1. **Quality Check** — Traffic light flags per topic (🔴 needs fix / 🟡 review / 🟢 ok)
2. **Strategic Insight** — Executive summary in plain language
3. **Recommended Actions** — Prioritized action list with ESRS references

---

## API Specification

### New Action: `analyzeDMAQuality`

**Endpoint:** `POST /.netlify/functions/api`

**Request:**
```json
{
  "action": "analyzeDMAQuality",
  "assessments": [
    {
      "id": "uuid-e1",
      "topic": "E1",
      "topicTitle": "Climate Change",
      "is_material": true,
      "impact_score": 16,
      "financial_score": 16,
      "impact_description": "Manufacturing emissions...",
      "financial_description": "Regulatory fines...",
      "impact_scale": 4,
      "impact_scope": 3,
      "impact_irremediability": 3,
      "impact_likelihood": 4,
      "financial_magnitude": 4,
      "financial_likelihood": 4
    }
    // ... all 10 topics
  ],
  "bmcItems": {
    "key_activities": [...],
    "eco_social_costs": [...]
  },
  "swotItems": {
    "threats": [...],
    "opportunities": [...]
  }
}
```

**Response:**
```json
{
  "qualityChecks": [
    {
      "topic": "E1",
      "topicTitle": "Climate Change",
      "status": "needs_fix",
      "issues": [
        {
          "severity": "high",
          "title": "Missing transition risk coverage",
          "description": "ESRS E1-6 requires disclosure of transition risks. Your assessment mentions regulatory fines but doesn't cover technology shifts, market changes, or policy risks.",
          "esrs_ref": "ESRS E1-6",
          "fix_suggestion": "Add analysis of: renewable energy transition costs, carbon pricing impacts, green tech investment needs"
        }
      ]
    },
    {
      "topic": "S1",
      "topicTitle": "Own Workforce",
      "status": "review",
      "issues": [
        {
          "severity": "medium",
          "title": "Score seems low for manufacturing",
          "description": "Impact score of 8 is below typical for manufacturing with 85 employees. Consider OHS risks from machinery and chemical exposure.",
          "esrs_ref": "ESRS S1",
          "fix_suggestion": "Review 'likelihood' score - continuous exposure to workplace hazards suggests score should be 4-5"
        }
      ]
    },
    {
      "topic": "E2",
      "topicTitle": "Pollution",
      "status": "ok",
      "issues": []
    }
  ],
  "strategicInsight": {
    "summary": "Your business faces HIGH climate and workforce risks that require immediate attention. Climate change is your most material sustainability issue due to manufacturing emissions and upcoming regulations.",
    "keyRisks": [
      "Climate regulation enforcement (E1): Potential fines 2% revenue + ฿2-3M capex for emissions control",
      "Workplace safety (S1): Continuous exposure to machinery and chemical hazards",
      "Supply chain disruption (E1): Transport-heavy operations vulnerable to fuel price volatility"
    ],
    "opportunities": [
      "Energy efficiency upgrades could cut costs 15-20% within 2 years",
      "Green manufacturing positioning for OEM customers",
      "Employee retention through better OHS programs"
    ],
    "bottomLine": "Focus on E1 (Climate) and S1 (Workforce) as your top priorities. Address regulatory compliance first, then pursue strategic opportunities."
  },
  "recommendedActions": [
    {
      "id": "action-1",
      "type": "fix",
      "priority": "high",
      "title": "Complete E1 transition risk analysis",
      "description": "Add coverage of technology shifts, carbon pricing, and green tech investment to meet ESRS E1-6 disclosure requirements",
      "esrs_ref": "ESRS E1-6",
      "source_type": "dma",
      "source_id": "uuid-e1",
      "estimated_time": "2 hours"
    },
    {
      "id": "action-2",
      "type": "comply",
      "priority": "high",
      "title": "Prepare GHG inventory (Scope 1+2)",
      "description": "E1 is material - ESRS requires baseline carbon footprint. Set up monthly tracking.",
      "esrs_ref": "ESRS E1-4",
      "source_type": "dma",
      "source_id": "uuid-e1",
      "estimated_time": "4-6 hours initial, 30 min/month ongoing"
    },
    {
      "id": "action-3",
      "type": "improve",
      "priority": "medium",
      "title": "Set 2030 carbon reduction target",
      "description": "Strategic opportunity: 15-20% energy savings potential identified in SWOT. Set science-based target.",
      "esrs_ref": "ESRS E1-5",
      "source_type": "swot",
      "source_id": null,
      "estimated_time": "3 hours"
    }
  ]
}
```

---

## Prompt Engineering

### System Prompt

```
You are an ESRS compliance auditor reviewing a company's Double Materiality Assessment.

Your role:
1. Check assessment quality against ESRS minimum disclosure requirements
2. Flag issues with specific ESRS references
3. Provide strategic insight in CEO-friendly language (no jargon)
4. Generate concrete, actionable recommendations

Context provided:
- All 10 ESRS topic assessments
- Company's Business Model Canvas
- SWOT analysis
- Industry sector

Output format: JSON (see structure below)

Quality check rules:
- RED FLAG (needs_fix): Missing required ESRS disclosures, major inconsistencies
- YELLOW FLAG (review): Score suspiciously low/high vs industry benchmark, minor gaps
- GREEN (ok): Complete and reasonable

Strategic insight rules:
- Use plain language (avoid "stakeholder", "materiality", "IRO")
- Focus on business impact (revenue, costs, risks, opportunities)
- Prioritize by urgency and magnitude
- Bottom line: 1-2 sentence action priority

Recommended actions:
- Type "fix": Address quality issues flagged above
- Type "comply": ESRS required actions for material topics
- Type "improve": Strategic opportunities from SWOT
- Include time estimates
- Link back to source (assessment ID, SWOT, etc.)
```

### Validation Logic

Backend validates AI response before sending to frontend:

```typescript
interface QualityCheck {
  topic: string;
  topicTitle: string;
  status: 'needs_fix' | 'review' | 'ok';
  issues: Array<{
    severity: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    esrs_ref: string;
    fix_suggestion?: string;
  }>;
}

interface StrategicInsight {
  summary: string;
  keyRisks: string[];
  opportunities: string[];
  bottomLine: string;
}

interface RecommendedAction {
  id: string;
  type: 'fix' | 'comply' | 'improve';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  esrs_ref?: string;
  source_type: 'dma' | 'swot' | 'bmc' | 'insight_hub';
  source_id?: string;
  estimated_time?: string;
}

interface InsightHubResponse {
  qualityChecks: QualityCheck[];
  strategicInsight: StrategicInsight;
  recommendedActions: RecommendedAction[];
}

function validateInsightHubResponse(data: any): InsightHubResponse {
  // Validate structure
  if (!data.qualityChecks || !Array.isArray(data.qualityChecks)) {
    throw new Error('qualityChecks must be an array');
  }
  
  if (!data.strategicInsight || typeof data.strategicInsight !== 'object') {
    throw new Error('strategicInsight required');
  }
  
  if (!data.recommendedActions || !Array.isArray(data.recommendedActions)) {
    throw new Error('recommendedActions must be an array');
  }
  
  // Validate quality checks
  data.qualityChecks.forEach((check: any) => {
    if (!['needs_fix', 'review', 'ok'].includes(check.status)) {
      throw new Error(`Invalid status: ${check.status}`);
    }
  });
  
  // Validate actions
  data.recommendedActions.forEach((action: any) => {
    if (!['fix', 'comply', 'improve'].includes(action.type)) {
      throw new Error(`Invalid action type: ${action.type}`);
    }
    if (!['high', 'medium', 'low'].includes(action.priority)) {
      throw new Error(`Invalid priority: ${action.priority}`);
    }
  });
  
  return data as InsightHubResponse;
}
```

---

## Database Schema

No new tables needed — results are returned to frontend only (not persisted).

**Optional (future):** Store insight_hub_results for audit trail
```sql
CREATE TABLE insight_hub_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quality_checks jsonb NOT NULL,
  strategic_insight jsonb NOT NULL,
  recommended_actions jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
```

---

## AI Usage Logging

```typescript
await logAIUsage({
  organizationId,
  userId,
  action: 'analyzeDMAQuality',
  model: 'gemini-2.5-flash',
  inputTokens: estimateTokens(prompt),
  outputTokens: estimateTokens(response),
  durationMs: elapsed,
  quotaType: 'platform_free', // or 'platform_pro'
  success: true,
  metadata: {
    assessment_count: assessments.length,
    material_topics: assessments.filter(a => a.is_material).length
  }
});
```

---

## Error Handling

```typescript
try {
  const response = await callGemini(prompt);
  const parsed = JSON.parse(response);
  const validated = validateInsightHubResponse(parsed);
  return validated;
} catch (error) {
  if (error instanceof SyntaxError) {
    // Malformed JSON
    logError('Insight Hub: Invalid JSON from AI', { error, response });
    return getFallbackResponse(); // Return empty but valid structure
  }
  
  if (error.message.includes('status')) {
    // Validation failed
    logError('Insight Hub: Validation failed', { error, parsed });
    return getFallbackResponse();
  }
  
  // AI timeout or other error
  throw error;
}

function getFallbackResponse(): InsightHubResponse {
  return {
    qualityChecks: [],
    strategicInsight: {
      summary: "Unable to generate insight at this time. Please review your assessments manually.",
      keyRisks: [],
      opportunities: [],
      bottomLine: "Manual review recommended."
    },
    recommendedActions: []
  };
}
```

---

## Acceptance Criteria

- [ ] API action `analyzeDMAQuality` implemented
- [ ] Prompt includes ESRS compliance rules
- [ ] Response validation with type safety
- [ ] Quality checks return traffic light status
- [ ] Strategic insight in plain language (no jargon)
- [ ] Recommended actions include time estimates
- [ ] AI usage logged with metadata
- [ ] Error handling with fallback response
- [ ] Performance: response within 10 seconds

---

## Files to Modify

### Backend:
- `netlify/functions/api.ts`
  - Add `case 'analyzeDMAQuality'`
  - Implement prompt template
  - Add validation logic
  
- `services/aiService.ts`
  - `callGemini()` helper
  - Token estimation
  
- `utils/insightHubHelpers.ts` (create)
  - `validateInsightHubResponse()`
  - `getFallbackResponse()`

### Types:
- `types/insightHub.ts` (create)
  - All interfaces above

---

## Testing Checklist

- [ ] Test with complete DMA (all 10 topics)
- [ ] Test with incomplete DMA (5 topics)
- [ ] Test with all-material scenario
- [ ] Test with no-material scenario
- [ ] Verify traffic light logic (red/yellow/green)
- [ ] Verify ESRS references are accurate
- [ ] Test error handling (timeout, malformed JSON)
- [ ] Performance test: 10 concurrent requests

---

## Related Issues

- Depends on: #4 (AI-Guided Scoring)
- Feeds into: #6 (Insight Hub UI)
- Feeds into: #7 (Task Generator uses recommended actions)
