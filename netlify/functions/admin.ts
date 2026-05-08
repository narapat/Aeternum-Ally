/**
 * admin.ts — Platform Admin API
 *
 * Authentication model
 * ────────────────────
 * Bootstrap  (platform_admins table is EMPTY):
 *   POST { action: 'admin_login', email, password }
 *   Server verifies against PLATFORM_ADMIN_EMAIL + PLATFORM_ADMIN_PASSWORD env vars.
 *   On success: seeds first admin row + returns a signed admin JWT (8 h).
 *
 * Normal     (platform_admins table has rows):
 *   POST { action: 'request_admin_magic_link', email }
 *   Server generates a Supabase magic link (server-side, bypasses redirect allowlist)
 *   and sends a custom admin-branded email via Resend.
 *   POST { action: 'verify_admin' } with Bearer <supabase-token>
 *   After the magic link is clicked, AdminApp exchanges the Supabase session
 *   for a signed admin JWT by calling this action.
 *
 * All other actions require Bearer <admin-jwt> (issued by this function).
 *
 * The admin JWT is signed with PLATFORM_ADMIN_JWT_SECRET (or derived from
 * SUPABASE_SERVICE_ROLE_KEY if the secret is not set — no extra env var needed).
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const supabaseUrl    = process.env.SUPABASE_URL    ?? process.env.VITE_SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const appUrl         = (process.env.APP_URL ?? process.env.VITE_APP_URL ?? 'http://localhost:8888').replace(/\/$/, '');
const resendApiKey   = process.env.RESEND_API_KEY  ?? '';
const fromEmail      = process.env.RESEND_FROM_EMAIL ?? 'noreply@aeternumally.com';

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Custom admin JWT  (Node built-in crypto — no npm deps)
// ---------------------------------------------------------------------------
function getJwtSecret(): string {
  return process.env.PLATFORM_ADMIN_JWT_SECRET
    ?? crypto.createHash('sha256').update(serviceRoleKey + ':admin-portal').digest('hex');
}

function signAdminToken(email: string): string {
  const secret  = getJwtSecret();
  const header  = Buffer.from('{"alg":"HS256","typ":"AdminJWT"}').toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub:  email,
    role: 'platform_admin',
    iat:  Math.floor(Date.now() / 1000),
    exp:  Math.floor(Date.now() / 1000) + 8 * 3600,   // 8 h
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret)
    .update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function verifyAdminToken(token: string): { email: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw Object.assign(new Error('Malformed admin token'), { status: 401 });
  const [header, payload, sig] = parts;
  const secret   = getJwtSecret();
  const expected = crypto.createHmac('sha256', secret)
    .update(`${header}.${payload}`).digest('base64url');
  // Constant-time compare to prevent timing attacks
  const sigBuf  = Buffer.from(sig,      'base64url');
  const expBuf  = Buffer.from(expected, 'base64url');
  const safe    = sigBuf.length === expBuf.length
    ? crypto.timingSafeEqual(sigBuf, expBuf)
    : false;
  if (!safe) throw Object.assign(new Error('Invalid admin token'), { status: 401 });
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (data.exp < Math.floor(Date.now() / 1000)) throw Object.assign(new Error('Admin token expired'), { status: 401 });
  if (data.role !== 'platform_admin') throw Object.assign(new Error('Invalid token role'), { status: 401 });
  return { email: data.sub };
}

// ---------------------------------------------------------------------------
// Auth middleware — verifies custom admin JWT + checks platform_admins table
// ---------------------------------------------------------------------------
async function requireAdmin(authHeader: string | undefined): Promise<{ email: string }> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing Authorization header'), { status: 401 });
  }
  const token = authHeader.slice(7);
  const { email } = verifyAdminToken(token);       // throws if invalid / expired

  const sb = getAdminClient();
  const { data: row } = await sb
    .from('platform_admins').select('is_active').eq('email', email).maybeSingle();
  if (!row?.is_active) throw Object.assign(new Error('Admin account inactive'), { status: 403 });

  return { email };
}

// ---------------------------------------------------------------------------
// Pre-auth: admin_login  (bootstrap — only works when table is empty)
// ---------------------------------------------------------------------------
async function handleAdminLogin(body: any): Promise<object> {
  const email    = (body.email    ?? '').trim().toLowerCase();
  const password = (body.password ?? '').trim();
  if (!email || !password) throw Object.assign(new Error('email and password are required'), { status: 400 });

  const sb = getAdminClient();

  // Only allowed when the table is empty
  const { count } = await sb
    .from('platform_admins').select('id', { count: 'exact', head: true });

  if ((count ?? 0) > 0) {
    throw Object.assign(
      new Error('Admin accounts already exist — use the magic link to sign in.'),
      { status: 403 }
    );
  }

  // Verify against .env credentials
  const envEmail    = (process.env.PLATFORM_ADMIN_EMAIL    ?? '').toLowerCase();
  const envPassword =  process.env.PLATFORM_ADMIN_PASSWORD ?? '';

  if (!envEmail || !envPassword) {
    throw Object.assign(
      new Error('PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD must be set in environment variables'),
      { status: 500 }
    );
  }

  const emailMatch = email === envEmail;
  // Constant-time password compare to prevent timing attacks
  const pwMatch = password.length === envPassword.length
    && crypto.timingSafeEqual(Buffer.from(password), Buffer.from(envPassword));

  if (!emailMatch || !pwMatch) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  // Seed the first admin row
  await sb.from('platform_admins').insert({ email, created_by: null });
  console.info('[admin] Bootstrap: first platform admin seeded:', email);

  return { token: signAdminToken(email), email };
}

// ---------------------------------------------------------------------------
// Pre-auth: request_admin_magic_link  (normal mode — table has rows)
// ---------------------------------------------------------------------------
async function handleRequestAdminMagicLink(body: any): Promise<object> {
  const email = (body.email ?? '').trim().toLowerCase();
  if (!email) throw Object.assign(new Error('email is required'), { status: 400 });

  const sb = getAdminClient();

  // Check email is an active platform admin (silent success if not — don't leak)
  const { data: adminRow } = await sb
    .from('platform_admins').select('id, is_active').eq('email', email).maybeSingle();

  if (!adminRow?.is_active) {
    console.info('[admin] magic-link requested for non-admin email:', email);
    return { sent: true };   // silent — don't reveal whether this is an admin
  }

  // Generate magic link server-side — bypasses Supabase redirect-URL allowlist
  const { data: linkData, error: linkError } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${appUrl}/admin` },
  });

  if (linkError || !linkData?.properties?.action_link) {
    console.error('[admin] generateLink failed:', linkError?.message);
    throw Object.assign(new Error('Failed to generate sign-in link'), { status: 500 });
  }

  const magicLink = linkData.properties.action_link;

  if (!resendApiKey) {
    // Dev mode — return link directly (shown in UI)
    console.info(`\n[admin] ✉️  MAGIC LINK (dev — no RESEND_API_KEY):\n${magicLink}\n`);
    return { sent: true, dev_link: magicLink };
  }

  try {
    await sendAdminMagicLinkEmail(email, magicLink);
    return { sent: true };
  } catch (emailErr: any) {
    // Email sending failed (e.g. domain not verified in Resend).
    // Fall back to returning the link directly so the admin is never locked out.
    console.error('[admin] Resend failed, returning dev_link fallback:', emailErr?.message);
    return { sent: true, dev_link: magicLink, email_error: emailErr?.message };
  }
}

// ---------------------------------------------------------------------------
// Pre-auth: verify_admin  (called after magic link redirect; exchanges
//           Supabase session for a signed admin JWT)
// ---------------------------------------------------------------------------
async function handleVerifyAdmin(authHeader: string | undefined): Promise<object> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing Authorization header'), { status: 401 });
  }
  const supabaseToken = authHeader.slice(7);

  const sb = getAdminClient();
  const { data: userData, error } = await sb.auth.getUser(supabaseToken);
  if (error || !userData.user) throw Object.assign(new Error('Invalid Supabase token'), { status: 401 });

  const email = (userData.user.email ?? '').toLowerCase();
  const { data: row } = await sb
    .from('platform_admins').select('id, is_active').eq('email', email).maybeSingle();
  if (!row?.is_active) throw Object.assign(new Error('Not an active platform admin'), { status: 403 });

  // Sign out of Supabase — we use our own token from here
  await sb.auth.admin.signOut(supabaseToken);

  return { token: signAdminToken(email), email };
}

// ---------------------------------------------------------------------------
// Post-auth: admin_dashboard
// ---------------------------------------------------------------------------
async function handleAdminDashboard(): Promise<object> {
  const sb    = getAdminClient();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [orgsRes, membersRes, aiTodayRes, aiErrorsRes] = await Promise.all([
    sb.from('organizations').select('id, is_active'),
    sb.from('organization_members').select('id', { count: 'exact', head: true }),
    sb.from('ai_usage_log').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
    sb.from('ai_usage_log').select('id', { count: 'exact', head: true }).not('error', 'is', null),
  ]);

  const orgs = orgsRes.data ?? [];
  return {
    totalCompanies:    orgs.length,
    activeCompanies:   orgs.filter((o: any) => o.is_active !== false).length,
    inactiveCompanies: orgs.filter((o: any) => o.is_active === false).length,
    totalUsers:        membersRes.count ?? 0,
    aiCallsToday:      aiTodayRes.count ?? 0,
    aiErrorsTotal:     aiErrorsRes.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Post-auth: company_stats  (all sections in one call)
// ---------------------------------------------------------------------------
async function handleCompanyStats(body: any): Promise<object> {
  const orgId = (body.org_id ?? '').trim();
  if (!orgId) throw Object.assign(new Error('org_id is required'), { status: 400 });

  const sb = getAdminClient();

  // Fetch everything in parallel
  const [profileRes, membersRes, invitesRes, aiRes] = await Promise.all([
    sb.from('company_profiles').select('name').eq('organization_id', orgId).maybeSingle(),
    sb.from('organization_members').select('user_id, email, role').eq('organization_id', orgId),
    sb.from('organization_invites').select('email, role, expires_at, created_at').eq('organization_id', orgId),
    sb.from('ai_usage_log')
      .select('action, quota_type, input_tokens, output_tokens, duration_ms, success, error_message, created_at')
      .eq('organization_id', orgId),
  ]);

  // ── 1. Users & Roles ──────────────────────────────────────────────────────
  const members = membersRes.data ?? [];
  const roleBreakdown: Record<string, number> = { Owner: 0, Admin: 0, Manager: 0, Consultant: 0 };
  for (const m of members) {
    if (roleBreakdown[m.role] !== undefined) roleBreakdown[m.role]++;
    else roleBreakdown[m.role] = 1;
  }

  // ── 2. Invitations ────────────────────────────────────────────────────────
  const invites    = invitesRes.data ?? [];
  const memberEmails = new Set(members.map((m: any) => (m.email ?? '').toLowerCase()));
  const now        = Date.now();

  const inviteStats = invites.map((inv: any) => {
    let status: string;
    if (memberEmails.has(inv.email?.toLowerCase() ?? '')) status = 'Accepted';
    else if (new Date(inv.expires_at).getTime() < now)   status = 'Expired';
    else                                                   status = 'Pending';
    return { email: inv.email, role: inv.role, status, created_at: inv.created_at, expires_at: inv.expires_at };
  });

  const inviteBreakdown = inviteStats.reduce((acc: Record<string, number>, i: any) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── 3. AI Usage ───────────────────────────────────────────────────────────
  const aiRows = aiRes.data ?? [];

  // Monthly buckets (last 12 months)
  const monthStart = new Date();
  monthStart.setMonth(monthStart.getMonth() - 11);
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const monthMap: Record<string, { month: string; byok: number; platform: number; total: number }> = {};
  for (let i = 0; i < 12; i++) {
    const d = new Date(monthStart);
    d.setMonth(d.getMonth() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthMap[key] = { month: key, byok: 0, platform: 0, total: 0 };
  }
  for (const r of aiRows) {
    const key = r.created_at.slice(0, 7);
    if (!monthMap[key]) continue;
    monthMap[key].total++;
    if (r.quota_type === 'byok') monthMap[key].byok++;
    else                          monthMap[key].platform++;
  }

  // By action
  const actionMap: Record<string, { action: string; calls: number; input_tokens: number; output_tokens: number; total_ms: number }> = {};
  for (const r of aiRows) {
    if (!actionMap[r.action]) actionMap[r.action] = { action: r.action, calls: 0, input_tokens: 0, output_tokens: 0, total_ms: 0 };
    const e = actionMap[r.action];
    e.calls++;
    e.input_tokens  += r.input_tokens  ?? 0;
    e.output_tokens += r.output_tokens ?? 0;
    e.total_ms      += r.duration_ms   ?? 0;
  }
  const byAction = Object.values(actionMap)
    .map(e => ({ ...e, avg_ms: e.calls > 0 ? Math.round(e.total_ms / e.calls) : 0 }))
    .sort((a, b) => b.calls - a.calls);

  const byok     = aiRows.filter((r: any) => r.quota_type === 'byok').length;
  const platform = aiRows.length - byok;

  // ── 4. Errors ─────────────────────────────────────────────────────────────
  const errorRows = aiRows.filter((r: any) => !r.success);
  const errMap: Record<string, { category: string; count: number; last_seen: string }> = {};
  for (const r of errorRows) {
    const cat = (r.error_message ?? 'Unknown error').slice(0, 80);
    if (!errMap[cat]) errMap[cat] = { category: cat, count: 0, last_seen: r.created_at };
    errMap[cat].count++;
    if (r.created_at > errMap[cat].last_seen) errMap[cat].last_seen = r.created_at;
  }
  const errors = Object.values(errMap).sort((a, b) => b.count - a.count);

  return {
    company_name:    profileRes.data?.name ?? '(unnamed)',
    users: {
      total:    members.length,
      by_role:  roleBreakdown,
    },
    invitations: {
      total:      invites.length,
      breakdown:  inviteBreakdown,
      recent:     inviteStats.slice(0, 20),
    },
    ai_usage: {
      total_calls:  aiRows.length,
      byok,
      platform,
      by_month:     Object.values(monthMap),
      by_action:    byAction,
    },
    ai_errors: {
      total:        errorRows.length,
      by_category:  errors,
    },
  };
}

// ---------------------------------------------------------------------------
// Post-auth: AI usage — shared fetch helper
// ---------------------------------------------------------------------------
async function fetchAIUsage(sb: ReturnType<typeof getAdminClient>, since?: string) {
  let q = sb.from('ai_usage_log')
    .select('organization_id, action, quota_type, input_tokens, output_tokens, duration_ms, success, estimated_cost_usd, created_at');
  if (since) q = q.gte('created_at', since);
  const { data, error } = await q;
  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  return (data ?? []) as {
    organization_id: string; action: string; quota_type: string | null;
    input_tokens: number | null; output_tokens: number | null;
    duration_ms: number | null; success: boolean;
    estimated_cost_usd: number | null; created_at: string;
  }[];
}

// ---------------------------------------------------------------------------
// Post-auth: admin_ai_usage_summary  (all-time platform totals)
// ---------------------------------------------------------------------------
async function handleAdminAIUsageSummary(): Promise<object> {
  const sb   = getAdminClient();
  const rows = await fetchAIUsage(sb);

  const totalCalls      = rows.length;
  const totalInput      = rows.reduce((s, r) => s + (r.input_tokens  ?? 0), 0);
  const totalOutput     = rows.reduce((s, r) => s + (r.output_tokens ?? 0), 0);
  const totalCost       = rows.reduce((s, r) => s + Number(r.estimated_cost_usd ?? 0), 0);
  const errorCount      = rows.filter(r => !r.success).length;
  const errorRate       = totalCalls > 0 ? (errorCount / totalCalls) * 100 : 0;

  return { totalCalls, totalInput, totalOutput, totalCost, errorCount, errorRate };
}

// ---------------------------------------------------------------------------
// Post-auth: admin_ai_usage_by_month  (last 12 months, stacked by quota_type)
// ---------------------------------------------------------------------------
async function handleAdminAIUsageByMonth(): Promise<object> {
  const sb    = getAdminClient();
  const since = new Date();
  since.setMonth(since.getMonth() - 11);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const rows = await fetchAIUsage(sb, since.toISOString());

  // Build map: YYYY-MM → { byok, platform, total }
  const map: Record<string, { month: string; byok: number; platform: number; total: number }> = {};

  for (let i = 0; i < 12; i++) {
    const d = new Date(since);
    d.setMonth(d.getMonth() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map[key] = { month: key, byok: 0, platform: 0, total: 0 };
  }

  for (const r of rows) {
    const key = r.created_at.slice(0, 7);
    if (!map[key]) continue;
    map[key].total += 1;
    if (r.quota_type === 'byok') map[key].byok += 1;
    else                          map[key].platform += 1;
  }

  return { months: Object.values(map) };
}

// ---------------------------------------------------------------------------
// Post-auth: admin_ai_usage_by_action  (all-time, grouped by action)
// ---------------------------------------------------------------------------
async function handleAdminAIUsageByAction(): Promise<object> {
  const sb   = getAdminClient();
  const rows = await fetchAIUsage(sb);

  const map: Record<string, {
    action: string; calls: number; input_tokens: number;
    output_tokens: number; errors: number; total_ms: number;
  }> = {};

  for (const r of rows) {
    if (!map[r.action]) map[r.action] = {
      action: r.action, calls: 0, input_tokens: 0,
      output_tokens: 0, errors: 0, total_ms: 0,
    };
    const e = map[r.action];
    e.calls        += 1;
    e.input_tokens  += r.input_tokens  ?? 0;
    e.output_tokens += r.output_tokens ?? 0;
    e.total_ms      += r.duration_ms   ?? 0;
    if (!r.success) e.errors += 1;
  }

  const actions = Object.values(map).map(e => ({
    ...e,
    avg_ms: e.calls > 0 ? Math.round(e.total_ms / e.calls) : 0,
  })).sort((a, b) => b.calls - a.calls);

  return { actions };
}

// ---------------------------------------------------------------------------
// Post-auth: admin_ai_top_orgs  (top 10 orgs this month by call count)
// ---------------------------------------------------------------------------
async function handleAdminAITopOrgs(): Promise<object> {
  const sb    = getAdminClient();
  const start = new Date();
  start.setDate(1); start.setHours(0, 0, 0, 0);

  const rows = await fetchAIUsage(sb, start.toISOString());

  // Count calls per org
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.organization_id] = (counts[r.organization_id] ?? 0) + 1;

  const top10 = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([org_id, calls]) => ({ org_id, calls }));

  if (top10.length === 0) return { orgs: [] };

  // Fetch names + tiers
  const ids = top10.map(o => o.org_id);
  const [profilesRes, orgsRes] = await Promise.all([
    sb.from('company_profiles').select('organization_id, name').in('organization_id', ids),
    sb.from('organizations').select('id, tier').in('id', ids),
  ]);

  const nameMap: Record<string, string> = {};
  for (const p of profilesRes.data ?? []) nameMap[p.organization_id] = p.name ?? '(unnamed)';
  const tierMap: Record<string, string> = {};
  for (const o of orgsRes.data ?? []) tierMap[o.id] = o.tier ?? 'free';

  const orgs = top10.map(o => ({
    org_id: o.org_id,
    name:   nameMap[o.org_id] ?? '(unnamed)',
    tier:   tierMap[o.org_id] ?? 'free',
    calls:  o.calls,
  }));

  return { orgs };
}

// ---------------------------------------------------------------------------
// Post-auth: export_company_data
// ---------------------------------------------------------------------------

// Tables with a plain organization_id column
const ORG_SCOPED_TABLES = [
  'company_profiles',
  'business_model_canvases',
  'swot_analyses',
  'assessments',
  'kpis',
  'tasks',
  'suggested_tasks',
  'emission_sources',
  'emission_entries',
  'evidence_attachments',
  'notification_channels',
  'organization_members',
  'organization_invites',
  'organization_ai_settings',
  'organization_integrations',
  'ai_usage_log',
] as const;

async function handleExportCompanyData(body: any): Promise<object> {
  const orgId = (body.org_id ?? '').trim();
  if (!orgId) throw Object.assign(new Error('org_id is required'), { status: 400 });

  const sb = getAdminClient();

  // Verify org exists
  const { data: org, error: orgErr } = await sb
    .from('organizations')
    .select('id, tier, is_active, created_at')
    .eq('id', orgId)
    .maybeSingle();
  if (orgErr || !org) throw Object.assign(new Error('Organization not found'), { status: 404 });

  // Fetch company name
  const { data: profile } = await sb
    .from('company_profiles').select('name').eq('organization_id', orgId).maybeSingle();

  // Fetch all tables in parallel
  const results = await Promise.all(
    ORG_SCOPED_TABLES.map(async (table) => {
      try {
        const { data } = await sb.from(table).select('*').eq('organization_id', orgId);
        return { table, rows: data ?? [] };
      } catch {
        return { table, rows: [] as unknown[] };
      }
    })
  );

  const tables: Record<string, unknown[]> = {};
  for (const { table, rows } of results) tables[table] = rows;

  const exportedAt = new Date().toISOString();
  const manifest = {
    exported_at:      exportedAt,
    organization_id:  orgId,
    company_name:     profile?.name ?? '(unnamed)',
    tier:             org.tier ?? 'free',
    is_active:        org.is_active !== false,
    org_created_at:   org.created_at,
    tables_exported:  Object.keys(tables),
  };

  return { manifest, tables };
}

// ---------------------------------------------------------------------------
// Post-auth: create_company
// ---------------------------------------------------------------------------
async function handleCreateCompany(body: any): Promise<object> {
  const companyName = (body.company_name ?? '').trim();
  const ownerEmail  = (body.owner_email  ?? '').trim().toLowerCase();
  const tier        = (body.tier ?? 'free') as string;

  if (!companyName) throw Object.assign(new Error('company_name is required'), { status: 400 });
  if (!ownerEmail)  throw Object.assign(new Error('owner_email is required'),  { status: 400 });
  if (!['free','starter','pro','enterprise'].includes(tier))
    throw Object.assign(new Error('Invalid tier'), { status: 400 });

  const sb = getAdminClient();

  // 1. Get or create the Supabase Auth user
  const { data: listData } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const existingUser = (listData?.users ?? []).find(
    (u: any) => u.email?.toLowerCase() === ownerEmail
  );

  let userId: string;
  let isNewUser = false;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email:          ownerEmail,
      email_confirm:  true,
    });
    if (createErr || !created.user) {
      throw Object.assign(new Error(createErr?.message ?? 'Failed to create user'), { status: 500 });
    }
    userId    = created.user.id;
    isNewUser = true;
  }

  // 2. Create org
  const { data: org, error: orgErr } = await sb
    .from('organizations').insert({ tier }).select('id').single();
  if (orgErr) throw Object.assign(new Error(orgErr.message), { status: 500 });

  // 3. Create company profile (name only; rest stays blank)
  const { error: profileErr } = await sb.from('company_profiles').insert({
    organization_id: org.id,
    name:            companyName,
  });
  if (profileErr) throw Object.assign(new Error(profileErr.message), { status: 500 });

  // 4. Add owner to org_members
  const { error: memberErr } = await sb.from('organization_members').insert({
    organization_id: org.id,
    user_id:         userId,
    role:            'Owner',
    email:           ownerEmail,
  });
  if (memberErr) throw Object.assign(new Error(memberErr.message), { status: 500 });

  // 5. Send magic-link invite to new users so they can sign in
  let devLink: string | undefined;
  if (isNewUser) {
    const { data: linkData } = await sb.auth.admin.generateLink({
      type: 'magiclink', email: ownerEmail,
      options: { redirectTo: appUrl },
    });
    const magicLink = linkData?.properties?.action_link ?? null;
    if (magicLink) {
      if (resendApiKey) {
        try {
          await sendOwnerInviteEmail(ownerEmail, magicLink, companyName);
        } catch (emailErr: any) {
          console.error('[admin] Owner invite email failed, using dev_link fallback:', emailErr?.message);
          devLink = magicLink;
        }
      } else {
        console.info(`\n[admin] ✉️  OWNER INVITE LINK (dev):\n${magicLink}\n`);
        devLink = magicLink;
      }
    }
  }

  console.info('[admin] create_company:', companyName, 'owner:', ownerEmail, 'org:', org.id);
  return { created: true, organization_id: org.id, company_name: companyName, dev_link: devLink };
}

// ---------------------------------------------------------------------------
// Post-auth: list_pending_users
// ---------------------------------------------------------------------------
async function handleListPendingUsers(): Promise<object> {
  const sb = getAdminClient();

  // Fetch all auth users + current members in parallel
  const [usersRes, membersRes] = await Promise.all([
    sb.auth.admin.listUsers({ perPage: 1000 }),
    sb.from('organization_members').select('user_id'),
  ]);

  if (usersRes.error) throw Object.assign(new Error(usersRes.error.message), { status: 500 });

  const memberIds = new Set((membersRes.data ?? []).map((m: any) => m.user_id));

  const pending = (usersRes.data?.users ?? [])
    .filter((u: any) => !memberIds.has(u.id) && u.email)
    .map((u: any) => ({
      id:              u.id,
      email:           u.email,
      created_at:      u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }));

  return { users: pending };
}

// ---------------------------------------------------------------------------
// Post-auth: assign_user_to_company
// ---------------------------------------------------------------------------
async function handleAssignUserToCompany(body: any): Promise<object> {
  const userId  = (body.user_id         ?? '').trim();
  const orgId   = (body.organization_id ?? '').trim();
  const role    = (body.role            ?? 'Manager') as string;

  if (!userId) throw Object.assign(new Error('user_id is required'),         { status: 400 });
  if (!orgId)  throw Object.assign(new Error('organization_id is required'), { status: 400 });
  if (!['Owner','Admin','Manager','Consultant'].includes(role))
    throw Object.assign(new Error('Invalid role'), { status: 400 });

  const sb = getAdminClient();

  // Resolve email from auth.users
  const { data: userData, error: userErr } = await sb.auth.admin.getUserById(userId);
  if (userErr || !userData.user) throw Object.assign(new Error('User not found'), { status: 404 });

  // Guard: already a member of this org
  const { data: dup } = await sb.from('organization_members')
    .select('id').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
  if (dup) throw Object.assign(new Error('User is already a member of this company'), { status: 409 });

  const { error: insertErr } = await sb.from('organization_members').insert({
    organization_id: orgId,
    user_id:         userId,
    role,
    email:           userData.user.email ?? '',
  });
  if (insertErr) throw Object.assign(new Error(insertErr.message), { status: 500 });

  console.info('[admin] assign_user_to_company:', userId, '->', orgId, 'role:', role);
  return { assigned: true, user_id: userId, organization_id: orgId, role };
}

// ---------------------------------------------------------------------------
// Post-auth: list_companies
// ---------------------------------------------------------------------------
async function handleListCompanies(): Promise<object> {
  const sb = getAdminClient();

  // Fetch orgs + company profiles (name) + member counts in parallel
  const [orgsRes, profilesRes, membersRes] = await Promise.all([
    sb.from('organizations')
      .select('id, tier, is_active, created_at')
      .order('created_at', { ascending: false }),
    sb.from('company_profiles')
      .select('organization_id, name'),
    sb.from('organization_members')
      .select('organization_id'),
  ]);

  if (orgsRes.error)  throw Object.assign(new Error(orgsRes.error.message),  { status: 500 });

  // Build lookup maps
  const nameMap: Record<string, string> = {};
  for (const p of profilesRes.data ?? []) {
    nameMap[p.organization_id] = p.name ?? '(unnamed)';
  }

  const memberCount: Record<string, number> = {};
  for (const m of membersRes.data ?? []) {
    memberCount[m.organization_id] = (memberCount[m.organization_id] ?? 0) + 1;
  }

  const companies = (orgsRes.data ?? []).map((o: any) => ({
    id:           o.id,
    name:         nameMap[o.id] ?? '(unnamed)',
    tier:         o.tier ?? 'free',
    is_active:    o.is_active !== false,
    member_count: memberCount[o.id] ?? 0,
    created_at:   o.created_at,
  }));

  return { companies };
}

// ---------------------------------------------------------------------------
// Post-auth: set_company_status
// ---------------------------------------------------------------------------
async function handleSetCompanyStatus(body: any): Promise<object> {
  const id        = (body.id        ?? '').trim();
  const is_active = body.is_active;
  if (!id)                      throw Object.assign(new Error('id is required'),        { status: 400 });
  if (typeof is_active !== 'boolean') throw Object.assign(new Error('is_active (boolean) is required'), { status: 400 });

  const sb = getAdminClient();
  const { error } = await sb.from('organizations').update({ is_active }).eq('id', id);
  if (error) throw Object.assign(new Error(error.message), { status: 500 });

  console.info('[admin] set_company_status:', id, '->', is_active);
  return { updated: true, id, is_active };
}

// ---------------------------------------------------------------------------
// Post-auth: list_admins
// ---------------------------------------------------------------------------
async function handleListAdmins(): Promise<object> {
  const sb = getAdminClient();
  const { data, error } = await sb
    .from('platform_admins')
    .select('id, email, is_active, created_by, created_at')
    .order('created_at', { ascending: true });
  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  return { admins: data ?? [] };
}

// ---------------------------------------------------------------------------
// Post-auth: add_admin
// ---------------------------------------------------------------------------
async function handleAddAdmin(body: any, actorEmail: string): Promise<object> {
  const email = (body.email ?? '').trim().toLowerCase();
  if (!email) throw Object.assign(new Error('email is required'), { status: 400 });

  const sb = getAdminClient();

  // Check if already an admin
  const { data: existing } = await sb
    .from('platform_admins').select('id, is_active').eq('email', email).maybeSingle();
  if (existing) {
    if (existing.is_active) throw Object.assign(new Error('This email is already an active platform admin'), { status: 409 });
    // Re-activate if previously deactivated
    const { error } = await sb.from('platform_admins').update({ is_active: true }).eq('id', existing.id);
    if (error) throw Object.assign(new Error(error.message), { status: 500 });
    console.info('[admin] Re-activated platform admin:', email);
    return { added: true, reactivated: true, email };
  }

  // Look up actor's row to set created_by
  const { data: actorRow } = await sb
    .from('platform_admins').select('id').eq('email', actorEmail).maybeSingle();

  // Upsert Supabase Auth user and generate an invitation magic link
  const { data: linkData, error: linkError } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${appUrl}/admin` },
  });
  if (linkError) {
    console.error('[admin] generateLink failed:', linkError.message);
    throw Object.assign(new Error('Failed to generate invitation link'), { status: 500 });
  }

  // Insert platform_admins row
  const { error: insertError } = await sb.from('platform_admins').insert({
    email,
    created_by: actorRow?.id ?? null,
  });
  if (insertError) throw Object.assign(new Error(insertError.message), { status: 500 });

  const magicLink = linkData?.properties?.action_link ?? null;

  // Send invitation email if Resend is configured; fall back to dev_link on failure
  let adminDevLink: string | undefined;
  if (resendApiKey && magicLink) {
    try {
      await sendAdminInviteEmail(email, magicLink, actorEmail);
    } catch (emailErr: any) {
      console.error('[admin] Admin invite email failed, using dev_link fallback:', emailErr?.message);
      adminDevLink = magicLink;
    }
  } else if (magicLink) {
    console.info(`\n[admin] ✉️  ADMIN INVITE LINK (dev — no RESEND_API_KEY):\n${magicLink}\n`);
    adminDevLink = magicLink;
  }

  console.info('[admin] Added platform admin:', email, 'by:', actorEmail);
  return { added: true, reactivated: false, email, dev_link: adminDevLink };
}

// ---------------------------------------------------------------------------
// Post-auth: deactivate_admin
// ---------------------------------------------------------------------------
async function handleDeactivateAdmin(body: any, actorEmail: string): Promise<object> {
  const id = (body.id ?? '').trim();
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  const sb = getAdminClient();

  // Fetch the target row so we can prevent self-deactivation
  const { data: target, error: fetchError } = await sb
    .from('platform_admins').select('id, email, is_active').eq('id', id).maybeSingle();
  if (fetchError || !target) throw Object.assign(new Error('Admin not found'), { status: 404 });
  if (target.email.toLowerCase() === actorEmail.toLowerCase()) {
    throw Object.assign(new Error('You cannot deactivate your own account'), { status: 403 });
  }
  if (!target.is_active) throw Object.assign(new Error('Admin is already inactive'), { status: 409 });

  const { error } = await sb.from('platform_admins').update({ is_active: false }).eq('id', id);
  if (error) throw Object.assign(new Error(error.message), { status: 500 });

  console.info('[admin] Deactivated platform admin:', target.email, 'by:', actorEmail);
  return { deactivated: true, email: target.email };
}

// ---------------------------------------------------------------------------
// Email helper — owner invite email (sent when a new company is created)
// ---------------------------------------------------------------------------
async function sendOwnerInviteEmail(toEmail: string, magicLink: string, companyName: string): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Welcome to Aeternum Ally</title></head>
<body style="margin:0;padding:0;background:#020617;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:48px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">
  <tr><td style="background:#14532d;padding:24px 32px;text-align:center;">
    <span style="color:#fff;font-size:18px;font-weight:700;">🌿 Aeternum Ally</span><br/>
    <span style="color:#86efac;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Sustainability Reporting Platform</span>
  </td></tr>
  <tr><td style="padding:32px;">
    <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">You've been added</p>
    <h1 style="margin:0 0 16px;color:#f1f5f9;font-size:20px;font-weight:700;">Welcome to ${companyName}</h1>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;">
      Your company <strong style="color:#e2e8f0;">${companyName}</strong> has been set up on Aeternum Ally.
      Click below to sign in as Owner and start your sustainability journey.
      Valid for <strong style="color:#e2e8f0;">60 minutes</strong>, single use.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#16a34a;border-radius:10px;">
        <a href="${magicLink}" style="display:inline-block;padding:14px 28px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">Sign in to Aeternum Ally →</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px 24px;"><p style="margin:0;color:#475569;font-size:11px;word-break:break-all;font-family:monospace;">${magicLink}</p></td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #1e293b;text-align:center;">
    <p style="margin:0;color:#334155;font-size:12px;">Aeternum Ally · Sustainability Reporting · Do not reply</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
    body: JSON.stringify({
      from:    `Aeternum Ally <${fromEmail}>`,
      to:      [toEmail],
      subject: `🌿 Welcome to Aeternum Ally — Your company ${companyName} is ready`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Email helper — admin invitation email via Resend
// ---------------------------------------------------------------------------
async function sendAdminInviteEmail(toEmail: string, magicLink: string, invitedBy: string): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Aeternum Ally Admin Invitation</title></head>
<body style="margin:0;padding:0;background:#020617;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:48px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">
  <tr><td style="background:#14532d;padding:24px 32px;text-align:center;">
    <span style="color:#fff;font-size:18px;font-weight:700;">🛡️ Aeternum Ally</span><br/>
    <span style="color:#86efac;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Platform Admin Invitation</span>
  </td></tr>
  <tr><td style="padding:32px;">
    <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">You've been invited</p>
    <h1 style="margin:0 0 16px;color:#f1f5f9;font-size:20px;font-weight:700;">Admin portal access granted</h1>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;">
      <strong style="color:#e2e8f0;">${invitedBy}</strong> has granted you
      <strong style="color:#e2e8f0;">Platform Admin</strong> access to Aeternum Ally.
      Click below to sign in — valid for <strong style="color:#e2e8f0;">60 minutes</strong>, single use.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#16a34a;border-radius:10px;">
        <a href="${magicLink}" style="display:inline-block;padding:14px 28px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">Accept &amp; Sign in →</a>
      </td></tr>
    </table>
    <table cellpadding="0" cellspacing="0" style="background:#1e293b;border:1px solid #334155;border-radius:10px;width:100%;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;color:#fbbf24;font-size:12px;font-weight:600;text-transform:uppercase;">⚠️ Security Notice</p>
        <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.5;">
          This link grants <strong style="color:#e2e8f0;">platform-level access</strong> to all companies and data.
          If you did not expect this invitation, ignore this email — it expires automatically.
        </p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px 24px;"><p style="margin:0;color:#475569;font-size:11px;word-break:break-all;font-family:monospace;">${magicLink}</p></td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #1e293b;text-align:center;">
    <p style="margin:0;color:#334155;font-size:12px;">Aeternum Ally · Platform Administration · Do not reply</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
    body: JSON.stringify({
      from:    `Aeternum Ally Admin <${fromEmail}>`,
      to:      [toEmail],
      subject: "🛡️ You've been invited to the Aeternum Ally Admin Portal",
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Email helper — custom admin-branded HTML via Resend
// ---------------------------------------------------------------------------
async function sendAdminMagicLinkEmail(toEmail: string, magicLink: string): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Aeternum Ally Admin Access</title></head>
<body style="margin:0;padding:0;background:#020617;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:48px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">
  <tr><td style="background:#14532d;padding:24px 32px;text-align:center;">
    <span style="color:#fff;font-size:18px;font-weight:700;">🛡️ Aeternum Ally</span><br/>
    <span style="color:#86efac;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Platform Admin Portal</span>
  </td></tr>
  <tr><td style="padding:32px;">
    <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Secure Sign-In Link</p>
    <h1 style="margin:0 0 16px;color:#f1f5f9;font-size:20px;font-weight:700;">Your admin access link</h1>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;">
      Click below to sign in to the <strong style="color:#e2e8f0;">Platform Admin Portal</strong>.
      Valid for <strong style="color:#e2e8f0;">60 minutes</strong>, single use.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#16a34a;border-radius:10px;">
        <a href="${magicLink}" style="display:inline-block;padding:14px 28px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">Sign in to Admin Portal →</a>
      </td></tr>
    </table>
    <table cellpadding="0" cellspacing="0" style="background:#1e293b;border:1px solid #334155;border-radius:10px;width:100%;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;color:#fbbf24;font-size:12px;font-weight:600;text-transform:uppercase;">⚠️ Security Notice</p>
        <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.5;">
          This link grants <strong style="color:#e2e8f0;">platform-level access</strong> to all companies and data.
          If you did not request this, ignore this email — it expires automatically.
        </p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px 24px;"><p style="margin:0;color:#475569;font-size:11px;word-break:break-all;font-family:monospace;">${magicLink}</p></td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #1e293b;text-align:center;">
    <p style="margin:0;color:#334155;font-size:12px;">Aeternum Ally · Platform Administration · Do not reply</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
    body: JSON.stringify({
      from:    `Aeternum Ally Admin <${fromEmail}>`,
      to:      [toEmail],
      subject: '🛡️ Your Aeternum Ally Admin Access Link',
      html,
    }),
  });

  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export const handler: Handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body: any = {};
  try { body = JSON.parse(event.body ?? '{}'); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action } = body;
  const authHeader = event.headers['authorization'] ?? event.headers['Authorization'];

  try {
    let result: object;

    // ── Pre-auth actions (no token required) ───────────────────────────────
    if (action === 'admin_login') {
      result = await handleAdminLogin(body);

    } else if (action === 'request_admin_magic_link') {
      result = await handleRequestAdminMagicLink(body);

    } else if (action === 'verify_admin') {
      result = await handleVerifyAdmin(authHeader);

    } else {
      // ── Post-auth actions (admin JWT required) ──────────────────────────
      const { email: actorEmail } = await requireAdmin(authHeader);

      switch (action) {
        case 'admin_dashboard':    result = await handleAdminDashboard();                        break;
        case 'company_stats':           result = await handleCompanyStats(body);               break;
        case 'admin_ai_usage_summary':  result = await handleAdminAIUsageSummary();            break;
        case 'admin_ai_usage_by_month': result = await handleAdminAIUsageByMonth();            break;
        case 'admin_ai_usage_by_action':result = await handleAdminAIUsageByAction();           break;
        case 'admin_ai_top_orgs':       result = await handleAdminAITopOrgs();                 break;
        case 'export_company_data':     result = await handleExportCompanyData(body);          break;
        case 'create_company':          result = await handleCreateCompany(body);              break;
        case 'list_companies':          result = await handleListCompanies();                   break;
        case 'set_company_status':      result = await handleSetCompanyStatus(body);            break;
        case 'list_pending_users':      result = await handleListPendingUsers();                break;
        case 'assign_user_to_company':  result = await handleAssignUserToCompany(body);         break;
        case 'list_admins':        result = await handleListAdmins();                            break;
        case 'add_admin':         result = await handleAddAdmin(body, actorEmail);              break;
        case 'deactivate_admin':  result = await handleDeactivateAdmin(body, actorEmail);       break;
        default:
          return { statusCode: 400, headers: cors, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
      }
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    const status = err?.status ?? 500;
    console.error(`[admin] action=${action} error:`, err?.message ?? err);
    return { statusCode: status, headers: cors, body: JSON.stringify({ error: err?.message ?? 'Internal server error' }) };
  }
};
