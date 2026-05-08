import React from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
  ZAxis, Tooltip, CartesianGrid, ReferenceLine, Cell,
} from 'recharts';
import { AssessmentData } from '../types';
import { MATERIALITY_THRESHOLD } from '../constants';

interface Props {
  data: AssessmentData[];
}

// ── Colour logic ─────────────────────────────────────────────────────────────
// Green  (#16a34a) — High Impact Material : both axes ≥ threshold
// Orange (#c2410c) — Material             : at least one axis ≥ threshold
// Grey   (#64748b) — Not Material         : neither axis ≥ threshold
type DotTier = 'high' | 'material' | 'none';

function getTier(d: AssessmentData): DotTier {
  const fin = d.financialMaterialityValue >= MATERIALITY_THRESHOLD;
  const imp = d.impactMaterialityValue    >= MATERIALITY_THRESHOLD;
  if (fin && imp) return 'high';
  if (fin || imp) return 'material';
  return 'none';
}

const DOT_COLOR: Record<DotTier, string> = {
  high:     '#16a34a',  // green
  material: '#c2410c',  // dark orange
  none:     '#64748b',  // dark grey
};

// ── Tooltip ───────────────────────────────────────────────────────────────────
function first20Words(text: string): string {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  return words.slice(0, 20).join(' ') + (words.length > 20 ? '…' : '');
}

const CustomTooltip: React.FC<{ payload?: any[] }> = ({ payload }) => {
  if (!payload?.length) return null;
  const p = payload[0].payload;
  const tier = getTier(p.raw);
  const tierLabel = tier === 'high' ? 'High Impact Material' : tier === 'material' ? 'Material' : 'Not Material';
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg rounded-lg p-3 text-xs text-slate-900 dark:text-white max-w-[260px] space-y-1.5">
      <p className="font-bold text-sm leading-snug">{p.fullName}</p>
      <p className="font-medium" style={{ color: DOT_COLOR[tier] }}>{tierLabel}</p>
      <div className="flex gap-4 text-slate-500 dark:text-slate-400">
        <span>Financial: <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.round(p.x)}</span></span>
        <span>Impact: <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.round(p.y)}</span></span>
      </div>
      {p.description && (
        <p className="text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-700 pt-1.5">
          {p.description}
        </p>
      )}
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────
const MaterialityMatrix: React.FC<Props> = ({ data }) => {
  const chartData = data.map(d => ({
    fullName:    d.topic,
    x:           d.financialMaterialityValue,
    y:           d.impactMaterialityValue,
    description: first20Words(d.impactDescription),
    raw:         d,          // keep original for tier calculation in tooltip
  }));

  return (
    <div className="w-full bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
      <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Double Materiality Matrix</h3>

      <div className="h-[420px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" opacity={0.3} />
            <XAxis
              type="number" dataKey="x" name="Financial Materiality"
              domain={[0, 100]}
              label={{ value: 'Financial Materiality', position: 'bottom', offset: 10, fill: '#94a3b8', fontSize: 12 }}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              stroke="#94a3b8"
            />
            <YAxis
              type="number" dataKey="y" name="Impact Materiality"
              domain={[0, 100]}
              label={{ value: 'Impact Materiality', angle: -90, position: 'insideLeft', offset: 10, fill: '#94a3b8', fontSize: 12 }}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              stroke="#94a3b8"
            />
            <ZAxis range={[70, 70]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />

            {/* Threshold reference lines */}
            <ReferenceLine x={MATERIALITY_THRESHOLD} stroke="#94a3b8" strokeDasharray="4 3" label={{ value: `${MATERIALITY_THRESHOLD}`, fill: '#94a3b8', fontSize: 10, position: 'top' }} />
            <ReferenceLine y={MATERIALITY_THRESHOLD} stroke="#94a3b8" strokeDasharray="4 3" label={{ value: `${MATERIALITY_THRESHOLD}`, fill: '#94a3b8', fontSize: 10, position: 'right' }} />

            <Scatter name="Topics" data={chartData}>
              {chartData.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={DOT_COLOR[getTier(entry.raw)]} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 mt-3 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: DOT_COLOR.high }} />
          High Impact Material
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: DOT_COLOR.material }} />
          Material
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: DOT_COLOR.none }} />
          Not Material
        </div>
      </div>
    </div>
  );
};

export default MaterialityMatrix;
