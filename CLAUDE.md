# AeternumAlly — Claude Code Context

This file provides context for AI-assisted development in this repository. It is read automatically by Claude Code at the start of every session.

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
  dbService.ts        CRUD wrappers — call these from components, not supabaseClient directly
  geminiService.ts    AI call helpers — proxies through /.netlify/functions/api

netlify/functions/
  api.ts              Gemini proxy + token logger (server-only, uses service-role key)
  invite.ts           Invitation CRUD + email dispatch (server-only)
  accept-invite.ts    Token validation + member join (server-only)

supabase/
  schema.sql          Canonical schema snapshot (for fresh installs)
  migrations/         Incremental SQL files (apply in numeric order)
```

---

## Patterns to follow

### View routing
Navigation is a single `view` state variable in `App.tsx` — no router library. Add new screens by extending the `view` union type and adding a case in the render switch.

### Adding a DB table
1. Add the SQL in a new `supabase/migrations/00N_<name>.sql` file.
2. Add the TypeScript type to `types.ts`.
3. If it's a singleton-per-org table, use `useOrgData` hook. If it's a many-per-org table, add CRUD wrappers to `dbService.ts`.

### Adding an AI feature
1. Export a new async function from `services/geminiService.ts` that calls `callApi("<action_name>", params)`.
2. Add a matching `case "<action_name>":` in the `runAction` switch in `netlify/functions/api.ts`.
3. Return `{ result, inputTokens, outputTokens }` from the case handler. Token logging is automatic.

### RLS pattern
Every org-scoped table follows the same policy shape:
- SELECT: `is_org_member(organization_id)`
- INSERT/UPDATE/DELETE: `user_org_role(organization_id) IN ('Owner', 'Admin', 'Manager')`
Use the helper functions — never inline a membership check.

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
- Never use `npm run dev` when testing functions — use `npm run dev:netlify`.

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

## Known gaps (do not introduce workarounds, track them)

See [docs/TECH_STACK.md — Known gaps](./docs/TECH_STACK.md#known-gaps--hardening-backlog) for the full list. The headline items:
- No CORS headers on Netlify Functions
- No rate limit on `request_resend` in `invite.ts`
- No server-side AI model allowlist
- No prompt-injection sanitisation
- Tailwind loaded via CDN (not PostCSS)
