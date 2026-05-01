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

The browser talks to Supabase directly for most reads/writes (RLS enforces tenant isolation). Netlify Functions are used only for operations that require the **service role** (bypassing RLS): invitations, accepting invites, and proxying Gemini calls so the API key never reaches the client.

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
| AI client | **@google/genai** | Used only inside Netlify Functions, not in the browser bundle |
| Auth/data | **@supabase/supabase-js** | Anon key in browser; RLS enforces access |

### Key directories

```
components/    React UI components (one per feature screen)
hooks/         Auth + per-org data hooks (useAuth, useOrganization, useOrgData)
lib/           Supabase client singleton
services/      dbService (CRUD wrappers), geminiService (AI call helpers)
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
ai_usage_log               ─┘

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

Source of truth is `supabase/schema.sql`. Incremental migrations live in `supabase/migrations/`:

- `001_create_organization_with_owner.sql` — atomic org-creation RPC
- `002_ai_settings_and_usage.sql` — per-org AI model + usage log

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
| Secrets in git | `.env` gitignored; `.env.example` committed as template |
