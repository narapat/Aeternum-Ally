
import React, { useState, useEffect, useCallback } from 'react';
import { CompanyProfile, OrgMember, OrgRole, OrgInvite } from '../types';
import { INDUSTRY_SECTORS, ISIC_CODES_GROUPED } from '../constants';
import {
  Building2, MapPin, Globe, Hash, Users, Wallet, Target, Layers, BookOpen,
  UserPlus, Loader2, AlertCircle, Trash2, Copy, CheckCircle2, Sparkles,
  Clock, XCircle, ShieldOff
} from 'lucide-react';
import SaveIndicator from './SaveIndicator';
import type { SaveStatus } from '../hooks/useOrgData';
import { supabase } from '../lib/supabaseClient';
import AIUsagePanel from './AIUsagePanel';

interface Props {
  data: CompanyProfile;
  onChange: (data: CompanyProfile) => void;
  onSave: () => void;
  saveStatus: SaveStatus;
  isDirty: boolean;
  saveError?: string | null;

  // Team tab props
  organizationId: string;
  currentUserId: string;
  currentUserRole: OrgRole | null;
  members: OrgMember[];
  onMembersChanged: () => void | Promise<void>;
}

const CompanyProfileForm: React.FC<Props> = ({
  data, onChange, onSave, saveStatus, isDirty, saveError,
  organizationId, currentUserId, currentUserRole, members, onMembersChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'details' | 'strategy' | 'team' | 'ai'>('general');

  const handleChange = (field: keyof CompanyProfile, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const canManageTeam = currentUserRole === 'Owner' || currentUserRole === 'Admin';

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Company Profile</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage your official business entity data. This information powers the AI context for your reports.
          </p>
        </div>
        <SaveIndicator status={saveStatus} isDirty={isDirty} onSave={onSave} errorMessage={saveError} />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          <TabButton
            active={activeTab === 'general'} onClick={() => setActiveTab('general')}
            icon={<Building2 className="w-4 h-4 flex-shrink-0" />} label="General Information" />
          <TabButton
            active={activeTab === 'details'} onClick={() => setActiveTab('details')}
            icon={<Hash className="w-4 h-4 flex-shrink-0" />} label="Business Details" />
          <TabButton
            active={activeTab === 'strategy'} onClick={() => setActiveTab('strategy')}
            icon={<Target className="w-4 h-4 flex-shrink-0" />} label="Strategy & Mission" />
          <TabButton
            active={activeTab === 'team'} onClick={() => setActiveTab('team')}
            icon={<Users className="w-4 h-4 flex-shrink-0" />} label="Team" />
          <TabButton
            active={activeTab === 'ai'} onClick={() => setActiveTab('ai')}
            icon={<Sparkles className="w-4 h-4 flex-shrink-0" />} label="AI & Usage" />
        </div>

        <div className="p-4 md:p-8">
          {activeTab === 'general' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputField label="Company Name (Registered)" value={data.name} onChange={(v) => handleChange('name', v)} placeholder="e.g. EcoTech Solutions Ltd." fullWidth />
              <InputField label="Registration No. / Tax ID" value={data.taxId} onChange={(v) => handleChange('taxId', v)} placeholder="e.g. 01055640XXXXX" icon={<Hash className="w-4 h-4 text-slate-400" />} />
              <InputField label="Founding Year" value={data.foundingYear} onChange={(v) => handleChange('foundingYear', v)} placeholder="e.g. 2018" type="number" />
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Registered Address</label>
                <div className="relative">
                  <MapPin className="absolute top-3 left-3 w-5 h-5 text-slate-400" />
                  <textarea
                    className="w-full pl-10 p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 h-24 resize-none"
                    value={data.address} onChange={(e) => handleChange('address', e.target.value)}
                    placeholder="Headquarters address..." />
                </div>
              </div>
              <InputField label="Website URL" value={data.website} onChange={(v) => handleChange('website', v)} placeholder="https://..." icon={<Globe className="w-4 h-4 text-slate-400" />} fullWidth />
            </div>
          )}

          {activeTab === 'details' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Industry Sector</label>
                <div className="relative">
                  <Layers className="absolute top-3 left-3 w-4 h-4 text-slate-400" />
                  <select value={data.industry} onChange={(e) => handleChange('industry', e.target.value)} className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500">
                    <option value="">Select Industry Sector</option>
                    {INDUSTRY_SECTORS.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">ISIC Code</label>
                <div className="relative">
                  <BookOpen className="absolute top-3 left-3 w-4 h-4 text-slate-400" />
                  <select value={data.isicCode} onChange={(e) => handleChange('isicCode', e.target.value)} className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500">
                    <option value="">Select ISIC Code</option>
                    {ISIC_CODES_GROUPED.map((group) => (
                      <optgroup key={group.category} label={group.category}>
                        {group.codes.map((item) => <option key={item.code} value={`${item.code} - ${item.label}`}>{item.code} - {item.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Number of Employees</label>
                <div className="relative">
                  <Users className="absolute top-3 left-3 w-4 h-4 text-slate-400" />
                  <select value={data.employeeCount} onChange={(e) => handleChange('employeeCount', e.target.value)} className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500">
                    <option value="">Select Range</option>
                    <option value="1-5">1-5 (Micro)</option>
                    <option value="6-50">6-50 (Small)</option>
                    <option value="51-200">51-200 (Medium)</option>
                    <option value="201+">201+ (Large)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Annual Revenue</label>
                <div className="relative">
                  <Wallet className="absolute top-3 left-3 w-4 h-4 text-slate-400" />
                  <select value={data.revenueRange} onChange={(e) => handleChange('revenueRange', e.target.value)} className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500">
                    <option value="">Select Revenue Range</option>
                    <option value="< 1.8 MB">&lt; 1.8 Million THB</option>
                    <option value="1.8 MB - 50 MB">1.8 MB - 50 Million THB</option>
                    <option value="50 MB - 300 MB">50 MB - 300 Million THB</option>
                    <option value="> 300 MB">&gt; 300 Million THB</option>
                  </select>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Primary Products / Services</label>
                <input className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500" value={data.productsServices} onChange={(e) => handleChange('productsServices', e.target.value)} placeholder="e.g. Biodegradable bowls, Custom pulp molding, Consulting" />
                <p className="text-xs text-slate-500 mt-1">Separate with commas</p>
              </div>
            </div>
          )}

          {activeTab === 'strategy' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Business Description</label>
                <textarea className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 h-32 resize-none" value={data.description} onChange={(e) => handleChange('description', e.target.value)} placeholder="Provide a comprehensive overview of what your company does..." />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-blue-700 dark:text-blue-400">Mission Statement</label>
                  <textarea className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-32 resize-none" value={data.mission} onChange={(e) => handleChange('mission', e.target.value)} placeholder="What is your core purpose? (e.g. To reduce plastic waste...)" />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-emerald-700 dark:text-emerald-400">Vision Statement</label>
                  <textarea className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 h-32 resize-none" value={data.vision} onChange={(e) => handleChange('vision', e.target.value)} placeholder="Where do you want to be in the future?" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <TeamPanel
              organizationId={organizationId}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              members={members}
              canManage={canManageTeam}
              onMembersChanged={onMembersChanged}
            />
          )}

          {activeTab === 'ai' && (
            <AIUsagePanel
              organizationId={organizationId}
              currentUserRole={currentUserRole}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================================
// TEAM PANEL
// =============================================================

interface TeamPanelProps {
  organizationId: string;
  currentUserId: string;
  currentUserRole: OrgRole | null;
  members: OrgMember[];
  canManage: boolean;
  onMembersChanged: () => void | Promise<void>;
}

const ROLE_COLORS: Record<OrgRole, string> = {
  Owner: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  Admin: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
  Manager: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  Consultant: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
};

const TeamPanel: React.FC<TeamPanelProps> = ({
  organizationId, currentUserId, currentUserRole, members, canManage, onMembersChanged,
}) => {
  const isOwner = currentUserRole === 'Owner';

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<OrgRole, 'Owner'>>('Manager');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [pendingInvites, setPendingInvites] = useState<OrgInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);

  const fetchPendingInvites = useCallback(async () => {
    setInvitesLoading(true);
    const { data } = await supabase
      .from('organization_invites')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    setPendingInvites((data ?? []) as OrgInvite[]);
    setInvitesLoading(false);
  }, [organizationId]);

  useEffect(() => { fetchPendingInvites(); }, [fetchPendingInvites]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteToken(null);
    setIsInviting(true);
    try {
      const sessionResp = await supabase.auth.getSession();
      const accessToken = sessionResp.data.session?.access_token;
      if (!accessToken) throw new Error('Not signed in.');

      const resp = await fetch('/.netlify/functions/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, organization_id: organizationId }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error ?? 'Failed to send invitation.');

      setInviteToken(body.invite_token ?? null);
      setInviteEmail('');
      await Promise.all([onMembersChanged(), fetchPendingInvites()]);
    } catch (err: any) {
      setInviteError(err?.message ?? 'Failed to send invitation.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleDeactivate = async (memberId: string, email: string | null) => {
    if (!window.confirm(`Deactivate access for ${email ?? 'this member'}? They will lose access immediately.`)) return;
    const { error } = await supabase.from('organization_members').delete().eq('id', memberId);
    if (error) { alert(`Failed to deactivate: ${error.message}`); return; }
    await onMembersChanged();
  };

  const handleCancelInvite = async (inviteId: string, email: string) => {
    if (!window.confirm(`Cancel invitation for ${email}?`)) return;
    const { error } = await supabase.from('organization_invites').delete().eq('id', inviteId);
    if (error) { alert(`Failed to cancel invitation: ${error.message}`); return; }
    await fetchPendingInvites();
  };

  const handleRoleChange = async (memberId: string, newRole: OrgRole) => {
    const { error } = await supabase.from('organization_members').update({ role: newRole }).eq('id', memberId);
    if (error) { alert(`Failed to update role: ${error.message}`); return; }
    await onMembersChanged();
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  return (
    <div className="space-y-8">

      {/* ── Invite form ────────────────────────────────────────────── */}
      {canManage && (
        <div className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <h3 className="font-bold text-slate-800 dark:text-white mb-1 flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Invite a team member
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            We'll email the invite link. They'll need to sign up (or sign in) before they can join.
          </p>

          {inviteError && (
            <div className="mb-3 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {inviteError}
            </div>
          )}

          <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
            <input
              type="email" required value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Exclude<OrgRole, 'Owner'>)}
              className="p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            >
              <option value="Admin">Admin</option>
              <option value="Manager">Manager</option>
              <option value="Consultant">Consultant (read-only)</option>
            </select>
            <button
              type="submit" disabled={isInviting}
              className="flex items-center justify-center gap-2 bg-esg-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-esg-700 transition-colors disabled:opacity-50"
            >
              {isInviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Send invite
            </button>
          </form>

          {inviteToken && (
            <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-2">
                ✓ Invitation sent. If the email doesn't arrive, share this link directly:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-white dark:bg-slate-950 p-2 rounded border border-emerald-200 dark:border-emerald-800 text-slate-700 dark:text-slate-300 break-all">
                  {inviteToken}
                </code>
                <button
                  type="button" onClick={() => copyToken(inviteToken)}
                  className="p-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded text-emerald-700 dark:text-emerald-300"
                  title="Copy token"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Pending invitations ────────────────────────────────────── */}
      {canManage && (
        <div>
          <h3 className="font-bold text-slate-800 dark:text-white mb-1 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" /> Pending Invitations
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Invitations that have been sent but not yet accepted.
          </p>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left p-3 font-semibold">Email</th>
                  <th className="text-left p-3 font-semibold">Role</th>
                  <th className="text-left p-3 font-semibold">Expires</th>
                  {isOwner && <th className="p-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                {invitesLoading ? (
                  <tr>
                    <td colSpan={isOwner ? 4 : 3} className="p-6 text-center text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />Loading…
                    </td>
                  </tr>
                ) : pendingInvites.length === 0 ? (
                  <tr>
                    <td colSpan={isOwner ? 4 : 3} className="p-6 text-center text-slate-400 italic">
                      No pending invitations.
                    </td>
                  </tr>
                ) : pendingInvites.map((inv) => {
                  const expired = isExpired(inv.expires_at);
                  return (
                    <tr key={inv.id} className={expired ? 'opacity-50' : ''}>
                      <td className="p-3 font-medium text-slate-800 dark:text-white">{inv.email}</td>
                      <td className="p-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded border ${ROLE_COLORS[inv.role]}`}>
                          {inv.role}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-slate-500 dark:text-slate-400">
                        {expired
                          ? <span className="text-red-500 font-medium">Expired</span>
                          : new Date(inv.expires_at).toLocaleDateString()}
                      </td>
                      {isOwner && (
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleCancelInvite(inv.id, inv.email)}
                            className="flex items-center gap-1 text-xs px-2 py-1 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Cancel invitation"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Active members ─────────────────────────────────────────── */}
      <div>
        <h3 className="font-bold text-slate-800 dark:text-white mb-1 flex items-center gap-2">
          <Users className="w-4 h-4" /> Team Members
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          {members.length} {members.length === 1 ? 'person has' : 'people have'} access to this workspace.
        </p>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left p-3 font-semibold">Email</th>
                <th className="text-left p-3 font-semibold">Role</th>
                <th className="text-left p-3 font-semibold">Joined</th>
                {isOwner && <th className="p-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {members.map((m) => {
                const isSelf = m.user_id === currentUserId;
                const isMemberOwner = m.role === 'Owner';
                const canEditThisRow = canManage && !isMemberOwner && !isSelf;
                return (
                  <tr key={m.id}>
                    <td className="p-3 font-medium text-slate-800 dark:text-white">
                      {m.email ?? '—'} {isSelf && <span className="text-xs text-slate-400 ml-1">(you)</span>}
                    </td>
                    <td className="p-3">
                      {canEditThisRow ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value as OrgRole)}
                          className={`text-xs font-semibold px-2 py-1 rounded border ${ROLE_COLORS[m.role]}`}
                        >
                          <option value="Admin">Admin</option>
                          <option value="Manager">Manager</option>
                          <option value="Consultant">Consultant</option>
                        </select>
                      ) : (
                        <span className={`text-xs font-semibold px-2 py-1 rounded border ${ROLE_COLORS[m.role]}`}>
                          {m.role}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-slate-500 dark:text-slate-400 text-xs">
                      {new Date(m.joined_at).toLocaleDateString()}
                    </td>
                    {isOwner && (
                      <td className="p-3 text-right">
                        {!isMemberOwner && !isSelf && (
                          <button
                            onClick={() => handleDeactivate(m.id, m.email)}
                            className="flex items-center gap-1 text-xs px-2 py-1 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Deactivate access"
                          >
                            <ShieldOff className="w-3.5 h-3.5" /> Deactivate
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={isOwner ? 4 : 3} className="p-6 text-center text-slate-400 italic">
                    No team members yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!canManage && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Only Owners and Admins can invite team members. Only Owners can deactivate access.
          </p>
        )}
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`flex-1 min-w-[160px] py-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
      active
      ? 'border-esg-600 text-esg-700 dark:text-esg-400 dark:border-esg-400 bg-slate-50 dark:bg-slate-700/50'
      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
    }`}
  >
    {icon}
    {label}
  </button>
);

const InputField = ({ label, value, onChange, placeholder, icon, type = 'text', fullWidth }: any) => (
  <div className={fullWidth ? 'md:col-span-2' : ''}>
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{label}</label>
    <div className="relative">
      {icon && <div className="absolute top-3 left-3">{icon}</div>}
      <input
        type={type}
        className={`w-full border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 p-2.5 ${icon ? 'pl-10' : 'pl-3'}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  </div>
);

export default CompanyProfileForm;
