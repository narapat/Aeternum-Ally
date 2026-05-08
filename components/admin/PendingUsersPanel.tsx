import React, { useEffect, useState, useCallback } from 'react';
import {
  UserCheck, RefreshCw, Loader2, AlertCircle, CheckCircle,
  X, Building2, UserPlus,
} from 'lucide-react';

interface PendingUser {
  id:              string;
  email:           string;
  created_at:      string;
  last_sign_in_at: string | null;
}

interface Company {
  id:   string;
  name: string;
}

interface Props {
  adminToken:       string;
  companies:        Company[];      // passed in from parent so we don't re-fetch
  onCreateCompany:  (prefillEmail: string) => void;  // opens Create Company modal
}

const ROLES = ['Owner', 'Admin', 'Manager', 'Consultant'] as const;

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

// ── Assign modal ──────────────────────────────────────────────────────────────
interface AssignModalProps {
  user:       PendingUser;
  companies:  Company[];
  token:      string;
  onAssigned: () => void;
  onClose:    () => void;
}

const AssignModal: React.FC<AssignModalProps> = ({ user, companies, token, onAssigned, onClose }) => {
  const [orgId,   setOrgId]   = useState('');
  const [role,    setRole]    = useState<string>('Manager');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await callAdmin('assign_user_to_company', token, {
        user_id: user.id, organization_id: orgId, role,
      });
      onAssigned();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to assign user');
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-esg-700 flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-white font-semibold text-sm">Assign to Company</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Assigning <span className="text-white font-medium">{user.email}</span>
        </p>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Company</label>
            <select
              value={orgId}
              onChange={e => setOrgId(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm"
            >
              <option value="">Select a company…</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm"
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="flex gap-3">
            <button
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !orgId}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-esg-600 hover:bg-esg-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Assigning…</> : 'Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────
const PendingUsersPanel: React.FC<Props> = ({ adminToken, companies, onCreateCompany }) => {
  const [users,       setUsers]       = useState<PendingUser[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [assignUser,  setAssignUser]  = useState<PendingUser | null>(null);
  const [actionMsg,   setActionMsg]   = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const json = await callAdmin('list_pending_users', adminToken);
      setUsers(json.users ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load pending users');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { load(); }, [load]);

  const formatDate = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-white">Pending Users</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Signed-up users with no company assignment.
          </p>
        </div>
        <button
          onClick={load} disabled={loading}
          className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
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
          <button onClick={() => setActionMsg(null)} className="ml-auto opacity-60 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2.5 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={load} className="ml-auto text-xs underline">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-10 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <UserCheck className="w-8 h-8 text-esg-600 mb-2" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">All users are assigned — great!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">Signed up</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden lg:table-cell">Last sign in</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {user.email.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800 dark:text-white truncate max-w-[180px]">{user.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 hidden sm:table-cell whitespace-nowrap">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 hidden lg:table-cell whitespace-nowrap">
                      {formatDate(user.last_sign_in_at)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onCreateCompany(user.email)}
                          title="Create a new company for this user"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-esg-400 hover:text-white hover:bg-esg-700 border border-esg-800/50 hover:border-esg-700 rounded-lg transition-all"
                        >
                          <Building2 className="w-3 h-3" /> New Company
                        </button>
                        <button
                          onClick={() => setAssignUser(user)}
                          title="Assign to an existing company"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-600 border border-slate-600 hover:border-slate-500 rounded-lg transition-all"
                        >
                          <UserPlus className="w-3 h-3" /> Assign
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

      {users.length > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{users.length} pending user{users.length !== 1 ? 's' : ''}</p>
      )}

      {/* Assign modal */}
      {assignUser && (
        <AssignModal
          user={assignUser}
          companies={companies}
          token={adminToken}
          onAssigned={() => {
            setActionMsg({ type: 'success', text: `${assignUser.email} assigned successfully.` });
            load();
          }}
          onClose={() => setAssignUser(null)}
        />
      )}
    </div>
  );
};

export default PendingUsersPanel;
