# AI-Guided Scoring in Double Materiality Assessment

**Type:** Enhancement  
**Priority:** P1 (High)  
**Labels:** `phase-2`, `ai`, `dma`, `p1`  
**Milestone:** Phase 2 — DMA Enhancements  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #1 (BMC/SWOT Migration), #2 (AI Structured Output)

---

## Problem

Currently, users manually guess materiality scores (1-5) for each criterion without guidance:
- Results in inaccurate assessments
- Users don't understand what score to assign
- No context from their actual business operations
- Inconsistent scoring across organizations

---

## Solution

AI suggests scores for ALL criteria with reasoning before user sees the form:

**Input context:**
- Company Profile (industry, size, description)
- BMC items (key activities, eco-social costs/benefits)
- SWOT items (threats, opportunities)
- ESRS sector-specific guidance (embedded in prompt)

**Output format:**
```json
{
  "impact": {
    "scale": {
      "score": 4,
      "reasoning": "Manufacturing with direct emissions from production processes. High volume metal processing generates significant air pollutants affecting local communities within 5km radius."
    },
    "scope": {
      "score": 3,
      "reasoning": "Regional supply chain (Thailand + ASEAN). Not global scale but affects multiple provinces through transport network."
    },
    "irremediability": {
      "score": 3,
      "reasoning": "Air pollution is partially reversible with mitigation measures, but some long-term environmental damage is irreversible."
    },
    "likelihood": {
      "score": 4,
      "reasoning": "Manufacturing operations are continuous. Emissions occur daily with current technology."
    }
  },
  "financial": {
    "magnitude": {
      "score": 4,
      "reasoning": "Potential fines up to 2% revenue (~฿800K annually) plus investment needed for emissions control systems (฿2-3M)."
    },
    "likelihood": {
      "score": 4,
      "reasoning": "New Thai air quality regulations effective 2025. Enforcement increasing. Regulatory risk is high."
    }
  }
}
```

---

## User Experience Flow

```
1. User opens E1 Climate Change assessment
2. Loading spinner: "Analyzing your business context..."
3. AI returns suggested scores + reasoning
4. Form pre-populated with suggestions
5. User can:
   - Accept suggestion (✓ Use AI Score)
   - Adjust score (slider 1-5)
   - Add override notes (audit trail)
6. Save assessment
```

---

## Technical Implementation

### New API Action: `generateAssessmentScoring`

**Request:**
```json
{
  "action": "generateAssessmentScoring",
  "topic": "E1",
  "topicTitle": "Climate Change",
  "companyProfile": {
    "name": "ABC Manufacturing",
    "industry": "Metal parts manufacturing",
    "isic_code": "25.99",
    "employee_count": 85,
    "annual_revenue_thb": 45000000
  },
  "bmcItems": {
    "key_activities": ["Precision metal cutting", "CNC machining", "Quality control"],
    "eco_social_costs": ["Air emissions from cutting", "Metal waste", "Energy consumption"],
    "eco_social_benefits": ["Long-lasting products", "Local employment"]
  },
  "swotItems": {
    "threats": ["Stricter environmental regulations", "Carbon border adjustment"],
    "opportunities": ["Green technology adoption", "Renewable energy transition"]
  }
}
```

**Prompt Template:**
```
You are an ESRS materiality expert helping SMEs assess E1 Climate Change.

Company context:
- Industry: {industry} (ISIC: {isic_code})
- Size: {employee_count} employees, ฿{revenue} annual revenue
- Key activities: {key_activities}
- Eco-social costs: {eco_social_costs}
- Threats: {threats}
- Opportunities: {opportunities}

ESRS E1 sector guidance for {industry}:
[Baked-in sector-specific guidance here]

Task: Suggest materiality scores (1-5 scale) for each criterion.

Scoring guidelines:
- Impact Scale: 1=minimal, 3=moderate, 5=severe
- Impact Scope: 1=internal only, 3=regional, 5=global
- Irremediability: 1=fully reversible, 3=partially, 5=irreversible
- Likelihood: 1=rare, 3=possible, 5=certain
- Financial Magnitude: 1=<0.5% revenue, 3=0.5-2%, 5=>5%
- Financial Likelihood: 1=unlikely, 3=possible, 5=almost certain

Return ONLY valid JSON with this structure:
{
  "impact": {
    "scale": {"score": X, "reasoning": "..."},
    "scope": {"score": X, "reasoning": "..."},
    "irremediability": {"score": X, "reasoning": "..."},
    "likelihood": {"score": X, "reasoning": "..."}
  },
  "financial": {
    "magnitude": {"score": X, "reasoning": "..."},
    "likelihood": {"score": X, "reasoning": "..."}
  }
}

Base reasoning on ACTUAL company operations, not generic assumptions.
```

**Response Validation:**
```typescript
interface AssessmentScoring {
  impact: {
    scale: { score: number; reasoning: string };
    scope: { score: number; reasoning: string };
    irremediability: { score: number; reasoning: string };
    likelihood: { score: number; reasoning: string };
  };
  financial: {
    magnitude: { score: number; reasoning: string };
    likelihood: { score: number; reasoning: string };
  };
}

function validateScoring(data: any): AssessmentScoring {
  // Validate all scores are 1-5
  const allScores = [
    data.impact.scale.score,
    data.impact.scope.score,
    data.impact.irremediability.score,
    data.impact.likelihood.score,
    data.financial.magnitude.score,
    data.financial.likelihood.score
  ];
  
  if (!allScores.every(s => s >= 1 && s <= 5)) {
    throw new Error('All scores must be 1-5');
  }
  
  // Validate reasoning exists
  if (!allScores.every((_, i) => {
    const key = Object.keys(data.impact)[i] || Object.keys(data.financial)[i - 4];
    return data.impact[key]?.reasoning?.length > 20 || data.financial[key]?.reasoning?.length > 20;
  })) {
    throw new Error('Reasoning must be substantial');
  }
  
  return data as AssessmentScoring;
}
```

---

## Frontend Implementation

### AssessmentForm Component Updates

**Before AI suggestion:**
```tsx
// Empty form, user fills everything
<FormField label="Impact Scale" value={scale} onChange={setScale} />
```

**After AI suggestion:**
```tsx
const [aiSuggestion, setAiSuggestion] = useState<AssessmentScoring | null>(null);
const [userOverrides, setUserOverrides] = useState<Record<string, boolean>>({});

useEffect(() => {
  // Fetch AI suggestion on mount
  fetchAISuggestion(topic, companyProfile, bmcItems, swotItems)
    .then(setAiSuggestion);
}, [topic]);

// Render with suggestions
<FormField 
  label="Impact Scale"
  value={scale}
  onChange={(val) => {
    setScale(val);
    setUserOverrides(prev => ({ ...prev, scale: true }));
  }}
  aiSuggestion={aiSuggestion?.impact.scale}
  isOverridden={userOverrides.scale}
/>
```

**FormField with AI Suggestion:**
```tsx
interface FormFieldProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  aiSuggestion?: { score: number; reasoning: string };
  isOverridden?: boolean;
}

function FormField({ label, value, onChange, aiSuggestion, isOverridden }: FormFieldProps) {
  return (
    <div>
      <label>{label}</label>
      
      {aiSuggestion && (
        <div className="ai-suggestion">
          <div className="suggested-score">
            AI suggests: {aiSuggestion.score}/5
            {!isOverridden && (
              <button onClick={() => onChange(aiSuggestion.score)}>
                ✓ Use AI Score
              </button>
            )}
          </div>
          <div className="reasoning">
            {aiSuggestion.reasoning}
          </div>
        </div>
      )}
      
      <input 
        type="range" 
        min="1" 
        max="5" 
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span>{value}/5</span>
      
      {isOverridden && (
        <div className="override-note">
          <label>Why did you adjust this score?</label>
          <textarea placeholder="Optional: explain your reasoning for audit trail" />
        </div>
      )}
    </div>
  );
}
```

---

## Acceptance Criteria

- [ ] `generateAssessmentScoring` API action implemented
- [ ] Prompt includes company context + ESRS guidance
- [ ] Response validation ensures scores 1-5 + reasoning >20 chars
- [ ] Frontend fetches AI suggestion on form load
- [ ] Form pre-populated with AI scores
- [ ] User can accept or override each score
- [ ] Override notes saved to audit trail
- [ ] Loading state during AI fetch
- [ ] Error handling if AI fails (fallback to empty form)

---

## Files to Modify

### Backend:
- `netlify/functions/api.ts`
  - Add `case 'generateAssessmentScoring'`
  - Implement prompt template
  - Add ESRS sector guidance

### Frontend:
- `components/AssessmentForm.tsx`
  - Add AI suggestion state
  - Update FormField component
  - Add override tracking
  
- `services/assessmentService.ts`
  - `fetchAISuggestion()` function

### Types:
- `types/assessment.ts`
  - Add `AssessmentScoring` interface

---

## Testing Checklist

- [ ] Test with 5 different industries
- [ ] Verify scores always 1-5
- [ ] Verify reasoning is contextual (not generic)
- [ ] Test override flow (accept → adjust → save)
- [ ] Test error handling (AI timeout, malformed JSON)
- [ ] Test audit trail captures overrides with notes

---

## Edge Cases

1. **AI returns generic reasoning:**
   - Solution: Prompt emphasizes "based on ACTUAL operations"
   - Fallback: Re-prompt with more specific context

2. **Company has minimal BMC/SWOT data:**
   - Solution: AI still provides baseline suggestion
   - Quality warning: "Limited context - review carefully"

3. **User adjusts score but doesn't explain:**
   - Solution: Override notes are optional but encouraged
   - Audit trail still captures the adjustment

---

## Future Enhancements (Not in Phase 2)

- Sector-specific guidance database (vs baked-in prompts)
- Industry benchmarking (compare your score to peers)
- Machine learning from user adjustments
- Multi-language reasoning

---

## Related Issues

- Depends on: #1 (BMC/SWOT must be jsonb)
- Depends on: #2 (AI structured output)
- Feeds into: #5 (Insight Hub analyzes scoring quality)
