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
const appUrl         = process.env.VITE_APP_URL    ?? 'http://localhost:8888';
const resendApiKey   = process.env.RESEND_API_KEY  ?? '';
const fromEmail      = process.env.RESEND_FROM_EMAIL ?? 'noreply@aeternum-ally.com';

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

  await sendAdminMagicLinkEmail(email, magicLink);
  return { sent: true };
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
    sb.from('org_members').select('id', { count: 'exact', head: true }),
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
      await requireAdmin(authHeader);

      switch (action) {
        case 'admin_dashboard': result = await handleAdminDashboard(); break;
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
