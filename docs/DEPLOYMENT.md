# Deployment Guide

Step-by-step guide for deploying Aeternum Ally. See [`TECH_STACK.md`](./TECH_STACK.md) for architecture context.

---

## Hosting overview

| Layer | Provider | What's there |
|---|---|---|
| Frontend (SPA) | **Netlify** | Static build output (`dist/`) on Netlify CDN |
| Backend (API) | **Netlify Functions** | `netlify/functions/*.ts` deployed as serverless functions |
| Database + Auth | **Supabase** | Postgres, Row-Level Security, Auth (magic link / invite emails) |
| AI | **Google Gemini API** | Called server-side only, key never exposed to browser |

**One Netlify site + one Supabase project per environment.** Production and test/demo are completely separate stacks (different URLs, different DBs, different env vars).

---

## Environments

| Env | Frontend URL | Branch | Netlify site | Supabase project |
|---|---|---|---|---|
| Production | _(your prod domain)_ | `main` | Production site | Production project |
| Demo / Test | `demo.aeternumally.com` | `main` (separate site) | Demo site | Test project (`tlyuhlyrkztypqdgixze`) |

Branch / preview deploys inherit env vars from their parent site.

---

## Environment variables

Set these in **Netlify Dashboard → Site settings → Environment variables** for each site.

| Variable | Public? | Where used | Example |
|---|---|---|---|
| `VITE_SUPABASE_URL` | ✅ public (in browser bundle) | Frontend + Functions | `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | ✅ public | Frontend | `eyJhbGc...` (RLS-protected) |
| `VITE_APP_URL` | ✅ public | Frontend + Functions | `https://demo.aeternumally.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔒 **server-only** | Functions only | `eyJhbGc...` (bypasses RLS) |
| `GEMINI_API_KEY` | 🔒 **server-only** | Functions only | `AIza...` |

> ⚠️ **Never** prefix server-only secrets with `VITE_` — Vite would inline them into the browser bundle.

> ⚠️ `VITE_APP_URL` should be the **base URL only**, no trailing slash, no query params. Used as the redirect target for invite emails.

---

## First-time setup

### 1. Supabase project

1. Create project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run `supabase/schema.sql` in full.
3. Run every file in `supabase/migrations/` in order:
   - `001_create_organization_with_owner.sql`
   - `002_ai_settings_and_usage.sql`
4. **Auth → URL Configuration:**
   - Site URL → `https://your-app-url`
   - Redirect URLs → add `https://your-app-url` (base only is enough; auto-join is email-based)
5. **Auth → Email Templates** *(optional but recommended):*
   - Customise the **Invite** and **Magic Link** templates. Use `{{ .Data.company_name }}` and `{{ .Data.app_name }}` to reference custom data passed from `invite.ts`.
6. **Auth → SMTP Settings** *(optional but recommended for production):*
   - Configure a real SMTP provider (Resend / SendGrid / Mailgun).
   - Without this, Supabase's built-in sender is heavily rate-limited and may silently drop emails.
7. Copy these from **Project Settings → API**:
   - Project URL → `VITE_SUPABASE_URL`
   - `anon` public key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Google Gemini API key

1. Get a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Save it for `GEMINI_API_KEY` in Netlify.

### 3. Netlify site

1. **Add new site → Import from Git → select repo**.
2. Build settings (auto-detected from `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
3. **Site settings → Environment variables**: add all 5 vars from the table above.
4. **Site settings → Domain management**: add your custom domain (e.g. `demo.aeternumally.com`) and follow DNS instructions.
5. Trigger a deploy (or push to `main`).

### 4. Smoke test

After the first deploy:

- [ ] Visit the URL → see sign-in screen
- [ ] Sign up with a fresh email → magic-link email arrives
- [ ] Click link → land on "Set up your company" screen
- [ ] Create a workspace → land in dashboard
- [ ] Invite a teammate (different email) → email arrives
- [ ] Click invite link → auto-joins to org without pasting token
- [ ] Open Company Profile → Team tab → see member list and pending invites

If any step fails, check **Netlify → Functions → logs** and the browser console.

---

## Ongoing deploys

### Code changes

```
Push to GitHub  ──▶  Netlify auto-build  ──▶  Live in ~2 min
```

- `main` → production site
- Other branches → preview URLs (each PR gets one)
- Failed builds: check **Netlify → Deploys → [build] → Deploy log**

### Schema changes

Database migrations are **manual** — Netlify does not run SQL.

For each PR that touches `supabase/schema.sql` or adds a `supabase/migrations/*.sql` file:

1. Open the PR description / commit message — it should call out the new SQL.
2. Open **Supabase Dashboard → SQL Editor** for the target environment.
3. Paste and run the new SQL.
4. Verify (e.g. `SELECT policyname FROM pg_policies WHERE tablename = '...'`).
5. Repeat for **every** environment (production + test).

> ⚠️ Run schema migrations **before** merging the code PR if the new code depends on the schema change. Otherwise the deploy will fail at runtime.

### Env-var changes

After updating env vars in Netlify, you must **redeploy** for them to take effect:
**Deploys → Trigger deploy → Clear cache and deploy site**.

---

## Local development

```bash
cp .env.example .env
# fill in: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_APP_URL=http://localhost:8888,
#         SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
npm install
npm run dev:netlify     # runs Vite + Netlify Functions on port 8888
```

`npm run dev` (Vite alone) **won't** expose `/.netlify/functions/*` — always use `dev:netlify` when developing API-touching code.

To test the invite flow locally, the Supabase project's **Site URL / Redirect URLs** must include `http://localhost:8888`.

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

### Function timeout (30s) on AI generation
Netlify Functions have a hard 30s timeout. If a Gemini call exceeds it:
- Parallelise calls with `Promise.all` instead of running them serially (already done for Sustainability Statement).
- Reduce prompt size or pick a faster model (`gemini-2.5-flash-lite`).

### Build fails with "Configuration property functions.timeout must be an object"
The `[functions] timeout = N` syntax is invalid in `netlify.toml`. Remove it — function timeouts can only be configured by upgrading the Netlify plan.

---

## Production hardening checklist

Before opening to real customers:

- [ ] SMTP configured in Supabase for branded, reliable email delivery
- [ ] Tailwind installed as a PostCSS plugin (currently CDN — see browser console warning)
- [ ] Custom domain with HTTPS (Netlify auto-provisions Let's Encrypt)
- [ ] Supabase project on a paid tier (free tier pauses after inactivity)
- [ ] Database backups enabled in Supabase
- [ ] Open Dependabot alerts triaged (currently 3 moderate, all in dev/transitive deps)
- [ ] Error monitoring (Sentry / similar) wired up
- [ ] Analytics (PostHog / Plausible / GA) added
- [ ] Privacy policy + Terms of Service linked from the app
