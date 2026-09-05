import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Building2, Search, RefreshCw, Loader2, AlertCircle,
  CheckCircle, ChevronUp, ChevronDown, X, ShieldOff, ShieldCheck,
  Plus, Mail, Users, Download,
} from 'lucide-react';
import PendingUsersPanel from './PendingUsersPanel';
import CompanyExportModal from './CompanyExportModal';
import CompanyStatsPanel from './CompanyStatsPanel';

interface Company {
  id:           string;
  name:         string;
  tier:         'free' | 'starter' | 'pro' | 'enterprise';
  is_active:    boolean;
  member_count: number;
  created_at:   string;
  /** Later of: any member's last sign-in, or the org's most recent AI call. */
  last_active_at: string | null;
}

type SortKey = 'name' | 'tier' | 'member_count' | 'created_at' | 'last_active_at' | 'is_active';
type SortDir = 'asc' | 'desc';
type Tab     = 'companies' | 'pending';

interface DetailView { id: string; name: string; is_active: boolean; }

interface Props {
  adminToken: string;
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

// ── Tier badge ────────────────────────────────────────────────────────────────
const TIER_STYLES: Record<string, string> = {
  free:       'bg-slate-700 text-slate-300',
  starter:    'bg-blue-900/60 text-blue-300 border border-blue-700/50',
  pro:        'bg-violet-900/60 text-violet-300 border border-violet-700/50',
  enterprise: 'bg-amber-900/60 text-amber-300 border border-amber-700/50',
};
// ── Sort header cell ──────────────────────────────────────────────────────────
const SortTh: React.FC<{
  label: string; col: SortKey; sort: SortKey; dir: SortDir;
  onSort: (c: SortKey) => void; className?: string;
}> = ({ label, col, sort, dir, onSort, className = '' }) => (
  <th
    onClick={() => onSort(col)}
    className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide cursor-pointer select-none hover:text-slate-800 dark:hover:text-white transition-colors ${className}`}
  >
    <span className="inline-flex items-center gap-1">
      {label}
      {sort === col
        ? (dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
        : <ChevronDown className="w-3 h-3 opacity-30" />}
    </span>
  </th>
);

// ── Create Company modal ──────────────────────────────────────────────────────
interface CreateModalProps {
  token:        string;
  prefillEmail: string;
  onCreated:    () => void;
  onClose:      () => void;
}

const TIERS = ['free', 'starter', 'pro', 'enterprise'] as const;

const CreateCompanyModal: React.FC<CreateModalProps> = ({ token, prefillEmail, onCreated, onClose }) => {
  const [companyName, setCompanyName] = useState('');
  const [ownerEmail,  setOwnerEmail]  = useState(prefillEmail);
  const [tier,        setTier]        = useState<string>('free');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const json = await callAdmin('create_company', token, {
        company_name: companyName.trim(),
        owner_email:  ownerEmail.trim(),
        tier,
      });
      setSuccess(`"${json.company_name}" created.${json.dev_link ? ' (dev invite link in console)' : ' Invitation email sent to owner.'}`);
      setTimeout(() => { onCreated(); onClose(); }, 1800);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create company');
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
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-white font-semibold text-sm">New Company</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 text-sm text-esg-400 bg-esg-950/40 border border-esg-800/50 rounded-lg px-3 py-2.5">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Company name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Company Name</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                required autoFocus placeholder="Acme Corp"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
              />
            </div>
          </div>

          {/* Owner email */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Owner Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)}
                required placeholder="owner@example.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">New accounts will receive a sign-in link.</p>
          </div>

          {/* Tier */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Tier</label>
            <select
              value={tier} onChange={e => setTier(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm capitalize"
            >
              {TIERS.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
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
              disabled={loading || !companyName || !ownerEmail || !!success}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-esg-600 hover:bg-esg-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────
const CompanyListPanel: React.FC<Props> = ({ adminToken }) => {
  const [companies,    setCompanies]    = useState<Company[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [tab,          setTab]          = useState<Tab>('companies');
  const [search,       setSearch]       = useState('');
  const [sort,         setSort]         = useState<SortKey>('created_at');
  const [dir,          setDir]          = useState<SortDir>('desc');
  const [toggling,     setToggling]     = useState<string | null>(null);
  const [tierSaving,   setTierSaving]   = useState<string | null>(null);
  const [actionMsg,    setActionMsg]    = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [createModal,  setCreateModal]  = useState<{ open: boolean; prefillEmail: string }>({ open: false, prefillEmail: '' });
  const [exportModal,  setExportModal]  = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' });
  const [detailView,   setDetailView]   = useState<DetailView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const json = await callAdmin('list_companies', adminToken);
      setCompanies(json.companies ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load companies');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { load(); }, [load]);

  const handleToggleStatus = async (company: Company) => {
    const newStatus = !company.is_active;
    if (!window.confirm(`${newStatus ? 'Reactivate' : 'Deactivate'} "${company.name}"?`)) return;
    setToggling(company.id);
    setActionMsg(null);
    try {
      await callAdmin('set_company_status', adminToken, { id: company.id, is_active: newStatus });
      setActionMsg({ type: 'success', text: `"${company.name}" ${newStatus ? 'reactivated' : 'deactivated'}.` });
      await load();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.message ?? 'Failed to update status' });
    } finally {
      setToggling(null);
    }
  };

  const handleTierChange = async (company: Company, tier: string) => {
    if (tier === company.tier) return;
    if (!window.confirm(
      `Move "${company.name}" from ${company.tier} to ${tier}?\n\n`
      + `This changes the organization's monthly AI allowance and evidence storage quota immediately.`
    )) return;

    setTierSaving(company.id);
    setActionMsg(null);
    try {
      await callAdmin('set_company_tier', adminToken, { id: company.id, tier });
      setActionMsg({ type: 'success', text: `"${company.name}" moved to ${tier}.` });
      await load();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.message ?? 'Failed to update tier' });
    } finally {
      setTierSaving(null);
    }
  };

  const handleSort = (col: SortKey) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setDir('asc'); }
  };

  const TIER_ORDER = { free: 0, starter: 1, pro: 2, enterprise: 3 };

  const filtered = useMemo(() => {
    let list = [...companies];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let v = 0;
      if      (sort === 'name')         v = a.name.localeCompare(b.name);
      else if (sort === 'tier')         v = (TIER_ORDER[a.tier] ?? 0) - (TIER_ORDER[b.tier] ?? 0);
      else if (sort === 'member_count') v = a.member_count - b.member_count;
      else if (sort === 'created_at')   v = a.created_at.localeCompare(b.created_at);
      // Never-active sorts last ascending, so "who has gone quiet" is one click.
      else if (sort === 'last_active_at')
        v = (a.last_active_at ?? '').localeCompare(b.last_active_at ?? '');
      else if (sort === 'is_active')    v = (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1);
      return dir === 'asc' ? v : -v;
    });
    return list;
  }, [companies, search, sort, dir]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const formatRelative = (iso: string | null) => {
    if (!iso) return 'Never';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0)  return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30)  return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  };

  const active   = companies.filter(c =>  c.is_active).length;
  const inactive = companies.filter(c => !c.is_active).length;

  // Simple list for PendingUsersPanel dropdown
  const activeCompanies = companies
    .filter(c => c.is_active)
    .map(c => ({ id: c.id, name: c.name }));

  // ── Company detail view ───────────────────────────────────────────────────
  if (detailView) {
    return (
      <CompanyStatsPanel
        companyId={detailView.id}
        companyName={detailView.name}
        isActive={detailView.is_active}
        adminToken={adminToken}
        onBack={() => setDetailView(null)}
      />
    );
  }

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Companies</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage registered organisations and unassigned users.
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
            onClick={() => setCreateModal({ open: true, prefillEmail: '' })}
            className="flex items-center gap-2 px-4 py-2 bg-esg-600 hover:bg-esg-700 text-white font-medium rounded-lg transition-colors text-sm"
          >
            <Plus className="w-4 h-4" /> New Company
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {([
          { id: 'companies', label: 'Companies', icon: <Building2 className="w-3.5 h-3.5" /> },
          { id: 'pending',   label: 'Pending Users', icon: <Users className="w-3.5 h-3.5" /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t.id
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Companies tab ─────────────────────────────────────────────────── */}
      {tab === 'companies' && (
        <>
          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total',    value: companies.length, color: 'text-slate-800 dark:text-white' },
              { label: 'Active',   value: active,           color: 'text-esg-500' },
              { label: 'Inactive', value: inactive,         color: 'text-red-400' },
            ].map(s => (
              <div key={s.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
              </div>
            ))}
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

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2.5 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              <button onClick={load} className="ml-auto text-xs underline">Retry</button>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search companies…"
              className="w-full pl-9 pr-8 py-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            {loading && companies.length === 0 ? (
              <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading companies…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {search ? 'No companies match your search.' : 'No companies yet. Create one above.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                      <SortTh label="Company"  col="name"         sort={sort} dir={dir} onSort={handleSort} />
                      <SortTh label="Tier"     col="tier"         sort={sort} dir={dir} onSort={handleSort} className="hidden md:table-cell" />
                      <SortTh label="Members"  col="member_count" sort={sort} dir={dir} onSort={handleSort} className="hidden sm:table-cell" />
                      <SortTh label="Last active" col="last_active_at" sort={sort} dir={dir} onSort={handleSort} className="hidden lg:table-cell" />
                      <SortTh label="Created"  col="created_at"   sort={sort} dir={dir} onSort={handleSort} className="hidden lg:table-cell" />
                      <SortTh label="Status"   col="is_active"    sort={sort} dir={dir} onSort={handleSort} className="text-center" />
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filtered.map(company => {
                      const isToggling = toggling === company.id;
                      return (
                        <tr key={company.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="px-4 py-3.5">
                            <button
                              onClick={() => setDetailView({ id: company.id, name: company.name, is_active: company.is_active })}
                              className="flex items-center gap-3 group text-left"
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${company.is_active ? 'bg-esg-700' : 'bg-slate-500'}`}>
                                {company.name.charAt(0).toUpperCase()}
                              </div>
                              <span className={`font-medium truncate max-w-[160px] group-hover:underline ${company.is_active ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500 line-through'}`}>
                                {company.name}
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-3.5 hidden md:table-cell">
                            <select
                              value={company.tier}
                              disabled={tierSaving === company.id}
                              onChange={e => handleTierChange(company, e.target.value)}
                              aria-label={`Tier for ${company.name}`}
                              title="Change tier — adjusts AI and storage entitlements"
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize border-0 cursor-pointer disabled:opacity-50 disabled:cursor-wait focus:ring-2 focus:ring-esg-500 ${TIER_STYLES[company.tier] ?? TIER_STYLES.free}`}
                            >
                              {TIERS.map(t => (
                                <option key={t} value={t} className="capitalize bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 hidden sm:table-cell">{company.member_count}</td>
                          <td
                            className={`px-4 py-3.5 hidden lg:table-cell whitespace-nowrap ${
                              company.last_active_at ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-600 italic'
                            }`}
                            title={company.last_active_at
                              ? `Latest of any member's sign-in and the organization's most recent AI call — ${formatDate(company.last_active_at)}`
                              : 'No sign-in or AI activity recorded'}
                          >
                            {formatRelative(company.last_active_at)}
                          </td>
                          <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 hidden lg:table-cell whitespace-nowrap">{formatDate(company.created_at)}</td>
                          <td className="px-4 py-3.5 text-center">
                            {company.is_active
                              ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-esg-900/50 text-esg-400 border border-esg-800/50"><ShieldCheck className="w-3 h-3" /> Active</span>
                              : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700"><ShieldOff className="w-3 h-3" /> Inactive</span>}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setExportModal({ open: true, id: company.id, name: company.name })}
                                title="Export company data"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-600 border border-slate-600 hover:border-slate-500 rounded-lg transition-all"
                              >
                                <Download className="w-3 h-3" /> Export
                              </button>
                              <button
                                onClick={() => handleToggleStatus(company)}
                                disabled={isToggling}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                  company.is_active
                                    ? 'text-red-400 hover:text-white hover:bg-red-700 border border-red-800/50 hover:border-red-700'
                                    : 'text-esg-400 hover:text-white hover:bg-esg-700 border border-esg-800/50 hover:border-esg-700'
                                }`}
                              >
                                {isToggling
                                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Updating…</>
                                  : company.is_active
                                    ? <><ShieldOff className="w-3 h-3" /> Deactivate</>
                                    : <><ShieldCheck className="w-3 h-3" /> Reactivate</>}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {filtered.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing {filtered.length} of {companies.length} companies{search && ` matching "${search}"`}
            </p>
          )}
        </>
      )}

      {/* ── Pending users tab ──────────────────────────────────────────────── */}
      {tab === 'pending' && (
        <PendingUsersPanel
          adminToken={adminToken}
          companies={activeCompanies}
          onCreateCompany={(email) => {
            setCreateModal({ open: true, prefillEmail: email });
            setTab('companies');
          }}
        />
      )}

      {/* Export modal */}
      {exportModal.open && (
        <CompanyExportModal
          companyId={exportModal.id}
          companyName={exportModal.name}
          adminToken={adminToken}
          onClose={() => setExportModal({ open: false, id: '', name: '' })}
        />
      )}

      {/* Create company modal */}
      {createModal.open && (
        <CreateCompanyModal
          token={adminToken}
          prefillEmail={createModal.prefillEmail}
          onCreated={load}
          onClose={() => setCreateModal({ open: false, prefillEmail: '' })}
        />
      )}
    </div>
  );
};

export default CompanyListPanel;
