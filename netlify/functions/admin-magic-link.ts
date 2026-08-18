import { createClient } from '@supabase/supabase-js';
import {
  deliverAdminMagicLink,
  isExplicitLocalAdminMagicLinkMode,
  requireAdminMagicLinkDelivery,
} from './_shared/adminMagicLinkSecurity.js';

const json = (status: number, body: object) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
});

function getAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Admin auth service is not configured');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getAppUrl() {
  return (process.env.APP_URL ?? process.env.VITE_APP_URL ?? 'http://localhost:8888').replace(/\/$/, '');
}

async function sendAdminMagicLinkEmail(toEmail: string, magicLink: string): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY ?? '';
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'no-reply@aeternumally.com';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Aeternum Ally Admin Access</title></head>
<body style="margin:0;padding:0;background:#020617;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:48px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">
  <tr><td style="background:#14532d;padding:24px 32px;text-align:center;">
    <span style="color:#fff;font-size:18px;font-weight:700;">Aeternum Ally</span><br/>
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
        <a href="${magicLink}" style="display:inline-block;padding:14px 28px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">Sign in to Admin Portal</a>
      </td></tr>
    </table>
    <table cellpadding="0" cellspacing="0" style="background:#1e293b;border:1px solid #334155;border-radius:10px;width:100%;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;color:#fbbf24;font-size:12px;font-weight:600;text-transform:uppercase;">Security Notice</p>
        <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.5;">
          This link grants <strong style="color:#e2e8f0;">platform-level access</strong> to all companies and data.
          If you did not request this, ignore this email. It expires automatically.
        </p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px 24px;"><p style="margin:0;color:#475569;font-size:11px;word-break:break-all;font-family:monospace;">${magicLink}</p></td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #1e293b;text-align:center;">
    <p style="margin:0;color:#334155;font-size:12px;">Aeternum Ally - Platform Administration - Do not reply</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
    body: JSON.stringify({
      from: `Aeternum Ally Admin <${fromEmail}>`,
      to: [toEmail],
      subject: 'Your Aeternum Ally Admin Access Link',
      html,
    }),
  });

  if (!response.ok) throw new Error('Email provider rejected the request');
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
  }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && origin !== requestUrl.origin) {
    return json(403, { error: 'Cross-origin requests are not allowed' });
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json(415, { error: 'Content-Type must be application/json' });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  try {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: 'A valid email is required' });
    }

    const allowDevLink = isExplicitLocalAdminMagicLinkMode(requestUrl.host);
    const emailDeliveryConfigured = Boolean(process.env.RESEND_API_KEY);
    requireAdminMagicLinkDelivery(emailDeliveryConfigured, allowDevLink);

    const admin = getAdminClient();
    const { data: adminRow } = await admin
      .from('platform_admins')
      .select('id, is_active')
      .eq('email', email)
      .maybeSingle();

    if (!adminRow?.is_active) {
      console.info('[admin-magic-link] request completed');
      return json(200, { sent: true });
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${getAppUrl()}/admin` },
    });
    const magicLink = linkData?.properties?.action_link;
    if (linkError || !magicLink) throw new Error('Magic-link generation failed');

    const result = await deliverAdminMagicLink({
      magicLink,
      emailDeliveryConfigured,
      allowDevLink,
      sendEmail: () => sendAdminMagicLinkEmail(email, magicLink),
    });
    console.info('[admin-magic-link] request completed');
    return json(200, result);
  } catch (error: any) {
    const status = error?.status === 503 ? 503 : 500;
    const message = status === 503
      ? error.message
      : 'Admin sign-in is temporarily unavailable. Please try again later.';
    console.error(`[admin-magic-link] request failed status=${status}`);
    return json(status, { error: message });
  }
};

export const config = {
  path: '/.netlify/functions/admin-magic-link',
  rateLimit: {
    windowLimit: 5,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
} as const;
