<!-- Version: 1.1.0 — Last updated: 2026-05-09 -->

# Tech Stack & Deployment

## Architecture overview

```
┌─────────────────┐      ┌────────────────────┐      ┌──────────────────┐
│   React SPA     │─────▶│  Netlify Functions │─────▶│  Supabase        │
│  (Vite, TS)     │◀─────│   (Node, TS)       │◀─────│  (Postgres+Auth) │
└─────────────────┘      └────────────────────┘      └──────────────────┘
        │                          │                          ▲
        │                          ▼                          │
        │                  ┌──────────────┐                   │
        └─────────────────▶│  Gemini API  │                   │
            (server only)  └──────────────┘                   │
                                                              │
        ┌─────────────────────────────────────────────────────┘
        │  RLS-protected direct access for read/write of
        │  org-scoped tables using anon key + JWT
        └─
```

The browser talks to Supabase for most reads/writes (RLS enforces tenant isolation). All database access from the frontend goes through `services/dbService.ts` — components and hooks never call the Supabase client directly. Netlify Functions are used only for operations that require the **service role** (bypassing RLS): invitations, accepting invites, and proxying Gemini calls so the API key never reaches the client.

---

## Frontend

| Layer | Choice | Notes |
|---|---|---|
| Framework | **React 19** | Function components + hooks |
| Build | **Vite 6** | Fast dev server, ES module output |
| Language | **TypeScript 5.8** | Strict mode |
| Styling | **Tailwind CSS** | Loaded via CDN in `index.html` (note: production-grade install pending — currently shows a console warning) |
| Icons | **lucide-react** | |
| Charts | **recharts** | KPI dashboards & materiality matrix |
| File I/O | **xlsx** | Excel export/import for Task Management |
| AI client | **@google/genai** | Used only inside Netlify Functions, not in the browser bundle |
| Auth/data | **@supabase/supabase-js** | Anon key in browser; RLS enforces access |

### Key directories

```
components/    React UI components (one per feature screen)
hooks/         Auth + per-org data hooks
               - useAuth          — Supabase session + sign-in/out
               - useOrganization  — current-org context, role, switch
               - useOrgData       — loads & mutates all org-scoped singleton tables
lib/           Supabase client singleton (imported only by dbService and auth hooks)
services/      dbService        — single source of all DB access: CRUD wrappers,
                                  data mappers (fromDb/toDb), org/member/AI helpers.
                                  No component or hook calls supabase.from() directly.
               geminiService    — AI call helpers (proxied via Netlify Functions)
               errorLogService  — silent client-side error logging to error_log table
```

---

## Backend (Netlify Functions)

Three serverless functions, all TypeScript, deployed to Netlify Functions runtime:

| Function | Purpose | Auth |
|---|---|---|
| `api.ts` | Proxies Gemini calls (Sustainability Statement, IRO suggestions, etc.). Logs token usage to `ai_usage_log`. | Bearer JWT (org member) |
| `invite.ts` | Create / list / resend / cancel invitations. Sends emails via Supabase Auth. | Bearer JWT (Owner/Admin) — except `request_resend` (unauthenticated, for expired-link self-service) |
| `accept-invite.ts` | Validate an invite token, add the user to `organization_members`, return company name. | Bearer JWT |

All three use the **Supabase service-role key** (server-side only) to perform privileged operations.

> ℹ️ The `request_resend` action on `invite.ts` is intentionally unauthenticated so a user with an expired link can request a fresh one from the sign-in page. It always returns a generic 200 to avoid email enumeration. Because it is public, it is a candidate for abuse — see the [Security model summary](#security-model-summary) for current limitations.

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

assessments                ─┐  Many per org
kpis                       ─┤  (org-scoped via FK + RLS)
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

`supabase/schema.sql` is the canonical full-schema snapshot used for **fresh installs**. Incremental migrations live in `supabase/migrations/` and apply changes that landed after the snapshot was last regenerated:

- `001_create_organization_with_owner.sql` — atomic org-creation RPC
- `002_ai_settings_and_usage.sql` — per-org AI model + usage log
- `003_ai_usage_log_http_status.sql` — adds `http_status` column to `ai_usage_log`
- `004_error_log.sql` — creates `error_log` table with RLS (server + client error tracking)
- `005_company_profile_address_contact.sql` — structured address + contact fields on `company_profiles`

**When to run what:**

| Scenario | Run |
|---|---|
| New Supabase project (fresh install) | `schema.sql`, then every file in `migrations/` in numeric order |
| Existing project, pulling latest code | Only the *new* migrations added since the last deploy |

Run via Supabase Dashboard → SQL Editor for each environment.

---

## External services

| Service | Used for | Where |
|---|---|---|
| **Supabase** | Auth (email magic-link), Postgres, RLS, transactional emails (invite/magic-link templates) | All envs |
| **Google Gemini API** | AI generation: IROs, KPIs, sustainability statement, BMC drafts | `api.ts` only |
| **Netlify** | Static hosting (frontend), serverless functions (backend), env-var management | All envs |

---

## Environment variables

Five env vars total — three public (Vite-prefixed, exposed to the browser) and two server-only:

| Variable | Scope |
|---|---|
| `VITE_SUPABASE_URL` | Public |
| `VITE_SUPABASE_ANON_KEY` | Public |
| `VITE_APP_URL` | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only |
| `GEMINI_API_KEY` | Server-only |

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
| API keys | Gemini & service-role keys live only in Netlify env vars, never sent to browser |
| Cross-tenant data leaks | Every table has SELECT policy gated by `is_org_member()` |
| Privilege escalation | INSERT/UPDATE/DELETE policies check `user_org_role()` |
| Invite token reuse | Invites burned (deleted) on acceptance |
| Expired links | Self-service resend on the sign-in page |
| Email enumeration on resend | `request_resend` always returns a generic 200 regardless of whether an invite exists |
| Secrets in git | `.env` gitignored; `.env.example` committed as template |

### Known gaps / hardening backlog

These are tracked, not yet implemented, and listed here so reviewers and operators are aware:

| Gap | Risk | Planned mitigation |
|---|---|---|
| **No CORS headers** on Netlify Functions (no `Access-Control-Allow-*`, no `OPTIONS` handler) | Cross-origin SPA deployments may break; no origin allowlist | Add a shared CORS wrapper that allowlists `VITE_APP_URL` |
| **No rate limit on `request_resend`** | An attacker can drain the Supabase email quota by spamming the endpoint | Netlify edge rule or token-bucket keyed on IP + email |
| **No server-side AI model allowlist** | An Owner/Admin can write any string to `organization_ai_settings.model`; `api.ts` forwards it to Gemini without checking against the `PRICING` table | Validate `model` against the allowlist before calling Gemini |
| **No prompt-injection sanitisation** | User-supplied fields (company description, topic names) are concatenated into Gemini prompts. A malicious member could inject instructions that manipulate AI output for the whole org. | Wrap user input in delimited, role-tagged sections; reject control sequences |
| **Tailwind via CDN** in `index.html` | Runtime third-party dependency; no SRI hash | Move to PostCSS install (build-time) |
| **No HTTP-method guard on `invite.ts`** | Non-POST requests fall through to body parsing | Add explicit `httpMethod` check (matches `accept-invite.ts`) |
