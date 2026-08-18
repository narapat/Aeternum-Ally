<!-- Version: 1.1.0 - Last updated: 2026-08-18 -->

# Architecture Overview

## 1. System Context

Aeternum Ally is a multi-tenant SaaS web application that helps SMEs produce ESRS/CSRD-compliant sustainability reports and track actionable sustainability metrics. Netlify hosts the React application and server functions, Supabase provides Auth/Postgres/RLS, Google Gemini provides AI generation, Google Drive provides organization-owned evidence selection, and Resend supports transactional email paths.

```
┌────────────────────────────────────────────────────────────────────┐
│                          Browser (User)                            │
│                    React 19 SPA — Vite / TS                        │
└────────────┬───────────────────────────────────────┬──────────────┘
             │  HTTPS (anon key + JWT)                │  HTTPS (Bearer JWT)
             ▼                                        ▼
┌────────────────────────┐              ┌─────────────────────────────┐
│  Supabase              │              │  Netlify Functions           │
│  ├─ Postgres (RLS)     │◀─────────────│  ├─ AI + background jobs    │
│  ├─ Auth (magic-link)  │  service-   │  ├─ invites + admin auth    │
│  └─ tenant data        │  role key   │  ├─ BYOK + Google Drive     │
└────────────────────────┘              │  └─ evidence + Ally support │
                                        └──────────┬────────┬────────┘
                                                   │        │
                                                   ▼        ▼
                                           Google Gemini  Google Drive
```

**Key design constraint:** Platform secrets, customer BYOK keys, OAuth tokens, and the Supabase service-role key never leave the server. The browser holds only public Vite configuration, the Supabase anon key, and the user's session tokens. The anon key is safe only while RLS remains correctly enabled and tested.

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
| File I/O | `read-excel-file`, `write-excel-file`, and `papaparse`; XLSX parsing is bounded and isolated in a Web Worker |

**Directory map:**

```
components/   One file per feature screen (AuthScreen, AssessmentForm, TaskManagement, CarbonDashboard, …)
hooks/        useAuth, useOrganization, useOrgData
lib/          Supabase client singleton (supabaseClient.ts)
services/     dbService.ts (CRUD helpers), geminiService.ts (AI call helpers)
```

### 2.2 Backend (Netlify Functions)

Thirteen TypeScript functions serve several different trust boundaries. Service-role access is used only where privileged database operations are required; every public route must authenticate and authorize independently before using it.

| Boundary | Functions | Authorization |
|---|---|---|
| Tenant AI | `api.ts`, `ally-support.ts` | Supabase JWT plus organization membership; input limits and usage logging |
| Internal AI workers | `report-background.ts`, `dma-background.ts`, `assessment-background.ts` | `INTERNAL_JOB_SECRET` checked before body parsing |
| Organization credentials | `byok-settings.ts` | JWT plus membership; Owner/Admin for credential changes; raw keys never returned |
| Google Drive | `google-drive.ts`, `google-callback.ts` | JWT/membership and Owner/Admin management; opaque OAuth state; server-side provider calls |
| Evidence | `evidence.ts` | JWT plus tenant/role checks |
| Invitations | `invite.ts`, `accept-invite.ts` | Owner/Admin management and authenticated invitee acceptance; public resend is generic and rate-limited |
| Platform administration | `admin-magic-link.ts`, `admin.ts` | Same-origin/rate-limited magic-link bootstrap and platform-admin JWT |

`api.ts` dispatches long-running work to internal worker functions using a trusted Netlify deploy URL and `X-Internal-Job-Secret`. A caller cannot select an arbitrary Host header as the internal destination.

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

Server-only organization secrets:
  organization_ai_secrets
  organization_integrations
  organization_oauth_states

Org-scoped arrays (many rows per org):
  assessments
  kpis
  tasks
  carbon_data
  evidence_attachments
  sustainability_reports
  dma_analysis_jobs
  assessment_ai_jobs
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

Server-only credential tables do not use the member-readable pattern. Grants are revoked from `PUBLIC`, `anon`, and `authenticated`; only `service_role` can read raw credentials. Functions return safe state such as `has_byok_key`, connection status, or reduced Drive file metadata.

`error_log` has a narrower client insert policy: the caller must be authenticated, `user_id` must equal `auth.uid()`, `source` must be `client`, and an organization ID is accepted only when the caller is a member.

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
      → api.ts verifies organization membership and resolves server-side AI settings
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
Invitee clicks link → lands on /?invite_token=<uuid>
  → POST /.netlify/functions/accept-invite  { invite_token }
    → accept-invite.ts validates token (not expired, not consumed)
    → Inserts organization_members row
    → Deletes organization_invites row (single-use)
  ← Returns company name for welcome screen
```

---

## 4. Multi-Tenancy Model

Members of one Aeternum Ally organization may use Gmail, Google Workspace, or unrelated email domains. Authorization is based on `organization_members`, never on email-domain matching. The database permits an account to have memberships in multiple organizations; the current `useOrganization` implementation loads one membership context with `limit(1)` and does not yet expose a workspace switcher. The selected `organization_id` is carried through tenant operations:

- **Client:** stored in `useOrganization` hook state, passed to every `dbService` call and to `geminiService.setOrganizationContext()`
- **Server functions:** the JWT identifies the caller; each privileged function verifies membership/role for the requested organization and ignores caller-supplied identity claims
- **Database:** RLS policies enforce membership at query time, independently of application code

Role hierarchy (highest to lowest): `Owner → Admin → Manager → Consultant`

---

## 5. Security Boundaries

| Boundary | Mechanism |
|---|---|
| Tenant data isolation | Postgres RLS — `is_org_member()` on every SELECT |
| Write privilege control | RLS — `user_org_role()` checked on INSERT/UPDATE/DELETE |
| Tenant context in privileged functions | Verified JWT plus explicit organization membership/role lookup before service-role access |
| AI key protection | Platform Gemini key lives in Netlify env vars; BYOK credentials live in the service-role-only `organization_ai_secrets` table |
| Google OAuth protection | OAuth tokens live in service-role-only storage; the browser receives only connection state and safe file metadata |
| Service-role protection | Service-role key lives only in Netlify env vars |
| Internal worker authentication | `INTERNAL_JOB_SECRET` and trusted deploy URL; workers reject requests before parsing payloads |
| Invite token single-use | Token (= row ID) deleted on acceptance |
| Invite resend abuse | Generic response, atomic 10-per-60-second client limit, and five-minute invitation cooldown |
| Admin magic-link isolation | Production delivery fails closed; development links require explicit loopback-only mode |
| Spreadsheet parser isolation | Content checks, strict size/shape bounds, Web Worker, and timeout before database writes |
| External evidence URLs | Public HTTPS policy, provider allowlists, render-time validation, and database constraint |
| Error-log integrity | Authenticated user binding and tenant membership enforced by RLS |
| AI log confidentiality | Diagnostic metadata only; raw model output and snippets are not logged |
| Session integrity | Supabase short-lived JWTs; refresh handled by client library |

Remaining hardening items are tracked in [TECH_STACK.md](./TECH_STACK.md#known-gaps--hardening-backlog). The only open Dependabot item is the development-only `extract-zip` path tracked in issue #152; prompt-boundary consistency, build-time Tailwind/CSP, centralized origin handling, and function-level model revalidation remain defense-in-depth work.

---

## 6. Deployment Topology

| Environment | Frontend | Backend | Database |
|---|---|---|---|
| Production | Netlify (auto-deploy from `main`) | Netlify Functions | Supabase project (prod) |
| Demo | Netlify (separate site) | Netlify Functions | Supabase project (demo) |
| Local dev | `vite` on :5173 via `npm run dev:netlify` | Netlify CLI Functions on :8888 | Supabase (remote or local CLI) |

> Always use `npm run dev:netlify` locally — plain `npm run dev` does not start the Functions runtime and AI/invite features will fail.

Schema migrations are applied manually via the Supabase Dashboard SQL editor. `supabase/schema.sql` is the canonical snapshot for fresh installs; files in `supabase/migrations/` are incremental deltas.
