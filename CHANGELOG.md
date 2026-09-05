# Changelog

All notable changes to Aeternum Ally are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project does not yet use semantic versioning. Entries are dated.

---

## [Unreleased]

### Fixed
- **Organization tier was write-once** — a tier could be chosen when a company was
  created and never changed; nothing wrote `organizations.tier` again. Platform admins
  can now change it from the company list (`set_company_tier`), which moves both the AI
  allowance and the evidence storage quota.
- **Tenant AI panel showed a limit that did not exist** — the quota bar displayed a
  hardcoded 100 to every organization regardless of tier, called it a "soft limit", and
  told anyone over it that "AI calls are still allowed". The panel now shows the ceiling
  the server will actually enforce, resolved server-side.
- **Evidence upload entitlement** — `evidence.ts` resolved the organization tier
  from `organizations.subscription_tier`, a column that does not exist; migration
  015 named it `tier`. Every organization therefore fell back to `free` (0 MB) and
  direct upload returned 403 even for organizations a platform admin had set to
  `pro` or `enterprise`. Tier resolution now goes through
  `netlify/functions/_shared/organizationTier.js`, which reads the canonical column
  and fails closed. The missing `starter` storage quota was added.

### Added
- **Enforced monthly AI quota** — the platform allowance was counted, logged as
  "soft limit reached (proceeding anyway)", and then ignored, so platform AI spend
  had no upper bound per tenant and `soft_quota_monthly` had no effect. Both AI
  entry points (`api.ts`, `ally-support.ts`) now return HTTP 429 before any
  provider call once the ceiling is spent. BYOK tenants are exempt.
  `quota_type` is recorded as `platform_<tier>` rather than always `platform_free`.
- **CI workflow** (`.github/workflows/ci.yml`) — runs the four verification steps
  `AGENTS.md` requires (security tests, type check, build, runtime audit) on every
  pull request and push to `main`.
- **Ad-hoc AI quota grants** (`ai_quota_grants`) — expiring, attributed top-ups that a
  platform admin can add from **AI Usage → Quota** without changing an organization's
  standing plan. The effective ceiling is `standing limit + active grants`.
- **Automatic first-breach burst** — the first time an organization crosses its ceiling
  in a month it receives one automatic 25% top-up and the call proceeds, so service is
  not interrupted before a human can look. Worst case is 125% of plan; "once per month"
  is enforced by a partial unique index, not application logic.
- **`ROADMAP.md`** — `CONTRIBUTING.md` referred contributors to a roadmap that did
  not exist.

### Changed
- **Documentation links** — `README.md` and `CONTRIBUTING.md` linked into a `docs/`
  directory that does not exist; the published documentation is in `Docs v1.1.0/`.
  The stated Node prerequisite moved from 20+ to 22+, which is what
  `npm run test:security` actually requires.
- **AI Studio import map removed** from `index.html`. It pointed React, react-dom,
  recharts, lucide-react and `@google/genai` at a third-party CDN. It was inert
  after bundling, but it had to go before a restrictive CSP is possible.

### Migrations to run (in order)

| File | What it does |
|---|---|
| `026_ai_quota_enforcement.sql` | Adds `platform_starter` to the `ai_usage_log.quota_type` CHECK constraint (migration 015 added the tier; the constraint was never extended) and restates `soft_quota_monthly` as an enforced ceiling |
| `027_ai_quota_grants.sql` | Creates the service-role-only `ai_quota_grants` table and the one-auto-burst-per-organization-per-month index |

> Before deploying quota enforcement, follow **Enabling AI quota enforcement** in
> [`Docs v1.1.0/DEPLOYMENT.md`](./Docs%20v1.1.0/DEPLOYMENT.md). Organizations already over
> their tier default start receiving HTTP 429 on the first deploy otherwise.

---

## [1.1.0] — 2026-05-10

### Added
- **DMA Insight Hub Polling & Background Job** — Implemented a polling pattern to prevent Netlify function timeouts during large Gemini Pro tasks.
- **Progressive UI** — Added skeletons for Strategic Insight and Recommended Actions that appear immediately while checks run.
- **Manual Override** — Allowed users to click "Re-analyse" during polling to force a restart (with confirmation).
- **Comprehensive error logging** — new `error_log` table (migration 004) captures
  server-side and client-side errors with `source`, `context`, `action`, `http_status`,
  and `metadata` columns. Owners/Admins can query their org's errors directly in Supabase.
  - `services/errorLogService.ts` — silent client-side logging helper (never throws)
  - `netlify/functions/invite.ts` — logs all-email-paths-fail and invite DB insert errors
  - `netlify/functions/accept-invite.ts` — logs member insert errors
  - `hooks/useOrgData.ts` — logs DB load/save failures (`db-load`, `db-save` contexts)
  - `components/CompanyProfileForm.tsx` — logs member management errors (deactivate,
    cancel invite, resend, update role); replaces `alert()` with inline error state
  - `components/OrgSetupScreen.tsx` — logs accept-invite and create-org failures
- **`http_status` on `ai_usage_log`** (migration 003) — Gemini upstream HTTP status codes
  (503, 429, etc.) are now stored with each AI call record for queryable error tracking.
- **Leaf circuit logo** — `public/favicon.png` added; wired as browser favicon and
  sidebar header icon (replaces generic lucide `Layout` icon).
- **Structured address fields on Company Profile** (migration 005) — the free-text
  address textarea is replaced with Street, City, State/Province, Postal Code, and
  Country (dropdown, 60 countries). Contact Email (with format validation on blur)
  and Contact Phone fields also added.

### Fixed
- **Race Condition** — Fixed a race condition where the frontend polled before the background job could update the status to "processing".
- **Parameter Mismatch** — Fixed data flow between Frontend, API, and Background Function by aligning parameter names (`assessments`, `bmcData`, `swotData`).
- **React ReferenceError** — Fixed a crash in `DMAInsightHub.tsx` caused by accessing a variable before initialization.

### Changed

- **DB access consolidated into `dbService.ts`** — all `supabase.from()` calls are now
  routed exclusively through `services/dbService.ts`. Components and hooks no longer
  import the Supabase client for data operations. New functions added:
  `fetchSingleton`, `upsertSingleton`, `fetchMembership`, `fetchOrganization`,
  `fetchOrgMembers`, `removeMember`, `updateMemberRole`, `cancelInvite`,
  `createOrganizationWithOwner`, `lookupPendingInvite`, `fetchAiSettings`,
  `upsertAiSettings`, `fetchAiUsageLog`. `AiUsageRow` type moved from
  `AIUsagePanel.tsx` to `dbService.ts`.
- **Structured AI context** — all five Gemini prompt functions now receive a full
  `CompanyProfile` object instead of opaque string props. Server-side
  `buildCompanyContext()` in `api.ts` formats six fields (name, industry, ISIC, scale,
  description, mission/vision, products/services) into a consistent prompt block.
- **KPI AI Suggest** — fixed silent failure (errors now surfaced inline); `frequency`
  field populated from AI response; `responseSchema` now declares all fields as
  `required` to prevent Gemini from omitting `description`.
- **Sustainability Statement timeout** — topic Gemini calls are batched in groups of 3
  (sequential batches, header section concurrent with first batch) to stay within
  Netlify's function timeout. Button shows topic count and "may take up to 30 seconds".
- **Full-width responsive layout** — removed fixed `max-w` caps from Company Profile,
  SWOT Analysis, Sustainability Statement shell, Assessments list, and Business Model
  Canvas wizard. KPI BSC map adds a `2xl:grid-cols-4` breakpoint (4 columns ≥1536 px).
- **AI Suggest button style** on KPI form — restyled to solid green (`esg-600`) matching
  the Save button.

### Migrations to run (in order)

| File | What it does |
|---|---|
| `003_ai_usage_log_http_status.sql` | Adds `http_status int` to `ai_usage_log` |
| `004_error_log.sql` | Creates `error_log` table with RLS |
| `005_company_profile_address_contact.sql` | Adds 7 structured address + contact columns to `company_profiles` |

Changes merged to `main` but not yet tagged for a release.

---

## [1.0.0] — 2026-05-01

Initial production release.

### Added

**Core workflow**
- Company Profile with industry and ISIC code lookup
- Sustainable Business Model Canvas (11 blocks, Osterwalder + Eco-Social extensions)
- Double Materiality Assessment for all 10 ESRS topics (E1–E5, S1–S4, G1)
- Materiality Matrix scatter plot (recharts) with configurable threshold
- Material Topics List filtered view
- SWOT Analysis wizard with step-by-step navigation
- Performance Dashboard with Balanced Scorecard (BSC) perspectives and RACI ownership
- Data Completeness Dashboard (overview screen)
- Sustainability Statement generator (ESRS 2 structure + GRI Content Index)

**AI features (Google Gemini)**
- Auto-Fill for assessment IRO descriptions and scoring suggestions
- AI canvas suggestions per BMC block
- SWOT internal analysis from canvas data
- SWOT external analysis with Google Search grounding (live market/regulatory data)
- KPI suggestions from company description and material topics
- Sustainability Statement generation

**Multi-tenancy & team management**
- Organization creation and ownership model
- Role-based access control (Owner / Admin / Manager / Consultant)
- Email invitation flow (magic-link + auto-join)
- Invite resend for expired links (unauthenticated self-service)
- AI Usage Panel for token consumption visibility

**Infrastructure**
- Supabase Auth (email magic-link)
- Postgres with Row-Level Security for full tenant isolation
- Netlify Functions (serverless) for privileged operations
- Auto-save for singleton tables (profile, canvas, SWOT)
- Dark mode (per-device preference)
- Collapsible sidebar (per-device preference)
- PDF export via browser print

### License
- Licensed under GNU AGPL-3.0

---

## Earlier history

Early development commits are visible in the git log (`git log --oneline`). This changelog begins at the first production-ready release.
