/**
 * admin.ts — Platform Admin API
 *
 * ALL admin operations route through here.
 *
 * Pre-auth actions (no JWT required):
 *   request_admin_magic_link  — generate a server-side magic link (bypasses
 *                               Supabase redirect-URL allowlist) and send a
 *                               custom admin-branded email via Resend.
 *
 * Post-auth actions (valid admin JWT required):
 *   verify_admin       — validate JWT + check platform_admins; seed first admin
 *   admin_dashboard    — platform-wide summary counts
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const supabaseUrl    = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const appUrl         = process.env.VITE_APP_URL ?? 'http://localhost:8888';
const resendApiKey   = process.env.RESEND_API_KEY ?? '';
const fromEmail      = process.env.RESEND_FROM_EMAIL ?? 'noreply@aeternum-ally.com';
const isDev          = !resendApiKey;

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Email — custom admin-branded HTML via Resend REST API
// ---------------------------------------------------------------------------

function buildAdminEmailHtml(magicLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Aeternum Ally — Admin Access</title>
</head>
<body style="margin:0;padding:0;background:#020617;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:480px;background:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#14532d;padding:28px 32px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:#15803d;border-radius:12px;width:48px;height:48px;text-align:center;vertical-align:middle;">
                    <span style="font-size:24px;line-height:48px;">🛡️</span>
                  </td>
                  <td style="padding-left:12px;text-align:left;">
                    <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">Aeternum Ally</div>
                    <div style="color:#86efac;font-size:12px;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;">Platform Admin Portal</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">
                Secure Sign-In Link
              </p>
              <h1 style="margin:0 0 16px;color:#f1f5f9;font-size:22px;font-weight:700;line-height:1.3;">
                Your admin access link is ready
              </h1>
              <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;">
                Click the button below to sign in to the <strong style="color:#e2e8f0;">Platform Admin Portal</strong>.
                This link is valid for <strong style="color:#e2e8f0;">60 minutes</strong> and can only be used once.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#16a34a;border-radius:10px;">
                    <a href="${magicLink}"
                       style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:-0.1px;">
                      Sign in to Admin Portal →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security notice -->
              <table cellpadding="0" cellspacing="0" style="background:#1e293b;border:1px solid #334155;border-radius:10px;width:100%;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 6px;color:#fbbf24;font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">
                      ⚠️ Security Notice
                    </p>
                    <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.5;">
                      This link grants <strong style="color:#e2e8f0;">platform-level admin access</strong> to all companies and data.
                      If you did not request this link, please ignore this email — it will expire automatically.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Link fallback -->
          <tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0 0 6px;color:#475569;font-size:12px;">
                Button not working? Copy and paste this URL into your browser:
              </p>
              <p style="margin:0;font-size:11px;color:#64748b;word-break:break-all;font-family:monospace;">
                ${magicLink}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #1e293b;text-align:center;">
              <p style="margin:0;color:#334155;font-size:12px;">
                Aeternum Ally · Platform Administration<br/>
                This is an automated message — do not reply.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendAdminMagicLinkEmail(toEmail: string, magicLink: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: `Aeternum Ally Admin <${fromEmail}>`,
      to: [toEmail],
      subject: '🛡️ Your Aeternum Ally Admin Access Link',
      html: buildAdminEmailHtml(magicLink),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Email delivery failed (Resend ${res.status}): ${errText}`);
  }
}

// ---------------------------------------------------------------------------
// Pre-auth action: request_admin_magic_link
// No JWT — the only check is that the email is an active platform admin.
// We always return the same success response to avoid leaking admin emails.
// ---------------------------------------------------------------------------
async function handleRequestAdminMagicLink(body: any): Promise<object> {
  const email = (body.email ?? '').trim().toLowerCase();
  if (!email) throw Object.assign(new Error('email is required'), { status: 400 });

  const sb = getAdminClient();

  // Check email is an active platform admin
  const { data: adminRow } = await sb
    .from('platform_admins')
    .select('id, is_active')
    .eq('email', email)
    .maybeSingle();

  // Silently succeed for non-admin emails (don't leak whether it exists)
  if (!adminRow?.is_active) {
    console.info(`[admin] magic-link requested for non-admin email: ${email}`);
    return { sent: true };
  }

  // Generate magic link server-side using the service-role key.
  // This bypasses Supabase's redirect-URL allowlist — the link goes
  // directly to /admin regardless of what is configured in the dashboard.
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

  if (isDev) {
    // Development: no Resend key — log link to console and return it
    // so the developer can use it directly from the UI.
    console.info(`\n[admin] ✉️  MAGIC LINK (dev mode — no RESEND_API_KEY set):\n${magicLink}\n`);
    return { sent: true, dev_link: magicLink };
  }

  // Production: send custom admin-branded email
  await sendAdminMagicLinkEmail(email, magicLink);
  return { sent: true };
}

// ---------------------------------------------------------------------------
// Post-auth action: verify_admin
// Called after the magic link is clicked and Supabase has authenticated.
// Confirms the user is an active platform admin; seeds first admin if needed.
// ---------------------------------------------------------------------------
async function handleVerifyAdmin(
  authHeader: string | undefined
): Promise<object> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing Authorization header'), { status: 401 });
  }
  const token = authHeader.slice(7);

  const sb = getAdminClient();
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData.user) {
    throw Object.assign(new Error('Invalid or expired token'), { status: 401 });
  }

  const email = (userData.user.email ?? '').toLowerCase();

  // Seed the first admin row if table is empty and env var matches
  const { count } = await sb
    .from('platform_admins')
    .select('id', { count: 'exact', head: true });

  const firstAdminEmail = (process.env.PLATFORM_ADMIN_EMAIL ?? '').toLowerCase();
  if ((count ?? 0) === 0 && firstAdminEmail && email === firstAdminEmail) {
    await sb.from('platform_admins').insert({ email, created_by: null });
    console.info('[admin] First platform admin seeded:', email);
  }

  // Verify active admin
  const { data: adminRow } = await sb
    .from('platform_admins')
    .select('id, is_active')
    .eq('email', email)
    .maybeSingle();

  if (!adminRow?.is_active) {
    throw Object.assign(new Error('Not an active platform admin'), { status: 403 });
  }

  return { ok: true, email, adminId: adminRow.id };
}

// ---------------------------------------------------------------------------
// Auth middleware for post-auth actions
// ---------------------------------------------------------------------------
async function verifyAdminJwt(
  authHeader: string | undefined
): Promise<{ userId: string; email: string }> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing or malformed Authorization header'), { status: 401 });
  }
  const token = authHeader.slice(7);
  const sb = getAdminClient();

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) {
    throw Object.assign(new Error('Invalid or expired token'), { status: 401 });
  }

  const email = (data.user.email ?? '').toLowerCase();
  const { data: adminRow, error: adminErr } = await sb
    .from('platform_admins')
    .select('id, is_active')
    .eq('email', email)
    .maybeSingle();

  if (adminErr) throw Object.assign(new Error('DB error checking admin status'), { status: 500 });
  if (!adminRow?.is_active) throw Object.assign(new Error('Not a platform admin'), { status: 403 });

  return { userId: data.user.id, email };
}

// ---------------------------------------------------------------------------
// Post-auth action: admin_dashboard
// ---------------------------------------------------------------------------
async function handleAdminDashboard(): Promise<object> {
  const sb = getAdminClient();
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
// Main handler
// ---------------------------------------------------------------------------
export const handler: Handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body: any = {};
  try { body = JSON.parse(event.body ?? '{}'); } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { action } = body;
  const authHeader = event.headers['authorization'] ?? event.headers['Authorization'];

  try {
    let result: object;

    // Pre-auth actions — no JWT needed
    if (action === 'request_admin_magic_link') {
      result = await handleRequestAdminMagicLink(body);

    } else if (action === 'verify_admin') {
      result = await handleVerifyAdmin(authHeader);

    } else {
      // All other actions require a verified admin JWT
      await verifyAdminJwt(authHeader);

      switch (action) {
        case 'admin_dashboard':
          result = await handleAdminDashboard();
          break;
        default:
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
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
    return { statusCode: status, headers: corsHeaders, body: JSON.stringify({ error: err?.message ?? 'Internal server error' }) };
  }
};
