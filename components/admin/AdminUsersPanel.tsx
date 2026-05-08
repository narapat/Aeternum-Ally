import React, { useEffect, useState, useCallback } from 'react';
import {
  Users, Plus, UserX, Loader2, AlertCircle, CheckCircle,
  RefreshCw, Mail, ShieldCheck, ShieldOff, X,
} from 'lucide-react';

interface AdminRow {
  id:         string;
  email:      string;
  is_active:  boolean;
  created_by: string | null;
  created_at: string;
}

interface Props {
  adminToken: string;
  adminEmail: string;   // currently signed-in admin — cannot deactivate self
}

// ── API helper ────────────────────────────────────────────────────────────────
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

// ── Add-admin modal ────────────────────────────────────────────────────────────
interface AddModalProps {
  token:    string;
  onAdded:  () => void;
  onClose:  () => void;
}

const AddAdminModal: React.FC<AddModalProps> = ({ token, onAdded, onClose }) => {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const json = await callAdmin('add_admin', token, { email: email.trim() });
      const msg = json.reactivated
        ? `${json.email} has been re-activated.`
        : `${json.email} added${json.dev_link ? ' (dev link shown — no Resend key)' : ' — invitation email sent'}.`;
      setSuccess(msg);
      if (json.dev_link) {
        // Show dev link in console for easy access
        console.info('[admin] New admin invite link:', json.dev_link);
      }
      setTimeout(() => { onAdded(); onClose(); }, 1800);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to add admin');
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
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-white font-semibold text-sm">Add Platform Admin</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Enter the email address of the new admin. An invitation link will be sent to them.
          They will have full platform-level access once they sign in.
        </p>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 text-sm text-esg-400 bg-esg-950/40 border border-esg-800/50 rounded-lg px-3 py-2.5">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="newadmin@example.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !email || !!success}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-esg-600 hover:bg-esg-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</> : 'Add Admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────
const AdminUsersPanel: React.FC<Props> = ({ adminToken, adminEmail }) => {
  const [admins,        setAdmins]        = useState<AdminRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [deactivating,  setDeactivating]  = useState<string | null>(null);
  const [actionMsg,     setActionMsg]     = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const json = await callAdmin('list_admins', adminToken);
      setAdmins(json.admins ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { load(); }, [load]);

  const handleDeactivate = async (row: AdminRow) => {
    if (!window.confirm(`Deactivate ${row.email}? They will lose admin access immediately.`)) return;
    setDeactivating(row.id);
    setActionMsg(null);
    try {
      await callAdmin('deactivate_admin', adminToken, { id: row.id });
      setActionMsg({ type: 'success', text: `${row.email} has been deactivated.` });
      await load();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.message ?? 'Failed to deactivate admin' });
    } finally {
      setDeactivating(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Admin Users</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage platform administrators — add or deactivate accounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-esg-600 hover:bg-esg-700 text-white font-medium rounded-lg transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Admin
          </button>
        </div>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className={`flex items-start gap-2.5 text-sm rounded-lg px-3 py-2.5 ${
          actionMsg.type === 'success'
            ? 'text-esg-400 bg-esg-950/40 border border-esg-800/50'
            : 'text-red-400 bg-red-950/40 border border-red-800/50'
        }`}>
          {actionMsg.type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          {actionMsg.text}
          <button
            onClick={() => setActionMsg(null)}
            className="ml-auto text-current opacity-60 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2.5 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading && admins.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading admins…</span>
          </div>
        ) : admins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No admins found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">Added</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {admins.map(row => {
                  const isSelf        = row.email.toLowerCase() === adminEmail.toLowerCase();
                  const isDeactivating = deactivating === row.id;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      {/* Email */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                            row.is_active ? 'bg-esg-700' : 'bg-slate-500'
                          }`}>
                            {row.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800 dark:text-white">{row.email}</p>
                            {isSelf && (
                              <p className="text-xs text-esg-500 dark:text-esg-400">You</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Added date */}
                      <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                        {formatDate(row.created_at)}
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3.5 text-center">
                        {row.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-esg-900/50 text-esg-400 border border-esg-800/50">
                            <ShieldCheck className="w-3 h-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            <ShieldOff className="w-3 h-3" /> Inactive
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 text-right">
                        {row.is_active && !isSelf ? (
                          <button
                            onClick={() => handleDeactivate(row)}
                            disabled={isDeactivating}
                            title="Deactivate this admin"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-white hover:bg-red-700 border border-red-800/50 hover:border-red-700 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isDeactivating
                              ? <><Loader2 className="w-3 h-3 animate-spin" /> Deactivating…</>
                              : <><UserX className="w-3 h-3" /> Deactivate</>}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-600 dark:text-slate-500 px-3">
                            {isSelf ? '(you)' : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {admins.length > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {admins.filter(a => a.is_active).length} active ·{' '}
          {admins.filter(a => !a.is_active).length} inactive ·{' '}
          {admins.length} total
        </p>
      )}

      {/* Add admin modal */}
      {showAddModal && (
        <AddAdminModal
          token={adminToken}
          onAdded={load}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
};

export default AdminUsersPanel;
