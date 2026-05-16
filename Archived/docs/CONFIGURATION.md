<!-- Version: 1.0.0 — Last updated: 2026-05-01 -->

# Configuration Reference

All configuration points in AeternumAlly — environment variables, hardcoded constants, and database-level settings. Use this as the single reference when tuning a self-hosted deployment.

---

## 1. Environment variables

Set these in **Netlify Dashboard → Site settings → Environment variables**. For local development, copy `.env.example` to `.env` and fill in each value.

| Variable | Scope | Required | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Public (browser + functions) | Yes | Your Supabase project URL (e.g. `https://xxxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Public (browser) | Yes | Supabase anon/public key. Safe to expose — RLS protects the data. |
| `VITE_APP_URL` | Public (browser + functions) | Yes | Base URL of your deployment, no trailing slash (e.g. `https://app.yourcompany.com`). Used as the redirect target in magic-link and invite emails. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only (functions) | Yes | Supabase service-role key. Bypasses RLS. **Never prefix with `VITE_`**. |
| `GEMINI_API_KEY` | Server-only (functions) | Yes | Google Gemini API key from Google AI Studio. **Never prefix with `VITE_`**. |

> `VITE_APP_URL` must also be added to Supabase Auth → URL Configuration → Redirect URLs. Without this, magic-link and invite redirects will be blocked.

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
| `PRICING` map | See source | Approximate USD/1M-token rates used to estimate costs in `ai_usage_log`. Update if Google changes pricing. |

### `supabase/schema.sql`

| Setting | Current value | Effect |
|---|---|---|
| Invite expiry | `now() + interval '7 days'` | How long an invitation link remains valid. Change the interval in the `organization_invites` table DEFAULT clause and redeploy the schema. |

---

## 3. Per-organization AI settings

Each organization can override the default Gemini model. This is stored in the `organization_ai_settings` table (one row per org) and managed from the AI Usage Panel in the app.

| Column | Type | Default | Description |
|---|---|---|---|
| `model` | `text` | `"gemini-2.5-flash"` | Gemini model to use for this org's AI calls |
| `monthly_budget_usd` | `numeric` | `null` | Optional soft budget cap (informational only — not enforced server-side in current build) |

> **Security note:** The server currently does not validate the `model` value against an allowlist before forwarding it to Gemini. An Owner/Admin can set any string. This is a known gap — see [docs/TECH_STACK.md](./TECH_STACK.md#known-gaps--hardening-backlog).

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

## 5. Netlify build settings

Defined in `netlify.toml`. These rarely need changing.

| Setting | Value | Notes |
|---|---|---|
| Build command | `npm run build` | Runs Vite production build |
| Publish directory | `dist` | Vite output directory |
| Functions directory | `netlify/functions` | All `.ts` files here are deployed as serverless functions |
| Dev port | `8888` | Port exposed by `netlify dev` (and `npm run dev:netlify`) |
| Dev target port | `3000` | Vite's internal port; Netlify CLI proxies this to 8888 |

---

## 6. Gemini models reference

Available models at time of writing. Check [Google AI pricing](https://ai.google.dev/pricing) for the latest.

| Model ID | Quality | Speed | Cost (USD / 1M tokens input / output) |
|---|---|---|---|
| `gemini-2.5-flash-lite` | Good | Fastest | $0.10 / $0.40 |
| `gemini-2.5-flash` | Better | Fast | $0.30 / $2.50 |
| `gemini-2.5-pro` | Best | Slower | $1.25 / $10.00 |

The default model (`gemini-2.5-flash`) balances quality and cost well for SME-scale usage.

---

## 7. Changing a configuration value

### To change a constant in `constants.ts` or `api.ts`
1. Edit the value in source
2. Run `npm run build` and verify
3. Push to `main` — Netlify auto-deploys

### To change the invite expiry
1. Edit the DEFAULT expression in `supabase/schema.sql` and write a migration:
   ```sql
   ALTER TABLE organization_invites
     ALTER COLUMN expires_at SET DEFAULT (now() + interval '14 days');
   ```
2. Apply the migration to each environment via Supabase Dashboard → SQL Editor

### To change environment variables
1. Update the value in Netlify Dashboard → Site settings → Environment variables
2. Trigger a redeploy: **Deploys → Trigger deploy → Clear cache and deploy site**
