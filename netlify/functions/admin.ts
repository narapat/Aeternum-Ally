/**
 * admin.ts — Platform Admin API
 *
 * ALL admin operations route through here.
 * Every request is authenticated: the caller must supply a valid Supabase JWT
 * whose owner is an active row in platform_admins.
 *
 * Actions available in this file (issue #72 — Foundation):
 *   verify_admin       — verify JWT + check platform_admins; seeds first admin if table empty
 *   admin_dashboard    — summary counts: companies, users, ai calls today
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase service-role client (server-only, never sent to browser)
// ---------------------------------------------------------------------------
const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Auth middleware — verifies JWT and checks platform_admins table
// ---------------------------------------------------------------------------
async function verifyAdminJwt(
  authHeader: string | undefined
): Promise<{ userId: string; email: string }> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing or malformed Authorization header'), { status: 401 });
  }
  const token = authHeader.slice(7);

  // Verify the Supabase JWT by calling getUser (uses service-role client)
  const sb = getAdminClient();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) {
    throw Object.assign(new Error('Invalid or expired token'), { status: 401 });
  }

  const email = data.user.email ?? '';
  const userId = data.user.id;

  // Check the platform_admins table
  const { data: adminRow, error: adminErr } = await sb
    .from('platform_admins')
    .select('id, is_active')
    .eq('email', email)
    .maybeSingle();

  if (adminErr) {
    throw Object.assign(new Error('DB error checking admin status'), { status: 500 });
  }
  if (!adminRow || !adminRow.is_active) {
    throw Object.assign(new Error('Not a platform admin'), { status: 403 });
  }

  return { userId, email };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/** verify_admin — called right after Supabase login to confirm admin access.
 *  Also seeds the first admin row from PLATFORM_ADMIN_EMAIL if table is empty.
 */
async function handleVerifyAdmin(
  body: any,
  authHeader: string | undefined
): Promise<object> {
  const sb = getAdminClient();
  const token = (authHeader ?? '').replace('Bearer ', '');

  if (!token) throw Object.assign(new Error('Missing token'), { status: 401 });

  // Resolve the calling user from the JWT
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData.user) {
    throw Object.assign(new Error('Invalid token'), { status: 401 });
  }
  const email = userData.user.email ?? '';

  // Seed first admin if table is empty and env var matches
  const { count } = await sb
    .from('platform_admins')
    .select('id', { count: 'exact', head: true });

  const firstAdminEmail = process.env.PLATFORM_ADMIN_EMAIL ?? '';

  if ((count ?? 0) === 0 && firstAdminEmail && email.toLowerCase() === firstAdminEmail.toLowerCase()) {
    await sb.from('platform_admins').insert({ email, created_by: null });
    console.info('[admin] First platform admin seeded:', email);
  }

  // Now check access
  const { data: adminRow } = await sb
    .from('platform_admins')
    .select('id, is_active')
    .eq('email', email)
    .maybeSingle();

  if (!adminRow || !adminRow.is_active) {
    throw Object.assign(new Error('Not an active platform admin'), { status: 403 });
  }

  return { ok: true, email, adminId: adminRow.id };
}

/** admin_dashboard — platform-wide summary counts */
async function handleAdminDashboard(adminEmail: string): Promise<object> {
  const sb = getAdminClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [orgsRes, membersRes, aiTodayRes, aiErrorsRes] = await Promise.all([
    sb.from('organizations').select('id, is_active', { count: 'exact' }),
    sb.from('org_members').select('id', { count: 'exact', head: true }),
    sb.from('ai_usage_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', today.toISOString()),
    sb.from('ai_usage_log')
      .select('id', { count: 'exact', head: true })
      .not('error', 'is', null),
  ]);

  const orgs = orgsRes.data ?? [];
  const activeOrgs   = orgs.filter((o: any) => o.is_active !== false).length;
  const inactiveOrgs = orgs.filter((o: any) => o.is_active === false).length;

  return {
    totalCompanies:   orgs.length,
    activeCompanies:  activeOrgs,
    inactiveCompanies: inactiveOrgs,
    totalUsers:       membersRes.count ?? 0,
    aiCallsToday:     aiTodayRes.count ?? 0,
    aiErrorsTotal:    aiErrorsRes.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export const handler: Handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body: any = {};
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { action } = body;
  const authHeader = event.headers['authorization'] ?? event.headers['Authorization'];

  try {
    let result: object;

    if (action === 'verify_admin') {
      // verify_admin does its own JWT parsing (handles seeding)
      result = await handleVerifyAdmin(body, authHeader);
    } else {
      // All other actions require a verified admin
      const { email } = await verifyAdminJwt(authHeader);

      switch (action) {
        case 'admin_dashboard':
          result = await handleAdminDashboard(email);
          break;
        default:
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: `Unknown action: ${action}` }),
          };
      }
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    const status = err?.status ?? 500;
    console.error(`[admin] action=${action} error:`, err?.message ?? err);
    return {
      statusCode: status,
      headers: corsHeaders,
      body: JSON.stringify({ error: err?.message ?? 'Internal server error' }),
    };
  }
};
