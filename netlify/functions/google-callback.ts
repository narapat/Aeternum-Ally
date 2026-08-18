/**
 * netlify/functions/google-callback.ts
 *
 * Handles the Google OAuth 2.0 flow and token management for Google Drive.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  Google Cloud Console setup required:                                │
 * │  1. Create a project at https://console.cloud.google.com             │
 * │  2. Enable "Google Drive API"                                         │
 * │  3. Create OAuth 2.0 Client ID (Web Application)                     │
 * │  4. Add Authorized Redirect URI:                                      │
 * │       https://<your-netlify-site>/.netlify/functions/google-callback  │
 * │       http://localhost:8888/.netlify/functions/google-callback (dev)  │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Routes (all at /.netlify/functions/google-callback):
 *
 *   GET ?code=…&state=…        OAuth callback from Google (unauthenticated)
 *   GET ?action=status&…       Is Drive connected for this org?  (authed)
 *   GET ?action=token&…        Retired route; always returns 404
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
import {
  canManageGoogleDrive,
  hashGoogleOAuthState,
  isValidGoogleOAuthState,
} from './_shared/googleDriveSecurity.js';

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const APP_URL       = process.env.VITE_APP_URL || 'http://localhost:8888';

const REDIRECT_URI  = `${APP_URL}/.netlify/functions/google-callback`;
const TOKEN_URL     = 'https://oauth2.googleapis.com/token';

// ─────────────────────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────────────────────

const json = (code: number, body: unknown) => ({
  statusCode: code,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
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
    const state = qs.state ?? '';
    if (isValidGoogleOAuthState(state)) {
      await admin
        .from('organization_oauth_states')
        .delete()
        .eq('state_hash', hashGoogleOAuthState(state))
        .eq('integration_type', 'google_drive');
    }
    const msg = encodeURIComponent('Google Drive authorization was not completed.');
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

  // GET ?action=token — retired; browser clients must never receive OAuth tokens
  if (event.httpMethod === 'GET' && qs.action === 'token') {
    const orgId = qs.organization_id;
    if (!orgId) return json(400, { error: 'Missing organization_id.' });
    if (!await isMember(admin, orgId, user.id)) return json(403, { error: 'Access denied.' });
    return json(404, { error: 'This Google Drive operation is no longer available.' });
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

  if (!code || code.length > 4096 || /[\u0000-\u001f\u007f]/.test(code)) {
    return redirect(`${APP_URL}?google_drive=error&message=${encodeURIComponent('Invalid Google Drive callback.')}`);
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return redirect(`${APP_URL}?google_drive=error&message=${encodeURIComponent('Google OAuth is not configured on this server.')}`);
  }

  if (!isValidGoogleOAuthState(state)) {
    return redirect(`${APP_URL}?google_drive=error&message=${encodeURIComponent('Google Drive authorization expired.')}`);
  }

  // Consume the hashed state atomically. Replays, expired states and legacy
  // base64("orgId:userId") values all fail without exposing tenant identifiers.
  const { data: oauthState, error: stateError } = await admin
    .from('organization_oauth_states')
    .delete()
    .eq('state_hash', hashGoogleOAuthState(state))
    .eq('integration_type', 'google_drive')
    .gt('expires_at', new Date().toISOString())
    .select('organization_id, user_id')
    .maybeSingle();
  if (stateError || !oauthState) {
    console.error('[google-drive] OAuth state verification failed');
    return redirect(`${APP_URL}?google_drive=error&message=${encodeURIComponent('Google Drive authorization expired.')}`);
  }

  const orgId = oauthState.organization_id as string;
  const userId = oauthState.user_id as string;
  const { data: membership, error: membershipError } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (membershipError || !membership || !canManageGoogleDrive(membership.role)) {
    return redirect(`${APP_URL}?google_drive=error&message=${encodeURIComponent('Access denied.')}`);
  }

  let tokens: GoogleTokenResponse;
  try {
    tokens = await exchangeCode(code);
  } catch (e: any) {
    const providerStatus = typeof e?.providerStatus === 'number'
      ? ` provider_status=${e.providerStatus}`
      : '';
    console.error(`[google-drive] token exchange failed${providerStatus}`);
    return redirect(`${APP_URL}?google_drive=error&message=${encodeURIComponent('Failed to obtain Google tokens.')}`);
  }

  const existing = await getIntegration(admin, orgId, 'google_drive');
  const refreshToken = tokens.refresh_token ?? existing?.refresh_token ?? null;
  if (!refreshToken) {
    console.error('[google-drive] OAuth response did not include a refresh token');
    return redirect(`${APP_URL}?google_drive=error&message=${encodeURIComponent('Google Drive connection failed.')}`);
  }
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  const { error } = await admin
    .from('organization_integrations')
    .upsert(
      {
        organization_id:  orgId,
        integration_type: 'google_drive',
        access_token:     tokens.access_token,
        refresh_token:    refreshToken,
        expires_at:       expiresAt,
        connected_by:     userId,
        connected_at:     new Date().toISOString(),
      },
      { onConflict: 'organization_id,integration_type' },
    );

  if (error) {
    console.error('[google-drive] failed to save OAuth credentials');
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
    throw Object.assign(new Error('Google rejected the OAuth request.'), {
      providerStatus: resp.status,
    });
  }
  return resp.json() as Promise<GoogleTokenResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getIntegration(admin: any, orgId: string, type: string) {
  const { data } = await admin
    .from('organization_integrations')
    .select('id, access_token, refresh_token, expires_at')
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
