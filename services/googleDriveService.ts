/**
 * googleDriveService.ts
 *
 * Client-side helpers for Google Drive OAuth integration.
 *
 * Required environment variables:
 *   VITE_GOOGLE_CLIENT_ID  — OAuth client ID (safe to expose; used for Picker)
 *   VITE_GOOGLE_API_KEY    — Google API key restricted to Picker API + your domain
 *
 * Server-side env vars (in .env / Netlify dashboard — never VITE_):
 *   GOOGLE_CLIENT_ID       — same client ID (server uses it for token exchange)
 *   GOOGLE_CLIENT_SECRET   — OAuth client secret
 *
 * How to set up in Google Cloud Console:
 *   1. APIs & Services → Library → enable "Google Drive API" + "Google Picker API"
 *   2. Credentials → Create Credentials → OAuth 2.0 Client ID (Web application)
 *      Authorized redirect URIs:
 *        https://<netlify-site>/.netlify/functions/google-callback
 *        http://localhost:8888/.netlify/functions/google-callback
 *   3. Credentials → Create Credentials → API Key
 *      Restrict to: Picker API + your domain(s)
 */

const CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;
const API_KEY   = (import.meta as any).env?.VITE_GOOGLE_API_KEY   as string | undefined;

const CALLBACK_URL  = '/.netlify/functions/google-callback';
const OAUTH_SCOPE   = 'https://www.googleapis.com/auth/drive.readonly';
const OAUTH_BASE    = 'https://accounts.google.com/o/oauth2/v2/auth';

// ─────────────────────────────────────────────────────────────────────────────
// OAuth initiation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the Google OAuth consent-screen URL and navigate the browser to it.
 * After consent the user lands at google-callback which stores the tokens,
 * then redirects back to APP_URL with ?google_drive=connected.
 */
export function connectGoogleDrive(orgId: string, userId: string): void {
  if (!CLIENT_ID) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID is not set. Configure the Google Cloud credentials first.',
    );
  }

  // State = base64("orgId:userId") — decoded server-side in google-callback.ts
  const state = btoa(`${orgId}:${userId}`);

  const url = new URL(OAUTH_BASE);
  url.searchParams.set('client_id',     CLIENT_ID);
  url.searchParams.set('redirect_uri',  `${window.location.origin}${CALLBACK_URL}`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope',         OAUTH_SCOPE);
  url.searchParams.set('state',         state);
  url.searchParams.set('access_type',   'offline');   // request refresh token
  url.searchParams.set('prompt',        'consent');   // always show consent to get refresh token

  window.location.href = url.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Token & status queries (via Netlify function)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true if Google Drive is connected for the org. */
export async function getGoogleDriveStatus(
  orgId: string,
  accessToken: string,
): Promise<boolean> {
  const resp = await fetch(
    `${CALLBACK_URL}?action=status&organization_id=${encodeURIComponent(orgId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) return false;
  const data = await resp.json();
  return !!(data as any).connected;
}

/**
 * Returns a valid Google OAuth access token for this org.
 * The server auto-refreshes it if expired.
 * Use this token to open the Google Picker (see openGooglePicker below).
 */
export async function getGoogleDriveAccessToken(
  orgId: string,
  accessToken: string,
): Promise<string> {
  const resp = await fetch(
    `${CALLBACK_URL}?action=token&organization_id=${encodeURIComponent(orgId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((body as any).error ?? 'Failed to get Google Drive token.');
  return (body as any).access_token as string;
}

/** Disconnect Google Drive (removes stored tokens). */
export async function disconnectGoogleDrive(
  orgId: string,
  accessToken: string,
): Promise<void> {
  const resp = await fetch(CALLBACK_URL, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ organization_id: orgId }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((body as any).error ?? 'Failed to disconnect Google Drive.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Picker
// ─────────────────────────────────────────────────────────────────────────────

export interface DriveFile {
  id:        string;
  name:      string;
  url:       string;
  mimeType:  string;
  sizeBytes: number | null;
}

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

let pickerScriptLoaded = false;

/** Dynamically load the Google Picker API script once. */
async function loadPickerApi(): Promise<void> {
  if (pickerScriptLoaded || window.gapi?.picker) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi!.load('picker', { callback: resolve });
    };
    script.onerror = () => reject(new Error('Failed to load Google Picker API script.'));
    document.head.appendChild(script);
  });
  pickerScriptLoaded = true;
}

/**
 * Open the Google Drive Picker and return the selected file's metadata.
 * Returns null if the user cancels.
 *
 * Requires:
 *   - VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY set
 *   - Google Drive is connected for the org (access token obtained via
 *     getGoogleDriveAccessToken)
 */
export async function openGooglePicker(driveAccessToken: string): Promise<DriveFile | null> {
  if (!API_KEY) {
    throw new Error('VITE_GOOGLE_API_KEY is not set.');
  }
  if (!CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not set.');
  }

  await loadPickerApi();

  return new Promise<DriveFile | null>((resolve) => {
    const picker = new window.google.picker.PickerBuilder()
      .addView(window.google.picker.ViewId.DOCS)
      .setOAuthToken(driveAccessToken)
      .setDeveloperKey(API_KEY!)
      .setAppId(CLIENT_ID!)
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const doc = data.docs[0];
          resolve({
            id:        doc.id         as string,
            name:      doc.name       as string,
            url:       doc.url        as string,
            mimeType:  doc.mimeType   as string,
            sizeBytes: doc.sizeBytes != null ? Number(doc.sizeBytes) : null,
          });
        } else if (
          data.action === window.google.picker.Action.CANCEL ||
          data.action === window.google.picker.Action.LOADED
        ) {
          if (data.action === window.google.picker.Action.CANCEL) resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true if the Google credentials env vars are configured in this build. */
export function isGoogleDriveConfigured(): boolean {
  return !!(CLIENT_ID && API_KEY);
}

/** Convert Google MIME type to a short extension string. */
export function mimeToExtension(mimeType: string): string {
  const MAP: Record<string, string> = {
    'application/pdf':                                                         'pdf',
    'application/vnd.google-apps.document':                                    'gdoc',
    'application/vnd.google-apps.spreadsheet':                                 'gsheet',
    'application/vnd.google-apps.presentation':                                'gslides',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       'xlsx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/jpeg':  'jpg',
    'image/png':   'png',
    'image/gif':   'gif',
    'image/webp':  'webp',
    'text/csv':    'csv',
    'text/plain':  'txt',
  };
  return MAP[mimeType] ?? mimeType.split('/').pop() ?? '';
}
