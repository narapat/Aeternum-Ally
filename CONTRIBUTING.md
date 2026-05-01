<!-- Version: 1.0.0 — Last updated: 2026-05-01 -->

# Contributing to Aeternum Ally

Thank you for taking the time to contribute. This document explains how to set up a development environment, how the codebase is organized, and the conventions to follow when submitting changes.

---

## Table of Contents

1. Prerequisites
2. Local development setup
3. Project structure
4. Development workflow
5. Code conventions
6. Commit messages
7. Pull request process
8. Database migrations
9. Adding AI actions
10. Running checks

---

## 1. Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 20 | [nodejs.org](https://nodejs.org) |
| npm | 10 | Bundled with Node 20 |
| Netlify CLI | 26 | `npm i -g netlify-cli` |
| Git | any modern | — |
| A Supabase project | — | [supabase.com](https://supabase.com) |
| A Google Gemini API key | — | [aistudio.google.com](https://aistudio.google.com/apikey) |

---

## 2. Local development setup

```bash
# 1. Clone the repo
git clone https://github.com/narapat/Aeternum-Ally.git
cd Aeternum-Ally

# 2. Copy env file and fill in the five required variables
cp .env.example .env

# 3. Install dependencies
npm install

# 4. Start the dev server (Vite + Netlify Functions together)
npm run dev:netlify
```

The app is available at `http://localhost:8888`.

> **Important:** Always use `npm run dev:netlify`, not `npm run dev`. The plain Vite dev server does not expose `/.netlify/functions/*` and AI / invite features will silently fail.

### Environment variables

Open `.env` and fill in all five values. See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md#environment-variables) for what each variable does and where to find the values.

### Database setup

If you are using a fresh Supabase project:
1. Open **Supabase Dashboard → SQL Editor**
2. Run `supabase/schema.sql` in full
3. Run each file in `supabase/migrations/` in numeric order

For existing projects, only run the migration files that are new since your last pull.

---

## 3. Project structure

```
components/       One React component file per feature screen
hooks/            useAuth, useOrganization, useOrgData
lib/              Supabase client singleton (supabaseClient.ts)
services/         dbService.ts — CRUD wrappers for Supabase
                  geminiService.ts — AI call helpers (client-side only; never calls Gemini directly)
netlify/
  functions/      api.ts, invite.ts, accept-invite.ts (server-side only)
supabase/
  schema.sql      Canonical full-schema snapshot (for fresh installs)
  migrations/     Incremental SQL files (for upgrading existing installs)
docs/             All documentation
types.ts          Shared TypeScript types
constants.ts      ESRS topics, scoring logic, GRI mapping, reference data
App.tsx           Root component — view routing, top-level state
index.tsx         React entry point
```

---

## 4. Development workflow

### Branching

| Branch | Purpose |
|---|---|
| `main` | Production-ready code. Auto-deploys to the production Netlify site. |
| `feature/<short-description>` | New features (e.g. `feature/kpi-export`) |
| `fix/<short-description>` | Bug fixes (e.g. `fix/invite-email-resend`) |
| `chore/<short-description>` | Housekeeping: deps, docs, config (e.g. `chore/update-readme`) |
| `migration/<short-description>` | PRs that include a database migration (e.g. `migration/add-audit-log`) |

Never commit directly to `main`. Open a pull request from your branch.

### Feature flag

There are no feature flags in the current codebase. New features should be complete and tested before merging to `main`.

---

## 5. Code conventions

### TypeScript

- Strict mode is enabled (`tsconfig.json`). Fix type errors rather than using `any` or `@ts-ignore`.
- All shared types go in `types.ts`. Constants go in `constants.ts`.
- Use named exports, not default exports, for components and utilities. `App.tsx` is the only exception.

### React

- Function components only. No class components.
- Hooks live in `hooks/`. If a hook is used only in one component, it can live in that component file until it grows beyond ~30 lines.
- Keep components focused. If a component exceeds ~250 lines, extract sub-components.
- Do not use external state management libraries. The existing pattern — `useState` + prop passing + shared hooks — is sufficient.

### Netlify Functions

- All functions use the Supabase service-role key (bypasses RLS). Be careful. Never expose this key to the browser.
- Validate HTTP method, authentication, and request body at the top of every handler before any business logic.
- Return JSON from all endpoints using the shared `json(statusCode, body)` helper.

### Styling

- Use Tailwind CSS utility classes. Do not write custom CSS unless absolutely necessary.
- Dark mode is toggled via the `dark` class on `<html>` (standard Tailwind dark mode). All components should have matching `dark:` variants.

### AI / Gemini

- The browser never calls the Gemini API directly. All AI calls go through `geminiService.ts` → `/.netlify/functions/api`.
- New AI actions belong in `netlify/functions/api.ts` as a new `case` in the `runAction` switch.
- Every action must log usage to `ai_usage_log` via the existing pattern in `api.ts`.

---

## 6. Commit messages

Use the Conventional Commits format:

```
<type>(<scope>): <short summary in imperative mood>
```

**Types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `migration`

**Examples:**
```
feat(assessment): add auto-fill scoring with AI suggestions
fix(invite): handle existing-user resend via signInWithOtp
chore(deps): upgrade @supabase/supabase-js to 2.46
docs(glossary): add ESRS and GRI definitions
migration: add audit_log table for org-scoped changes
```

Keep the subject line under 72 characters. Add a body if the "why" is non-obvious.

---

## 7. Pull request process

1. Open a PR against `main` from your feature branch.
2. Fill in the PR template completely.
3. Ensure the checklist in the template is checked before requesting review.
4. If your PR includes a database migration, add the label `migration` and call it out clearly in the description. The migration must be run manually on each environment after merge.
5. At least one approving review is required to merge.
6. Squash-merge is preferred to keep the `main` history clean.

---

## 8. Database migrations

If your change requires a schema modification:

1. Write the SQL as a new file in `supabase/migrations/` with the next sequential number: `supabase/migrations/00N_<description>.sql`.
2. Test the migration against your local Supabase project first.
3. If the new code depends on the schema change (e.g. a new table or column), apply the migration to the target environment **before** merging and deploying the code.
4. Update `supabase/schema.sql` with a full snapshot after the migration lands on all environments. (Run `supabase db dump` or manually apply the delta to the file.)
5. Document the migration in your PR description: what changed and why.

There is no automated migration runner. Migrations are applied manually via the Supabase Dashboard SQL Editor.

---

## 9. Adding an AI action

To add a new AI-powered feature:

1. **Add the client call** in `services/geminiService.ts`. Export a new async function that calls `callApi("<your_action_name>", { ...params })`.
2. **Add the server handler** in `netlify/functions/api.ts`:
   - Add a new `case "<your_action_name>":` to the `runAction` switch
   - Implement the handler function below the switch
   - Return `{ result, inputTokens, outputTokens }`
3. **Token logging is automatic** — the shared handler in `api.ts` records usage to `ai_usage_log` after every action completes.
4. **Test** by calling the feature in the UI with your local Netlify dev server.

---

## 10. Running checks

There is currently no automated test suite. Verify your changes manually:

```bash
# TypeScript type check (no emit)
npx tsc --noEmit

# Build the production bundle (catches tree-shaking and bundler issues)
npm run build
```

Before submitting a PR:
- [ ] `npx tsc --noEmit` passes with no errors
- [ ] `npm run build` succeeds
- [ ] You have manually tested the affected feature end-to-end in the browser
- [ ] Dark mode and light mode both look correct for any UI changes
- [ ] If your change touches auth or invites, test the full invite flow (send → receive email → click link → join org)
