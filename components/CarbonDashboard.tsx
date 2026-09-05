/**
 * CarbonDashboard.tsx — Recurring emission entry & trend tracking
 *
 * Features:
 * - YTD summary (Scope 1/2/3 totals)
 * - Monthly trend chart (recharts AreaChart)
 * - Quick-add modal per source (<1 min entry)
 * - Source list with last-entry date + history modal
 * - Year-over-year comparison (when 2+ years of data exist)
 * - Bulk Excel upload
 * - "Run Wizard" shortcut for first-time users
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, RefreshCw, Loader2, X, History, Trash2, Upload, Pencil,
  Download, ChevronDown, ChevronUp, TrendingDown, TrendingUp,
  Leaf, Zap, Sparkles, AlertCircle, Info,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, BarChart, Bar, Legend, Cell,
} from 'recharts';
import { EmissionSource, EmissionEntry } from '../types';
import {
  buildMonthlyTrend,
  countableForYear,
  entriesForYear,
  overlappingEntries,
  sourcesOnEstimate,
} from '../services/carbonAggregation';
import {
  fetchEmissionSources,
  fetchEmissionEntries,
  upsertEmissionSource,
  upsertEmissionEntry,
  deleteEmissionEntry,
  calculateEmissions,
  deleteEmissionSource,
} from '../services/emissionFactorService';
import { downloadSpreadsheet, parseSpreadsheetFile } from '../services/spreadsheetService';
import EvidenceBadge from './EvidenceBadge';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SCOPE_COLORS: Record<string, string> = {
  '1': '#f59e0b',
  '2': '#6366f1',
  '3': '#10b981',
};

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtTco2e(kg: number) {
  return (kg / 1000).toFixed(2);
}

function periodLabel(start: string): string {
  const d = new Date(start);
  return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

function startOfYear(year: number) { return `${year}-01-01`; }
function endOfYear(year: number)   { return `${year}-12-31`; }

function lastEntry(entries: EmissionEntry[], sourceId: string): EmissionEntry | null {
  const es = entries.filter(e => e.source_id === sourceId).sort(
    (a, b) => new Date(b.period_start).getTime() - new Date(a.period_start).getTime(),
  );
  return es[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  orgId: string;
  currentUserId: string;
  onRunWizard: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────

const CarbonDashboard: React.FC<Props> = ({ orgId, currentUserId, onRunWizard }) => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [sources, setSources] = useState<EmissionSource[]>([]);
  const [entries, setEntries] = useState<EmissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSource, setAddSource] = useState<EmissionSource | null>(null);
  const [historySource, setHistorySource] = useState<EmissionSource | null>(null);
  const [editSource, setEditSource] = useState<EmissionSource | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [srcs, ents] = await Promise.all([
        fetchEmissionSources(orgId),
        fetchEmissionEntries(orgId),
      ]);
      setSources(srcs);
      setEntries(ents);
    } catch (e) {
      console.error('CarbonDashboard load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const handleDeleteSource = async (source: EmissionSource) => {
    const entriesCount = entries.filter(e => e.source_id === source.id).length;
    let msg = `Are you sure you want to delete "${source.source_name}"?`;
    if (entriesCount > 0) {
      msg += `\nThis will also delete ${entriesCount} history entries tied to it!`;
    }
    if (!window.confirm(msg)) return;

    try {
      await deleteEmissionSource(source.id);
      load();
    } catch (e) {
      console.error('Failed to delete source:', e);
    }
  };

  useEffect(() => { load(); }, [load]);

  // ── Derived data ────────────────────────────────────────────────────────
  const scopeOf = Object.fromEntries(sources.map(s => [s.id, s.scope]));
  const yearEntries = entriesForYear(entries, year);
  const countableEntries = countableForYear(entries, year);
  // Sources still carrying an annualised estimate rather than measurements.
  const estimatedSources = sourcesOnEstimate(entries, year);

  const scopeTotals = { '1': 0, '2': 0, '3': 0 };
  for (const e of countableEntries) {
    const sc = scopeOf[e.source_id] ?? '1';
    scopeTotals[sc as keyof typeof scopeTotals] += e.calculated_emissions_kgco2e;
  }
  const grandTotal = scopeTotals['1'] + scopeTotals['2'] + scopeTotals['3'];

  const trendData = buildMonthlyTrend(entries, sources, year);
  const hasData = yearEntries.length > 0;

  // YoY
  const prevYearEntries = countableForYear(entries, year - 1);
  const prevTotal = prevYearEntries.reduce((s, e) => s + e.calculated_emissions_kgco2e, 0);
  const showYoY = prevYearEntries.length > 0 && countableEntries.length > 0;
  const yoyChange = showYoY && prevTotal > 0 ? ((grandTotal - prevTotal) / prevTotal) * 100 : 0;

  // Available years
  const allYears = [...new Set<number>(entries.map(e => new Date(e.period_start).getFullYear()))].sort((a, b) => b - a);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-esg-500" />
      <span className="ml-2 text-slate-500">Loading carbon data…</span>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Leaf className="w-6 h-6 text-emerald-500" /> Carbon Dashboard
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Track and log your GHG emissions over time.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Year selector */}
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none"
          >
            {[...new Set([currentYear, currentYear - 1, ...allYears])].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button onClick={() => setShowBulkUpload(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium rounded-lg transition-colors">
            <Upload className="w-4 h-4" /> Bulk Upload
          </button>
          <button onClick={onRunWizard} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
            <Sparkles className="w-4 h-4" /> Run Wizard
          </button>
          <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── No data state ── */}
      {sources.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50">
          <Leaf className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-4" />
          <p className="font-semibold text-slate-700 dark:text-slate-200">No emission sources yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-5 max-w-xs">
            Complete the Carbon Quest wizard to set up your emission sources and baseline.
          </p>
          <button onClick={onRunWizard} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
            <Sparkles className="w-4 h-4" /> Start Carbon Quest
          </button>
        </div>
      )}

      {sources.length > 0 && (
        <>
          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ScopeCard label="Total" value={grandTotal} color="text-slate-800 dark:text-white" bg="bg-slate-50 dark:bg-slate-800" border="border-slate-200 dark:border-slate-700" />
            {estimatedSources.size > 0 && (
              <div className="sm:col-span-3 flex items-start gap-2 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-800 dark:text-amber-300">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  {estimatedSources.size === 1 ? '1 source is' : `${estimatedSources.size} sources are`}{' '}
                  still an annualised estimate from Carbon Quest. Record a month of actual
                  usage and it replaces the estimate for that source — the total never counts both.
                </span>
              </div>
            )}
            <ScopeCard label="Scope 1 – Direct" value={scopeTotals['1']} color="text-amber-700 dark:text-amber-300" bg="bg-amber-50 dark:bg-amber-900/20" border="border-amber-200 dark:border-amber-800" />
            <ScopeCard label="Scope 2 – Energy" value={scopeTotals['2']} color="text-indigo-700 dark:text-indigo-300" bg="bg-indigo-50 dark:bg-indigo-900/20" border="border-indigo-200 dark:border-indigo-800" />
            <ScopeCard label="Scope 3 – Other" value={scopeTotals['3']} color="text-emerald-700 dark:text-emerald-300" bg="bg-emerald-50 dark:bg-emerald-900/20" border="border-emerald-200 dark:border-emerald-800" />
          </div>

          {/* ── YoY comparison ── */}
          {showYoY && (
            <div className={`flex items-center gap-3 px-5 py-4 rounded-xl border ${yoyChange < 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
              {yoyChange < 0
                ? <TrendingDown className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                : <TrendingUp className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />}
              <div>
                <span className={`font-semibold text-sm ${yoyChange < 0 ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>
                  {yoyChange < 0 ? '📉 Emissions reduced' : '📈 Emissions increased'} {Math.abs(yoyChange).toFixed(1)}% vs {year - 1}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                  ({fmtTco2e(prevTotal)} tCO₂e in {year - 1} → {fmtTco2e(grandTotal)} tCO₂e in {year})
                </span>
              </div>
            </div>
          )}

          {/* ── Trend chart ── */}
          {hasData && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 dark:text-white text-sm">Monthly Emissions — {year}</h3>
                <span className="text-xs text-slate-400">tCO₂e</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-700" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                  <RTooltip formatter={(v: any) => [`${v} tCO₂e`, '']} contentStyle={{ background: 'var(--tw-prose-body, #fff)', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-slate-500">{v}</span>} />
                  <Area type="monotone" dataKey="scope2" stackId="1" stroke={SCOPE_COLORS['2']} fill={SCOPE_COLORS['2']} fillOpacity={0.6} name="Scope 2" />
                  <Area type="monotone" dataKey="scope1" stackId="1" stroke={SCOPE_COLORS['1']} fill={SCOPE_COLORS['1']} fillOpacity={0.6} name="Scope 1" />
                  <Area type="monotone" dataKey="scope3" stackId="1" stroke={SCOPE_COLORS['3']} fill={SCOPE_COLORS['3']} fillOpacity={0.6} name="Scope 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Quick add shortcuts ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {sources.slice(0, 4).map(src => (
              <button
                key={src.id}
                onClick={() => setAddSource(src)}
                className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all group"
              >
                <Plus className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 flex-shrink-0" />
                <span className="truncate">{src.source_name}</span>
              </button>
            ))}
          </div>

          {/* ── Source list ── */}
          <div className="space-y-3">
            <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm uppercase tracking-wide">Emission Sources</h3>
            {sources.map(src => {
              const last = lastEntry(entries, src.id);
              const srcEntries = entries.filter(e => e.source_id === src.id);
              const scopeColor = src.scope === '1' ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                : src.scope === '2' ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
              return (
                <div key={src.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-center gap-4">
                  <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${scopeColor} flex-shrink-0`}>
                    Scope {src.scope}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 dark:text-white text-sm flex items-center gap-2 flex-wrap">
                      {src.source_name}
                      {src.identification_number && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono">
                          ID: {src.identification_number}
                        </span>
                      )}
                      {src.asset_number && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono">
                          Asset: {src.asset_number}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {src.fuel_type && <span>{src.fuel_type} · </span>}
                      {src.emission_factor_value
                        ? <span>{src.emission_factor_value} kgCO₂e/{src.unit}</span>
                        : <span>No factor set</span>}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                    {last
                      ? <>Last: <span className="font-medium text-slate-700 dark:text-slate-300">{periodLabel(last.period_start)}</span> ({last.activity_data.toLocaleString()} {src.unit})</>
                      : 'No entries yet'}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddSource(src)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-medium rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Entry
                    </button>
                    <button
                      onClick={() => setEditSource(src)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-xs font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    {srcEntries.length > 0 && (
                      <button
                        onClick={() => setHistorySource(src)}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-xs font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <History className="w-3 h-3" /> History ({srcEntries.length})
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteSource(src)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 text-xs font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Delete emission source and all its history entries"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {addSource && createPortal(
        <QuickAddModal
          source={addSource}
          existingEntries={entries}
          currentUserId={currentUserId}
          orgId={orgId}
          onClose={() => setAddSource(null)}
          onSaved={() => { setAddSource(null); load(); }}
        />, document.body)}

      {editSource && createPortal(
        <EditSourceModal
          source={editSource}
          orgId={orgId}
          onClose={() => setEditSource(null)}
          onSaved={() => { setEditSource(null); load(); }}
        />, document.body)}

      {historySource && createPortal(
        <HistoryModal
          source={historySource}
          entries={entries.filter(e => e.source_id === historySource.id)}
          orgId={orgId}
          currentUserId={currentUserId}
          onClose={() => setHistorySource(null)}
          onDeleted={() => { setHistorySource(null); load(); }}
          onUpdated={() => { load(); }}
        />, document.body)}

      {showBulkUpload && createPortal(
        <BulkUploadModal
          sources={sources}
          orgId={orgId}
          currentUserId={currentUserId}
          onClose={() => setShowBulkUpload(false)}
          onDone={() => { setShowBulkUpload(false); load(); }}
        />, document.body)}
    </div>
  );
};

export default CarbonDashboard;

// ─────────────────────────────────────────────────────────────────────────────
// Scope summary card
// ─────────────────────────────────────────────────────────────────────────────

const ScopeCard: React.FC<{ label: string; value: number; color: string; bg: string; border: string }> = ({ label, value, color, bg, border }) => (
  <div className={`${bg} rounded-xl border ${border} p-4`}>
    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${color}`}>{fmtTco2e(value)}</p>
    <p className="text-xs text-slate-400 dark:text-slate-500">tCO₂e</p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Edit source modal
// ─────────────────────────────────────────────────────────────────────────────

const EditSourceModal: React.FC<{
  source: EmissionSource;
  orgId: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ source, orgId, onClose, onSaved }) => {
  const [idNumber, setIdNumber] = useState(source.identification_number || '');
  const [assetNumber, setAssetNumber] = useState(source.asset_number || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await upsertEmissionSource(orgId, {
        ...source,
        identification_number: idNumber.trim() || null,
        asset_number: assetNumber.trim() || null,
      });
      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Edit Source — {source.source_name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Scope {source.scope}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Identification No.
            </label>
            <input
              type="text"
              value={idNumber}
              onChange={e => { setIdNumber(e.target.value); setError(''); }}
              placeholder="e.g. Car Reg or S/N"
              className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Asset No. (Optional)
            </label>
            <input
              type="text"
              value={assetNumber}
              onChange={e => { setAssetNumber(e.target.value); setError(''); }}
              placeholder="e.g. ASSET-001"
              className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm font-bold transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Quick-add modal
// ─────────────────────────────────────────────────────────────────────────────

const QuickAddModal: React.FC<{
  source: EmissionSource;
  existingEntries: EmissionEntry[];
  orgId: string;
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ source, existingEntries, orgId, currentUserId, onClose, onSaved }) => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const defaultStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const defaultEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const [amount, setAmount] = useState('');
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [notes, setNotes] = useState('');
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const factor = source.emission_factor_value ?? 0;
  const kgco2e = amount ? calculateEmissions(Number(amount), factor) : 0;

  // A second entry for a period is allowed — corrections and adjustments are
  // real — but it has to be deliberate and it has to say why.
  const overlaps = overlappingEntries(existingEntries, source.id, 'actual', start, end);
  const isDuplicate = overlaps.length > 0;
  const noteRequired = isDuplicate && notes.trim() === '';
  const blocked = isDuplicate && (!confirmedDuplicate || noteRequired);

  const handleSave = async () => {
    if (!amount || Number(amount) <= 0) { setError('Please enter a positive amount.'); return; }
    if (isDuplicate && !confirmedDuplicate) {
      setError('Another entry already covers this period. Confirm below to add this one as well.');
      return;
    }
    if (noteRequired) {
      setError('A note is required when more than one entry covers the same period.');
      return;
    }
    setSaving(true); setError('');
    try {
      await upsertEmissionEntry(orgId, {
        source_id: source.id,
        period_start: start,
        period_end: end,
        activity_data: Number(amount),
        calculated_emissions_kgco2e: kgco2e,
        notes: notes.trim() || null,
      }, currentUserId);
      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Add Entry — {source.source_name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Scope {source.scope} · {source.fuel_type ?? source.unit}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Usage ({source.unit})
            </label>
            <input
              type="number"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(''); }}
              placeholder="e.g. 12450"
              className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Period start</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Period end</label>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          {amount && Number(amount) > 0 && factor > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-sm">
              <span className="text-slate-600 dark:text-slate-300 font-mono">
                {Number(amount).toLocaleString()} {source.unit} × {factor} kgCO₂e/{source.unit} =
              </span>
              <span className="font-bold text-emerald-700 dark:text-emerald-300 ml-1">{fmtTco2e(kgco2e)} tCO₂e</span>
            </div>
          )}

          {isDuplicate && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
              <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    {overlaps.length === 1
                      ? 'An entry already covers this period'
                      : `${overlaps.length} entries already cover this period`}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {overlaps.slice(0, 3).map(o => (
                      <li key={o.id} className="font-mono">
                        {o.period_start} → {o.period_end}: {o.activity_data.toLocaleString()} {source.unit}
                        {o.notes ? ` — ${o.notes}` : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1">
                    Adding another is fine for a correction or adjustment — it will be
                    counted in addition to the entries above, so only continue if that
                    is what you intend.
                  </p>
                </div>
              </div>
              <label className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmedDuplicate}
                  onChange={e => { setConfirmedDuplicate(e.target.checked); setError(''); }}
                  className="mt-0.5 accent-amber-600"
                />
                <span>Yes, add this as an additional entry for the period.</span>
              </label>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {isDuplicate
                ? <>Notes <span className="text-amber-600 dark:text-amber-400">(required — explain why)</span></>
                : 'Notes (optional)'}
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => { setNotes(e.target.value); setError(''); }}
              placeholder={isDuplicate ? 'e.g. correction to Feb reading, second invoice' : 'e.g. Oct 2026 bill'}
              className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 ${
                noteRequired
                  ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                  : 'border-slate-300 dark:border-slate-600 focus:ring-indigo-500'
              }`}
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !amount || blocked}
              title={blocked
                ? (noteRequired
                    ? 'Add a note explaining this additional entry'
                    : 'Confirm that this is an additional entry for the period')
                : undefined}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 disabled:opacity-40 text-white rounded-lg text-sm font-bold transition-colors ${
                isDuplicate ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Saving…' : isDuplicate ? 'Add Anyway' : 'Save Entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// History modal
// ─────────────────────────────────────────────────────────────────────────────

const HistoryModal: React.FC<{
  source: EmissionSource;
  entries: EmissionEntry[];
  orgId: string;
  currentUserId: string;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated?: () => void;
}> = ({ source, entries, orgId, currentUserId, onClose, onDeleted, onUpdated }) => {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editedNote, setEditedNote] = useState('');
  const sorted = [...entries].sort((a, b) => new Date(b.period_start).getTime() - new Date(a.period_start).getTime());

  const handleSaveNote = async (entry: EmissionEntry) => {
    try {
      await upsertEmissionEntry(orgId, {
        ...entry,
        notes: editedNote.trim() || null,
      }, currentUserId);
      setEditingNoteId(null);
      if (onUpdated) onUpdated(); else onDeleted();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try { await deleteEmissionEntry(id, orgId); onDeleted(); }
    catch (e) { console.error(e); setDeleting(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">{source.source_name} — Entry History</h3>
            <p className="text-xs text-slate-500 mt-0.5">{sorted.length} entries</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Period</th>
                <th className="px-4 py-3 text-right font-medium">Usage</th>
                <th className="px-4 py-3 text-right font-medium">tCO₂e</th>
                <th className="px-4 py-3 text-left font-medium">Notes</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {sorted.map(entry => (
                <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200">
                  <td className="px-4 py-3">{periodLabel(entry.period_start)}</td>
                  <td className="px-4 py-3 text-right font-mono">{entry.activity_data.toLocaleString()} {source.unit}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">{fmtTco2e(entry.calculated_emissions_kgco2e)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {editingNoteId === entry.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editedNote}
                          onChange={e => setEditedNote(e.target.value)}
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveNote(entry)}
                          className="p-1 text-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-400"
                          title="Save note"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingNoteId(null)}
                          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between group">
                        <span>{entry.notes ?? '—'}</span>
                        <button
                          onClick={() => { setEditingNoteId(entry.id); setEditedNote(entry.notes || ''); }}
                          className="p-1 text-slate-400 hover:text-indigo-500 transition-colors"
                          title="Edit note"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <EvidenceBadge
                        linkedToType="emission_entry"
                        linkedToId={entry.id}
                        orgId={orgId}
                        currentUserId={currentUserId}
                      />
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={deleting === entry.id}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-40"
                        title="Delete entry"
                      >
                        {deleting === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Bulk upload modal
// ─────────────────────────────────────────────────────────────────────────────

interface BulkRow {
  source_id: string;
  source_name: string;
  period_start: string;
  period_end: string;
  activity_data: number;
  calculated_emissions_kgco2e: number;
  notes: string;
  error?: string;
}

const BulkUploadModal: React.FC<{
  sources: EmissionSource[];
  orgId: string;
  currentUserId: string;
  onClose: () => void;
  onDone: () => void;
}> = ({ sources, orgId, currentUserId, onClose, onDone }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BulkRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

  const downloadTemplate = async () => {
    const headers = [
      'Source Name',
      'Source ID',
      'Scope',
      'Unit',
      'Factor (kgCO₂e/unit)',
      'Identification No',
      'Asset No',
      'Period Start (YYYY-MM-DD)',
      'Period End (YYYY-MM-DD)',
      'Activity Data',
      'Notes'
    ];
    
    const data = sources.map(s => [
      s.source_name,
      s.id,
      s.scope,
      s.unit,
      s.emission_factor_value ?? '',
      s.identification_number ?? '',
      s.asset_number ?? '',
      '',
      '',
      '',
      ''
    ]);
    
    try {
      await downloadSpreadsheet(
        `carbon-bulk-template-${new Date().toISOString().slice(0, 10)}.xlsx`,
        [{
          name: 'Emissions',
          rows: [headers, ...data],
          columnWidths: [25, 36, 8, 8, 20, 20, 20, 22, 22, 16, 30],
        }],
      );
    } catch (e: any) {
      setImportError(e?.message ?? 'Could not create the spreadsheet template.');
    }
  };

  const handleFile = async (file: File) => {
    setParsingFile(true);
    setImportError(null);
    setPreview([]);
    try {
      const rawRows = await parseSpreadsheetFile(file);

      const sourceById = Object.fromEntries(sources.map(s => [s.id, s]));
      const sourceByName = Object.fromEntries(sources.map(s => [s.source_name.toLowerCase(), s]));

      const rows: BulkRow[] = rawRows.map(r => {
        const srcId = String(r['Source ID'] ?? '').trim();
        const srcName = String(r['Source Name'] ?? '').trim();
      
        let src;
        if (srcId) {
          src = sourceById[srcId];
          if (!src) return { source_id: '', source_name: srcName, period_start: '', period_end: '', activity_data: 0, calculated_emissions_kgco2e: 0, notes: '', error: `Source with ID "${srcId}" not found` };
        } else if (srcName) {
          src = sourceByName[srcName.toLowerCase()];
          if (!src) return { source_id: '', source_name: srcName, period_start: '', period_end: '', activity_data: 0, calculated_emissions_kgco2e: 0, notes: '', error: `Source with name "${srcName}" not found` };
        } else {
          return { source_id: '', source_name: '', period_start: '', period_end: '', activity_data: 0, calculated_emissions_kgco2e: 0, notes: '', error: 'Either Source ID or Source Name is required' };
        }

        const start = String(r['Period Start (YYYY-MM-DD)'] ?? '').trim();
        const end   = String(r['Period End (YYYY-MM-DD)'] ?? '').trim();
        const act   = Number(r['Activity Data'] ?? 0);

        if (!start || !end) return { source_id: src.id, source_name: src.source_name, period_start: start, period_end: end, activity_data: act, calculated_emissions_kgco2e: 0, notes: '', error: 'Period Start and Period End are required' };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { source_id: src.id, source_name: src.source_name, period_start: start, period_end: end, activity_data: act, calculated_emissions_kgco2e: 0, notes: '', error: 'Date format must be YYYY-MM-DD' };
        if (!act || act <= 0) return { source_id: src.id, source_name: src.source_name, period_start: start, period_end: end, activity_data: act, calculated_emissions_kgco2e: 0, notes: '', error: 'Activity Data must be a positive number' };

        const kgco2e = calculateEmissions(act, src.emission_factor_value ?? 0);
        return { source_id: src.id, source_name: src.source_name, period_start: start, period_end: end, activity_data: act, calculated_emissions_kgco2e: kgco2e, notes: String(r['Notes'] ?? '').trim() };
      });
      setPreview(rows);
    } catch (e: any) {
      setImportError(e?.message ?? 'Could not parse the spreadsheet.');
    } finally {
      setParsingFile(false);
    }
  };

  const handleUpload = async () => {
    const valid = preview.filter(r => !r.error);
    setUploading(true);
    let success = 0, failed = 0;
    for (const row of valid) {
      try {
        await upsertEmissionEntry(orgId, {
          source_id: row.source_id,
          period_start: row.period_start,
          period_end: row.period_end,
          activity_data: row.activity_data,
          calculated_emissions_kgco2e: row.calculated_emissions_kgco2e,
          notes: row.notes || null,
        }, currentUserId);
        success++;
      } catch { failed++; }
    }
    setUploading(false);
    setResult({ success, failed });
  };

  const validRows = preview.filter(r => !r.error);
  const errorRows = preview.filter(r => r.error);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white">Bulk Upload Emissions Data</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {result ? (
            <div className={`rounded-xl border p-5 text-center ${result.failed === 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
              <p className={`font-bold text-lg ${result.failed === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                {result.success} uploaded{result.failed > 0 ? `, ${result.failed} failed` : ' successfully'}
              </p>
              <button onClick={onDone} className="mt-4 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">Done</button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <Download className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                <div className="flex-1 text-sm text-slate-600 dark:text-slate-300">Download the template with your sources pre-filled.</div>
                <button onClick={() => void downloadTemplate()} className="flex-shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">Download Template</button>
              </div>

              {importError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              <div
                className={`border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center transition-colors ${parsingFile ? 'cursor-wait opacity-60' : 'cursor-pointer hover:border-indigo-400'}`}
                onClick={() => !parsingFile && fileRef.current?.click()}
              >
                {parsingFile ? <Loader2 className="w-8 h-8 text-indigo-500 mx-auto mb-2 animate-spin" /> : <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />}
                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">{parsingFile ? 'Checking spreadsheet…' : 'Click to upload Excel or CSV'}</p>
                <p className="text-xs text-slate-400 mt-1">.xlsx or .csv · maximum 2 MB and 1,000 rows</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  disabled={parsingFile}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleFile(file);
                  }}
                />
              </div>

              {preview.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-200">Preview — {preview.length} rows</span>
                    <span className="text-slate-500">{validRows.length} valid · {errorRows.length} errors</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Source</th>
                          <th className="px-3 py-2 text-left">Period</th>
                          <th className="px-3 py-2 text-right">Activity</th>
                          <th className="px-3 py-2 text-right">tCO₂e</th>
                          <th className="px-3 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {preview.map((row, i) => (
                          <tr key={i} className={row.error ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                            <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{row.source_name}</td>
                            <td className="px-3 py-2 text-slate-500">{row.period_start}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">{row.activity_data > 0 ? row.activity_data.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-emerald-700 dark:text-emerald-400">{row.calculated_emissions_kgco2e > 0 ? fmtTco2e(row.calculated_emissions_kgco2e) : '—'}</td>
                            <td className="px-3 py-2">{row.error ? <span className="text-red-600 dark:text-red-400">{row.error}</span> : <span className="text-emerald-600 dark:text-emerald-400">✓</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {validRows.length > 0 && (
                    <button
                      onClick={handleUpload}
                      disabled={uploading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-xl transition-colors text-sm"
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {uploading ? 'Uploading…' : `Upload ${validRows.length} entries`}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
