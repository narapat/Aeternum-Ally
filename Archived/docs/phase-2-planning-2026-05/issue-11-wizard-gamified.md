# Carbon Accounting Wizard — Gamified Onboarding

**Type:** Enhancement  
**Priority:** P2 (Medium)  
**Labels:** `phase-2`, `carbon-accounting`, `ui`, `gamification`, `p2`  
**Milestone:** Phase 2 — Carbon Accounting  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #3 (emission tables)

---

## Problem

Carbon accounting is intimidating for SMEs:
- Don't know where to start
- Scope 1/2/3 jargon is confusing
- Feel overwhelmed by data requirements
- Often give up before completing

---

## Solution

**Gamified wizard** for first-time setup:
- Framed as "🌍 Carbon Quest" with 3 missions
- Start with EASIEST (Scope 2 = electricity) to build confidence
- Progress bar + achievements unlock
- Friendly AI copilot chat
- 15-20 minutes total time
- Celebrate wins at each step

---

## User Journey

```
User marks E1 as material
  ↓
Task created: "Prepare GHG inventory"
  ↓
Click task → route to Carbon Wizard
  ↓
Welcome screen:
  "🌍 Welcome to Carbon Quest!"
  "3 missions to map your carbon footprint"
  [Start Mission 1 →]
  ↓
Mission 1: Scope 2 (Electricity)
  - Why start here? "Easiest data to collect"
  - Upload electricity bill OR manual entry
  - AI extracts kWh from bill (OCR)
  - Calculate → show result
  - 🎉 "Mission 1 Complete! You've mapped 40% of typical footprint"
  ↓
Mission 2: Scope 1 (Direct Emissions)
  - AI suggests sources from BMC ("You have fleet → likely gasoline")
  - Checkboxes: vehicles, boiler, generator, forklift
  - Sub-wizard per source selected
  - Progress within mission: "Scope 1: ▓▓░░ 2/4 sources"
  ↓
Mission 3: Scope 3 (Optional)
  - "Bonus Mission! Not required for ESRS minimum"
  - AI recommends category based on BMC (e.g., Upstream Transport)
  - User can skip → revisit later from dashboard
  ↓
Boss Level: Review & Publish
  - Summary pie chart (Scope 1/2/3 breakdown)
  - AI insight: "Electricity is biggest → quick win = renewable energy"
  - Badges unlocked display
  - [Publish to Dashboard →]
  ↓
Redirect to Carbon Dashboard (recurring entry mode)
```

---

## Component Structure

```
<CarbonWizard>
  <WelcomeScreen />
  <Mission1_Scope2 />
  <Mission2_Scope1 />
  <Mission3_Scope3 />
  <BossLevel_Review />
</CarbonWizard>
```

---

## Welcome Screen

```tsx
function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="wizard-welcome">
      <div className="quest-badge">🌍</div>
      <h1>Welcome to Carbon Quest!</h1>
      
      <p className="subtitle">
        Map your organization's carbon footprint in 3 missions
      </p>
      
      <div className="missions-preview">
        <MissionCard
          icon="⚡"
          title="Mission 1: Scope 2"
          description="Purchased electricity (easiest!)"
          time="5 min"
        />
        <MissionCard
          icon="🚗"
          title="Mission 2: Scope 1"
          description="Direct emissions (vehicles, boilers)"
          time="8 min"
        />
        <MissionCard
          icon="📦"
          title="Mission 3: Scope 3"
          description="Supply chain (bonus level)"
          time="5 min"
          optional
        />
      </div>
      
      <div className="why-section">
        <h3>Why carbon accounting?</h3>
        <ul>
          <li>✓ ESRS E1 requires baseline footprint</li>
          <li>✓ Identify quick wins (cost savings)</li>
          <li>✓ Prepare for carbon pricing</li>
          <li>✓ Show customers you're serious</li>
        </ul>
      </div>
      
      <button className="start-button" onClick={onStart}>
        Start Mission 1 →
      </button>
      
      <p className="skip-note">
        Already have data? <a href="/carbon/dashboard">Skip to Dashboard</a>
      </p>
    </div>
  );
}
```

---

## Mission 1: Scope 2 (Electricity)

```tsx
function Mission1_Scope2({ onComplete }: { onComplete: () => void }) {
  const [method, setMethod] = useState<'upload' | 'manual' | null>(null);
  const [kWh, setKWh] = useState<number | null>(null);
  const [calculating, setCalculating] = useState(false);
  
  const handleUpload = async (file: File) => {
    setCalculating(true);
    // OCR to extract kWh from bill
    const extracted = await extractKWhFromBill(file);
    setKWh(extracted.kWh);
    setCalculating(false);
  };
  
  const handleManual = (value: number) => {
    setKWh(value);
  };
  
  const handleCalculate = async () => {
    if (!kWh) return;
    
    setCalculating(true);
    
    // Create emission source + entry
    await createEmissionSource({
      scope: '2',
      source_name: 'Electricity',
      fuel_type: 'Grid Electricity',
      unit: 'kWh',
      emission_factor_value: 0.5213 // Thailand grid 2024
    });
    
    const emissions = kWh * 0.5213 / 1000; // tCO2e
    
    await createEmissionEntry({
      source_id: sourceId,
      activity_data: kWh,
      calculated_emissions_kgco2e: emissions * 1000
    });
    
    setCalculating(false);
    
    // Show success + fun analogy
    showCelebration({
      emissions,
      analogy: `That's equal to driving ${Math.round(emissions * 4200)} km!`
    });
    
    setTimeout(onComplete, 3000);
  };
  
  return (
    <div className="mission-screen">
      <div className="mission-header">
        <span className="mission-badge">⚡</span>
        <h2>Mission 1: Scope 2 — Electricity</h2>
        <div className="progress">1 of 3</div>
      </div>
      
      <div className="why-easy">
        <strong>Why start here?</strong> Electricity data is easy —
        just check your monthly bill! This usually covers 40-60% 
        of an SME's total footprint.
      </div>
      
      {!method && (
        <div className="method-selection">
          <button 
            className="method-card"
            onClick={() => setMethod('upload')}
          >
            <div className="icon">📤</div>
            <h3>Upload Bill</h3>
            <p>We'll extract kWh automatically</p>
            <span className="badge">Recommended</span>
          </button>
          
          <button 
            className="method-card"
            onClick={() => setMethod('manual')}
          >
            <div className="icon">⌨️</div>
            <h3>Manual Entry</h3>
            <p>Type in your monthly kWh</p>
          </button>
        </div>
      )}
      
      {method === 'upload' && (
        <FileUploader onUpload={handleUpload} />
      )}
      
      {method === 'manual' && (
        <ManualEntry
          label="Monthly kWh usage"
          placeholder="e.g., 12,450"
          unit="kWh"
          onSubmit={handleManual}
          tip="Find this on your electricity bill under 'Total Units' or 'kWh'"
        />
      )}
      
      {kWh && !calculating && (
        <div className="calculation-preview">
          <div className="input-summary">
            <strong>{kWh.toLocaleString()} kWh</strong> × 
            <strong>0.5213 kgCO2e/kWh</strong> = 
            <strong className="result">
              {(kWh * 0.5213 / 1000).toFixed(2)} tCO2e
            </strong>
          </div>
          
          <button 
            className="calculate-button"
            onClick={handleCalculate}
          >
            Calculate My Scope 2 Emissions
          </button>
        </div>
      )}
      
      {calculating && <LoadingSpinner text="Calculating..." />}
      
      <AICopilot
        messages={[
          "Looking good! Most SMEs use 8,000-15,000 kWh per month.",
          "Quick win: LED lighting can cut electricity 20-30%",
          "Solar panels typical payback: 6-8 years in Thailand"
        ]}
      />
    </div>
  );
}
```

---

## Mission 2: Scope 1 (Direct Emissions)

```tsx
function Mission2_Scope1({ onComplete }: { onComplete: () => void }) {
  const [sources, setSources] = useState<string[]>([]);
  const [currentSource, setCurrentSource] = useState<string | null>(null);
  const [sourceData, setSourceData] = useState<Record<string, any>>({});
  
  // AI suggests based on BMC
  const suggestedSources = [
    { id: 'vehicles', label: 'Company Vehicles', icon: '🚗', ai_confidence: 'high' },
    { id: 'generator', label: 'Backup Generator', icon: '⚡', ai_confidence: 'medium' },
    { id: 'boiler', label: 'Boiler/Heating', icon: '🔥', ai_confidence: 'low' },
    { id: 'forklift', label: 'Forklifts', icon: '🏗️', ai_confidence: 'medium' }
  ];
  
  const handleSourceToggle = (sourceId: string) => {
    setSources(prev => 
      prev.includes(sourceId) 
        ? prev.filter(s => s !== sourceId)
        : [...prev, sourceId]
    );
  };
  
  const handleSourceComplete = (sourceId: string, data: any) => {
    setSourceData(prev => ({ ...prev, [sourceId]: data }));
    
    const nextIndex = sources.indexOf(sourceId) + 1;
    if (nextIndex < sources.length) {
      setCurrentSource(sources[nextIndex]);
    } else {
      onComplete();
    }
  };
  
  const progress = Object.keys(sourceData).length / sources.length;
  
  return (
    <div className="mission-screen">
      <div className="mission-header">
        <span className="mission-badge">🚗</span>
        <h2>Mission 2: Scope 1 — Direct Emissions</h2>
        <div className="progress">2 of 3</div>
      </div>
      
      {!currentSource && (
        <>
          <div className="ai-suggestion">
            <strong>🤖 AI Insight:</strong> Based on your business model,
            you likely have these emission sources:
          </div>
          
          <div className="source-selection">
            {suggestedSources.map(source => (
              <label key={source.id} className="source-checkbox">
                <input
                  type="checkbox"
                  checked={sources.includes(source.id)}
                  onChange={() => handleSourceToggle(source.id)}
                />
                <div className="source-card">
                  <span className="icon">{source.icon}</span>
                  <span className="label">{source.label}</span>
                  {source.ai_confidence === 'high' && (
                    <span className="confidence">AI: High confidence</span>
                  )}
                </div>
              </label>
            ))}
          </div>
          
          <button
            className="continue-button"
            disabled={sources.length === 0}
            onClick={() => setCurrentSource(sources[0])}
          >
            Continue with {sources.length} source{sources.length > 1 ? 's' : ''}
          </button>
        </>
      )}
      
      {currentSource && (
        <div className="source-wizard">
          <div className="sub-progress">
            Scope 1: {Object.keys(sourceData).length} / {sources.length} complete
          </div>
          
          <SourceDataForm
            source={suggestedSources.find(s => s.id === currentSource)!}
            onComplete={(data) => handleSourceComplete(currentSource, data)}
          />
        </div>
      )}
      
      <AICopilot
        messages={[
          "Vehicles are typically the biggest Scope 1 source for SMEs",
          "Keep fuel receipts for accurate tracking",
          "Consider EV fleet for long-term savings"
        ]}
      />
    </div>
  );
}

function SourceDataForm({ 
  source, 
  onComplete 
}: { 
  source: SuggestedSource; 
  onComplete: (data: any) => void;
}) {
  const [fuelType, setFuelType] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('L');
  
  const fuelOptions = {
    vehicles: ['Gasoline', 'Diesel', 'LPG'],
    generator: ['Diesel', 'Natural Gas'],
    boiler: ['Natural Gas', 'LPG', 'Fuel Oil'],
    forklift: ['LPG', 'Diesel']
  };
  
  return (
    <div className="source-form">
      <h3>{source.icon} {source.label}</h3>
      
      <FormField label="Fuel Type">
        <select value={fuelType} onChange={(e) => setFuelType(e.target.value)}>
          <option value="">Select fuel...</option>
          {fuelOptions[source.id].map(fuel => (
            <option key={fuel} value={fuel}>{fuel}</option>
          ))}
        </select>
      </FormField>
      
      <FormField label="Annual Consumption">
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="e.g., 850"
        />
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="L">Liters</option>
          <option value="kg">Kilograms</option>
          <option value="m3">Cubic meters</option>
        </select>
      </FormField>
      
      <button
        onClick={() => onComplete({ fuelType, quantity, unit })}
        disabled={!fuelType || !quantity}
      >
        Save & Continue
      </button>
    </div>
  );
}
```

---

## Mission 3: Scope 3 (Optional Bonus)

```tsx
function Mission3_Scope3({ 
  onComplete, 
  onSkip 
}: { 
  onComplete: () => void; 
  onSkip: () => void;
}) {
  return (
    <div className="mission-screen">
      <div className="mission-header">
        <span className="mission-badge">📦</span>
        <h2>Mission 3: Scope 3 — Supply Chain (Bonus!)</h2>
        <div className="progress">3 of 3</div>
        <span className="optional-badge">Optional</span>
      </div>
      
      <div className="bonus-explainer">
        <p>
          <strong>Good news:</strong> Scope 3 is NOT required for ESRS minimum compliance.
          This is a bonus mission for overachievers! 🏆
        </p>
        <p>
          Scope 3 = emissions from your supply chain (transport, materials, waste).
          Usually the biggest footprint but hardest to measure.
        </p>
      </div>
      
      <div className="ai-recommendation">
        <strong>🤖 AI Recommendation:</strong> Based on your business model,
        start with <strong>Category 3.4: Upstream Transportation</strong>.
        Your transport-heavy operations likely have significant logistics emissions.
      </div>
      
      <div className="choice-buttons">
        <button className="skip-button" onClick={onSkip}>
          Skip for Now (can add later)
        </button>
        <button className="continue-button" onClick={() => {/* start Scope 3 */}}>
          Accept Bonus Mission
        </button>
      </div>
      
      <div className="tip">
        💡 Tip: Most SMEs skip Scope 3 initially and add it after
        mastering Scope 1+2 tracking.
      </div>
    </div>
  );
}
```

---

## Boss Level: Review & Publish

```tsx
function BossLevel_Review({ data }: { data: EmissionData }) {
  const total = data.scope1 + data.scope2 + (data.scope3 || 0);
  
  return (
    <div className="boss-level">
      <div className="victory-banner">
        <h1>🎉 Carbon Quest Complete!</h1>
        <p>You've mapped your organization's carbon footprint</p>
      </div>
      
      <div className="footprint-summary">
        <PieChart data={{
          'Scope 1': data.scope1,
          'Scope 2': data.scope2,
          'Scope 3': data.scope3 || 0
        }} />
        
        <div className="total-card">
          <div className="value">{total.toFixed(1)}</div>
          <div className="unit">tCO2e/year</div>
          <div className="label">Total Footprint</div>
        </div>
      </div>
      
      <AIInsight 
        biggestSource={data.scope2 > data.scope1 ? 'Electricity' : 'Vehicles'}
        quickWin="Switch to LED lighting for 20-30% electricity savings"
      />
      
      <AchievementsUnlocked 
        badges={[
          '⚡ Scope 2 Master',
          '🚗 Scope 1 Complete',
          '📊 Carbon Accountant',
          data.scope3 ? '🏆 Overachiever' : null
        ].filter(Boolean)}
      />
      
      <button 
        className="publish-button"
        onClick={() => publish(data)}
      >
        Publish to Dashboard
      </button>
      
      <div className="next-steps">
        <h3>What's Next?</h3>
        <ul>
          <li>✓ Monthly tracking dashboard (keep it updated!)</li>
          <li>✓ Set reduction targets in KPI Dashboard</li>
          <li>✓ Include footprint in Sustainability Statement</li>
        </ul>
      </div>
    </div>
  );
}
```

---

## Gamification Elements

### Progress Tracking

```tsx
function MissionProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="mission-progress">
      <div className="progress-bar">
        <div 
          className="fill"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
      <span className="label">Mission {current} of {total}</span>
    </div>
  );
}
```

### Celebration Animations

```tsx
function CelebrationModal({ 
  emissions, 
  analogy 
}: { 
  emissions: number; 
  analogy: string;
}) {
  return (
    <div className="celebration-modal">
      <Confetti />
      <div className="trophy">🏆</div>
      <h2>Mission Complete!</h2>
      <div className="result">
        {emissions.toFixed(2)} tCO2e calculated
      </div>
      <div className="analogy">{analogy}</div>
    </div>
  );
}
```

### Achievement Badges

```tsx
function AchievementsUnlocked({ badges }: { badges: string[] }) {
  return (
    <div className="achievements">
      <h3>Achievements Unlocked</h3>
      <div className="badge-list">
        {badges.map(badge => (
          <div key={badge} className="badge">
            {badge}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

- [ ] Welcome screen explains quest structure
- [ ] Mission 1 (Scope 2) completes in ~5 min
- [ ] Bill upload extracts kWh via OCR
- [ ] Manual entry validates input
- [ ] Mission 2 (Scope 1) suggests sources from BMC
- [ ] Progress bar shows completion within mission
- [ ] Mission 3 (Scope 3) clearly marked optional
- [ ] Boss Level shows pie chart breakdown
- [ ] AI insights personalized per company
- [ ] Celebration animations on completion
- [ ] Achievements unlock and display
- [ ] Publish redirects to Dashboard

---

## Files to Create

### Components:
- `components/carbon/CarbonWizard.tsx` (main)
- `components/carbon/wizard/WelcomeScreen.tsx`
- `components/carbon/wizard/Mission1_Scope2.tsx`
- `components/carbon/wizard/Mission2_Scope1.tsx`
- `components/carbon/wizard/Mission3_Scope3.tsx`
- `components/carbon/wizard/BossLevel_Review.tsx`
- `components/carbon/wizard/AICopilot.tsx`
- `components/carbon/wizard/CelebrationModal.tsx`

### Routing:
- `pages/carbon/wizard.tsx`

### Styling:
- `styles/carbon-wizard.css` (gamification theme)

---

## Testing Checklist

- [ ] Complete full wizard flow (all 3 missions)
- [ ] Upload electricity bill → OCR extracts kWh
- [ ] Manual entry → validates number input
- [ ] Select 3 Scope 1 sources → sub-wizard works
- [ ] Skip Scope 3 → still completes successfully
- [ ] Boss Level → charts render correctly
- [ ] Publish → data saved to database
- [ ] Mobile responsive (wizard on phone)

---

## Related Issues

- Depends on: #3 (emission tables)
- Feeds into: #12 (Carbon Dashboard recurring entry)
