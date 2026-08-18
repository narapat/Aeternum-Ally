# Carbon Dashboard — Recurring Entry & Tracking

**Type:** Enhancement  
**Priority:** P2 (Medium)  
**Labels:** `phase-2`, `carbon-accounting`, `ui`, `p2`  
**Milestone:** Phase 2 — Carbon Accounting  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #11 (Wizard establishes baseline)

---

## Problem

After wizard completes baseline, users need ongoing tracking:
- Monthly electricity bills arrive
- Vehicles refuel periodically
- Data needs continuous updates (not annual bulk)
- Want to see trends over time

---

## Solution

**Carbon Dashboard** for recurring data entry:
- NOT a wizard (permanent screen)
- Quick-add modals (<1 min per entry)
- Source list showing last entry date
- Trend chart (month-over-month)
- Year-over-year comparison (when multi-year data exists)
- Bulk Excel upload option

---

## Dashboard Layout

```
┌─────────────────────────────────────────────┐
│ Carbon Dashboard                            │
│ 2026 | View: [Monthly ▼]                   │
├─────────────────────────────────────────────┤
│                                             │
│ Summary (Year-to-Date)                      │
│ Total: 89.3 tCO2e (Jan-Sep)                │
│ Scope 1: 24.1 | Scope 2: 58.7 | Scope 3: 6.5│
│                                             │
│ 📊 Trend Chart                              │
│ ▂▃▄▃▅▆▇▅▄  (Jan-Sep monthly)               │
│                                             │
├─────────────────────────────────────────────┤
│ Quick Add                                   │
├─────────────────────────────────────────────┤
│ [⚡ Add Electricity]  ← most frequent       │
│ [🚗 Log Fuel]                               │
│ [📤 Upload Excel]                           │
└─────────────────────────────────────────────┘

Emission Sources
┌─────────────────────────────────────────────┐
│ ⚡ Scope 2 — Electricity                    │
│ Last entry: Sep 2026 (12,450 kWh)          │
│ [+ Add Oct Entry] [View History]           │
├─────────────────────────────────────────────┤
│ 🚗 Scope 1 — Company Vehicles               │
│ Last entry: 15 Sep 2026 (850 L)            │
│ [+ Add Entry] [View History]                │
├─────────────────────────────────────────────┤
│ 🏭 Scope 1 — Forklift (LPG)                │
│ Last entry: Aug 2026 (240 kg)              │
│ [+ Add Entry] [View History]                │
└─────────────────────────────────────────────┘
```

---

## Component Structure

```tsx
<CarbonDashboard>
  <DashboardHeader />
  <SummaryCard />
  <TrendChart />
  <QuickAddButtons />
  <EmissionSourcesList />
</CarbonDashboard>
```

---

## Implementation

### Dashboard Component

```tsx
function CarbonDashboard() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<'monthly' | 'quarterly'>('monthly');
  const [sources, setSources] = useState<EmissionSource[]>([]);
  const [entries, setEntries] = useState<EmissionEntry[]>([]);
  
  useEffect(() => {
    loadSources();
    loadEntries(year);
  }, [year]);
  
  const summary = calculateSummary(entries);
  const trendData = calculateTrend(entries, viewMode);
  
  return (
    <div className="carbon-dashboard">
      <DashboardHeader 
        year={year}
        onYearChange={setYear}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      
      <SummaryCard summary={summary} />
      
      <TrendChart 
        data={trendData}
        viewMode={viewMode}
      />
      
      <QuickAddButtons 
        frequentSources={sources.slice(0, 2)}
      />
      
      <EmissionSourcesList 
        sources={sources}
        onAddEntry={handleAddEntry}
      />
      
      {showYoYComparison && (
        <YearOverYearComparison 
          currentYear={year}
          previousYear={year - 1}
        />
      )}
    </div>
  );
}
```

---

## Quick Add Modal

```tsx
function QuickAddModal({ 
  source, 
  onClose, 
  onSave 
}: {
  source: EmissionSource;
  onClose: () => void;
  onSave: (entry: EmissionEntry) => void;
}) {
  const [activityData, setActivityData] = useState('');
  const [periodStart, setPeriodStart] = useState(
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [periodEnd, setPeriodEnd] = useState(
    format(endOfMonth(new Date()), 'yyyy-MM-dd')
  );
  
  const calculated = activityData 
    ? parseFloat(activityData) * source.emission_factor_value 
    : 0;
  
  const handleSave = async () => {
    await createEmissionEntry({
      source_id: source.id,
      period_start: periodStart,
      period_end: periodEnd,
      activity_data: parseFloat(activityData),
      calculated_emissions_kgco2e: calculated
    });
    
    onSave();
    onClose();
  };
  
  return (
    <Modal onClose={onClose}>
      <div className="quick-add-modal">
        <h3>Add {source.source_name} — {format(new Date(), 'MMMM yyyy')}</h3>
        
        <FormField label={`Usage (${source.unit})`}>
          <input
            type="number"
            value={activityData}
            onChange={(e) => setActivityData(e.target.value)}
            placeholder="e.g., 12,450"
          />
          <div className="tip">
            💡 Tip: Find this on your {source.source_name.toLowerCase()} bill
          </div>
        </FormField>
        
        <FormField label="Period">
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
          <span>to</span>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </FormField>
        
        {activityData && (
          <div className="calculation-preview">
            <strong>Calculated Emissions:</strong>
            <div className="formula">
              {activityData} {source.unit} × {source.emission_factor_value} 
              = {(calculated / 1000).toFixed(3)} tCO2e
            </div>
          </div>
        )}
        
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button 
            onClick={handleSave}
            disabled={!activityData}
            className="primary"
          >
            Save Entry
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

---

## Trend Chart

```tsx
function TrendChart({ 
  data, 
  viewMode 
}: { 
  data: TrendDataPoint[]; 
  viewMode: 'monthly' | 'quarterly';
}) {
  return (
    <div className="trend-chart">
      <h3>Emissions Trend</h3>
      <LineChart
        data={data}
        xKey="period"
        yKey="emissions"
        height={200}
      />
      
      <div className="trend-stats">
        <div className="stat">
          <span className="label">Average</span>
          <span className="value">
            {calculateAverage(data).toFixed(1)} tCO2e/{viewMode === 'monthly' ? 'mo' : 'qtr'}
          </span>
        </div>
        <div className="stat">
          <span className="label">Trend</span>
          <span className={`value ${getTrendDirection(data)}`}>
            {getTrendPercentage(data)}%
          </span>
        </div>
      </div>
    </div>
  );
}
```

---

## Source History Modal

```tsx
function SourceHistoryModal({ 
  source, 
  onClose 
}: { 
  source: EmissionSource; 
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<EmissionEntry[]>([]);
  
  useEffect(() => {
    loadEntriesForSource(source.id).then(setEntries);
  }, [source.id]);
  
  return (
    <Modal onClose={onClose} size="large">
      <div className="source-history">
        <h3>{source.source_name} — Entry History</h3>
        
        <table className="history-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Usage ({source.unit})</th>
              <th>Emissions (tCO2e)</th>
              <th>Added By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <tr key={entry.id}>
                <td>
                  {formatDate(entry.period_start)} - {formatDate(entry.period_end)}
                </td>
                <td>{entry.activity_data.toLocaleString()}</td>
                <td>{(entry.calculated_emissions_kgco2e / 1000).toFixed(3)}</td>
                <td>{entry.created_by_name}</td>
                <td>
                  <button onClick={() => editEntry(entry.id)}>Edit</button>
                  <button onClick={() => deleteEntry(entry.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <button className="close-button" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
```

---

## Year-over-Year Comparison

```tsx
function YearOverYearComparison({ 
  currentYear, 
  previousYear 
}: { 
  currentYear: number; 
  previousYear: number;
}) {
  const [current, setCurrent] = useState<number>(0);
  const [previous, setPrevious] = useState<number>(0);
  
  useEffect(() => {
    loadYearTotal(currentYear).then(setCurrent);
    loadYearTotal(previousYear).then(setPrevious);
  }, [currentYear, previousYear]);
  
  const change = ((current - previous) / previous) * 100;
  const improved = change < 0;
  
  return (
    <div className="yoy-comparison">
      <h3>Year-over-Year Comparison</h3>
      
      <div className="comparison-bars">
        <div className="year-bar">
          <span className="label">{previousYear}</span>
          <div className="bar" style={{ width: '100%' }}>
            {previous.toFixed(1)} tCO2e
          </div>
        </div>
        <div className="year-bar">
          <span className="label">{currentYear}</span>
          <div 
            className="bar" 
            style={{ width: `${(current / previous) * 100}%` }}
          >
            {current.toFixed(1)} tCO2e
          </div>
        </div>
      </div>
      
      <div className={`change-indicator ${improved ? 'positive' : 'negative'}`}>
        {improved ? '📉' : '📈'} 
        {improved ? 'Reduced' : 'Increased'} by {Math.abs(change).toFixed(1)}%
      </div>
      
      {improved && (
        <div className="celebration">
          🎉 Great work! You've reduced emissions by {(previous - current).toFixed(1)} tCO2e
        </div>
      )}
    </div>
  );
}
```

---

## Bulk Excel Upload

```tsx
function BulkUploadModal({ 
  sources, 
  onClose 
}: { 
  sources: EmissionSource[]; 
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  
  const handleFileSelect = async (file: File) => {
    setFile(file);
    const parsed = await parseExcelFile(file);
    setPreview(parsed);
  };
  
  const handleUpload = async () => {
    const results = await bulkCreateEntries(preview);
    showResults(results);
    onClose();
  };
  
  return (
    <Modal onClose={onClose} size="large">
      <div className="bulk-upload">
        <h3>Bulk Upload Emissions Data</h3>
        
        <div className="download-template">
          <p>Download template with your emission sources:</p>
          <button onClick={() => downloadTemplate(sources)}>
            📥 Download Template
          </button>
        </div>
        
        <div className="upload-area">
          <input 
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
        </div>
        
        {preview.length > 0 && (
          <>
            <div className="preview">
              <h4>Preview ({preview.length} entries)</h4>
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Period</th>
                    <th>Usage</th>
                    <th>Emissions</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 5).map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.source_name}</td>
                      <td>{row.period}</td>
                      <td>{row.usage} {row.unit}</td>
                      <td>{row.emissions} tCO2e</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 5 && (
                <p>... and {preview.length - 5} more</p>
              )}
            </div>
            
            <button 
              className="upload-button"
              onClick={handleUpload}
            >
              Upload {preview.length} Entries
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
```

---

## Acceptance Criteria

- [ ] Dashboard shows YTD summary
- [ ] Trend chart displays monthly/quarterly data
- [ ] Quick-add button opens modal
- [ ] Modal pre-fills current month dates
- [ ] Calculate emissions automatically
- [ ] Save entry updates source "last entry" date
- [ ] Source list shows last entry per source
- [ ] View History shows all entries for source
- [ ] Year-over-year comparison when 2+ years data
- [ ] Bulk upload validates and creates entries
- [ ] Excel template includes all user sources

---

## Files to Create

### Components:
- `components/carbon/CarbonDashboard.tsx`
- `components/carbon/dashboard/SummaryCard.tsx`
- `components/carbon/dashboard/TrendChart.tsx`
- `components/carbon/dashboard/QuickAddModal.tsx`
- `components/carbon/dashboard/SourceHistoryModal.tsx`
- `components/carbon/dashboard/YearOverYearComparison.tsx`
- `components/carbon/dashboard/BulkUploadModal.tsx`

### Services:
- `services/carbonService.ts`
  - `loadSources()`
  - `loadEntries(year)`
  - `createEmissionEntry()`
  - `calculateSummary()`
  - `calculateTrend()`
  - `bulkCreateEntries()`

### Routing:
- `pages/carbon/dashboard.tsx`

---

## Testing Checklist

- [ ] Add electricity entry → saves successfully
- [ ] View History → shows all past entries
- [ ] Trend chart → renders correctly
- [ ] YoY comparison → calculates % change
- [ ] Bulk upload → processes 50 entries
- [ ] Mobile responsive

---

## Related Issues

- Depends on: #11 (Wizard baseline)
- Feeds into: Statement generation (includes footprint)
