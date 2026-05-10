import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, Sparkles, TrendingUp, Clock, Loader2, AlertCircle,
  UserPlus, CheckCircle2, Copy, ShieldOff, RefreshCw, XCircle,
  Save, Zap, Brain, Key, ShieldCheck, Eye, EyeOff, Hash, DollarSign, KeyRound,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  fetchAiSettings, upsertAiSettings, upsertByokSettings,
  fetchAiUsageLog, fetchMonthlyCallCount,
  removeMember, updateMemberRole, cancelInvite,
  type AiUsageRow, type AiSettings,
} from '../services/dbService';
import { supabase } from '../lib/supabaseClient';
import { logError } from '../services/errorLogService';
import type { OrgMember, OrgRole, OrgInvite } from '../types';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
interface Props {
  organizationId: string;
  currentUserId: string;
  currentUserRole: OrgRole | null;
  members: OrgMember[];
  onMembersChanged: () => void | Promise<void>;
  /** Jump straight to a tab on mount */
  initialTab?: SettingsTab;
}

type SettingsTab = 'team' | 'ai' | 'usage' | 'activity';

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────
const PLATFORM_SOFT_LIMIT_DEFAULT = 100;

const MODELS = [
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    tagline: 'Fastest & cheapest. Good for short suggestions.',
    icon: <Zap className="w-5 h-5" />,
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    tagline: 'Balanced quality, speed and price. Recommended default.',
    icon: <Sparkles className="w-5 h-5" />,
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    tagline: 'Most capable. Best for long-form report generation.',
    icon: <Brain className="w-5 h-5" />,
  },
];

const ACTION_LABELS: Record<string, string> = {
  generateAssessmentSuggestions: 'Materiality assessment',
  generateAssessmentScoring:     'AI scoring',
  generateCanvasSuggestion:      'Canvas suggestion',
  generateSwotInternal:          'SWOT internal',
  generateSwotExternal:          'SWOT external',
  generateKPISuggestions:        'KPI suggestions',
  generateSustainabilityStatement: 'Sustainability statement',
  analyzeTopicQuality:           'Quality check',
  analyzeDMASynthesis:           'DMA synthesis',
  analyzeDMAQuality:             'DMA quality (legacy)',
  generateTasks:                 'Task generation',
};

const ACTION_COLORS: Record<string, string> = {
  generateAssessmentSuggestions: '#3b82f6',
  generateAssessmentScoring:     '#60a5fa',
  generateCanvasSuggestion:      '#10b981',
  generateSwotInternal:          '#f59e0b',
  generateSwotExternal:          '#8b5cf6',
  generateKPISuggestions:        '#ec4899',
  generateSustainabilityStatement: '#06b6d4',
  analyzeTopicQuality:           '#f97316',
  analyzeDMASynthesis:           '#84cc16',
  analyzeDMAQuality:             '#a78bfa',
  generateTasks:                 '#fb923c',
};

const ROLE_COLORS: Record<OrgRole, string> = {
  Owner:      'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  Admin:      'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
  Manager:    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  Consultant: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
};

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────
const SettingsDashboard: React.FC<Props> = ({
  organizationId,
  currentUserId,
  currentUserRole,
  members,
  onMembersChanged,
  initialTab = 'team',
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // ── AI data ──────────────────────────────────────────────────────
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [usage, setUsage] = useState<AiUsageRow[]>([]);
  const [monthlyCount, setMonthlyCount] = useState(0);
  const [aiLoading, setAiLoading] = useState(true);

  const loadAIData = useCallback(async () => {
    setAiLoading(true);
    try {
      const [settings, log, count] = await Promise.all([
        fetchAiSettings(organizationId),
        fetchAiUsageLog(organizationId, 500),
        fetchMonthlyCallCount(organizationId),
      ]);
      setAiSettings(settings);
      setUsage(log);
      setMonthlyCount(count);
    } catch (e) {
      console.error("Failed to load AI data:", e);
    } finally {
      setAiLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadAIData();
  }, [loadAIData]);

  const TAB_DEFS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'team',     label: 'Team',          icon: <Users className="w-4 h-4 flex-shrink-0" /> },
    { id: 'ai',       label: 'AI',            icon: <Sparkles className="w-4 h-4 flex-shrink-0" /> },
    { id: 'usage',    label: 'Usage',         icon: <TrendingUp className="w-4 h-4 flex-shrink-0" /> },
    { id: 'activity', label: 'Activity',      icon: <Clock className="w-4 h-4 flex-shrink-0" /> },
  ];

  return (
    <div className="w-full animate-in fade-in duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Settings</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Manage your workspace — team members, AI configuration, and usage.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {TAB_DEFS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 min-w-[120px] py-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                activeTab === id
                  ? 'border-esg-600 text-esg-700 dark:text-esg-400 dark:border-esg-400 bg-slate-50 dark:bg-slate-700/50'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        <div className="p-4 md:p-8">
          {activeTab === 'team' && (
            <TeamSection
              organizationId={organizationId}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              members={members}
              onMembersChanged={onMembersChanged}
            />
          )}
          {activeTab === 'ai' && (
            <AISection
              organizationId={organizationId}
              currentUserRole={currentUserRole}
              settings={aiSettings}
              isLoading={aiLoading}
              onSettingsChanged={(s) => setAiSettings(s)}
            />
          )}
          {activeTab === 'usage' && (
            <UsageSection
              usage={usage}
              monthlyCount={monthlyCount}
              softQuotaMonthly={aiSettings?.soft_quota_monthly ?? null}
              useBYOK={aiSettings?.use_byok ?? false}
              isLoading={aiLoading}
            />
          )}
          {activeTab === 'activity' && (
            <ActivitySection usage={usage} isLoading={aiLoading} onRefresh={loadAIData} />
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Team section
// ─────────────────────────────────────────────────────────────────
interface TeamSectionProps {
  organizationId: string;
  currentUserId: string;
  currentUserRole: OrgRole | null;
  members: OrgMember[];
  onMembersChanged: () => void | Promise<void>;
}

const TeamSection: React.FC<TeamSectionProps> = ({
  organizationId, currentUserId, currentUserRole, members, onMembersChanged,
}) => {
  const canManage = currentUserRole === 'Owner' || currentUserRole === 'Admin';
  const isOwner   = currentUserRole === 'Owner';
  const { resetPasswordForEmail } = useAuth();
  const [resetingId,    setResetingId]    = useState<string | null>(null);
  const [resetSentId,   setResetSentId]   = useState<string | null>(null);

  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteRole, setInviteRole]     = useState<Exclude<OrgRole, 'Owner'>>('Manager');
  const [isInviting, setIsInviting]     = useState(false);
  const [inviteError, setInviteError]   = useState<string | null>(null);
  const [inviteToken, setInviteToken]   = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);
  const [actionError, setActionError]   = useState<string | null>(null);
  const [resendingId, setResendingId]   = useState<string | null>(null);
  const [fallbackLink, setFallbackLink] = useState<{ inviteId: string; link: string } | null>(null);

  const [pendingInvites, setPendingInvites]   = useState<OrgInvite[]>([]);
  const [invitesLoading, setInvitesLoading]   = useState(false);
  const [invitesError, setInvitesError]       = useState<string | null>(null);

  const fetchPendingInvites = useCallback(async () => {
    setInvitesLoading(true);
    setInvitesError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in.');
      const resp = await fetch('/.netlify/functions/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'list', organization_id: organizationId }),
      });
      const body = await resp.json();
      if (!resp.ok) throw new Error(body.error ?? 'Failed to load invitations.');
      setPendingInvites((body.invites ?? []) as OrgInvite[]);
    } catch (e: any) {
      setInvitesError(e?.message ?? 'Failed to load invitations.');
    } finally {
      setInvitesLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { fetchPendingInvites(); }, [fetchPendingInvites]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteToken(null);
    setIsInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in.');
      const resp = await fetch('/.netlify/functions/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
    setActionError(null);
    try {
      await removeMember(memberId);
    } catch (error: any) {
      setActionError(`Failed to deactivate: ${error.message}`);
      logError({ context: 'member-management', action: 'deactivate_member', error, organizationId });
      return;
    }
    await onMembersChanged();
  };

  const handleCancelInvite = async (inviteId: string, email: string) => {
    if (!window.confirm(`Cancel invitation for ${email}?`)) return;
    setActionError(null);
    try {
      await cancelInvite(inviteId);
    } catch (error: any) {
      setActionError(`Failed to cancel invitation: ${error.message}`);
      logError({ context: 'member-management', action: 'cancel_invite', error, organizationId });
      return;
    }
    await fetchPendingInvites();
  };

  const handleResendInvite = async (inviteId: string, email: string) => {
    setResendingId(inviteId);
    setFallbackLink(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in.');
      const resp = await fetch('/.netlify/functions/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'resend', invite_id: inviteId, email, organization_id: organizationId }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error ?? 'Failed to resend invitation.');
      if (body.fallback_link) setFallbackLink({ inviteId, link: body.fallback_link });
      else alert(`Invitation resent to ${email}. The new link is valid for 1 hour.`);
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to resend invitation.');
      logError({ context: 'member-management', action: 'resend_invite', error: err, organizationId });
    } finally {
      setResendingId(null);
    }
  };

  const handleResetPassword = async (memberId: string, email: string | null) => {
    if (!email) return;
    setResetingId(memberId);
    await resetPasswordForEmail(email); // always succeeds silently — don't reveal account existence
    setResetingId(null);
    setResetSentId(memberId);
    setTimeout(() => setResetSentId(null), 4000);
  };

  const handleRoleChange = async (memberId: string, newRole: OrgRole) => {
    setActionError(null);
    try {
      await updateMemberRole(memberId, newRole);
    } catch (error: any) {
      setActionError(`Failed to update role: ${error.message}`);
      logError({ context: 'member-management', action: 'update_role', error, organizationId });
      return;
    }
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
      {actionError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {actionError}
        </div>
      )}

      {/* Invite form */}
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
                <button type="button" onClick={() => copyToken(inviteToken)}
                  className="p-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded text-emerald-700 dark:text-emerald-300">
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending invitations */}
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
                  {isOwner && <th className="p-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                {invitesLoading ? (
                  <tr><td colSpan={isOwner ? 4 : 3} className="p-6 text-center text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />Loading…
                  </td></tr>
                ) : invitesError ? (
                  <tr><td colSpan={isOwner ? 4 : 3} className="p-6 text-center text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4 inline-block mr-1 mb-0.5" />{invitesError}
                  </td></tr>
                ) : pendingInvites.length === 0 ? (
                  <tr><td colSpan={isOwner ? 4 : 3} className="p-6 text-center text-slate-400 italic">
                    No pending invitations.
                  </td></tr>
                ) : pendingInvites.map((inv) => {
                  const expired = isExpired(inv.expires_at);
                  return (
                    <tr key={inv.id} className={expired ? 'opacity-50' : ''}>
                      <td className="p-3 font-medium text-slate-800 dark:text-white">{inv.email}</td>
                      <td className="p-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded border ${ROLE_COLORS[inv.role]}`}>{inv.role}</span>
                      </td>
                      <td className="p-3 text-xs text-slate-500 dark:text-slate-400">
                        {expired ? <span className="text-red-500 font-medium">Expired</span> : new Date(inv.expires_at).toLocaleDateString()}
                      </td>
                      {isOwner && (
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleResendInvite(inv.id, inv.email)} disabled={resendingId === inv.id}
                              className="flex items-center gap-1 text-xs px-2 py-1 text-slate-500 hover:text-esg-600 hover:bg-esg-50 dark:hover:bg-esg-900/20 rounded transition-colors disabled:opacity-50">
                              {resendingId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              Resend
                            </button>
                            <button onClick={() => handleCancelInvite(inv.id, inv.email)}
                              className="flex items-center gap-1 text-xs px-2 py-1 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                              <XCircle className="w-3.5 h-3.5" /> Cancel
                            </button>
                          </div>
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

      {/* Fallback link banner */}
      {fallbackLink && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm">
          <p className="font-semibold text-amber-800 dark:text-amber-200 mb-1">Email delivery unavailable — share this link directly:</p>
          <p className="text-amber-700 dark:text-amber-300 text-xs mb-2">Copy and send this link to the invitee. It expires in 1 hour.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-white dark:bg-slate-950 p-2 rounded border border-amber-200 dark:border-amber-700 text-slate-700 dark:text-slate-300 break-all">
              {fallbackLink.link}
            </code>
            <button onClick={() => { navigator.clipboard.writeText(fallbackLink.link); copyToken(fallbackLink.link); }}
              className="p-2 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded text-amber-700 dark:text-amber-300">
              {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Active members */}
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
                {isOwner && <th className="p-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {members.map((m) => {
                const isSelf         = m.user_id === currentUserId;
                const isMemberOwner  = m.role === 'Owner';
                const canEditThisRow = canManage && !isMemberOwner && !isSelf;
                return (
                  <tr key={m.id}>
                    <td className="p-3 font-medium text-slate-800 dark:text-white">
                      {m.email ?? '—'} {isSelf && <span className="text-xs text-slate-400 ml-1">(you)</span>}
                    </td>
                    <td className="p-3">
                      {canEditThisRow ? (
                        <select value={m.role} onChange={(e) => handleRoleChange(m.id, e.target.value as OrgRole)}
                          className={`text-xs font-semibold px-2 py-1 rounded border ${ROLE_COLORS[m.role]}`}>
                          <option value="Admin">Admin</option>
                          <option value="Manager">Manager</option>
                          <option value="Consultant">Consultant</option>
                        </select>
                      ) : (
                        <span className={`text-xs font-semibold px-2 py-1 rounded border ${ROLE_COLORS[m.role]}`}>{m.role}</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-500 dark:text-slate-400 text-xs">{new Date(m.joined_at).toLocaleDateString()}</td>
                    {isOwner && (
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Reset password — available for any member except self */}
                          {canManage && !isSelf && m.email && (
                            resetSentId === m.id ? (
                              <span className="flex items-center gap-1 text-xs px-2 py-1 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Sent
                              </span>
                            ) : (
                              <button
                                onClick={() => handleResetPassword(m.id, m.email)}
                                disabled={resetingId === m.id}
                                className="flex items-center gap-1 text-xs px-2 py-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors disabled:opacity-50"
                                title={`Send password reset email to ${m.email}`}
                              >
                                {resetingId === m.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <KeyRound className="w-3.5 h-3.5" />}
                                Reset pwd
                              </button>
                            )
                          )}
                          {/* Deactivate — owners only, not self, not other owners */}
                          {!isMemberOwner && !isSelf && (
                            <button onClick={() => handleDeactivate(m.id, m.email)}
                              className="flex items-center gap-1 text-xs px-2 py-1 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                              <ShieldOff className="w-3.5 h-3.5" /> Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr><td colSpan={isOwner ? 4 : 3} className="p-6 text-center text-slate-400 italic">No team members yet.</td></tr>
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

// ─────────────────────────────────────────────────────────────────
// AI section — model selector + BYOK
// ─────────────────────────────────────────────────────────────────
interface AISectionProps {
  organizationId: string;
  currentUserRole: OrgRole | null;
  settings: AiSettings | null;
  isLoading: boolean;
  onSettingsChanged: (s: AiSettings) => void;
}

const AISection: React.FC<AISectionProps> = ({
  organizationId, currentUserRole, settings, isLoading, onSettingsChanged,
}) => {
  const canManage = currentUserRole === 'Owner' || currentUserRole === 'Admin';

  const [model,      setModel]      = useState('gemini-2.5-flash');
  const [savedModel, setSavedModel] = useState('gemini-2.5-flash');
  const [isSaving,   setIsSaving]   = useState(false);
  const [saveError,  setSaveError]  = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  const [useBYOK,       setUseBYOK]       = useState(false);
  const [savedUseBYOK,  setSavedUseBYOK]  = useState(false);
  const [byokProvider,  setByokProvider]  = useState('gemini');
  const [byokKeyInput,  setByokKeyInput]  = useState('');
  const [hasStoredKey,  setHasStoredKey]  = useState(false);
  const [showKey,       setShowKey]       = useState(false);
  const [isSavingBYOK,  setIsSavingBYOK] = useState(false);
  const [byokSaveError, setByokSaveError] = useState<string | null>(null);
  const [byokSaveStatus, setByokSaveStatus] = useState<'idle' | 'saved'>('idle');

  // Sync local state when settings load
  useEffect(() => {
    if (!settings) return;
    setModel(settings.model);
    setSavedModel(settings.model);
    setUseBYOK(settings.use_byok);
    setSavedUseBYOK(settings.use_byok);
    setByokProvider(settings.byok_provider ?? 'gemini');
    setHasStoredKey(settings.has_byok_key);
  }, [settings]);

  const isDirty     = model !== savedModel;
  const isByokDirty = useBYOK !== savedUseBYOK || byokKeyInput !== '';

  const handleSaveModel = async () => {
    setIsSaving(true); setSaveError(null);
    try {
      await upsertAiSettings(organizationId, model);
      setSavedModel(model);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
      onSettingsChanged({ ...(settings ?? { model, use_byok: useBYOK, byok_provider: byokProvider, has_byok_key: hasStoredKey, soft_quota_monthly: null }), model });
    } catch (e: any) { setSaveError(e.message); }
    finally { setIsSaving(false); }
  };

  const handleSaveBYOK = async () => {
    setIsSavingBYOK(true); setByokSaveError(null);
    try {
      const payload: Parameters<typeof upsertByokSettings>[1] = {
        use_byok: useBYOK,
        byok_provider: useBYOK ? byokProvider : null,
      };
      if (byokKeyInput.trim()) payload.byok_api_key = byokKeyInput.trim();
      else if (!useBYOK && hasStoredKey) payload.byok_api_key = null;

      await upsertByokSettings(organizationId, payload);
      setSavedUseBYOK(useBYOK);
      const newHasKey = useBYOK ? (byokKeyInput.trim() !== '' || hasStoredKey) : false;
      setHasStoredKey(newHasKey);
      setByokKeyInput('');
      setByokSaveStatus('saved');
      setTimeout(() => setByokSaveStatus('idle'), 3000);
      onSettingsChanged({ ...(settings ?? { model: savedModel, use_byok: useBYOK, byok_provider: byokProvider, has_byok_key: newHasKey, soft_quota_monthly: null }), use_byok: useBYOK, byok_provider: useBYOK ? byokProvider : null, has_byok_key: newHasKey });
    } catch (e: any) { setByokSaveError(e.message); }
    finally { setIsSavingBYOK(false); }
  };

  if (isLoading) return <LoadingSpinner label="Loading AI settings…" />;

  return (
    <div className="space-y-8">
      {/* Model selector */}
      <section>
        <header className="mb-4">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-esg-600" /> AI Model
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Choose which Gemini model is used for AI-assisted features in this workspace.
          </p>
        </header>
        {saveError && <ErrorBanner message={saveError} />}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODELS.map((m) => {
            const selected = model === m.id;
            return (
              <button key={m.id} type="button"
                onClick={() => canManage && setModel(m.id)}
                disabled={!canManage}
                className={`text-left p-4 rounded-xl border-2 transition-all ${selected ? 'border-esg-500 bg-esg-50 dark:bg-esg-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className={`p-2 rounded-lg ${selected ? 'bg-esg-100 text-esg-700 dark:bg-esg-900/50 dark:text-esg-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                    {m.icon}
                  </div>
                  {savedModel === m.id && (
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-slate-800 dark:text-white text-sm">{m.label}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{m.tagline}</p>
              </button>
            );
          })}
        </div>
        {canManage && (
          <div className="mt-4 flex items-center justify-between">
            <StatusHint dirty={isDirty} saveStatus={saveStatus} />
            <button type="button" onClick={handleSaveModel} disabled={!isDirty || isSaving}
              className="flex items-center gap-2 bg-esg-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-esg-700 transition-colors disabled:opacity-50">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save model choice
            </button>
          </div>
        )}
        {!canManage && <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">Only Owners and Admins can change the AI model.</p>}
      </section>

      {/* BYOK */}
      <section>
        <header className="mb-4">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Key className="w-4 h-4 text-esg-600" /> Bring Your Own Key (BYOK)
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Supply your own Gemini API key to bypass the monthly platform quota.
          </p>
        </header>
        {byokSaveError && <ErrorBanner message={byokSaveError} />}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-4">
          {/* Toggle */}
          <label className={`flex items-center justify-between gap-3 ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
            <div className="flex items-center gap-2">
              {useBYOK ? <ShieldCheck className="w-5 h-5 text-emerald-500" /> : <ShieldOff className="w-5 h-5 text-slate-400" />}
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">{useBYOK ? 'BYOK enabled' : 'BYOK disabled'}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {useBYOK ? 'AI calls use your own API key and bypass platform quota.' : 'AI calls use the platform Gemini key (quota applies).'}
                </p>
              </div>
            </div>
            <div role="switch" aria-checked={useBYOK}
              onClick={() => canManage && setUseBYOK(!useBYOK)}
              className={`relative inline-flex w-11 h-6 rounded-full transition-colors flex-shrink-0 ${useBYOK ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${useBYOK ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </label>

          {useBYOK && (
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-700">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Provider</label>
                <select value={byokProvider} onChange={(e) => canManage && setByokProvider(e.target.value)} disabled={!canManage}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm px-3 py-2 disabled:opacity-60">
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  API Key {hasStoredKey && !byokKeyInput && <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-normal">· key stored</span>}
                </label>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={byokKeyInput}
                    onChange={(e) => canManage && setByokKeyInput(e.target.value)}
                    disabled={!canManage}
                    placeholder={hasStoredKey ? 'Enter a new key to replace the stored one' : 'AIza...'}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm px-3 py-2 pr-10 font-mono disabled:opacity-60" />
                  <button type="button" onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">Your key is stored encrypted on the server and is never sent to the browser.</p>
              </div>
            </div>
          )}

          {canManage && (
            <div className="flex items-center justify-between pt-2">
              <StatusHint dirty={isByokDirty} saveStatus={byokSaveStatus} />
              <button type="button" onClick={handleSaveBYOK} disabled={!isByokDirty || isSavingBYOK}
                className="flex items-center gap-2 bg-esg-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-esg-700 transition-colors disabled:opacity-50">
                {isSavingBYOK ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save BYOK settings
              </button>
            </div>
          )}
          {!canManage && <p className="text-xs text-slate-500 dark:text-slate-400">Only Owners and Admins can configure BYOK.</p>}
        </div>
      </section>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Usage section — quota bar + stats + chart
// ─────────────────────────────────────────────────────────────────
interface UsageSectionProps {
  usage: AiUsageRow[];
  monthlyCount: number;
  softQuotaMonthly: number | null;
  useBYOK: boolean;
  isLoading: boolean;
}

const UsageSection: React.FC<UsageSectionProps> = ({
  usage, monthlyCount, softQuotaMonthly, useBYOK, isLoading,
}) => {
  const stats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthUsage = usage.filter((r) => new Date(r.created_at) >= monthStart);
    const totalCalls  = monthUsage.length;
    const totalTokens = monthUsage.reduce((s, r) => s + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0);
    const totalCost   = monthUsage.reduce((s, r) => s + Number(r.estimated_cost_usd ?? 0), 0);
    const successRate = totalCalls === 0 ? 100 : Math.round(monthUsage.filter((r) => r.success).length / totalCalls * 100);
    return { totalCalls, totalTokens, totalCost, successRate };
  }, [usage]);

  const chartData = useMemo(() => {
    const days: Record<string, Record<string, number>> = {};
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      days[d.toISOString().slice(0, 10)] = {};
    }
    usage.forEach((row) => {
      if (!row.success) return;
      const key = new Date(row.created_at).toISOString().slice(0, 10);
      if (days[key] === undefined) return;
      days[key][row.action] = (days[key][row.action] ?? 0) + 1;
    });
    return Object.entries(days).map(([date, byAction]) => ({ date: date.slice(5), ...byAction }));
  }, [usage]);

  const seenActions = useMemo(() => {
    const set = new Set<string>();
    chartData.forEach((d) => Object.keys(d).forEach((k) => { if (k !== 'date') set.add(k); }));
    return Array.from(set);
  }, [chartData]);

  if (isLoading) return <LoadingSpinner label="Loading usage data…" />;

  const limit = softQuotaMonthly ?? PLATFORM_SOFT_LIMIT_DEFAULT;

  return (
    <div className="space-y-8">
      {/* Quota bar */}
      {!useBYOK && (
        <section>
          <header className="mb-3">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Hash className="w-4 h-4 text-esg-600" /> Monthly call quota
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Platform quota resets on the 1st of each month. Enable BYOK (AI tab) to bypass it.
            </p>
          </header>
          <QuotaBar used={monthlyCount} limit={limit} />
        </section>
      )}

      {/* Stat cards */}
      <section>
        <header className="mb-4">
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-esg-600" /> This month
          </h3>
        </header>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Calls"        value={stats.totalCalls.toLocaleString()}                                       icon={<Hash className="w-4 h-4 text-blue-500" />} />
          <StatCard label="Tokens"       value={formatTokens(stats.totalTokens)}                                         icon={<Sparkles className="w-4 h-4 text-purple-500" />} />
          <StatCard label="Est. cost"    value={`$${stats.totalCost.toFixed(stats.totalCost < 1 ? 4 : 2)}`}              icon={<DollarSign className="w-4 h-4 text-emerald-500" />} />
          <StatCard label="Success rate" value={`${stats.successRate}%`}                                                  icon={<CheckCircle2 className="w-4 h-4 text-amber-500" />} />
        </div>

        {/* 30-day chart */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Last 30 days · calls per day, by feature
          </h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#94a3b8" interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'rgba(15,23,42,0.95)', border: 'none', borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: '#fff' }} labelStyle={{ color: '#cbd5e1', fontWeight: 600 }}
                  formatter={(v: number, name: string) => [v, ACTION_LABELS[name] ?? name]}
                />
                <Legend formatter={(v) => <span className="text-xs text-slate-600 dark:text-slate-400">{ACTION_LABELS[v] ?? v}</span>} wrapperStyle={{ fontSize: 11 }} />
                {seenActions.map((action) => (
                  <Bar key={action} dataKey={action} stackId="a" fill={ACTION_COLORS[action] ?? '#94a3b8'} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Activity section — recent AI call log
// ─────────────────────────────────────────────────────────────────
interface ActivitySectionProps {
  usage: AiUsageRow[];
  isLoading: boolean;
  onRefresh: () => void;
}

const ActivitySection: React.FC<ActivitySectionProps> = ({ usage, isLoading, onRefresh }) => {
  if (isLoading) return <LoadingSpinner label="Loading activity…" />;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-esg-600" /> Recent activity
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Last 50 AI calls in your workspace.</p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </header>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left p-3 font-semibold">Time</th>
                <th className="text-left p-3 font-semibold">User</th>
                <th className="text-left p-3 font-semibold">Feature</th>
                <th className="text-left p-3 font-semibold">Model</th>
                <th className="text-right p-3 font-semibold">Tokens</th>
                <th className="text-right p-3 font-semibold">Cost</th>
                <th className="text-center p-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {usage.slice(0, 50).map((r) => {
                const tokens = (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
                return (
                  <tr key={r.id}>
                    <td className="p-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{formatRelativeTime(r.created_at)}</td>
                    <td className="p-3 text-slate-700 dark:text-slate-300 text-xs">{r.user_email ?? '—'}</td>
                    <td className="p-3 text-slate-700 dark:text-slate-300 text-xs">{ACTION_LABELS[r.action] ?? r.action}</td>
                    <td className="p-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{r.model.replace('gemini-', '')}</td>
                    <td className="p-3 text-right text-slate-700 dark:text-slate-300 text-xs font-mono">{formatTokens(tokens)}</td>
                    <td className="p-3 text-right text-slate-700 dark:text-slate-300 text-xs font-mono">
                      {r.estimated_cost_usd != null ? `$${Number(r.estimated_cost_usd).toFixed(4)}` : '—'}
                    </td>
                    <td className="p-3 text-center">
                      {r.success
                        ? <span className="inline-flex w-2 h-2 bg-emerald-500 rounded-full" title="Success" />
                        : <span className="inline-flex w-2 h-2 bg-red-500 rounded-full" title="Failed" />}
                    </td>
                  </tr>
                );
              })}
              {usage.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-slate-400 italic">
                  No AI calls yet. Try the AI Suggest button on Business Model Canvas or SWOT.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Shared mini-components
// ─────────────────────────────────────────────────────────────────
const QuotaBar: React.FC<{ used: number; limit: number }> = ({ used, limit }) => {
  const pct = limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 0;
  const isWarning = pct >= 80 && pct < 100;
  const isOver    = pct >= 100;
  const barColor  = isOver ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-esg-500';
  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-2">
      {(isOver || isWarning) && (
        <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs border ${isOver
          ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
          : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'}`}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {isOver
            ? 'Soft quota exceeded. AI calls are still allowed — enable BYOK or contact support to raise the limit.'
            : 'Approaching monthly quota. Consider enabling BYOK (AI tab) to avoid interruptions.'}
        </div>
      )}
      <div className="flex justify-between items-center text-xs text-slate-600 dark:text-slate-400">
        <span>{used.toLocaleString()} calls used</span>
        <span>{limit.toLocaleString()} soft limit</span>
      </div>
      <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-400">{pct}% of monthly soft limit used</p>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
    <div className="flex items-center gap-2 mb-1 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">{icon} {label}</div>
    <div className="text-xl font-bold text-slate-800 dark:text-white">{value}</div>
  </div>
);

const LoadingSpinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center justify-center h-48 text-slate-500 dark:text-slate-400 gap-2">
    <Loader2 className="w-4 h-4 animate-spin" /> {label}
  </div>
);

const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div className="mb-3 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {message}
  </div>
);

const StatusHint: React.FC<{ dirty: boolean; saveStatus: 'idle' | 'saved' }> = ({ dirty, saveStatus }) => (
  <div className="text-xs text-slate-500 dark:text-slate-400">
    {dirty ? (
      <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved changes
      </span>
    ) : saveStatus === 'saved' ? (
      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
        <CheckCircle2 className="w-3.5 h-3.5" /> Saved
      </span>
    ) : null}
  </div>
);

// ─────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────
function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatRelativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default SettingsDashboard;
