<!-- Version: 1.1.0 — Last updated: 2026-05-09 -->

# Design Principles

## Overview

These principles guide every product, engineering, and UX decision in AeternumAlly. They are not aspirational statements — they are active constraints that resolve trade-offs when requirements pull in different directions.

---

## 1. Compliance Is a Starting Point, Not the Goal

AeternumAlly exists to help SMEs comply with ESRS and CSRD, but compliance is the floor, not the ceiling. Every feature should ask: does this also help the company become more sustainable and more competitive? If a feature only produces a checkbox, reconsider it. If it reveals a strategic insight, prioritize it.

**In practice:**
- The Double Materiality Assessment reveals which environmental and social risks threaten the business financially — surface this clearly.
- KPIs are linked to the Balanced Scorecard so sustainability performance connects to business outcomes.
- The Action Plan (Task Management) explicitly bridges the gap between reporting on an issue and fixing it, linking generated tasks straight back to their root KPIs or assessments.
- The Business Model Canvas extension (Eco-Social Costs/Benefits) is deliberately placed before the assessment to anchor compliance work in business strategy.

---

## 2. AI Assists, Humans Decide

The AI layer (Google Gemini) is an accelerator, not an authority. Every AI-generated suggestion — impact descriptions, financial risk narratives, KPI proposals, SWOT entries, and Tasks — is editable before saving. The system never commits AI output directly to the database without user review.

**In practice:**
- "Auto-Fill" populates a form; the user must still save it.
- AI suggestions are visually distinguished from user-authored content.
- All manual entry paths exist independently of AI. The app is fully functional without AI features enabled.
- AI usage is logged transparently so Owners can see what the system is doing on their behalf.

---

## 3. Complexity Earns Its Place

SME users are not ESG specialists. Every piece of complexity — every score, every acronym, every configuration option — must justify its presence by delivering value the user cannot get without it. If a field or workflow step is confusing without adding decision-making power, simplify or remove it.

**In practice:**
- Scoring scales (1–5) use plain language labels (Minimal, Low, Medium, High, Critical) rather than raw numbers.
- The materiality matrix visualizes abstract scores as a spatial map to make the "material / not material" judgment intuitive.
- ESRS topic codes (E1, S1, G1) are always displayed with their plain-language names.
- The SWOT wizard and Carbon Quest wizard are step-by-step processes rather than single dense forms.

---

## 4. Data Belongs to the Organization

All sustainability data is scoped to the organization, not the individual user. Members come and go; the company's compliance record must persist and be accessible to whoever holds the current role.

**In practice:**
- Multi-tenancy is enforced at the database layer via Row-Level Security — no application-layer workaround can leak data across tenants.
- Role-based access control (Owner / Admin / Manager / Consultant) is enforced server-side, not just in the UI.
- Singleton data (profile, canvas, SWOT) auto-saves so no work is lost when a user session ends.
- Personal preferences (dark mode, sidebar state) are the only things stored per-user, in `localStorage`.

---

## 5. Standards Interoperability Is a Feature

SMEs operate in a world of overlapping reporting standards. Aligning ESRS with GRI reduces rework when the same company faces multiple reporting requirements from different stakeholders (investors, supply chain, regulators).

**In practice:**
- Every material ESRS topic is mapped to its corresponding GRI standards in the database (`GRI_MAPPING` constant).
- The Sustainability Statement output includes a GRI Content Index table by default.
- The data model is designed around ESRS topic identifiers so future support for other frameworks (TCFD, TNFD, ISO 26000) can be added without restructuring.

---

## 6. Security Is Not Optional, Especially for SMEs

SME clients often lack security expertise. AeternumAlly must be secure by default so users do not have to make security trade-offs they are not equipped to evaluate.

**In practice:**
- API keys (Gemini, Supabase service-role) never reach the browser — ever. All privileged operations go through server-side Netlify Functions.
- RLS policies are the authoritative access control layer; UI-level role gates are secondary.
- Invite tokens are single-use and expire after 7 days.
- The `.env` file is gitignored; `.env.example` is the only committed template.
- Known security gaps are documented openly in [TECH_STACK.md](./TECH_STACK.md) rather than hidden.

---

## 7. Incremental Progress Over Big-Bang Completion

Sustainability reporting is not done in a single session. The workflow is designed so that partial data is always useful and always saveable. A company that fills in only the Company Profile and one Assessment has still made forward progress and can return later.

**In practice:**
- The Data Completeness Dashboard gives the user a clear percentage-based view of progress across all sections.
- Every section auto-saves or has an explicit save action — no data is lost if the user navigates away.
- The Sustainability Statement can be generated at any completeness level; the output will reflect what data is available.
- The app never blocks the user from saving partial data by requiring all fields.

---

## 8. Transparency About Limitations

As a tool for regulatory compliance, AeternumAlly must be honest about what it can and cannot guarantee. AI-generated content is a draft, not an audited disclosure. The system should communicate this clearly.

**In practice:**
- Generated statements and generated tasks are presented as drafts for review, not final reports or mandates.
- AI usage panel is visible to Owners so they understand the nature and extent of AI involvement.
- Known gaps in the product (rate limiting, CORS, prompt injection risks) are documented in the tech docs for operators who self-host.
- The live demo prominently discloses shared AI quota limitations.

---

## 9. Extend the Familiar

The Sustainable Business Model Canvas extends the widely-known Osterwalder canvas rather than inventing a new framework. KPI management uses the Balanced Scorecard (BSC) framework that managers already know. ESRS topics follow the official EU nomenclature.

Building on familiar mental models reduces onboarding friction and means users arrive with relevant context, even if they have never used sustainability software before.

---

## 10. Open Source, Open Accountability

AeternumAlly is licensed under AGPL-3.0. This creates a mutual accountability loop: users who deploy the software as a service must share their improvements. This ensures that the communities the software serves — SMEs navigating complex sustainability requirements — can collectively benefit from any organization's investment in improving it.
