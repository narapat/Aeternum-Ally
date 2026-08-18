# Google Drive OAuth Integration

**Type:** Enhancement  
**Priority:** P2 (Medium)  
**Labels:** `phase-2`, `evidence-vault`, `integration`, `p2`  
**Milestone:** Phase 2 — Evidence Vault  
**Epic:** #[EPIC_NUMBER]  
**Depends on:** #14 (Evidence API)

---

## Problem

Users need seamless way to link files from Google Drive without manually copying URLs.

---

## Solution

OAuth integration with Google Drive:
- One-click "Connect Google Drive" button
- File picker shows user's Drive files
- Select file → automatically extract metadata
- Store file ID + name + URL

**Permissions:** Read-only (no write access)

---

## Google Drive API Setup

### 1. Create OAuth Credentials

```
1. Go to Google Cloud Console
2. Create project "AeternumAlly"
3. Enable Google Drive API
4. Create OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URIs: 
     - https://app.aeternumally.com/auth/google/callback
     - http://localhost:3000/auth/google/callback (dev)
5. Copy Client ID and Client Secret
```

### 2. Environment Variables

```bash
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://app.aeternumally.com/auth/google/callback
```

---

## OAuth Flow

```
User clicks [Connect Google Drive]
  ↓
Redirect to Google OAuth consent screen
  ↓
User grants read-only Drive access
  ↓
Google redirects to callback with auth code
  ↓
Exchange code for access token + refresh token
  ↓
Store tokens in organization_integrations table
  ↓
Open Google Picker with access token
  ↓
User selects file
  ↓
Extract file metadata (ID, name, URL)
  ↓
Create evidence_attachment record
```

---

## Database Schema

```sql
CREATE TABLE organization_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_type text NOT NULL CHECK (integration_type IN ('google_drive', 'onedrive', 'dropbox')),
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  connected_by uuid REFERENCES auth.users(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, integration_type)
);

ALTER TABLE organization_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_manage_integrations" ON organization_integrations
  FOR ALL USING (
    is_org_member(organization_id) 
    AND user_org_role(organization_id) IN ('Owner', 'Admin')
  );
```

---

## Backend Implementation

### OAuth Callback Handler

```typescript
// netlify/functions/google-callback.ts

export async function handler(event) {
  const code = event.queryStringParameters.code;
  const state = event.queryStringParameters.state; // organization_id
  
  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code);
  
  // Store in database
  await db.organization_integrations.upsert({
    where: {
      organization_id_integration_type: {
        organization_id: state,
        integration_type: 'google_drive'
      }
    },
    update: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000)
    },
    create: {
      organization_id: state,
      integration_type: 'google_drive',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000),
      connected_by: userId
    }
  });
  
  // Redirect back to app
  return {
    statusCode: 302,
    headers: {
      Location: '/evidence?connected=google_drive'
    }
  };
}

async function exchangeCodeForTokens(code: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    })
  });
  
  return await response.json();
}
```

### Token Refresh

```typescript
async function getValidAccessToken(organizationId: string): Promise<string> {
  const integration = await db.organization_integrations.findUnique({
    where: {
      organization_id_integration_type: {
        organization_id: organizationId,
        integration_type: 'google_drive'
      }
    }
  });
  
  if (!integration) {
    throw new Error('Google Drive not connected');
  }
  
  // Check if token expired
  if (new Date() >= integration.expires_at) {
    const tokens = await refreshAccessToken(integration.refresh_token);
    
    await db.organization_integrations.update({
      where: { id: integration.id },
      data: {
        access_token: tokens.access_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000)
      }
    });
    
    return tokens.access_token;
  }
  
  return integration.access_token;
}

async function refreshAccessToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token'
    })
  });
  
  return await response.json();
}
```

---

## Frontend Implementation

### Connect Button

```tsx
function ConnectGoogleDrive({ organizationId }: { organizationId: string }) {
  const handleConnect = () => {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.readonly');
    authUrl.searchParams.set('state', organizationId);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    
    window.location.href = authUrl.toString();
  };
  
  return (
    <button onClick={handleConnect}>
      🔗 Connect Google Drive
    </button>
  );
}
```

### Google Picker

```tsx
import { useDrivePicker } from 'react-google-drive-picker';

function GoogleDrivePicker({ onSelect }: { onSelect: (file: any) => void }) {
  const [openPicker] = useDrivePicker();
  
  const handleOpenPicker = async () => {
    const accessToken = await getAccessToken(organizationId);
    
    openPicker({
      clientId: GOOGLE_CLIENT_ID,
      developerKey: GOOGLE_API_KEY,
      viewId: 'DOCS',
      token: accessToken,
      showUploadView: false,
      showUploadFolders: false,
      supportDrives: true,
      multiselect: false,
      callbackFunction: (data) => {
        if (data.action === 'picked') {
          const file = data.docs[0];
          onSelect({
            id: file.id,
            name: file.name,
            url: file.url,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes
          });
        }
      }
    });
  };
  
  return (
    <button onClick={handleOpenPicker}>
      Select from Google Drive
    </button>
  );
}
```

---

## Acceptance Criteria

- [ ] OAuth consent flow works
- [ ] Tokens stored securely in database
- [ ] Token refresh works automatically
- [ ] Google Picker opens with user's files
- [ ] Selected file metadata extracted
- [ ] Evidence record created with Drive link
- [ ] Only Owner/Admin can connect integrations
- [ ] Disconnect removes tokens from database

---

## Files to Create

### Backend:
- `netlify/functions/google-callback.ts`
- `services/googleDriveService.ts`

### Frontend:
- `components/evidence/ConnectGoogleDrive.tsx`
- `components/evidence/GoogleDrivePicker.tsx`

### Migration:
- `supabase/migrations/00X_organization_integrations.sql`

---

## Testing Checklist

- [ ] OAuth flow completes successfully
- [ ] Token stored in database
- [ ] Picker shows user's Drive files
- [ ] Select file → evidence created
- [ ] Token expires → auto-refresh works
- [ ] Disconnect → tokens removed

---

## Security Notes

- Store tokens encrypted in database
- Never expose tokens to frontend
- Use HTTPS only for OAuth callback
- Validate state parameter (CSRF protection)

---

## Related Issues

- Depends on: #14 (Evidence API)
- Used by: #16 (Link UI)
