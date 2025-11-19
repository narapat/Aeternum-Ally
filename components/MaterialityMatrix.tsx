import React from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import { AssessmentData } from '../types';
import { MATERIALITY_THRESHOLD } from '../constants';

interface Props {
  data: AssessmentData[];
}

const MaterialityMatrix: React.FC<Props> = ({ data }) => {
  const chartData = data.map(d => ({
    name: d.topic.split(' ')[0], // E1, S1 etc
    fullName: d.topic,
    x: d.financialMaterialityValue,
    y: d.impactMaterialityValue,
    isMaterial: d.isMaterial
  }));

  return (
    <div className="w-full h-[400px] bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
      <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Double Materiality Matrix</h3>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#475569" opacity={0.3} />
          <XAxis 
            type="number" 
            dataKey="x" 
            name="Financial Materiality" 
            domain={[0, 100]} 
            label={{ value: 'Financial Materiality', position: 'bottom', offset: 0, fill: '#94a3b8' }}
            tick={{ fill: '#94a3b8' }}
            stroke="#94a3b8" 
          />
          <YAxis 
            type="number" 
            dataKey="y" 
            name="Impact Materiality" 
            domain={[0, 100]} 
            label={{ value: 'Impact Materiality', angle: -90, position: 'left', fill: '#94a3b8' }}
            tick={{ fill: '#94a3b8' }}
            stroke="#94a3b8"
          />
          <ZAxis range={[60, 60]} /> 
          <Tooltip 
            cursor={{ strokeDasharray: '3 3' }} 
            content={({ payload }) => {
                if (payload && payload.length) {
                    const { name, fullName, x, y } = payload[0].payload;
                    return (
                        <div className="bg-white dark:bg-slate-900 p-2 border border-slate-200 dark:border-slate-700 shadow-lg rounded text-xs text-slate-900 dark:text-white">
                            <p className="font-bold">{fullName}</p>
                            <p>Financial: {Math.round(x)}</p>
                            <p>Impact: {Math.round(y)}</p>
                        </div>
                    );
                }
                return null;
            }}
          />
          
          {/* Threshold Lines */}
          <ReferenceLine x={MATERIALITY_THRESHOLD} stroke="#94a3b8" strokeDasharray="3 3" />
          <ReferenceLine y={MATERIALITY_THRESHOLD} stroke="#94a3b8" strokeDasharray="3 3" />

          <Scatter name="Topics" data={chartData} fill="#8884d8">
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.isMaterial ? '#16a34a' : '#94a3b8'} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-esg-600 rounded-full"></div> Material</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-400 rounded-full"></div> Not Material</div>
      </div>
    </div>
  );
};

export default MaterialityMatrix;