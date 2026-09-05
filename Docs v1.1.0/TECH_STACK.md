<!-- Version: 1.1.0 - Last updated: 2026-09-05 -->

# Tech Stack & Deployment

## Architecture overview

```
┌─────────────────┐      ┌────────────────────┐      ┌──────────────────┐
│   React SPA     │─────▶│  Netlify Functions │─────▶│  Supabase        │
│  (Vite, TS)     │◀─────│   (Node, TS)       │◀─────│  (Postgres+Auth) │
└────────┬────────┘      └─────────┬──────────┘      └─────────▲────────┘
         │                         │                           │
         │                         ├────▶ Gemini API           │
         │                         └────▶ Google Drive API     │
         │                                                     │
         └─────────────────────────────────────────────────────┘
             RLS-protected direct access using anon key + JWT
```

The browser talks to Supabase for RLS-protected application data and uses Netlify Functions for privileged or server-secret operations. Frontend data access is centralized primarily in service modules and authentication/organization hooks. A function that uses the service-role key must authenticate the caller and enforce organization membership or role itself because the key bypasses RLS.

---

## Frontend

| Layer | Choice | Notes |
|---|---|---|
| Framework | **React 19** | Function components + hooks |
| Build | **Vite 6** | Fast dev server, ES module output |
| Language | **TypeScript 5.8** | Strict mode |
| Styling | **Tailwind CSS 3.4** | Compiled at build time via PostCSS; theme in `tailwind.config.js`, layers in `index.css`. The app shell loads no third-party script. |
| Icons | **lucide-react** | |
| Charts | **recharts** | KPI dashboards & materiality matrix |
| File I/O | **read-excel-file**, **write-excel-file**, **papaparse** | Bounded XLSX/CSV import and export; XLSX import runs in a Web Worker |
| AI client | **@google/genai** | Used only inside Netlify Functions, not in the browser bundle |
| Auth/data | **@supabase/supabase-js** | Anon key in browser; RLS enforces access |

### Key directories

```
components/    React UI components (one per feature screen)
hooks/         Auth + per-org data hooks
               - useAuth          — Supabase session + sign-in/out
               - useOrganization  — current membership, organization, role, and members
               - useOrgData       — loads & mutates all org-scoped singleton tables
lib/           Supabase client singleton
services/      dbService        — single source of all DB access: CRUD wrappers,
                                  data mappers (fromDb/toDb), org/member/AI helpers
               geminiService    — AI call helpers (proxied via Netlify Functions)
               errorLogService  — silent client-side error logging to error_log table
               evidenceService  — evidence attachment and validated external-link operations
```

---

## Backend (Netlify Functions)

Thirteen TypeScript serverless functions are deployed from `netlify/functions/`. Authorization is route-specific:

| Function group | Purpose | Required trust boundary |
|---|---|---|
| `api.ts` | Gemini proxy and AI usage logging | Bearer JWT plus organization membership |
| `report-background.ts`, `dma-background.ts`, `assessment-background.ts` | Privileged asynchronous AI jobs | `INTERNAL_JOB_SECRET`; requests are dispatched only by the authenticated API path |
| `ally-support.ts` | Tenant-aware Ally support and optional escalation | Bearer JWT plus organization membership; bounded payload |
| `byok-settings.ts` | Read safe AI settings and manage organization credentials | Bearer JWT plus membership; Owner/Admin for changes |
| `google-drive.ts` | OAuth connection status and server-side Drive file operations | Bearer JWT plus membership; Owner/Admin connect or disconnect |
| `google-callback.ts` | Complete Google OAuth and store organization tokens | Opaque, expiring, one-way-hashed OAuth state tied to user and organization |
| `evidence.ts` | Evidence attachment operations | Bearer JWT plus tenant and role checks |
| `invite.ts` | Create, list, resend, and cancel invitations | Owner/Admin except public `request_resend`, which is generic and rate-limited |
| `accept-invite.ts` | Validate an invite and add the matching authenticated user | Bearer JWT for the invitee; email and token validation |
| `admin-magic-link.ts` | Deliver platform-admin magic links | Same-origin JSON POST, generic unknown-user response, Netlify rate limit; production email fails closed |
| `admin.ts` | Platform administration API | Platform-admin JWT |

Functions that need privileged database access use the server-only Supabase service-role key. Possession of that key is not treated as caller authorization; each public route authenticates and authorizes before privileged reads or writes.

The `request_resend` action remains intentionally unauthenticated for expired-link recovery. It always returns the same 200 response, limits a HMAC-derived client identifier to 10 requests per 60 seconds, and permits at most one email per invitation every five minutes.

---

## Database (Supabase / Postgres)

Single Postgres database, multi-tenant via `organization_id` foreign keys and RLS policies.

### Core tables

```
organizations              ─┐
organization_members       ─┤  Tenant root
organization_invites       ─┘

company_profiles           ─┐
business_model_canvases    ─┤  One row per org
swot_analyses              ─┤
organization_ai_settings   ─┘

organization_ai_secrets    ─┐  Service-role-only credentials/state
organization_integrations  ─┤  (RLS enabled, no policies; no browser grants)
organization_oauth_states  ─┤
ai_quota_grants            ─┘

assessments                ─┐  Many per org
kpis                       ─┤  (org-scoped via FK + RLS)
tasks                      ─┤
evidence_attachments       ─┤
sustainability_reports     ─┤
dma_analysis_jobs          ─┤
assessment_ai_jobs         ─┤
ai_usage_log               ─┤
error_log                  ─┘

user_preferences           ─┐  Per user (not org-scoped)
auth.users (Supabase)      ─┘
```

### Row-Level Security

Two helper functions (`SECURITY DEFINER`) avoid recursive RLS:

- `is_org_member(org_id)` — `EXISTS` check on `organization_members`
- `user_org_role(org_id)` — returns the caller's role in the org

Standard policy pattern:
- **SELECT**: `is_org_member(organization_id)`
- **INSERT/UPDATE/DELETE**: `user_org_role(organization_id) IN ('Owner', 'Admin', 'Manager')`
- **Owner-only**: role check restricted to `'Owner'`
- **Invitee read-own-invite**: `lower(email) = lower(auth.jwt() ->> 'email')` — needed so a newly invited user (not yet a member) can see their pending invite for auto-join

### Migrations

`supabase/schema.sql` is the canonical full-schema snapshot used for **fresh installs** and already includes the current migrated state. Incremental migrations in `supabase/migrations/` upgrade existing projects. Do not replay the full migration history after loading the current snapshot. For an existing project, run only unapplied files in filename order; both `008_*` files are distinct and required when upgrading through that point.

Security-relevant migrations:

- `014_platform_admins.sql` - platform-admin identities and access state
- `017_sustainability_reports.sql`, `018_dma_analysis_jobs.sql`, `019_assessment_ai_jobs.sql` - tenant-owned report and background-job data
- `020_expand_organization_ai_secrets.sql` - move BYOK credentials to a service-role-only table
- `021_contract_legacy_byok_key.sql` - remove the browser-readable legacy BYOK column
- `022_google_drive_token_isolation.sql` - revoke browser access to OAuth token storage and add OAuth state storage
- `023_validate_evidence_external_urls.sql` - database defense for external evidence URLs
- `024_rate_limit_invite_resends.sql` - atomic invite-resend rate limit and delivery cooldown
- `025_secure_error_log_inserts.sql` - bind client logs to the authenticated user and tenant
- `026_ai_quota_enforcement.sql` - complete the `quota_type` constraint for the starter tier
- `027_ai_quota_grants.sql` - service-role-only expiring quota grants; one automatic burst per org per month enforced by a partial unique index

**When to run what:**

| Scenario | Run |
|---|---|
| New Supabase project (fresh install) | Current `schema.sql` only |
| Existing project, pulling latest code | Only the *new* migrations added since the last deploy |

Run via Supabase Dashboard → SQL Editor for each environment.

---

## External services

| Service | Used for | Where |
|---|---|---|
| **Supabase** | Auth (email magic-link), Postgres, RLS, transactional emails (invite/magic-link templates) | All envs |
| **Google Gemini API** | AI generation: IROs, KPIs, sustainability statements, assessments, DMA, and Ally support | Authenticated AI functions and internal workers |
| **Google Drive API** | Organization-owned evidence file selection | `google-drive.ts` and `google-callback.ts`; OAuth tokens stay server-side |
| **Resend** | Platform-admin magic links and support/invite email delivery paths | Server-side functions only |
| **Netlify** | Static hosting (frontend), serverless functions (backend), env-var management | All envs |

---

## Environment variables

Only variables prefixed with `VITE_` are intended for the browser bundle. All others are server-only:

| Variable group | Scope | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL` | Public | Supabase client and application base URL |
| `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` | Server-only | Privileged database and platform AI access |
| `INTERNAL_JOB_SECRET` | Server-only | Authenticates API-to-background-function dispatch |
| `INTERNAL_FUNCTION_BASE_URL` | Server-only, optional | Trusted base URL for non-Netlify/self-hosted internal dispatch |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Server-only | Google Drive OAuth |
| `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, `PLATFORM_ADMIN_JWT_SECRET` | Server-only | Platform-admin bootstrap and token signing |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Server-only | Transactional email delivery |
| `ALLOW_DEV_ADMIN_MAGIC_LINKS` | Server-only, local only | Explicitly permits local loopback development links |

`.env.example` is committed; `.env` is gitignored. See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for full setup.

---

## Deployment

Hosted on **Netlify** (frontend + functions) and **Supabase** (database + auth). One Netlify site + one Supabase project per environment (production / demo).

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for:
- First-time setup (Supabase + Netlify + env vars)
- Deploy flow (Git → Netlify auto-build)
- Schema migration process (manual, per environment)
- Local development setup
- Troubleshooting common issues

---

## Security model summary

| Concern | Mitigation |
|---|---|
| Tenant isolation | Postgres RLS keyed on `organization_id` via membership helpers |
| Platform secrets | Gemini and service-role keys live only in server environment variables |
| Customer secrets | BYOK keys and OAuth tokens live in service-role-only tables and are never returned to the browser |
| Cross-tenant data leaks | Member-readable organization tables gate SELECT with `is_org_member()`; credential tables are service-role-only |
| Privilege escalation | INSERT/UPDATE/DELETE policies check `user_org_role()` |
| Privileged background jobs | Shared internal secret is checked before body parsing |
| Invite token reuse | Invites burned (deleted) on acceptance |
| Expired links | Self-service resend on the sign-in page |
| Email enumeration on resend | `request_resend` always returns a generic 200 regardless of whether an invite exists |
| Resend abuse | Atomic per-client rate limit and per-invitation email cooldown |
| Uploaded spreadsheets | Content/type checks, size and structure limits, worker isolation, parser timeout |
| Operational logs | Client identity/tenant RLS binding and no raw AI output logging |
| Secrets in git | `.env` gitignored; `.env.example` committed as template |

### Known gaps / hardening backlog

These items remain after the August 2026 remediation cycle:

| Gap | Risk | Planned mitigation |
|---|---|---|
| **Unpatched `extract-zip` in Netlify development tooling** ([#152](https://github.com/narapat/Aeternum-Ally/issues/152)) | A malicious ZIP-based local function artifact could exploit symlink traversal. The remaining path is development-only and is not imported by application code. | Upgrade when Netlify ships a patched dependency; keep untrusted ZIP artifacts out of local tooling and retain the dependency regression test. |
| **Prompt-injection controls are not systematic across every AI action** | A malicious tenant member may influence shared AI suggestions or report integrity through fields interpolated into prompts. | Define prompt trust boundaries, delimit untrusted fields, require structured output validation, and preserve human approval before writes. |
| **No Content-Security-Policy** | Without a policy there is no browser-side backstop against injected script. The prerequisite is done — the app shell now loads no remote script, and the only remote origins are the two Google Fonts hosts — so a restrictive policy is finally writable. | Add CSP response headers in `netlify.toml`, allowing `fonts.googleapis.com` and `fonts.gstatic.com` for styles and fonts only. |
| **No centralized origin/CORS wrapper** | Function behavior can drift and cross-origin self-hosted deployments can fail inconsistently. CORS is not an authorization mechanism. | Add one shared origin policy while retaining per-route authentication, role, and tenant checks. |
| **AI model allowlist is not repeated in the function** | The database `CHECK` currently enforces the allowed model IDs, but the function lacks an independent fail-closed check. | Validate the selected model against `MODEL_REGISTRY` before provider calls. |
