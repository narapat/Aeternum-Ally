<!-- Version: 1.1.0 — Last updated: 2026-05-09 -->

# Architecture Overview

## 1. System Context

AeternumAlly is a multi-tenant SaaS web application that helps SMEs produce ESRS/CSRD-compliant sustainability reports and track actionable sustainability metrics. The system sits at the intersection of three external services: a relational database with built-in auth (Supabase), a generative AI API (Google Gemini), and a static hosting + serverless runtime (Netlify).

```
┌────────────────────────────────────────────────────────────────────┐
│                          Browser (User)                            │
│                    React 19 SPA — Vite / TS                        │
└────────────┬───────────────────────────────────────┬──────────────┘
             │  HTTPS (anon key + JWT)                │  HTTPS (Bearer JWT)
             ▼                                        ▼
┌────────────────────────┐              ┌─────────────────────────────┐
│  Supabase              │              │  Netlify Functions           │
│  ├─ Postgres (RLS)     │◀─────────────│  ├─ api.ts (Gemini proxy)    │
│  ├─ Auth (magic-link)  │  service-   │  ├─ invite.ts               │
│  └─ Realtime (future)  │  role key   │  └─ accept-invite.ts        │
└────────────────────────┘              └──────────────┬──────────────┘
                                                       │  HTTPS (API key)
                                                       ▼
                                          ┌────────────────────────┐
                                          │  Google Gemini API     │
                                          │  (generative AI)       │
                                          └────────────────────────┘
```

**Key design constraint:** The Gemini API key and the Supabase service-role key never leave the server. The browser holds only the anon key (safe to expose) and the user's short-lived JWT.

---

## 2. Layers

### 2.1 Frontend (React SPA)

Built with React 19, TypeScript 5.8, and Vite 6. Deployed as a static site on Netlify.

| Concern | Implementation |
|---|---|
| Routing / view state | Single-level `view` enum in `App.tsx` (no router library) |
| Auth state | `useAuth` hook — wraps Supabase `onAuthStateChange` |
| Org / role state | `useOrganization` hook — fetches membership row and exposes role |
| Per-org data | `useOrgData` hook — generic loader/saver for singleton tables |
| Array data (assessments, KPIs, tasks) | Explicit CRUD via `dbService.ts` wrapper functions |
| AI calls | `geminiService.ts` — all calls go through `/.netlify/functions/api`, never directly to Gemini |
| UI styling | Tailwind CSS (CDN build in development; production migration to PostCSS pending) |
| Charts | recharts — materiality matrix scatter plot, KPI progress bars |
| Icons | lucide-react |
| File I/O | xlsx — for Excel data export/import in Task Management |

**Directory map:**

```
components/   One file per feature screen (AuthScreen, AssessmentForm, TaskManagement, CarbonDashboard, …)
hooks/        useAuth, useOrganization, useOrgData
lib/          Supabase client singleton (supabaseClient.ts)
services/     dbService.ts (CRUD helpers), geminiService.ts (AI call helpers)
```

### 2.2 Backend (Netlify Functions)

Three serverless functions written in TypeScript. All use the Supabase service-role key so they can bypass RLS for privileged operations.

| Function | Responsibility | Auth requirement |
|---|---|---|
| `api.ts` | Proxies Gemini calls (Generates Tasks, Insights, Statements); logs token usage to `ai_usage_log` | Bearer JWT (any org member) |
| `invite.ts` | Create / list / resend / cancel invitations via Supabase Auth | Bearer JWT (Owner or Admin only), except `request_resend` which is unauthenticated |
| `accept-invite.ts` | Validate invite token, add user to `organization_members` | Bearer JWT (invitee) |

### 2.3 Database (Supabase / Postgres)

Single Postgres instance, multi-tenancy enforced at the row level. Every application table carries an `organization_id` foreign key; RLS policies prevent cross-tenant access.

**Table groupings:**

```
Tenant root:
  organizations
  organization_members
  organization_invites

Org-scoped singletons (one row per org):
  company_profiles
  business_model_canvases
  swot_analyses
  organization_ai_settings

Org-scoped arrays (many rows per org):
  assessments
  kpis
  tasks
  carbon_data
  ai_usage_log
  error_log

User-scoped:
  user_preferences
  auth.users  (managed by Supabase Auth)
```

**RLS helper functions** (`SECURITY DEFINER`, so they run with elevated privilege and break circular dependency):

- `is_org_member(org_id uuid) → boolean` — membership existence check
- `user_org_role(org_id uuid) → text` — returns caller's role in the org

Standard policy pattern applied to all org-scoped tables:

```
SELECT  → is_org_member(organization_id)
INSERT  → user_org_role(organization_id) IN ('Owner', 'Admin', 'Manager')
UPDATE  → same as INSERT
DELETE  → same as INSERT (Owner-only for sensitive tables)
```

---

## 3. Data Flow — Key Scenarios

### 3.1 User Sign-in (Magic Link)

```
Browser → Supabase Auth (email magic-link) → email delivered
User clicks link → Supabase sets session JWT in localStorage
useAuth detects session → App renders main shell
useOrganization loads membership row → role exposed to UI
```

### 3.2 AI-Assisted Assessment (IRO Suggestions)

```
User clicks "Auto-Fill"
  → geminiService.callApi("suggest_iros", { topic, companyDescription })
    → POST /.netlify/functions/api  (Bearer JWT in header)
      → api.ts validates JWT with Supabase
      → api.ts calls Google Gemini with prompt built from user data
      → Response streamed back as JSON
      → ai_usage_log row inserted (tokens, model, org_id)
    ← JSON { impactDescription, financialDescription, scores }
  ← UI populates assessment form fields
User reviews & saves
  → dbService.upsertAssessment(orgId, data)
    → Direct Supabase CRUD (anon key + JWT, RLS enforced)
```

### 3.3 Team Invitation Flow

```
Owner/Admin enters email + role
  → POST /.netlify/functions/invite  { action: "invite", email, role }
    → invite.ts validates JWT role ≥ Admin
    → Creates organization_invites row (UUID = token)
    → Sends Supabase Auth invite email with token in URL
Invitee clicks link → lands on /accept-invite?token=<uuid>
  → POST /.netlify/functions/accept-invite  { token }
    → accept-invite.ts validates token (not expired, not consumed)
    → Inserts organization_members row
    → Deletes organization_invites row (single-use)
  ← Returns company name for welcome screen
```

---

## 4. Multi-Tenancy Model

Every authenticated user belongs to exactly one organization at a time. The `organization_id` is carried through all operations:

- **Client:** stored in `useOrganization` hook state, passed to every `dbService` call and to `geminiService.setOrganizationContext()`
- **Server functions:** validated in every request body; Supabase JWT confirms the caller is a member
- **Database:** RLS policies enforce membership at query time, independently of application code

Role hierarchy (highest to lowest): `Owner → Admin → Manager → Consultant`

---

## 5. Security Boundaries

| Boundary | Mechanism |
|---|---|
| Tenant data isolation | Postgres RLS — `is_org_member()` on every SELECT |
| Write privilege control | RLS — `user_org_role()` checked on INSERT/UPDATE/DELETE |
| AI key protection | Gemini key lives only in Netlify env vars; never sent to browser |
| Service-role protection | Service-role key lives only in Netlify env vars |
| Invite token single-use | Token (= row ID) deleted on acceptance |
| Session integrity | Supabase short-lived JWTs; refresh handled by client library |

Known gaps tracked in [TECH_STACK.md](./TECH_STACK.md#known-gaps--hardening-backlog):
CORS headers, rate-limiting on `request_resend`, server-side AI model allowlist, prompt-injection sanitisation, Tailwind CDN dependency, HTTP-method guard on `invite.ts`.

---

## 6. Deployment Topology

| Environment | Frontend | Backend | Database |
|---|---|---|---|
| Production | Netlify (auto-deploy from `main`) | Netlify Functions | Supabase project (prod) |
| Demo | Netlify (separate site) | Netlify Functions | Supabase project (demo) |
| Local dev | `vite` on :5173 via `npm run dev:netlify` | Netlify CLI Functions on :8888 | Supabase (remote or local CLI) |

> Always use `npm run dev:netlify` locally — plain `npm run dev` does not start the Functions runtime and AI/invite features will fail.

Schema migrations are applied manually via the Supabase Dashboard SQL editor. `supabase/schema.sql` is the canonical snapshot for fresh installs; files in `supabase/migrations/` are incremental deltas.
