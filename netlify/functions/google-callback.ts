/**
 * netlify/functions/google-callback.ts
 *
 * Handles the Google OAuth 2.0 flow and token management for Google Drive.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  Google Cloud Console setup required:                                │
 * │  1. Create a project at https://console.cloud.google.com             │
 * │  2. Enable "Google Drive API" and "Google Picker API"                │
 * │  3. Create OAuth 2.0 Client ID (Web Application)                     │
 * │  4. Add Authorized Redirect URI:                                      │
 * │       https://<your-netlify-site>/.netlify/functions/google-callback  │
 * │       http://localhost:8888/.netlify/functions/google-callback (dev)  │
 * │  5. Create an API Key (restrict to Picker API + your domain)         │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Routes (all at /.netlify/functions/google-callback):
 *
 *   GET ?code=…&state=…        OAuth callback from Google (unauthenticated)
 *   GET ?action=status&…       Is Drive connected for this org?  (authed)
 *   GET ?action=token&…        Return current valid access token (authed)
 *   DELETE body{organization_id} Disconnect (remove tokens)       (authed)
 *
 * Environment variables required:
 *   GOOGLE_CLIENT_ID           — OAuth client ID (server-only)
 *   GOOGLE_CLIENT_SECRET       — OAuth client secret (server-only)
 *   VITE_APP_URL               — App root URL for post-OAuth redirect
 *   SUPABASE_SERVICE_ROLE_KEY  — Supabase service role key
 *   VITE_SUPABASE_URL          — Supabase project URL
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const APP_URL       = process.env.VITE_APP_URL || 'http://localhost:8888';

const REDIRECT_URI  = `${APP_URL}/.netlify/functions/google-callback`;
const TOKEN_URL     = 'https://oauth2.googleapis.com/token';
const SCOPE         = 'https://www.googleapis.com/auth/drive.readonly';

// ─────────────────────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────────────────────

const json = (code: number, body: unknown) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const redirect = (url: string) => ({
  statusCode: 302,
  headers: { Location: url },
  body: '',
});

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

export const handler = async (event: any) => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(503, { error: 'Server configuration error: missing Supabase credentials.' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const qs = (event.queryStringParameters ?? {}) as Record<string, string | undefined>;

  // ── OAuth callback from Google (GET ?code=…&state=…) ─────────────────────
  if (event.httpMethod === 'GET' && qs.code) {
    return handleOAuthCallback(admin, qs);
  }

  // ── Error redirect from Google (GET ?error=…) ────────────────────────────
  if (event.httpMethod === 'GET' && qs.error) {
    const msg = encodeURIComponent(qs.error_description ?? qs.error ?? 'Google OAuth error');
    return redirect(`${APP_URL}?google_drive=error&message=${msg}`);
  }

  // ── Authenticated API routes ───────────────────────────────────────────────
  const authHeader = (event.headers.authorization || event.headers.Authorization) as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'Authentication required.' });
  }
  const accessToken = authHeader.slice('Bearer '.length);
  const { data: userResp, error: authErr } = await admin.auth.getUser(accessToken);
  if (authErr || !userResp?.user) {
    return json(401, { error: 'Session expired. Please sign in again.' });
  }
  const user = userResp.user;

  // GET ?action=status
  if (event.httpMethod === 'GET' && qs.action === 'status') {
    const orgId = qs.organization_id;
    if (!orgId) return json(400, { error: 'Missing organization_id.' });
    if (!await isMember(admin, orgId, user.id)) return json(403, { error: 'Access denied.' });

    const integration = await getIntegration(admin, orgId, 'google_drive');
    return json(200, { connected: !!integration });
  }

  // GET ?action=token — returns a valid (auto-refreshed) access token
  if (event.httpMethod === 'GET' && qs.action === 'token') {
    const orgId = qs.organization_id;
    if (!orgId) return json(400, { error: 'Missing organization_id.' });
    if (!await isMember(admin, orgId, user.id)) return json(403, { error: 'Access denied.' });

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return json(503, { error: 'Google Drive integration is not configured on this server.' });
    }

    const integration = await getIntegration(admin, orgId, 'google_drive');
    if (!integration) {
      return json(404, { error: 'Google Drive is not connected for this organization.' });
    }

    const token = await getValidToken(admin, integration);
    return json(200, { access_token: token });
  }

  // DELETE — disconnect Google Drive
  if (event.httpMethod === 'DELETE') {
    let body: any = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}
    const orgId = body.organization_id as string | undefined;
    if (!orgId) return json(400, { error: 'Missing organization_id.' });

    // Only Owner/Admin can disconnect
    if (!await isAdmin(admin, orgId, user.id)) {
      return json(403, { error: 'Only Owner or Admin can disconnect integrations.' });
    }

    const { error } = await admin
      .from('organization_integrations')
      .delete()
      .eq('organization_id', orgId)
      .eq('integration_type', 'google_drive');
    if (error) return json(500, { error: 'Failed to disconnect Google Drive.' });

    return json(200, { success: true });
  }

  return json(405, { error: 'Method not allowed.' });
};

// ─────────────────────────────────────────────────────────────────────────────
// OAuth callback handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleOAuthCallback(admin: any, qs: Record<string, string | undefined>) {
  const code = qs.code!;
  const state = qs.state ?? '';

  // State encodes "orgId:userId" as base64
  let orgId: string;
  let userId: string;
  try {
    const decoded = Buffer.from(state, 'base64').toString('utf-8');
    [orgId, userId] = decoded.split(':');
    if (!orgId || !userId) throw new Error('bad format');
  } catch {
    return redirect(`${APP_URL}?google_drive=error&message=${encodeURIComponent('Invalid OAuth state parameter.')}`);
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return redirect(`${APP_URL}?google_drive=error&message=${encodeURIComponent('Google OAuth is not configured on this server.')}`);
  }

  // Verify the user is actually a member of that org
  if (!await isMember(admin, orgId, userId)) {
    return redirect(`${APP_URL}?google_drive=error&message=${encodeURIComponent('Access denied.')}`);
  }

  // Exchange code for tokens
  let tokens: GoogleTokenResponse;
  try {
    tokens = await exchangeCode(code);
  } catch (e: any) {
    console.error('Google token exchange failed:', e);
    return redirect(`${APP_URL}?google_drive=error&message=${encodeURIComponent('Failed to obtain Google tokens.')}`);
  }

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  // Upsert tokens into organization_integrations
  const { error } = await admin
    .from('organization_integrations')
    .upsert(
      {
        organization_id:  orgId,
        integration_type: 'google_drive',
        access_token:     tokens.access_token,
        refresh_token:    tokens.refresh_token ?? null,
        expires_at:       expiresAt,
        connected_by:     userId,
        connected_at:     new Date().toISOString(),
      },
      { onConflict: 'organization_id,integration_type' },
    );

  if (error) {
    console.error('Failed to save Google tokens:', error);
    return redirect(`${APP_URL}?google_drive=error&message=${encodeURIComponent('Failed to save integration. Please try again.')}`);
  }

  return redirect(`${APP_URL}?google_drive=connected`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────────────────────────────────────

interface GoogleTokenResponse {
  access_token:  string;
  refresh_token?: string;
  expires_in?:   number;
  token_type?:   string;
}

async function exchangeCode(code: string): Promise<GoogleTokenResponse> {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }).toString(),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Google responded ${resp.status}: ${body}`);
  }
  return resp.json() as Promise<GoogleTokenResponse>;
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    'refresh_token',
    }).toString(),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${body}`);
  }
  return resp.json() as Promise<GoogleTokenResponse>;
}

/** Returns a valid access token, refreshing it if expired. */
async function getValidToken(admin: any, integration: any): Promise<string> {
  const now = Date.now();
  const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : 0;

  // Refresh 60 seconds before actual expiry to avoid race conditions
  if (expiresAt - now > 60_000) {
    return integration.access_token as string;
  }

  if (!integration.refresh_token) {
    throw new Error('No refresh token available. User must reconnect Google Drive.');
  }

  const tokens = await refreshAccessToken(integration.refresh_token);
  const newExpiresAt = new Date(now + (tokens.expires_in ?? 3600) * 1000).toISOString();

  // Update stored tokens
  await admin
    .from('organization_integrations')
    .update({
      access_token: tokens.access_token,
      expires_at:   newExpiresAt,
    })
    .eq('id', integration.id);

  return tokens.access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getIntegration(admin: any, orgId: string, type: string) {
  const { data } = await admin
    .from('organization_integrations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('integration_type', type)
    .maybeSingle();
  return data ?? null;
}

async function isMember(admin: any, orgId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

async function isAdmin(admin: any, orgId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role === 'Owner' || data?.role === 'Admin';
}
