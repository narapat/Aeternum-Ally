import React, { useEffect, useState, useCallback } from 'react';
import {
  Loader2, AlertCircle, CheckCircle, RefreshCw,
  Plus, Edit2, Trash2, X, Factory
} from 'lucide-react';

interface EmissionFactor {
  id: string;
  fuel_type: string;
  scope: string;
  unit: string;
  kgco2e_per_unit: number;
  source: string;
  year: number;
  region: string | null;
  created_at: string;
}

interface Props {
  adminToken: string;
}

// ── API helper ────────────────────────────────────────────────────────────────
async function callAdmin(action: string, token: string, body?: object) {
  const res = await fetch('/.netlify/functions/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

// ── Modal ──────────────────────────────────────────────────────────────────────
interface ModalProps {
  token: string;
  factor: EmissionFactor | null; // null = create mode
  onSaved: () => void;
  onClose: () => void;
}

const FactorModal: React.FC<ModalProps> = ({ token, factor, onSaved, onClose }) => {
  const [formData, setFormData] = useState({
    fuel_type: factor?.fuel_type ?? '',
    scope: factor?.scope ?? '1',
    unit: factor?.unit ?? '',
    kgco2e_per_unit: factor?.kgco2e_per_unit?.toString() ?? '',
    source: factor?.source ?? '',
    year: factor?.year?.toString() ?? new Date().getFullYear().toString(),
    region: factor?.region ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!factor;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isEdit) {
        await callAdmin('update_emission_factor', token, { id: factor.id, ...formData });
      } else {
        await callAdmin('create_emission_factor', token, formData);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save factor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-esg-700 flex items-center justify-center">
              <Factory className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-white font-semibold text-sm">{isEdit ? 'Edit Factor' : 'New Factor'}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Fuel Type / Name</label>
              <input
                type="text" value={formData.fuel_type} onChange={e => setFormData({ ...formData, fuel_type: e.target.value })}
                required autoFocus placeholder="e.g. Diesel B7"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Scope</label>
              <select
                value={formData.scope} onChange={e => setFormData({ ...formData, scope: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm"
              >
                <option value="1">Scope 1</option>
                <option value="2">Scope 2</option>
                <option value="3">Scope 3</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Unit</label>
              <input
                type="text" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })}
                required placeholder="e.g. L, kg, kWh"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">kgCO2e per Unit</label>
              <input
                type="number" step="any" value={formData.kgco2e_per_unit} onChange={e => setFormData({ ...formData, kgco2e_per_unit: e.target.value })}
                required placeholder="0.00"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Year</label>
              <input
                type="number" value={formData.year} onChange={e => setFormData({ ...formData, year: e.target.value })}
                required placeholder="YYYY"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Source</label>
              <input
                type="text" value={formData.source} onChange={e => setFormData({ ...formData, source: e.target.value })}
                required placeholder="e.g. IPCC 2021"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Region (Optional)</label>
              <input
                type="text" value={formData.region} onChange={e => setFormData({ ...formData, region: e.target.value })}
                placeholder="e.g. Global, Thailand"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-esg-600 hover:bg-esg-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────
const AdminEmissionFactorsPanel: React.FC<Props> = ({ adminToken }) => {
  const [factors, setFactors] = useState<EmissionFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState<{ open: boolean; factor: EmissionFactor | null }>({ open: false, factor: null });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const json = await callAdmin('list_emission_factors', adminToken);
      setFactors(json.factors ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load emission factors');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete emission factor "${name}"? This may affect calculations for tenants referencing it.`)) return;
    setDeleting(id);
    setActionMsg(null);
    try {
      await callAdmin('delete_emission_factor', adminToken, { id });
      setActionMsg({ type: 'success', text: `"${name}" deleted.` });
      await load();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.message ?? 'Failed to delete factor' });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Emission Factors</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage global emission factors (IPCC, DEFRA, TGO, etc.).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load} disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowModal({ open: true, factor: null })}
            className="flex items-center gap-2 px-4 py-2 bg-esg-600 hover:bg-esg-700 text-white font-medium rounded-lg transition-colors text-sm"
          >
            <Plus className="w-4 h-4" /> Add Factor
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className={`flex items-start gap-2.5 text-sm rounded-lg px-3 py-2.5 ${
          actionMsg.type === 'success' ? 'text-esg-400 bg-esg-950/40 border border-esg-800/50' : 'text-red-400 bg-red-950/40 border border-red-800/50'
        }`}>
          {actionMsg.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          {actionMsg.text}
          <button onClick={() => setActionMsg(null)} className="ml-auto text-current opacity-60 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2.5 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={load} className="ml-auto text-xs underline hover:no-underline">Retry</button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading && factors.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading factors…</span>
          </div>
        ) : factors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Factory className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No emission factors found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Fuel Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Scope</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">kgCO2e / Unit</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">Region</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {factors.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-800 dark:text-white">{row.fuel_type}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">
                      Scope {row.scope}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-600 dark:text-slate-300">
                      {row.kgco2e_per_unit.toFixed(4)} <span className="text-slate-400 text-xs">/ {row.unit}</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                      {row.source} ({row.year})
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                      {row.region || 'Global'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setShowModal({ open: true, factor: row })}
                          title="Edit factor"
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(row.id, row.fuel_type)}
                          disabled={deleting === row.id}
                          title="Delete factor"
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {deleting === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal.open && (
        <FactorModal
          token={adminToken}
          factor={showModal.factor}
          onSaved={() => {
            setActionMsg({ type: 'success', text: showModal.factor ? 'Factor updated successfully.' : 'Factor created successfully.' });
            load();
          }}
          onClose={() => setShowModal({ open: false, factor: null })}
        />
      )}
    </div>
  );
};

export default AdminEmissionFactorsPanel;
