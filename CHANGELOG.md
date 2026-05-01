# Changelog

All notable changes to Aeternum Ally are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project does not yet use semantic versioning. Entries are dated.

---

## [Unreleased]

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
