import React, { useState } from 'react';
import {
  Download, X, FileJson, FileSpreadsheet, Loader2, AlertCircle, CheckCircle,
} from 'lucide-react';
import { buildZip, jsonToCSV } from '../../lib/zipBuilder';

interface Props {
  companyId:   string;
  companyName: string;
  adminToken:  string;
  onClose:     () => void;
}

type Format = 'json' | 'csv';

async function callAdmin(action: string, token: string, body?: object) {
  const res = await fetch('/.netlify/functions/admin', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ action, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFilename(name: string) {
  return name.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
}

const CompanyExportModal: React.FC<Props> = ({ companyId, companyName, adminToken, onClose }) => {
  const [format,  setFormat]  = useState<Format>('json');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState(false);

  const handleExport = async () => {
    setError('');
    setLoading(true);
    setDone(false);
    try {
      const json = await callAdmin('export_company_data', adminToken, { org_id: companyId });
      const { manifest, tables } = json as {
        manifest: Record<string, unknown>;
        tables:   Record<string, Record<string, unknown>[]>;
      };
      const slug      = safeFilename(companyName);
      const timestamp = new Date().toISOString().slice(0, 10);

      if (format === 'json') {
        const content = JSON.stringify({ manifest, tables }, null, 2);
        triggerDownload(
          new Blob([content], { type: 'application/json' }),
          `${slug}_export_${timestamp}.json`,
        );
      } else {
        // Build CSV ZIP
        const files: { name: string; content: string }[] = [
          { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) },
        ];
        for (const [tableName, rows] of Object.entries(tables)) {
          files.push({
            name:    `${tableName}.csv`,
            content: jsonToCSV(rows as Record<string, unknown>[]),
          });
        }
        const zipBytes = buildZip(files);
        triggerDownload(
          new Blob([zipBytes], { type: 'application/zip' }),
          `${slug}_export_${timestamp}.zip`,
        );
      }

      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-esg-700 flex items-center justify-center">
              <Download className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">Export Company Data</h2>
              <p className="text-slate-400 text-xs truncate max-w-[180px]">{companyName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Exports all org data: company profile, assessments, KPIs, tasks, emissions,
          members, AI usage, and more. Includes a manifest with export metadata.
        </p>

        {/* Format selector */}
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Format</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 'json', label: 'JSON',    sub: 'Single file, all tables',   icon: <FileJson className="w-5 h-5" /> },
              { id: 'csv',  label: 'CSV ZIP', sub: 'One CSV per table + manifest', icon: <FileSpreadsheet className="w-5 h-5" /> },
            ] as { id: Format; label: string; sub: string; icon: React.ReactNode }[]).map(f => (
              <button
                key={f.id}
                onClick={() => { setFormat(f.id); setDone(false); setError(''); }}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-center transition-all ${
                  format === f.id
                    ? 'border-esg-600 bg-esg-900/40 text-white'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                <span className={format === f.id ? 'text-esg-400' : ''}>{f.icon}</span>
                <span className="text-xs font-semibold">{f.label}</span>
                <span className="text-[10px] text-slate-500 leading-tight">{f.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Error / success */}
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}
        {done && (
          <div className="flex items-start gap-2 text-sm text-esg-400 bg-esg-950/40 border border-esg-800/50 rounded-lg px-3 py-2.5">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            Download started — check your downloads folder.
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors text-sm"
          >
            Close
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-esg-600 hover:bg-esg-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</>
              : <><Download className="w-4 h-4" /> Download</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompanyExportModal;
