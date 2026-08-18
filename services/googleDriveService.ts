/**
 * googleDriveService.ts
 *
 * Client-side helpers for the server-proxied Google Drive integration.
 *
 * Server-side env vars (in .env / Netlify dashboard — never VITE_):
 *   GOOGLE_CLIENT_ID       — same client ID (server uses it for token exchange)
 *   GOOGLE_CLIENT_SECRET   — OAuth client secret
 *
 * How to set up in Google Cloud Console:
 *   1. APIs & Services → Library → enable "Google Drive API"
 *   2. Credentials → Create Credentials → OAuth 2.0 Client ID (Web application)
 *      Authorized redirect URIs:
 *        https://<netlify-site>/.netlify/functions/google-callback
 *        http://localhost:8888/.netlify/functions/google-callback
 */

const GOOGLE_DRIVE_URL = '/.netlify/functions/google-drive';

// ─────────────────────────────────────────────────────────────────────────────
// OAuth initiation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ask the server to create a short-lived, single-use OAuth state, then navigate
 * to the returned Google authorization URL.
 */
export async function connectGoogleDrive(
  orgId: string,
  accessToken: string,
): Promise<void> {
  const resp = await fetch(GOOGLE_DRIVE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: 'connect', organization_id: orgId }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((body as any).error ?? 'Failed to connect Google Drive.');

  const authorizationUrl = new URL((body as any).authorization_url);
  if (authorizationUrl.origin !== 'https://accounts.google.com') {
    throw new Error('The Google authorization URL is invalid.');
  }
  window.location.assign(authorizationUrl.toString());
}

// ─────────────────────────────────────────────────────────────────────────────
// Status and file queries (via Netlify function)
// ─────────────────────────────────────────────────────────────────────────────

export interface GoogleDriveStatus {
  configured: boolean;
  connected: boolean;
  canManage: boolean;
}

/** Returns safe connection metadata for the organization. */
export async function getGoogleDriveStatus(
  orgId: string,
  accessToken: string,
): Promise<GoogleDriveStatus> {
  const resp = await fetch(
    `${GOOGLE_DRIVE_URL}?action=status&organization_id=${encodeURIComponent(orgId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((body as any).error ?? 'Failed to check Google Drive status.');
  return {
    configured: (body as any).configured === true,
    connected: (body as any).connected === true,
    canManage: (body as any).can_manage === true,
  };
}

export interface DriveFile {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
}

export interface GoogleDriveFilePage {
  files: DriveFile[];
  nextPageToken: string | null;
}

/** List constrained file metadata without exposing the Google bearer token. */
export async function listGoogleDriveFiles(
  orgId: string,
  accessToken: string,
  options: { search?: string; pageToken?: string | null } = {},
): Promise<GoogleDriveFilePage> {
  const url = new URL(GOOGLE_DRIVE_URL, window.location.origin);
  url.searchParams.set('action', 'files');
  url.searchParams.set('organization_id', orgId);
  if (options.search) url.searchParams.set('search', options.search);
  if (options.pageToken) url.searchParams.set('page_token', options.pageToken);

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((body as any).error ?? 'Failed to load Google Drive files.');
  return {
    files: Array.isArray((body as any).files) ? (body as any).files : [],
    nextPageToken: typeof (body as any).next_page_token === 'string'
      ? (body as any).next_page_token
      : null,
  };
}

/** Disconnect Google Drive (removes stored tokens). */
export async function disconnectGoogleDrive(
  orgId: string,
  accessToken: string,
): Promise<void> {
  const resp = await fetch(GOOGLE_DRIVE_URL, {
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
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

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
