# Aeternum Ally - Claude Code Context

`AGENTS.md` is the canonical project context for AI-assisted development in this repository. Claude Code must read and follow it before making changes. If this compatibility summary conflicts with `AGENTS.md`, `AGENTS.md` wins.

---

## What this project is

A multi-tenant SaaS web app that guides SMEs through ESRS/CSRD sustainability reporting. Users complete a structured workflow (company profile → business model canvas → double materiality assessment → SWOT → KPIs → sustainability statement) and the system generates a compliant Sustainability Statement.

Stack: React 19 + TypeScript + Vite (frontend), Netlify Functions (backend), Supabase Postgres + Auth (database), Google Gemini (AI).

---

## Key commands

```bash
npm run dev:netlify     # start dev server (Vite + Netlify Functions on port 8888) — always use this, not npm run dev
npm run build           # production build
npx tsc --noEmit        # type-check without building
```

> Never use `npm run dev` alone — it does not start the Netlify Functions runtime and AI / invite features will fail silently.

---

## Project layout

```
App.tsx               Root — view routing via 'view' enum, top-level state
types.ts              All shared TypeScript types
constants.ts          ESRS topics, scoring formulas, GRI mapping, MATERIALITY_THRESHOLD

components/           One file per feature screen
hooks/
  useAuth.ts          Supabase session + sign-in/out
  useOrganization.ts  Current org context, role, member list
  useOrgData.ts       Generic loader/auto-saver for singleton DB tables

lib/
  supabaseClient.ts   Supabase anon client (browser-safe)

services/
  dbService.ts        CRUD wrappers and tenant-aware data mappers
  geminiService.ts    AI call helpers - proxies through /.netlify/functions/api
  evidenceService.ts  Evidence operations and validated external links
  spreadsheetService.ts  Bounded XLSX/CSV parsing and export

netlify/functions/
  api.ts              Authenticated Gemini proxy + usage logger
  *-background.ts     Internal AI workers protected by INTERNAL_JOB_SECRET
  byok-settings.ts    Role-aware server-only BYOK management
  google-drive.ts     Authenticated Drive proxy; never returns OAuth tokens
  google-callback.ts  OAuth callback with hashed, expiring state
  evidence.ts         Tenant-aware evidence operations
  invite.ts           Invitation CRUD + rate-limited public resend
  accept-invite.ts    Authenticated invite validation + member join
  ally-support.ts     Authenticated, tenant-bound support AI
  admin*.ts           Platform-admin authentication and operations

supabase/
  schema.sql          Canonical schema snapshot (for fresh installs)
  migrations/         Incremental SQL upgrades for existing projects

tests/security/       Security regression tests for auth, tenant isolation,
                      secrets, URLs, uploads, logging, and dependencies
```

---

## Patterns to follow

### View routing
Navigation is a single `view` state variable in `App.tsx` — no router library. Add new screens by extending the `view` union type and adding a case in the render switch.

### Adding a DB table
1. Add an incremental `supabase/migrations/00N_<name>.sql` file for existing projects.
2. Update `supabase/schema.sql` so fresh installs receive the current final state.
3. Add the TypeScript type to `types.ts`.
4. If it is a singleton-per-org table, use `useOrgData`. If it is many-per-org, add tenant-aware service functions.
5. Add RLS and regression tests before exposing the table to browser roles.

Fresh projects run the current `schema.sql` only. Existing projects run only migrations not yet applied, in filename order. Do not replay the full migration history after loading the current snapshot.

### Adding an AI feature
1. Export a new async function from `services/geminiService.ts` that calls `callApi("<action_name>", params)`.
2. Add a matching `case "<action_name>":` in the `runAction` switch in `netlify/functions/api.ts`.
3. Return `{ result, inputTokens, outputTokens }` from the case handler. Token logging is automatic.

### RLS pattern
Member-readable org-scoped tables normally follow this policy shape:
- SELECT: `is_org_member(organization_id)`
- INSERT/UPDATE/DELETE: `user_org_role(organization_id) IN ('Owner', 'Admin', 'Manager')`
Use the helper functions rather than duplicating membership SQL.

Server-only credential tables are exceptions. `organization_ai_secrets`, `organization_integrations`, and `organization_oauth_states` revoke browser grants and are accessed only through authenticated Netlify Functions using `service_role`.

### Dark mode
Toggle via `dark` class on `<html>`. Every UI component should have `dark:` Tailwind variants. Dark mode preference is stored in `localStorage` (per-device, not in DB).

### Auto-save
Singleton tables (profile, canvas, SWOT) use `useOrgData` which auto-saves on state change with a debounce. Many-per-org tables (assessments, KPIs) use explicit save buttons via `dbService` functions.

---

## Things NOT to do

- Never call the Gemini API from the browser. Always go through `/.netlify/functions/api`.
- Never use the Supabase service-role key in the frontend bundle (`SUPABASE_SERVICE_ROLE_KEY` is server-only).
- Never prefix server-only secrets with `VITE_` — Vite inlines them into the browser bundle.
- Never commit `.env` (gitignored). Only `.env.example` is committed.
- Never bypass RLS in application code. If you need a privileged operation, add it to a Netlify Function.
- Never return BYOK keys, OAuth access/refresh tokens, admin magic links, or internal-job credentials to the browser.
- Never trust caller-supplied `organization_id`, role, email, or user identity in a service-role function without JWT and membership/role verification.
- Never log prompts, raw AI responses, report snippets, invite tokens, OAuth tokens, or API keys.
- Never use `npm run dev` when testing functions — use `npm run dev:netlify`.

The complete delivery workflow and security review requirements are maintained in `AGENTS.md`.

---

## Domain vocabulary

| Term | Meaning |
|---|---|
| ESRS | European Sustainability Reporting Standards — the reporting framework |
| CSRD | Corporate Sustainability Reporting Directive — the EU law mandating ESRS |
| GRI | Global Reporting Initiative — older, widely-used standard; ESRS topics map to GRI |
| Double Materiality | Two-dimensional assessment: impact on world (inside-out) + financial impact on company (outside-in) |
| IRO | Impact, Risk, Opportunity — the three things identified per material topic |
| Material topic | An ESRS topic that scores above the threshold (40) on either materiality dimension |
| BMC | Business Model Canvas — 9-block strategic model, extended with Eco-Social Costs/Benefits |
| BSC | Balanced Scorecard — KPI framework: Financial, Customer, Internal, Learning & Growth |
| RACI | Responsible, Accountable, Consulted, Informed — ownership matrix for KPIs |
| Org / Organization | A tenant in the multi-tenant system. One org = one company's data. |

---

## Key constants

| Constant | Location | Value | Notes |
|---|---|---|---|
| `MATERIALITY_THRESHOLD` | `constants.ts` | `40` | Topics above this on either axis are material |
| `DEFAULT_MODEL` | `netlify/functions/api.ts` | `"gemini-2.5-flash"` | Used when org has no AI settings row |
| Invite expiry | `supabase/schema.sql` | `now() + interval '7 days'` | Hardcoded in DB default |

---

## Known gaps (track; do not introduce workarounds)

See [TECH_STACK.md - Known gaps](./Docs%20v1.1.0/TECH_STACK.md#known-gaps--hardening-backlog), [Known Issues - Security Review](./Docs%20v1.1.0/known%20issue%20-%20security%20review.md), and the canonical list in `AGENTS.md`.

- Dependabot alert `#112` for `extract-zip` remains in Netlify development tooling with no upstream patch; track under GitHub issue `#152`.
- Prompt-injection trust boundaries and structured output validation are not yet systematic across every AI action.
- Tailwind compiles at build time and the app shell loads no third-party script; a restrictive CSP is still pending and is now unblocked.
- Netlify Functions do not yet share one centralized origin/CORS policy. CORS is not authorization.
- The database constrains AI model IDs, but `api.ts` does not repeat the allowlist at the function boundary.
