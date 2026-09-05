<!-- Version: 1.1.0 - Last updated: 2026-09-05 -->

# Deployment Guide

Step-by-step guide for deploying AeternumAlly. See [`TECH_STACK.md`](./TECH_STACK.md) for architecture context.

---

## Hosting overview

| Layer | Provider | What's there |
|---|---|---|
| Frontend (SPA) | **Netlify** | Static build output (`dist/`) on Netlify CDN |
| Backend (API) | **Netlify Functions** | `netlify/functions/*.ts` deployed as serverless functions |
| Database + Auth | **Supabase** | Postgres, Row-Level Security, Auth (magic link / invite emails) |
| AI | **Google Gemini API** | Called server-side only, key never exposed to browser |
| Evidence integration | **Google Drive API** | Organization-owned OAuth connection; provider tokens remain server-side |
| Transactional email | **Resend / Supabase SMTP** | Platform-admin links and application email delivery paths |

**One Netlify site + one Supabase project per environment.** Production and test/demo are completely separate stacks (different URLs, different DBs, different env vars).

---

## Environments

| Env | Frontend URL | Branch | Netlify site | Supabase project |
|---|---|---|---|---|
| Production | _(your prod domain)_ | `main` | Production site | Production project |
| Demo / Test | `demo.aeternumally.com` | `main` (separate site) | Demo site | _(separate Supabase project — ID stored in Netlify env vars only)_ |

Branch and Deploy Preview behavior depends on each variable's Netlify deploy-context scope. Confirm that required secrets have values in Preview contexts before testing; a listed variable with `0 values` is not configured.

---

## Environment variables

Set these in **Netlify Dashboard → Site settings → Environment variables** for each site.

| Variable | Public? | Where used |
|---|---|---|
| `VITE_SUPABASE_URL` | Public | Frontend and Functions |
| `VITE_SUPABASE_ANON_KEY` | Public | Frontend Supabase client; protected by RLS |
| `VITE_APP_URL` | Public | Redirects, callbacks, and application base URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** | Privileged function database access; bypasses RLS |
| `GEMINI_API_KEY` | **Server-only** | Platform AI calls |
| `INTERNAL_JOB_SECRET` | **Server-only** | Authenticated dispatch to background AI functions |
| `INTERNAL_FUNCTION_BASE_URL` | **Server-only**, optional | Trusted base URL for non-Netlify/self-hosted dispatch |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **Server-only** | Google Drive OAuth |
| `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD` | **Server-only** | Initial platform-admin bootstrap only |
| `PLATFORM_ADMIN_JWT_SECRET` | **Server-only**, optional | Explicit admin token-signing key |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | **Server-only** | Transactional email delivery |
| `ALLOW_DEV_ADMIN_MAGIC_LINKS` | **Server-only**, local only | Must remain `false` in hosted environments |

Never prefix a server-only secret with `VITE_`; Vite would inline it into the browser bundle. `VITE_APP_URL` must be a base URL with no trailing slash or query string.

Generate `INTERNAL_JOB_SECRET` with `openssl rand -hex 32`. Use a different value per environment and rotate it if exposed. A secret must have an actual value in Netlify, not only an environment-variable name.

---

## First-time setup

### 1. Supabase project

1. Create project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run `supabase/schema.sql` in full.
3. Do not replay `supabase/migrations/` after loading the current snapshot; `schema.sql` already represents the migrated state. Migrations are for upgrading an existing project.
4. Verify the security-critical objects exist: `organization_ai_secrets`, `organization_oauth_states`, `invite_resend_rate_limits`, and the current `error_log` policies.
5. **Auth → URL Configuration:**
   - Site URL → `https://your-app-url`
   - Redirect URLs → add `https://your-app-url` (base only is enough; auto-join is email-based)
6. **Auth → Email Templates** *(optional but recommended):*
   - Customise the **Invite** and **Magic Link** templates. Use `{{ .Data.company_name }}` and `{{ .Data.app_name }}` to reference custom data passed from `invite.ts`.
7. **Auth → SMTP Settings** *(optional but recommended for production):*
   - Configure a real SMTP provider (Resend / SendGrid / Mailgun).
   - Without this, Supabase's built-in sender is heavily rate-limited and may silently drop emails.
8. Copy these from **Project Settings → API**:
   - Project URL → `VITE_SUPABASE_URL`
   - `anon` public key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Google Gemini API key

1. Get a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Save it for `GEMINI_API_KEY` in Netlify.

### 3. Google Drive OAuth (optional)

1. In Google Cloud Console, enable the Google Drive API and configure the OAuth consent screen.
2. Create an OAuth 2.0 Client ID of type **Web application**.
3. Add the exact redirect URI for each environment:
   - `https://your-app.example/.netlify/functions/google-callback`
   - Add the exact Deploy Preview callback URI only when preview OAuth testing is required.
4. Configure the `drive.readonly` scope and add test users while the consent screen is in Testing mode.
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the matching Netlify deploy contexts.
6. Redeploy, then connect from **Settings -> Integrations** as an Owner or Admin.

The connected Google account belongs to the Aeternum Ally organization. Membership is determined by the application's `organization_members` table, not by Google/email domain. Managers and Consultants may select Drive files after connection but cannot manage OAuth or receive raw tokens.

### 4. Netlify site

1. **Add new site → Import from Git → select repo**.
2. Build settings (auto-detected from `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
3. **Site settings → Environment variables**: add the public variables and every server variable required by enabled features. Confirm each has a value in Production and Deploy Preview contexts where it is used.
4. **Site settings → Domain management**: add your custom domain (e.g. `demo.aeternumally.com`) and follow DNS instructions.
5. Open and verify a pull request, merge after review, then publish the resulting deploy through the normal release flow.

### 5. Smoke test

After the first deploy:

- [ ] Visit the URL → see sign-in screen
- [ ] Sign up with a fresh email → magic-link email arrives
- [ ] Click link → land on "Set up your company" screen
- [ ] Create a workspace → land in dashboard
- [ ] Invite a teammate (different email) → email arrives
- [ ] Click invite link → auto-joins to org without pasting token
- [ ] Open Company Profile → Team tab → see member list and pending invites
- [ ] Trigger synchronous and background AI suggestions; unauthenticated background requests return 401
- [ ] As Owner/Admin, connect Google Drive; as Manager/Consultant, select a file but cannot connect/disconnect
- [ ] Confirm Drive and BYOK responses never contain raw credentials
- [ ] Import a valid spreadsheet and reject oversized, malformed, or renamed non-spreadsheet files without writes
- [ ] Save/open a valid HTTPS evidence URL and reject unsafe schemes or provider lookalikes

If any step fails, check **Netlify → Functions → logs** and the browser console.

---

## Ongoing deploys

### Code changes

```
Feature branch → pull request → Deploy Preview → review/merge → production deploy → publish
```

- `main` produces the production deploy according to the site's publish settings
- Other branches produce preview URLs when branch/PR previews are enabled
- Failed builds: check **Netlify → Deploys → [build] → Deploy log**

### Schema changes

Database migrations are **manual** — Netlify does not run SQL.

For each PR that touches `supabase/schema.sql` or adds a `supabase/migrations/*.sql` file:

1. Open the PR description / commit message — it should call out the new SQL.
2. Open **Supabase Dashboard → SQL Editor** for the target environment.
3. Paste and run the new SQL.
4. Verify (e.g. `SELECT policyname FROM pg_policies WHERE tablename = '...'`).
5. Repeat for **every** environment (production + test).

Security migration sequence introduced in the August 2026 remediation:

| Migration | Required result |
|---|---|
| `020_expand_organization_ai_secrets.sql` | Create service-role-only BYOK storage and copy existing keys |
| `021_contract_legacy_byok_key.sql` | Verify enabled organizations have a secret, then drop the legacy browser-readable column |
| `022_google_drive_token_isolation.sql` | Revoke browser access to OAuth tokens and create short-lived OAuth state storage |
| `023_validate_evidence_external_urls.sql` | Add the external evidence HTTPS constraint |
| `024_rate_limit_invite_resends.sql` | Add the service-role-only rate-limit table and atomic resend RPC |
| `025_secure_error_log_inserts.sql` | Replace the client insert policy and revoke anonymous inserts |
| `026_ai_quota_enforcement.sql` | Add `platform_starter` to the `ai_usage_log.quota_type` constraint and restate `soft_quota_monthly` as an enforced ceiling |
| `027_ai_quota_grants.sql` | Create the service-role-only `ai_quota_grants` table and the one-auto-burst-per-month index |

> ⚠️ Run schema migrations **before** merging the code PR if the new code depends on the schema change. Otherwise the deploy will fail at runtime.

### Enabling AI quota enforcement (one-off)

Before the release that enforces the monthly AI allowance, decide what happens to organizations that are *already* over it. Nothing blocked AI calls previously, so any organization above its tier default starts receiving HTTP 429 the moment the deploy goes live — the demo organization is the likely candidate.

**1. Measure first.** This also tells you whether the tier defaults in `_shared/aiQuota.js` are set anywhere near real usage:

```sql
select o.id,
       coalesce(cp.name, '(unnamed)') as company,
       o.tier,
       count(l.id) filter (where l.success) as calls_this_month
from organizations o
left join company_profiles cp on cp.organization_id = o.id
left join ai_usage_log l on l.organization_id = o.id
     and l.created_at >= date_trunc('month', now() at time zone 'utc')
group by o.id, cp.name, o.tier
order by calls_this_month desc;
```

**2. Seed a generous standing limit** for existing organizations, then tighten once you have watched a full month. Organizations that never opened AI settings have no row in `organization_ai_settings`, so this must insert rather than update:

```sql
insert into organization_ai_settings (organization_id, soft_quota_monthly)
select id, 5000 from organizations
on conflict (organization_id) do update
  set soft_quota_monthly = coalesce(
        organization_ai_settings.soft_quota_monthly,
        excluded.soft_quota_monthly),
      updated_at = now();
```

The `coalesce` leaves any deliberate existing value alone, so the statement stays safe to re-run.

**3. Tighten later.** Clearing the override returns an organization to its tier default:

```sql
update organization_ai_settings
set soft_quota_monthly = null, updated_at = now()
where organization_id = '<org-uuid>';
```

From the release that adds the admin quota controls onward, do steps 2 and 3 from **AI Usage → Quota** in the admin console instead of by hand.

The alternative to seeding is raising the `free` default in `netlify/functions/_shared/aiQuota.js` before the release. That is one line and needs no SQL, but it applies to every future signup too, so it is a pricing decision rather than a migration safeguard.

#### Rollback procedure

There is no automatic rollback. If a migration breaks production:

1. **Revert the code** first — push a revert PR so the new app no longer expects the new schema.
2. **Write a hand-rolled rollback SQL** (e.g. `migrations/00X_rollback_<thing>.sql`) that undoes the failed change. Examples: `DROP POLICY`, `DROP COLUMN`, restore the previous function body.
3. Run the rollback SQL via Supabase Dashboard → SQL Editor.
4. Verify the schema matches the prior known-good state and the app is healthy.
5. Restore from a Supabase backup only as a last resort — it loses all data written since the snapshot.

Always test migrations on the demo/test environment before applying them to production.

### Env-var changes

After updating env vars in Netlify, you must **redeploy** for them to take effect:
**Deploys → Trigger deploy → Clear cache and deploy site**.

---

## Local development

```bash
cp .env.example .env
# fill in: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_APP_URL=http://localhost:8888,
#         SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, INTERNAL_JOB_SECRET,
#         plus Google Drive, admin, and email variables for the features under test
npm install
npm run dev:netlify     # runs Vite + Netlify Functions on port 8888
```

`npm run dev` (Vite alone) **won't** expose `/.netlify/functions/*` — always use `dev:netlify` when developing API-touching code.

> ℹ️ The `[dev]` block in `netlify.toml` declares `command = "npm run dev"` because Netlify CLI runs Vite as a child process and proxies it on port 8888. The script you invoke from your shell is still `npm run dev:netlify` (which is `netlify dev` under the hood). Don't run `npm run dev` directly when developing functions.

To test the invite flow locally, the Supabase project's **Site URL / Redirect URLs** must include `http://localhost:8888`. To test Google Drive, add `http://localhost:8888/.netlify/functions/google-callback` to the OAuth client. Local admin `dev_link` responses additionally require `ALLOW_DEV_ADMIN_MAGIC_LINKS=true`, Netlify Dev, and a loopback request host; never enable this variable in hosted contexts.

---

## Common issues

### `403 Forbidden` on a Supabase REST call
RLS policy is blocking the request. Check:
- The right policies exist: `SELECT policyname FROM pg_policies WHERE tablename = '<table>';`
- Helper functions are present: `\df is_org_member`
- For invitee read: policy uses `auth.jwt() ->> 'email'`, **not** `(SELECT email FROM auth.users …)` — the `authenticated` role has no SELECT on `auth.users`.

### Invite emails not arriving
1. Check Supabase **Auth → Logs** for delivery errors.
2. Confirm SMTP is configured (otherwise built-in sender rate-limits aggressively).
3. For existing users, the function falls back to `signInWithOtp`. Make sure your `VITE_APP_URL` is in the Redirect URLs allow-list.
4. As a last resort, the admin Team panel shows a copy-able fallback link when delivery fails — share it manually.

### "One more step to get started" appears for invited users
Auto-join failed. Cause is almost always:
- The `invitee_read_own_invite` RLS policy is missing on this Supabase project, **or**
- The policy uses the broken `auth.users` subquery form. Replace it with:
  ```sql
  DROP POLICY "invitee_read_own_invite" ON organization_invites;
  CREATE POLICY "invitee_read_own_invite" ON organization_invites
    FOR SELECT USING (
      lower(email) = lower(auth.jwt() ->> 'email')
    );
  ```

### AI request times out
Synchronous AI requests are fenced at 50 seconds so the function retains time for usage/error logging within the configured 60-second synchronous limit. If a call exceeds the fence:
- Reduce prompt size or choose `gemini-2.5-flash-lite`.
- Use the authenticated background-job path for supported long-running operations.
- Confirm `INTERNAL_JOB_SECRET` has the same value in the calling and worker function context.

### Build fails with "Configuration property functions.timeout must be an object"
The `[functions] timeout = N` syntax is invalid in `netlify.toml`. Remove it — function timeouts can only be configured by upgrading the Netlify plan.

### Supabase email quota suddenly exhausted / abuse on `request_resend`
The public resend flow is protected by migration `024`: a HMAC-derived client identifier is limited to 10 requests per 60 seconds and an invitation can send at most once every five minutes. The response is always generic.

If email volume is still abnormal:
1. Confirm migration `024_rate_limit_invite_resends.sql` is applied and `claim_pending_invite_resend` exists.
2. Confirm `invite_resend_rate_limits` is inaccessible to `anon` and `authenticated`.
3. Review Netlify invocation logs and provider delivery logs without recording raw invite tokens.
4. Add an upstream Netlify/edge limit as additional defense if the deployment is under sustained abuse.

### Google Drive says connected but files are unavailable
1. Confirm the Google Drive API is enabled and the OAuth consent user is permitted.
2. Confirm the exact environment callback URI is registered in Google Cloud.
3. Confirm `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` have values in the current Netlify deploy context, then redeploy.
4. Reconnect as Owner/Admin if the refresh token was revoked.
5. Do not add any endpoint that returns `access_token` or `refresh_token` to the browser.

---

## Production hardening checklist

Before opening to real customers, work through this list. See [`TECH_STACK.md`](./TECH_STACK.md#known-gaps--hardening-backlog) for the threat-model rationale behind the security items.

### Infrastructure
- [ ] SMTP configured in Supabase for branded, reliable email delivery
- [ ] Custom domain with HTTPS (Netlify auto-provisions Let's Encrypt)
- [ ] Supabase project on a paid tier (free tier pauses after inactivity)
- [ ] Database backups enabled and **restore tested** at least once
- [ ] Error monitoring (Sentry / similar) wired up
- [ ] Analytics (PostHog / Plausible / GA) added
- [ ] Privacy policy + Terms of Service linked from the app

### Security (functions)
- [ ] `INTERNAL_JOB_SECRET` is random, at least 32 characters, and configured in every AI-enabled deploy context
- [ ] Direct unauthenticated requests to every background AI function return 401
- [ ] Production admin magic-link requests never return `dev_link`; Resend failure returns a closed error
- [ ] BYOK and Google Drive responses contain no raw API keys, access tokens, or refresh tokens
- [ ] Owner/Admin and Manager/Consultant behavior is tested against the same organization and a different organization
- [ ] Invite resend always returns a generic response and migration `024` limits requests/delivery
- [ ] Ally rejects missing JWTs and non-members before AI, database, Blob, or email side effects
- [ ] Function logs contain no prompts, raw AI responses, report snippets, OAuth tokens, API keys, or service-role keys
- [ ] **Remaining hardening:** add a shared origin/CORS policy without treating CORS as authorization
- [ ] **Remaining hardening:** validate the selected AI model against `MODEL_REGISTRY` at the function boundary
- [ ] **Remaining hardening:** define consistent prompt trust boundaries and structured output validation for every AI action

### Security (frontend / Supabase)
- [ ] Migrations `020` through `025` are applied and verified in every existing Supabase environment
- [ ] Browser roles cannot select `organization_ai_secrets`, `organization_integrations`, or `organization_oauth_states`
- [ ] `error_log` rejects anonymous inserts, forged user IDs, and non-member organization IDs
- [ ] Spreadsheet imports reject oversized, malformed, disguised, and over-limit files before writes
- [ ] Evidence URLs reject unsafe schemes, credentials, local/private hosts, and provider lookalikes
- [ ] Tailwind moved from runtime CDN to the build pipeline (remaining hardening)
- [ ] CSP header configured via Netlify `_headers` file
- [ ] Supabase Auth password policy reviewed (min length, MFA where applicable)
- [ ] Session token lifetime tuned to your risk tolerance (Supabase Auth → Settings)
- [ ] Key rotation runbook covers `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_JOB_SECRET`, Google OAuth, Resend, platform-admin signing, and organization BYOK credentials

### Dependencies
- [ ] `npm audit --omit=dev` reports zero production vulnerabilities
- [ ] Dependabot alerts are reviewed and linked to an issue or remediation PR
- [ ] Deferred Netlify development-tooling alert is still isolated as asserted by `tests/security/netlify-tooling-dependencies.test.mjs`
- [ ] Issue [#152](https://github.com/narapat/Aeternum-Ally/issues/152) is rechecked after Netlify CLI / `@netlify/functions-dev` releases
