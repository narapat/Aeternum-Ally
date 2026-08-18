<!-- Version: 1.1.0 - Last updated: 2026-08-18 -->

# Configuration Reference

All configuration points in AeternumAlly — environment variables, hardcoded constants, and database-level settings. Use this as the single reference when tuning a self-hosted deployment.

---

## 1. Environment variables

Set these in **Netlify Dashboard → Site settings → Environment variables**. For local development, copy `.env.example` to `.env` and fill in each value.

| Variable | Scope | Required | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Public (browser + functions) | Yes | Supabase project URL, for example `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Public (browser) | Yes | Supabase anon/public key. Its exposure is intentional; RLS must protect every data path. |
| `VITE_APP_URL` | Public (browser + functions) | Yes | Deployment base URL with no trailing slash. Used for redirects and provider callbacks. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Yes | Privileged Supabase key that bypasses RLS. Every function using it must perform its own authorization. |
| `GEMINI_API_KEY` | Server-only | Yes for platform AI | Platform Gemini credential. Organizations using BYOK store their key separately in Supabase. |
| `INTERNAL_JOB_SECRET` | Server-only | Yes for background AI | At least 32 random characters shared by `api.ts` and background functions. Generate with `openssl rand -hex 32`. |
| `INTERNAL_FUNCTION_BASE_URL` | Server-only | No | Trusted HTTPS base URL for non-Netlify/self-hosted internal dispatch. Netlify deploy URLs are detected automatically. |
| `GOOGLE_CLIENT_ID` | Server-only | Yes for Google Drive | Google OAuth Web application client ID. |
| `GOOGLE_CLIENT_SECRET` | Server-only | Yes for Google Drive | Google OAuth client secret. |
| `PLATFORM_ADMIN_EMAIL` | Server-only | Bootstrap only | Initial platform-admin identity, used only while `platform_admins` is empty. |
| `PLATFORM_ADMIN_PASSWORD` | Server-only | Bootstrap only | Initial platform-admin password. Password bootstrap is rejected after an admin row exists. |
| `PLATFORM_ADMIN_JWT_SECRET` | Server-only | No | Optional explicit signing key for eight-hour platform-admin tokens. Otherwise derived from the service-role key. |
| `RESEND_API_KEY` | Server-only | Yes for production admin magic links | Resend API key. Production admin magic-link delivery fails closed when unavailable. |
| `RESEND_FROM_EMAIL` | Server-only | Yes when Resend is used | Sender on a verified Resend domain. |
| `ALLOW_DEV_ADMIN_MAGIC_LINKS` | Server-only | Local development only | Keep `false` in hosted environments. A link is returned only when this is `true`, Netlify Dev is detected, and the request host is loopback. |

Never prefix a server-only variable with `VITE_`; Vite would embed it in the browser bundle. Scope sensitive variables to every Netlify deploy context that needs the feature, including Deploy Previews used for testing.

`VITE_APP_URL` must be allowed in Supabase Auth URL Configuration. Google Drive also requires an exact callback URI: `<deployment-base-url>/.netlify/functions/google-callback`.

---

## 2. Hardcoded constants

These values are defined in source code. Changing them requires a code edit and redeploy.

### `constants.ts`

| Constant | Current value | Effect |
|---|---|---|
| `MATERIALITY_THRESHOLD` | `40` | Topics scoring above this (0–100 scale) on either materiality dimension are flagged as material. Raising it makes the assessment more selective; lowering it flags more topics. |

### `netlify/functions/api.ts`

| Constant | Current value | Effect |
|---|---|---|
| `DEFAULT_MODEL` | `"gemini-2.5-flash"` | The Gemini model used when an org has no `organization_ai_settings` row. Change to a cheaper model (`gemini-2.5-flash-lite`) to reduce costs, or to a more capable one (`gemini-2.5-pro`) for higher quality output. |
| `MODEL_REGISTRY` | See source | Allowed operational model metadata and approximate USD/1M-token rates used for cost estimates. The database also has a `CHECK` allowlist. |

### Security limits

| Source | Setting | Current value |
|---|---|---|
| `services/spreadsheetPolicy.ts` | Spreadsheet size | 2 MiB |
| `services/spreadsheetPolicy.ts` | Workbook shape | 2 sheets, 1,000 data rows per sheet, 50 columns |
| `services/spreadsheetPolicy.ts` | Cell and parser bounds | 10,000 characters per cell; 8-second worker timeout |
| `services/evidenceUrlSecurity.ts` | External evidence URL | 2,048 characters; public HTTPS only; provider hostname allowlists where applicable |
| `_shared/inviteResendSecurity.js` | Public resend request limit | 10 requests per client per 60 seconds |
| `_shared/inviteResendSecurity.js` | Invitation delivery cooldown | 5 minutes |
| `_shared/allySupportSecurity.js` | Ally request limits | 64 KiB request, 30 messages, 4,000 characters per message, 30,000 total message characters |
| `_shared/aiRequestFence.js` | Synchronous AI request fence | 50 seconds within the 60-second synchronous function limit |

### `supabase/schema.sql`

| Setting | Current value | Effect |
|---|---|---|
| Invite expiry | `now() + interval '7 days'` | How long an invitation link remains valid. Change the interval in the `organization_invites` table DEFAULT clause and redeploy the schema. |

---

## 3. Per-organization AI settings

Each organization can select a Gemini model and optionally use its own credential. Safe settings are stored in `organization_ai_settings`; raw credentials are stored separately in the service-role-only `organization_ai_secrets` table.

| Column | Type | Default | Description |
|---|---|---|---|
| `model` | `text` | `"gemini-2.5-flash"` | Gemini model to use for this org's AI calls |
| `use_byok` | `boolean` | `false` | Whether the server should use the organization's stored key |
| `byok_provider` | `text` | `null` | Credential provider; currently only `gemini` is accepted by the function |
| `soft_quota_monthly` | `integer` | `null` | Optional monthly call allowance override; the current quota is a soft warning, not a hard block |

`organization_ai_secrets.byok_api_key` is not selectable by browser roles. The settings endpoint returns `has_byok_key`, never the key. Owners and Admins can configure/rotate it; other members can use AI according to organization settings without reading the credential.

The database `CHECK` restricts `model` values. Repeating the allowlist at the function boundary remains defense-in-depth work; see [TECH_STACK.md](./TECH_STACK.md#known-gaps--hardening-backlog).

---

## 4. Supabase Auth settings

Configure these in **Supabase Dashboard → Authentication → Settings**.

| Setting | Recommended value | Notes |
|---|---|---|
| Site URL | Your `VITE_APP_URL` | Must match exactly |
| Redirect URLs | `VITE_APP_URL` (at minimum) | Add `http://localhost:8888` for local dev |
| JWT expiry | 3600s (default) | Shorten for higher security; users will need to re-authenticate more often |
| Email OTP expiry | 3600s (default) | How long a magic-link remains valid |
| SMTP provider | Configure a real SMTP service | The built-in Supabase sender is rate-limited and unreliable for production |

---

## 5. Google Drive OAuth

Create a Google OAuth 2.0 **Web application** client and configure:

- Authorized JavaScript origin: the deployment base URL when required by Google Cloud
- Authorized redirect URI: `<deployment-base-url>/.netlify/functions/google-callback`
- Scope: `https://www.googleapis.com/auth/drive.readonly`
- OAuth consent users: add test users while the consent screen remains in Testing mode

The redirect URI must match exactly, including scheme, hostname, path, and Deploy Preview hostname when testing a preview. Add a separate URI for each stable environment. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the matching Netlify deploy context, then redeploy.

The connection belongs to the Aeternum Ally organization, not to an email domain. An Owner or Admin connects one Google account on behalf of the organization; members may have Gmail, Workspace, or unrelated email domains. Managers and Consultants can select allowed Drive evidence files after the organization is connected, but cannot connect, disconnect, or read OAuth tokens.

## 6. Netlify build settings

Defined in `netlify.toml`. These rarely need changing.

| Setting | Value | Notes |
|---|---|---|
| Build command | `npm run build` | Runs Vite production build |
| Publish directory | `dist` | Vite output directory |
| Functions directory | `netlify/functions` | All `.ts` files here are deployed as serverless functions |
| Dev port | `8888` | Port exposed by `netlify dev` (and `npm run dev:netlify`) |
| Dev target port | `3000` | Vite's internal port; Netlify CLI proxies this to 8888 |

---

## 7. Gemini models reference

Available models at time of writing. Check [Google AI pricing](https://ai.google.dev/pricing) for the latest.

| Model ID | Quality | Speed | Cost (USD / 1M tokens input / output) |
|---|---|---|---|
| `gemini-2.5-flash-lite` | Good | Fastest | $0.10 / $0.40 |
| `gemini-2.5-flash` | Better | Fast | $0.30 / $2.50 |
| `gemini-2.5-pro` | Best | Slower | $1.25 / $10.00 |

The default model (`gemini-2.5-flash`) balances quality and cost well for SME-scale usage.

---

## 8. Changing a configuration value

### To change a constant in `constants.ts` or `api.ts`
1. Edit the value in source
2. Run `npm run test:security`, `npx tsc --noEmit`, and `npm run build`
3. Open a pull request from a feature branch and verify the Deploy Preview
4. Merge only after review; publish the resulting deploy through the normal release flow

### To change the invite expiry
1. Edit the DEFAULT expression in `supabase/schema.sql` and write a migration:
   ```sql
   ALTER TABLE organization_invites
     ALTER COLUMN expires_at SET DEFAULT (now() + interval '14 days');
   ```
2. Apply the migration to each environment via Supabase Dashboard → SQL Editor

### To change environment variables
1. Update the value in Netlify Dashboard → Site settings → Environment variables
2. Confirm the variable has a value in every required deploy context; a variable name with zero values is not configured
3. Trigger a redeploy: **Deploys → Trigger deploy → Clear cache and deploy site**
