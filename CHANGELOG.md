# Changelog

All notable changes to Aeternum Ally are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project does not yet use semantic versioning. Entries are dated.

---

## [Unreleased] — 2026-05-02 / 2026-05-03

### Added

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
