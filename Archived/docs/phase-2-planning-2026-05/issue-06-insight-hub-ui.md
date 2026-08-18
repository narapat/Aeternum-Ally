# DMA Insight Hub — Frontend UI Implementation

**Type:** Enhancement  
**Priority:** P1 (High)  
**Labels:** `phase-2`, `ui`, `frontend`, `p1`  
**Milestone:** Phase 2 — DMA Enhancements  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #5 (Insight Hub Backend)

---

## Problem

After completing DMA, user immediately proceeds to KPI with no feedback loop:
- No quality validation checkpoint
- No opportunity to fix issues before moving forward
- Critical decision point (materiality) has no guardrails

---

## Solution

Full-screen Insight Hub between DMA and KPI showing:
1. Score banner (overview stats)
2. Quality check cards (per-topic traffic lights)
3. Strategic insight panel (executive summary)
4. Recommended actions list (prioritized)
5. Clear navigation: [← Fix DMA] or [Continue to KPI →]

**Mockup reference:** `/mnt/user-data/outputs/dma-insight-hub.html`

---

## User Journey

```
User completes 10th assessment → Click [Review & Continue]
  ↓
Loading screen: "Analyzing your assessments..."
  ↓
Insight Hub screen renders
  ↓
User reviews:
  - Quality flags (🔴🟡🟢)
  - Strategic insight
  - Recommended actions
  ↓
Decision:
  Option A: [← Back to Fix Issues]
  Option B: [Continue to KPI Dashboard →]
```

---

## Component Structure

```
<DMAInsightHub>
  <LoadingState />         (during AI analysis)
  <ScoreBanner />          (material topics, completion %)
  <QualityCheckSection />  (topic-by-topic cards)
  <StrategicInsightPanel /> (CEO summary)
  <RecommendedActions />   (prioritized action list)
  <Navigation />           (back / continue buttons)
</DMAInsightHub>
```

---

## Detailed Component Specs

### 1. ScoreBanner

```tsx
interface ScoreBannerProps {
  assessments: Assessment[];
}

function ScoreBanner({ assessments }: ScoreBannerProps) {
  const materialCount = assessments.filter(a => a.is_material).length;
  const completionRate = (assessments.filter(a => a.completed).length / 10) * 100;
  
  return (
    <div className="score-banner">
      <div className="stat">
        <div className="value">{materialCount}/10</div>
        <div className="label">Material Topics</div>
      </div>
      <div className="stat">
        <div className="value">{completionRate}%</div>
        <div className="label">Completion</div>
      </div>
      <div className="stat">
        <div className="value">{calculateReadiness(assessments)}</div>
        <div className="label">Statement Ready</div>
      </div>
    </div>
  );
}
```

---

### 2. QualityCheckSection

```tsx
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

function QualityCheckSection({ checks }: { checks: QualityCheck[] }) {
  return (
    <section className="quality-checks">
      <h2>Quality Check</h2>
      <div className="checks-grid">
        {checks.map(check => (
          <QualityCheckCard key={check.topic} check={check} />
        ))}
      </div>
    </section>
  );
}

function QualityCheckCard({ check }: { check: QualityCheck }) {
  const statusIcon = {
    needs_fix: '🔴',
    review: '🟡',
    ok: '🟢'
  }[check.status];
  
  const statusLabel = {
    needs_fix: 'Must Fix',
    review: 'Should Review',
    ok: 'Complete'
  }[check.status];
  
  return (
    <div className={`check-card status-${check.status}`}>
      <div className="card-header">
        <span className="status-icon">{statusIcon}</span>
        <h3>{check.topic} {check.topicTitle}</h3>
      </div>
      
      {check.issues.length > 0 && (
        <div className="issues">
          {check.issues.map((issue, idx) => (
            <div key={idx} className="issue">
              <div className="issue-title">{issue.title}</div>
              <div className="issue-description">{issue.description}</div>
              {issue.fix_suggestion && (
                <div className="fix-suggestion">
                  <strong>How to fix:</strong> {issue.fix_suggestion}
                </div>
              )}
              <div className="esrs-ref">
                <span className="label">ESRS Reference:</span> {issue.esrs_ref}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {check.status !== 'ok' && (
        <button 
          className="fix-button"
          onClick={() => navigateToAssessment(check.topic)}
        >
          Fix {check.topic}
        </button>
      )}
    </div>
  );
}
```

---

### 3. StrategicInsightPanel

```tsx
interface StrategicInsight {
  summary: string;
  keyRisks: string[];
  opportunities: string[];
  bottomLine: string;
}

function StrategicInsightPanel({ insight }: { insight: StrategicInsight }) {
  return (
    <section className="strategic-insight">
      <h2>Strategic Insight</h2>
      
      <div className="insight-summary">
        {insight.summary}
      </div>
      
      <div className="two-columns">
        <div className="risks">
          <h3>Key Risks</h3>
          <ul>
            {insight.keyRisks.map((risk, idx) => (
              <li key={idx}>{risk}</li>
            ))}
          </ul>
        </div>
        
        <div className="opportunities">
          <h3>Opportunities</h3>
          <ul>
            {insight.opportunities.map((opp, idx) => (
              <li key={idx}>{opp}</li>
            ))}
          </ul>
        </div>
      </div>
      
      <div className="bottom-line">
        <strong>Bottom Line:</strong> {insight.bottomLine}
      </div>
    </section>
  );
}
```

---

### 4. RecommendedActions

```tsx
interface RecommendedAction {
  id: string;
  type: 'fix' | 'comply' | 'improve';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  esrs_ref?: string;
  estimated_time?: string;
}

function RecommendedActions({ actions }: { actions: RecommendedAction[] }) {
  const grouped = {
    fix: actions.filter(a => a.type === 'fix'),
    comply: actions.filter(a => a.type === 'comply'),
    improve: actions.filter(a => a.type === 'improve')
  };
  
  return (
    <section className="recommended-actions">
      <h2>Recommended Actions</h2>
      
      {grouped.fix.length > 0 && (
        <ActionGroup 
          title="🔴 Fix (Before Statement)" 
          actions={grouped.fix} 
        />
      )}
      
      {grouped.comply.length > 0 && (
        <ActionGroup 
          title="🟡 Comply (ESRS Required)" 
          actions={grouped.comply} 
        />
      )}
      
      {grouped.improve.length > 0 && (
        <ActionGroup 
          title="🟢 Improve (Strategic)" 
          actions={grouped.improve} 
        />
      )}
    </section>
  );
}

function ActionGroup({ title, actions }: { title: string; actions: RecommendedAction[] }) {
  return (
    <div className="action-group">
      <h3>{title}</h3>
      {actions.map(action => (
        <div key={action.id} className={`action priority-${action.priority}`}>
          <div className="action-header">
            <span className="title">{action.title}</span>
            {action.estimated_time && (
              <span className="time-estimate">⏱ {action.estimated_time}</span>
            )}
          </div>
          <div className="description">{action.description}</div>
          {action.esrs_ref && (
            <div className="esrs-ref">{action.esrs_ref}</div>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

### 5. Navigation

```tsx
function Navigation({ hasIssues }: { hasIssues: boolean }) {
  return (
    <div className="insight-navigation">
      <button 
        className="back-button"
        onClick={() => router.push('/dma')}
      >
        ← Back to Fix Issues
      </button>
      
      <button 
        className="continue-button"
        onClick={() => router.push('/kpi')}
      >
        Continue to KPI Dashboard →
      </button>
      
      {hasIssues && (
        <div className="warning">
          ⚠️ You have quality issues flagged above. 
          We recommend fixing them before generating your statement.
        </div>
      )}
    </div>
  );
}
```

---

### 6. LoadingState

```tsx
function LoadingState() {
  return (
    <div className="loading-state">
      <div className="spinner" />
      <h2>Analyzing Your Assessments...</h2>
      <p>Checking quality against ESRS requirements</p>
      <p>Generating strategic insights</p>
      <p>Preparing recommendations</p>
    </div>
  );
}
```

---

## State Management

```tsx
function DMAInsightHub() {
  const [loading, setLoading] = useState(true);
  const [insightData, setInsightData] = useState<InsightHubResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    fetchInsightHubData();
  }, []);
  
  async function fetchInsightHubData() {
    try {
      setLoading(true);
      
      // Fetch all assessments
      const assessments = await getAssessments(organizationId);
      const bmcItems = await getBMCItems(organizationId);
      const swotItems = await getSWOTItems(organizationId);
      
      // Call Insight Hub API
      const response = await fetch('/.netlify/functions/api', {
        method: 'POST',
        body: JSON.stringify({
          action: 'analyzeDMAQuality',
          assessments,
          bmcItems,
          swotItems
        })
      });
      
      const data = await response.json();
      setInsightData(data);
    } catch (err) {
      setError('Failed to generate insights. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }
  
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!insightData) return <EmptyState />;
  
  const hasIssues = insightData.qualityChecks.some(
    c => c.status === 'needs_fix' || c.status === 'review'
  );
  
  return (
    <div className="insight-hub">
      <ScoreBanner assessments={assessments} />
      <QualityCheckSection checks={insightData.qualityChecks} />
      <StrategicInsightPanel insight={insightData.strategicInsight} />
      <RecommendedActions actions={insightData.recommendedActions} />
      <Navigation hasIssues={hasIssues} />
    </div>
  );
}
```

---

## Styling (Tailwind + Custom CSS)

```css
/* Dark theme matching dma-insight-hub.html mockup */
.insight-hub {
  background: #0a0e1a;
  color: #e2e8f0;
  font-family: 'DM Sans', sans-serif;
  min-height: 100vh;
  padding: 2rem;
}

.score-banner {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.score-banner .stat {
  background: #1a1f2e;
  padding: 2rem;
  border-radius: 12px;
  text-align: center;
}

.score-banner .value {
  font-size: 3rem;
  font-weight: 700;
  color: #10b981;
}

.checks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
}

.check-card {
  background: #1a1f2e;
  border-radius: 12px;
  padding: 1.5rem;
  border-left: 4px solid;
}

.check-card.status-needs_fix { border-color: #ef4444; }
.check-card.status-review { border-color: #f59e0b; }
.check-card.status-ok { border-color: #10b981; }

.strategic-insight {
  background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
  padding: 2rem;
  border-radius: 12px;
  margin: 3rem 0;
}

.action-group {
  margin-bottom: 2rem;
}

.action {
  background: #1a1f2e;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  border-left: 3px solid;
}

.action.priority-high { border-color: #ef4444; }
.action.priority-medium { border-color: #f59e0b; }
.action.priority-low { border-color: #10b981; }
```

---

## Acceptance Criteria

- [ ] Loading state shows during AI analysis
- [ ] Score banner displays correct stats
- [ ] Quality check cards render with traffic lights
- [ ] Click "Fix E1" navigates to that assessment
- [ ] Strategic insight in plain language (no jargon)
- [ ] Actions grouped by type (Fix/Comply/Improve)
- [ ] Navigation buttons work (back to DMA, forward to KPI)
- [ ] Warning shown if quality issues exist
- [ ] Error handling displays friendly message
- [ ] Responsive design (mobile + desktop)

---

## Files to Create/Modify

### New Components:
- `components/DMAInsightHub.tsx` (main)
- `components/insight-hub/ScoreBanner.tsx`
- `components/insight-hub/QualityCheckSection.tsx`
- `components/insight-hub/StrategicInsightPanel.tsx`
- `components/insight-hub/RecommendedActions.tsx`
- `components/insight-hub/LoadingState.tsx`

### Routing:
- `pages/insight-hub.tsx` (new route)
- `pages/dma.tsx` (update "Complete" button → navigate to insight-hub)

### Styling:
- `styles/insight-hub.css` (custom styles)

---

## Testing Checklist

- [ ] Test with 10 complete assessments
- [ ] Test with 5 incomplete assessments
- [ ] Test with all-green quality checks
- [ ] Test with red/yellow flags
- [ ] Test navigation: back to DMA works
- [ ] Test navigation: continue to KPI works
- [ ] Test error state (API timeout)
- [ ] Test loading state animation
- [ ] Mobile responsive (320px width)
- [ ] Desktop layout (1920px width)

---

## Accessibility

- [ ] Semantic HTML (sections, headings)
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] ARIA labels for traffic light icons
- [ ] Color contrast meets WCAG AA
- [ ] Screen reader tested

---

## Related Issues

- Depends on: #5 (Backend API)
- Feeds into: #7 (Task Generator can consume recommended actions)
