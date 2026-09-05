/**
 * CarbonWizard.tsx — Gamified "Carbon Quest" onboarding wizard
 *
 * 5 phases:
 *   welcome → mission1 (Scope 2) → mission2 (Scope 1) → mission3 (Scope 3, optional) → review
 *
 * Saves emission_sources + emission_entries via emissionFactorService.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Zap, Car, Package, Trophy, ChevronRight, Check, X,
  Loader2, Sparkles, ArrowRight, Info, RefreshCw, Leaf,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip as RechartTooltip, ResponsiveContainer, Legend } from 'recharts';
import { CompanyProfile, SustainabilityBusinessModel } from '../types';
import {
  getBestEmissionFactor,
  upsertEmissionSource,
  upsertEmissionEntry,
  calculateEmissions,
} from '../services/emissionFactorService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Phase = 'welcome' | 'mission1' | 'mission2' | 'mission3' | 'review';

interface Scope1Entry {
  sourceId: string;
  sourceName: string;
  fuelType: string;
  unit: string;
  activityData: number;
  kgco2e: number;
}

interface WizardData {
  scope2KWh: number;
  scope2Kgco2e: number;
  scope1Entries: Scope1Entry[];
  scope3Kgco2e: number;
  scope3Done: boolean;
}

const SCOPE1_SOURCES = [
  {
    id: 'vehicles',
    label: 'Company Vehicles',
    icon: '🚗',
    fuels: ['Gasoline', 'Diesel', 'LPG'],
    unit: 'L',
    hint: 'Check fuel receipts or driver logs',
  },
  {
    id: 'generator',
    label: 'Backup Generator',
    icon: '⚡',
    fuels: ['Diesel', 'Natural Gas'],
    unit: 'L',
    hint: 'Monthly fuel fill-up records',
  },
  {
    id: 'boiler',
    label: 'Boiler / Heating',
    icon: '🔥',
    fuels: ['Natural Gas', 'LPG', 'Fuel Oil'],
    unit: 'm3',
    hint: 'Monthly gas bill in m³',
  },
  {
    id: 'forklift',
    label: 'Forklifts / Heavy Equipment',
    icon: '🏗️',
    fuels: ['LPG', 'Diesel'],
    unit: 'kg',
    hint: 'LPG cylinder count × avg weight',
  },
] as const;

type Scope1SourceId = typeof SCOPE1_SOURCES[number]['id'];

const SCOPE3_CATEGORIES = [
  { id: 'transport', label: 'Upstream Transport', factor: 0.163, unit: 'tonne.km', icon: '🚚' },
  { id: 'waste',     label: 'Waste to Landfill',  factor: 0.467, unit: 'tonne',    icon: '🗑️' },
  { id: 'travel',   label: 'Business Air Travel', factor: 0.602, unit: 'tonne.km', icon: '✈️' },
];

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b'];

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  orgId: string;
  currentUserId: string;
  profile: CompanyProfile;
  bmcData: SustainabilityBusinessModel;
  onComplete: () => void;
  onSkip: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main wizard
// ─────────────────────────────────────────────────────────────────────────────

const CarbonWizard: React.FC<Props> = ({
  orgId, currentUserId, profile, bmcData, onComplete, onSkip,
}) => {
  const [phase, setPhase] = useState<Phase>('welcome');
  const [wizardData, setWizardData] = useState<WizardData>({
    scope2KWh: 0,
    scope2Kgco2e: 0,
    scope1Entries: [],
    scope3Kgco2e: 0,
    scope3Done: false,
  });
  const [celebration, setCelebration] = useState<{ title: string; analogy: string } | null>(null);

  const country = profile.addressCountry || 'Global';

  const phaseIndex = ['welcome', 'mission1', 'mission2', 'mission3', 'review'].indexOf(phase);
  const progressPct = (phaseIndex / 4) * 100;

  const showCelebration = (title: string, analogy: string) => {
    setCelebration({ title, analogy });
    setTimeout(() => setCelebration(null), 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 md:p-8 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🌍</span>
          <span className="font-bold text-white text-lg">Carbon Quest</span>
        </div>
        {phase !== 'review' && (
          <button
            onClick={onSkip}
            className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Skip to Dashboard
          </button>
        )}
      </div>

      {/* Progress bar (hidden on welcome) */}
      {phase !== 'welcome' && (
        <div className="mb-8 space-y-1">
          <div className="flex justify-between text-xs text-slate-400 mb-1 px-0.5">
            <span>Mission Progress</span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 px-0.5">
            {['Welcome', 'Scope 2', 'Scope 1', 'Scope 3', 'Review'].map((label, i) => (
              <span key={label} className={i <= phaseIndex ? 'text-indigo-400 font-medium' : ''}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Phase content */}
      <div className="flex-1 max-w-2xl mx-auto w-full">
        {phase === 'welcome' && (
          <WelcomePhase onStart={() => setPhase('mission1')} onSkip={onSkip} />
        )}
        {phase === 'mission1' && (
          <Mission1Phase
            country={country}
            orgId={orgId}
            currentUserId={currentUserId}
            onComplete={(kWh, kgco2e) => {
              setWizardData(d => ({ ...d, scope2KWh: kWh, scope2Kgco2e: kgco2e }));
              showCelebration(
                '⚡ Mission 1 Complete!',
                `${(kgco2e / 1000).toFixed(1)} tCO2e mapped — that's ${Math.round(kgco2e / 0.21)} km driven!`,
              );
              setTimeout(() => setPhase('mission2'), 3200);
            }}
          />
        )}
        {phase === 'mission2' && (
          <Mission2Phase
            country={country}
            orgId={orgId}
            currentUserId={currentUserId}
            bmcData={bmcData}
            onComplete={(entries) => {
              setWizardData(d => ({ ...d, scope1Entries: entries }));
              showCelebration(
                '🚗 Mission 2 Complete!',
                `${entries.length} Scope 1 source${entries.length !== 1 ? 's' : ''} mapped!`,
              );
              setTimeout(() => setPhase('mission3'), 3200);
            }}
          />
        )}
        {phase === 'mission3' && (
          <Mission3Phase
            orgId={orgId}
            currentUserId={currentUserId}
            onComplete={(kgco2e) => {
              setWizardData(d => ({ ...d, scope3Kgco2e: kgco2e, scope3Done: true }));
              showCelebration('🏆 Overachiever!', 'Scope 3 mapped — you\'re ahead of the curve!');
              setTimeout(() => setPhase('review'), 3200);
            }}
            onSkip={() => setPhase('review')}
          />
        )}
        {phase === 'review' && (
          <ReviewPhase
            wizardData={wizardData}
            onPublish={onComplete}
          />
        )}
      </div>

      {/* Celebration overlay */}
      {celebration && createPortal(
        <CelebrationModal title={celebration.title} analogy={celebration.analogy} />,
        document.body,
      )}
    </div>
  );
};

export default CarbonWizard;

// ─────────────────────────────────────────────────────────────────────────────
// Welcome Phase
// ─────────────────────────────────────────────────────────────────────────────

const WelcomePhase: React.FC<{ onStart: () => void; onSkip: () => void }> = ({ onStart, onSkip }) => (
  <div className="space-y-8 animate-in fade-in duration-500">
    <div className="text-center">
      <div className="text-6xl mb-4">🌍</div>
      <h1 className="text-3xl font-bold text-white mb-3">Welcome to Carbon Quest!</h1>
      <p className="text-slate-300 text-lg max-w-md mx-auto">
        Map your organisation's carbon footprint in 3 guided missions.
        Start with the easiest and build confidence as you go.
      </p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[
        { icon: '⚡', mission: 'Mission 1', scope: 'Scope 2', desc: 'Electricity usage', time: '~5 min', optional: false },
        { icon: '🚗', mission: 'Mission 2', scope: 'Scope 1', desc: 'Direct emissions', time: '~8 min', optional: false },
        { icon: '📦', mission: 'Mission 3', scope: 'Scope 3', desc: 'Supply chain', time: '~5 min', optional: true },
      ].map(m => (
        <div key={m.scope} className="bg-white/5 rounded-2xl p-5 border border-white/10 relative">
          {m.optional && (
            <span className="absolute -top-2 -right-2 bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
              BONUS
            </span>
          )}
          <div className="text-3xl mb-3">{m.icon}</div>
          <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">{m.mission}</div>
          <div className="font-bold text-white">{m.scope}</div>
          <div className="text-slate-400 text-sm mt-1">{m.desc}</div>
          <div className="text-slate-500 text-xs mt-2">{m.time}</div>
        </div>
      ))}
    </div>

    <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl p-4">
      <div className="text-emerald-400 font-semibold mb-2">Why does this matter?</div>
      <ul className="space-y-1 text-sm text-emerald-200">
        <li className="flex items-center gap-2"><Check className="w-3 h-3 flex-shrink-0" /> ESRS E1 requires a baseline GHG inventory</li>
        <li className="flex items-center gap-2"><Check className="w-3 h-3 flex-shrink-0" /> Identify quick-win cost savings</li>
        <li className="flex items-center gap-2"><Check className="w-3 h-3 flex-shrink-0" /> Prepare for future carbon pricing</li>
        <li className="flex items-center gap-2"><Check className="w-3 h-3 flex-shrink-0" /> Demonstrate climate commitment to customers</li>
      </ul>
    </div>

    <div className="flex flex-col sm:flex-row gap-3">
      <button
        onClick={onStart}
        className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold rounded-xl transition-all text-lg shadow-lg shadow-indigo-900/40"
      >
        Start Mission 1 <ArrowRight className="w-5 h-5" />
      </button>
      <button
        onClick={onSkip}
        className="px-6 py-3 border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 rounded-xl transition-colors text-sm"
      >
        Skip — I already have data
      </button>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Mission 1 — Scope 2 (Electricity)
// ─────────────────────────────────────────────────────────────────────────────

const Mission1Phase: React.FC<{
  country: string;
  orgId: string;
  currentUserId: string;
  onComplete: (kWh: number, kgco2e: number) => void;
}> = ({ country, orgId, currentUserId, onComplete }) => {
  const [kWh, setKWh] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [saving, setSaving] = useState(false);
  const [factor, setFactor] = useState<number | null>(null);
  const [factorSource, setFactorSource] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getBestEmissionFactor('Grid Electricity', 'kWh', country)
      .then(f => {
        if (f) { setFactor(f.kgco2e_per_unit); setFactorSource(`${f.source} (${f.region})`); }
        else { setFactor(0.475); setFactorSource('IEA 2021 (Global)'); }
      })
      .catch(() => { setFactor(0.475); setFactorSource('IEA 2021 (Global)'); });
  }, [country]);

  const annualKWh = kWh
    ? (period === 'monthly' ? Number(kWh) * 12 : Number(kWh))
    : 0;
  const kgco2e = factor ? calculateEmissions(annualKWh, factor) : 0;

  const handleSave = async () => {
    const val = Number(kWh);
    if (!val || val <= 0) { setError('Please enter a valid kWh value.'); return; }
    setSaving(true);
    setError('');
    try {
      const source = await upsertEmissionSource(orgId, {
        scope: '2',
        source_name: 'Grid Electricity',
        fuel_type: 'Grid Electricity',
        unit: 'kWh',
        emission_factor_value: factor ?? 0.475,
        emission_factor_source: factorSource,
      });
      const periodStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
      const periodEnd   = new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10);
      await upsertEmissionEntry(orgId, {
        source_id: source.id,
        period_start: periodStart,
        period_end: periodEnd,
        // Annualised from a typical period, not a measurement for this year.
        basis: 'estimate',
        activity_data: annualKWh,
        calculated_emissions_kgco2e: kgco2e,
        notes: `Wizard entry: ${period === 'monthly' ? `${kWh} kWh/month × 12` : `${kWh} kWh/year`}`,
      }, currentUserId);
      onComplete(annualKWh, kgco2e);
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <MissionHeader icon="⚡" title="Mission 1: Scope 2 — Electricity" step={1} />

      <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 text-sm text-blue-200">
        <strong>Why start here?</strong> Electricity is the easiest data to find — it's on your monthly bill.
        For most SMEs it covers 40–60% of the total footprint.
      </div>

      <div className="bg-white/5 rounded-2xl p-6 border border-white/10 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Electricity consumption period</label>
          <div className="flex gap-2">
            {(['monthly', 'annual'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
                }`}
              >
                {p === 'monthly' ? '📅 Monthly average' : '📆 Annual total'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            kWh usage {period === 'monthly' ? 'per month' : 'per year'}
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={kWh}
              onChange={e => { setKWh(e.target.value); setError(''); }}
              placeholder={period === 'monthly' ? 'e.g. 12450' : 'e.g. 149400'}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="self-center text-slate-400 text-sm">kWh</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Find this on your electricity bill under "Total Units" or "kWh consumed"</p>
        </div>

        {factor !== null && annualKWh > 0 && (
          <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-4 space-y-2">
            <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wide">Calculation preview</div>
            <div className="text-white text-sm font-mono">
              {annualKWh.toLocaleString()} kWh × {factor} kgCO₂e/kWh
              = <span className="text-emerald-300 font-bold">{(kgco2e / 1000).toFixed(2)} tCO₂e/year</span>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <Info className="w-3 h-3" /> Factor: {factorSource}
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleSave}
          disabled={!kWh || !factor || saving}
          className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold rounded-xl transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Complete Mission 1'}
        </button>
      </div>

      <AICopilotBubble messages={[
        `💡 Most SMEs in ${country || 'this region'} use 8,000–15,000 kWh/month.`,
        '🔆 LED lighting swap can cut electricity 20–30%.',
        '☀️ Solar panels offer 6–8 year payback in tropical climates.',
      ]} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Mission 2 — Scope 1 (Direct Emissions)
// ─────────────────────────────────────────────────────────────────────────────

const Mission2Phase: React.FC<{
  country: string;
  orgId: string;
  currentUserId: string;
  bmcData: SustainabilityBusinessModel;
  onComplete: (entries: Scope1Entry[]) => void;
}> = ({ country, orgId, currentUserId, onComplete }) => {
  const [selected, setSelected] = useState<Set<Scope1SourceId>>(new Set(['vehicles']));
  const [step, setStep] = useState<'select' | Scope1SourceId>('select');
  const [entries, setEntries] = useState<Scope1Entry[]>([]);
  const remaining = [...selected].filter(id => !entries.find(e => e.sourceId === id));

  const handleEntryDone = (entry: Scope1Entry) => {
    const next = [...entries, entry];
    setEntries(next);
    const nextSource = [...selected].find(id => !next.find(e => e.sourceId === id));
    if (nextSource) setStep(nextSource as Scope1SourceId);
    else onComplete(next);
  };

  if (step === 'select') {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <MissionHeader icon="🚗" title="Mission 2: Scope 1 — Direct Emissions" step={2} />
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4 text-sm text-amber-200">
          <strong>🤖 AI Insight:</strong> Select the emission sources that apply to your organisation.
          You can always add more later from the Carbon Dashboard.
        </div>

        <div className="space-y-3">
          {SCOPE1_SOURCES.map(src => {
            const checked = selected.has(src.id);
            return (
              <button
                key={src.id}
                onClick={() => setSelected(prev => {
                  const next = new Set(prev);
                  checked ? next.delete(src.id) : next.add(src.id);
                  return next;
                })}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                  checked
                    ? 'bg-indigo-900/30 border-indigo-500/50 text-white'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-500'
                }`}>
                  {checked && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-2xl">{src.icon}</span>
                <div className="flex-1 text-left">
                  <div className="font-medium">{src.label}</div>
                  <div className="text-xs text-slate-500">{src.hint}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onComplete([])}
            className="px-5 py-2.5 border border-slate-600 text-slate-400 hover:text-white rounded-xl text-sm transition-colors"
          >
            Skip Scope 1
          </button>
          <button
            onClick={() => setStep([...selected][0] as Scope1SourceId)}
            disabled={selected.size === 0}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold rounded-xl transition-colors"
          >
            Enter data for {selected.size} source{selected.size !== 1 ? 's' : ''} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const src = SCOPE1_SOURCES.find(s => s.id === step)!;
  const doneCount = entries.length;
  const totalCount = selected.size;

  return (
    <Scope1SourceForm
      key={step}
      source={src}
      doneCount={doneCount}
      totalCount={totalCount}
      country={country}
      orgId={orgId}
      currentUserId={currentUserId}
      onDone={handleEntryDone}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Scope 1 sub-form
// ─────────────────────────────────────────────────────────────────────────────

const Scope1SourceForm: React.FC<{
  source: typeof SCOPE1_SOURCES[number];
  doneCount: number;
  totalCount: number;
  country: string;
  orgId: string;
  currentUserId: string;
  onDone: (entry: Scope1Entry) => void;
}> = ({ source, doneCount, totalCount, country, orgId, currentUserId, onDone }) => {
  const [fuelType, setFuelType] = useState(source.fuels[0]);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState(source.unit);
  const [period, setPeriod] = useState<'monthly' | 'annual'>('annual');
  const [idNumber, setIdNumber] = useState('');
  const [assetNumber, setAssetNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const annual = amount ? (period === 'monthly' ? Number(amount) * 12 : Number(amount)) : 0;

  const handleSave = async () => {
    const val = Number(amount);
    if (!val || val <= 0) { setError('Please enter a valid amount.'); return; }
    setSaving(true);
    setError('');
    try {
      const factor = await getBestEmissionFactor(fuelType, unit, country);
      const efValue = factor?.kgco2e_per_unit ?? 2.5;
      const kgco2e = calculateEmissions(annual, efValue);

      const dbSource = await upsertEmissionSource(orgId, {
        scope: '1',
        source_name: source.label,
        fuel_type: fuelType,
        unit,
        emission_factor_value: efValue,
        emission_factor_source: factor ? `${factor.source} (${factor.region})` : 'Estimated',
        identification_number: idNumber || null,
        asset_number: assetNumber || null,
      });
      const periodStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
      const periodEnd   = new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10);
      await upsertEmissionEntry(orgId, {
        source_id: dbSource.id,
        period_start: periodStart,
        period_end: periodEnd,
        // Annualised from a typical period, not a measurement for this year.
        basis: 'estimate',
        activity_data: annual,
        calculated_emissions_kgco2e: kgco2e,
        notes: `Wizard entry — ${source.label}`,
      }, currentUserId);

      onDone({ sourceId: source.id, sourceName: source.label, fuelType, unit, activityData: annual, kgco2e });
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-2">
        <MissionBadge step={2} />
        <div>
          <div className="text-white font-bold text-lg">{source.icon} {source.label}</div>
          <div className="text-slate-400 text-sm">Source {doneCount + 1} of {totalCount}</div>
        </div>
        <div className="ml-auto">
          <div className="flex gap-1">
            {Array.from({ length: totalCount }).map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i < doneCount ? 'bg-emerald-500' : i === doneCount ? 'bg-indigo-500' : 'bg-slate-600'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white/5 rounded-2xl p-6 border border-white/10 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Identification No.</label>
            <input
              type="text"
              value={idNumber}
              onChange={e => setIdNumber(e.target.value)}
              placeholder="e.g. Car Reg or S/N"
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Asset No. (Optional)</label>
            <input
              type="text"
              value={assetNumber}
              onChange={e => setAssetNumber(e.target.value)}
              placeholder="e.g. ASSET-001"
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Fuel type</label>
          <select
            value={fuelType}
            onChange={e => setFuelType(e.target.value)}
            className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {source.fuels.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div className="flex gap-2">
          {(['annual', 'monthly'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              {p === 'annual' ? '📆 Annual' : '📅 Monthly ×12'}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Consumption ({period === 'monthly' ? 'per month' : 'per year'})
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(''); }}
              placeholder="e.g. 850"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={unit}
              onChange={e => setUnit(e.target.value)}
              className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none"
            >
              <option value="L">L</option>
              <option value="kg">kg</option>
              <option value="m3">m³</option>
            </select>
          </div>
          <p className="text-xs text-slate-500 mt-1">{source.hint}</p>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleSave}
          disabled={!amount || saving}
          className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold rounded-xl transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Car className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save & Continue'}
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Mission 3 — Scope 3 (Optional)
// ─────────────────────────────────────────────────────────────────────────────

const Mission3Phase: React.FC<{
  orgId: string;
  currentUserId: string;
  onComplete: (kgco2e: number) => void;
  onSkip: () => void;
}> = ({ orgId, currentUserId, onComplete, onSkip }) => {
  const [accepted, setAccepted] = useState(false);
  const [category, setCategory] = useState(SCOPE3_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const kgco2e = amount ? calculateEmissions(Number(amount), category.factor) : 0;

  const handleSave = async () => {
    const val = Number(amount);
    if (!val || val <= 0) { setError('Please enter a valid amount.'); return; }
    setSaving(true);
    setError('');
    try {
      const source = await upsertEmissionSource(orgId, {
        scope: '3',
        source_name: category.label,
        fuel_type: null,
        unit: category.unit,
        emission_factor_value: category.factor,
        emission_factor_source: 'IPCC 2021',
      });
      const periodStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
      const periodEnd   = new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10);
      await upsertEmissionEntry(orgId, {
        source_id: source.id,
        period_start: periodStart,
        period_end: periodEnd,
        // Annualised from a typical period, not a measurement for this year.
        basis: 'estimate',
        activity_data: val,
        calculated_emissions_kgco2e: kgco2e,
        notes: 'Wizard entry — Scope 3',
      }, currentUserId);
      onComplete(kgco2e);
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <MissionHeader icon="📦" title="Mission 3: Scope 3 — Supply Chain" step={3} badge="BONUS" />

      {!accepted ? (
        <>
          <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-5 space-y-3">
            <p className="text-amber-200 text-sm">
              <strong>Good news:</strong> Scope 3 is <em>not</em> required for ESRS minimum compliance.
              This is a bonus mission for overachievers! 🏆
            </p>
            <p className="text-slate-300 text-sm">
              Scope 3 = emissions from your supply chain (transport, materials, waste).
              Usually the largest share but hardest to measure precisely.
            </p>
          </div>

          <div className="bg-indigo-900/20 border border-indigo-700/30 rounded-xl p-4 text-sm text-indigo-200">
            <strong>🤖 Recommendation:</strong> Start with <strong>Upstream Transport</strong> — the most common
            Scope 3 category for goods-based businesses.
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onSkip}
              className="flex-1 py-3 border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 rounded-xl text-sm font-medium transition-colors"
            >
              Skip — add later from Dashboard
            </button>
            <button
              onClick={() => setAccepted(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-colors"
            >
              <Trophy className="w-4 h-4" /> Accept Bonus Mission
            </button>
          </div>

          <p className="text-xs text-slate-500 text-center">
            💡 Most SMEs skip Scope 3 initially and add it after mastering Scope 1+2 tracking.
          </p>
        </>
      ) : (
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Scope 3 category</label>
            <div className="space-y-2">
              {SCOPE3_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    category.id === cat.id
                      ? 'bg-indigo-900/30 border-indigo-500/50 text-white'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
                  }`}
                >
                  <span className="text-xl">{cat.icon}</span>
                  <div className="text-left">
                    <div className="font-medium text-sm">{cat.label}</div>
                    <div className="text-xs text-slate-500">{cat.factor} kgCO₂e per {cat.unit}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Annual volume ({category.unit})
            </label>
            <input
              type="number"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(''); }}
              placeholder="e.g. 5000"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {amount && Number(amount) > 0 && (
            <div className="text-emerald-300 text-sm font-mono bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-3">
              ≈ <strong>{(kgco2e / 1000).toFixed(2)} tCO₂e/year</strong>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleSave}
            disabled={!amount || saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold rounded-xl transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Complete Bonus Mission'}
          </button>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Review / Boss Level
// ─────────────────────────────────────────────────────────────────────────────

const ReviewPhase: React.FC<{
  wizardData: WizardData;
  onPublish: () => void;
}> = ({ wizardData, onPublish }) => {
  const { scope2Kgco2e, scope1Entries, scope3Kgco2e, scope3Done } = wizardData;
  const scope1Total = scope1Entries.reduce((s, e) => s + e.kgco2e, 0);
  const totalKgco2e = scope2Kgco2e + scope1Total + scope3Kgco2e;
  const totalTco2e = totalKgco2e / 1000;

  const pieData = [
    { name: 'Scope 1', value: Math.round(scope1Total / 1000 * 100) / 100 },
    { name: 'Scope 2', value: Math.round(scope2Kgco2e / 1000 * 100) / 100 },
    ...(scope3Kgco2e > 0 ? [{ name: 'Scope 3', value: Math.round(scope3Kgco2e / 1000 * 100) / 100 }] : []),
  ].filter(d => d.value > 0);

  const biggestScope = scope2Kgco2e >= scope1Total ? 'Scope 2 (Electricity)' : 'Scope 1 (Direct)';

  const badges = [
    '⚡ Scope 2 Master',
    scope1Entries.length > 0 && '🚗 Scope 1 Complete',
    scope3Done && '🏆 Overachiever',
    '📊 Carbon Accountant',
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="text-center py-4">
        <div className="text-5xl mb-3">🎉</div>
        <h2 className="text-2xl font-bold text-white">Carbon Quest Complete!</h2>
        <p className="text-slate-300 mt-1">You've mapped your organisation's carbon footprint.</p>
      </div>

      {/* Total card */}
      <div className="bg-gradient-to-br from-indigo-900/50 to-emerald-900/50 border border-indigo-500/30 rounded-2xl p-6 text-center">
        <div className="text-4xl font-bold text-white">{totalTco2e.toFixed(1)}</div>
        <div className="text-slate-300 text-lg">tCO₂e / year</div>
        <div className="text-slate-500 text-sm mt-1">Total GHG Footprint</div>
      </div>

      {/* Pie chart */}
      {pieData.length > 0 && (
        <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
          <div className="text-sm font-medium text-slate-300 mb-4">Breakdown by Scope</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}t`}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <RechartTooltip formatter={(v: any) => [`${v} tCO₂e`, '']} contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#fff' }} />
              <Legend formatter={(v) => <span className="text-slate-300 text-xs">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* AI insight */}
      <div className="bg-indigo-900/20 border border-indigo-700/30 rounded-xl p-4">
        <div className="flex items-center gap-2 text-indigo-300 font-semibold mb-2">
          <Sparkles className="w-4 h-4" /> AI Insight
        </div>
        <p className="text-slate-300 text-sm">
          Your biggest emission source is <strong>{biggestScope}</strong>.{' '}
          {biggestScope.includes('Scope 2')
            ? 'Quick win: negotiate a renewable energy tariff or add rooftop solar.'
            : 'Quick win: introduce a fuel-efficiency policy for your vehicle fleet.'}
        </p>
      </div>

      {/* Badges */}
      <div>
        <div className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-3">Achievements Unlocked</div>
        <div className="flex flex-wrap gap-2">
          {badges.map(b => (
            <span key={b} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-900/40 border border-indigo-700/50 text-indigo-300 text-sm font-medium rounded-full">
              {b}
            </span>
          ))}
        </div>
      </div>

      {/* Next steps */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-4 text-sm space-y-2">
        <div className="text-slate-300 font-semibold mb-1">What's next?</div>
        {[
          'Monthly tracking in Carbon Dashboard',
          'Set reduction targets in the KPI Dashboard',
          'Include your footprint in the Sustainability Statement',
        ].map(step => (
          <div key={step} className="flex items-center gap-2 text-slate-400">
            <ChevronRight className="w-3 h-3 text-indigo-400 flex-shrink-0" />
            {step}
          </div>
        ))}
      </div>

      <button
        onClick={onPublish}
        className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-900/40 text-lg"
      >
        <Leaf className="w-5 h-5" /> Go to Carbon Dashboard
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

const MissionBadge: React.FC<{ step: number }> = ({ step }) => (
  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
    {step}
  </div>
);

const MissionHeader: React.FC<{ icon: string; title: string; step: number; badge?: string }> = ({ icon, title, step, badge }) => (
  <div className="flex items-center gap-3">
    <MissionBadge step={step} />
    <div className="flex-1">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {badge && (
          <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-400 text-amber-900 rounded-full">{badge}</span>
        )}
      </div>
    </div>
  </div>
);

const AICopilotBubble: React.FC<{ messages: string[] }> = ({ messages }) => {
  const [idx, setIdx] = useState(0);
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1">
        <div className="text-xs text-indigo-400 font-medium mb-1">AI Copilot</div>
        <p className="text-slate-300 text-sm">{messages[idx]}</p>
        {messages.length > 1 && (
          <button
            onClick={() => setIdx(i => (i + 1) % messages.length)}
            className="mt-2 text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Next tip
          </button>
        )}
      </div>
    </div>
  );
};

const CelebrationModal: React.FC<{ title: string; analogy: string }> = ({ title, analogy }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
    <div className="bg-gradient-to-br from-indigo-900 to-emerald-900 border border-indigo-500/50 rounded-2xl p-8 text-center shadow-2xl max-w-sm mx-4 animate-in zoom-in duration-300">
      <div className="text-5xl mb-3">🏆</div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-slate-300 text-sm">{analogy}</p>
    </div>
  </div>
);
