<!-- Version: 1.1.0 — Last updated: 2026-05-09 -->

# Functional Specification

## 1. Purpose & Scope

Aeternum Ally is a multi-tenant web application that guides SMEs through a structured, AI-assisted sustainability management workflow. The output is a publishable Sustainability Statement compliant with ESRS (European Sustainability Reporting Standards) and cross-referenced to GRI standards, along with actionable tasks and carbon tracking.

This document describes the functional behaviour of every feature area: what it does, what data it requires, what actions are available, and what the system produces.

---

## 2. User Roles & Permissions

| Role | Description | Key Permissions |
|---|---|---|
| **Owner** | Created automatically when an organization is established. One per org. | All permissions, including org deletion and transferring ownership |
| **Admin** | Trusted power user. | All write operations; can invite / remove members (except Owner) |
| **Manager** | Default role for invited team members. | Full read/write on all sustainability data |
| **Consultant** | Read-only advisor role. | Read access to all data; no write, no invite |

Role assignment is fixed at invite time. Only the Owner can promote another member to Admin.

---

## 3. Authentication & Organization Setup

### 3.1 Sign-in

- Email magic-link only (no password). Supabase Auth sends a one-time link valid for a configurable expiry.
- On first sign-in, the user has no organization and is redirected to Organization Setup.
- On subsequent sign-ins, the last active organization is loaded automatically.

### 3.2 Organization Setup

Triggered for new users or users not yet attached to an organization.

Two paths:
1. **Create new organization** — user becomes Owner. A new row is created in `organizations` and `organization_members`.
2. **Join via invite link** — user arrives from an invitation email with a token. The `accept-invite` function validates the token, adds the user to `organization_members`, and redirects to the main app.

### 3.3 Inviting Team Members

Available to Owner and Admin roles via the organization settings panel.

Inputs: email address, role (Admin / Manager / Consultant).
System behaviour:
- Inserts a row in `organization_invites` with a 7-day expiry.
- Sends an invitation email via Supabase Auth.
- The invite token is a UUID; it is single-use and deleted on acceptance.
- Resend available from the sign-in page (unauthenticated endpoint) if the link has expired.

---

## 4. Company Profile

**Purpose:** Capture the foundational identity of the organization. This data seeds all AI prompts throughout the workflow.

**Fields:**

| Field | Notes |
|---|---|
| Company name | Free text |
| Tax / registration number | Free text |
| Industry sector | Dropdown — 18 ISIC Rev.4 category groups |
| ISIC code | Searchable dropdown nested under sector |
| Founding year | Free text |
| Website | Free text |
| Address | Free text |
| Employee count | Micro / Small / Medium |
| Revenue range | Predefined bands |
| General description | Multi-line — primary input for AI context |
| Mission | Multi-line |
| Vision | Multi-line |
| Products / services | Comma-separated list |

**Persistence:** One row per organization in `company_profiles`. Auto-saved on blur; manual save also available. A save-status indicator is shown in the UI.

---

## 5. Sustainable Business Model Canvas

**Purpose:** Map the company's value creation logic, including ecological and social dimensions, before conducting the materiality assessment.

**Structure:** 11 blocks based on the Osterwalder Business Model Canvas extended with sustainability layers:

| Block | Description |
|---|---|
| Key Partners | Suppliers, alliances, joint ventures |
| Key Activities | Core operations required to deliver the value proposition |
| Key Resources | Physical, intellectual, human, financial assets |
| Value Proposition | Products/services and the problems they solve |
| Customer Relationships | How the company acquires and retains customers |
| Channels | Distribution and communication routes |
| Customer Segments | Target markets and personas |
| Cost Structure | Fixed and variable costs |
| Revenue Streams | Income sources and pricing mechanisms |
| Eco-Social Costs | Negative environmental and social impacts of operations |
| Eco-Social Benefits | Positive contributions to environment and society |

**AI feature:** Each block has an "AI Suggest" button. The system sends the company description and block context to the Gemini API and returns a draft suggestion that the user can accept, edit, or discard.

**Persistence:** One row per organization in `business_model_canvases`. Auto-save on change with debounce.

---

## 6. Double Materiality Assessment

This is the core analytical engine. It evaluates each ESRS topic on two dimensions to determine which topics are "material" — i.e., require disclosure.

### 6.1 ESRS Topics

Ten standard topics across three pillars:

| Pillar | Topics |
|---|---|
| Environment (E) | E1 Climate Change, E2 Pollution, E3 Water & Marine Resources, E4 Biodiversity & Ecosystems, E5 Resource Use & Circular Economy |
| Social (S) | S1 Own Workforce, S2 Workers in the Value Chain, S3 Affected Communities, S4 Consumers & End-users |
| Governance (G) | G1 Business Conduct |

### 6.2 Assessment Scoring

Each topic is scored on two independent materiality dimensions:

**Impact Materiality (Inside-Out)** — the company's impact on people and the planet:

| Criterion | Scale |
|---|---|
| Scale | 1 (Minimal) to 5 (Critical) |
| Scope | 1 to 5 |
| Irremediability | 1 to 5 |
| Likelihood | 1 (Very Unlikely) to 5 (Certain) |

Calculated value: `((Scale + Scope + Irremediability) / 3) × Likelihood × 4`

**Financial Materiality (Outside-In)** — financial risks and opportunities for the company:

| Criterion | Scale |
|---|---|
| Magnitude | 1 to 5 |
| Likelihood | 1 to 5 |

Calculated value: `Magnitude × Likelihood × 4`

**Materiality threshold:** A topic is marked material if either dimension score exceeds **40** (on a 0–100 scale).

### 6.3 AI Auto-Fill

Clicking "Auto-Fill" sends the company profile and selected ESRS topic to the Gemini API. The API returns draft text for:
- Impact description (impacts the company has on the environment/society for this topic)
- Financial description (risks and opportunities the topic poses to the company's finances)
- Suggested scores for all criteria

The user can accept, modify, or discard each suggestion before saving.

### 6.4 Assessment Form

Fields per topic:
- Topic selection (ESRSTopic enum)
- Impact description (free text)
- Financial description (free text)
- All scoring sliders (labeled 1–5)
- Computed materiality values (read-only, recalculated on input change)
- Material / Not Material badge (derived from threshold)

### 6.5 Materiality Matrix

A scatter plot (recharts) where:
- X-axis = Financial Materiality score (0–100)
- Y-axis = Impact Materiality score (0–100)
- Each data point = one assessed topic
- A threshold line at 40 on each axis divides the quadrant
- Topics above the threshold in either dimension are highlighted as "Material"

The matrix updates in real-time as assessment data changes.

### 6.6 Material Topics List

A filtered list displaying only topics flagged as material, used as the basis for the Sustainability Statement.

### 6.7 DMA Insight Hub

A module that synthesizes the results of all materiality assessments alongside the Business Model Canvas and SWOT analysis. It leverages the AI API to evaluate data consistency, identify systemic risks, and provide actionable strategic insight summaries to help transition from reporting to action.

---

## 7. SWOT Analysis Wizard

**Purpose:** Structured internal/external analysis of the organization's strategic sustainability position.

**Steps:**

1. **Strengths** — internal positive capabilities (free text)
2. **Weaknesses** — internal constraints or gaps (free text)
3. **Opportunities** — external trends the company can leverage (free text + AI search grounding)
4. **Threats** — external risks and regulatory pressures (free text + AI search grounding)

**AI Google Search Grounding:** For Opportunities and Threats, the user can click "Search & Suggest". The Gemini API performs a live Google Search grounded on the company's industry and location, then returns real-world market trends, regulatory changes, and competitor activity as draft text.

**Persistence:** One row per organization in `swot_analyses`. Auto-save on change.

---

## 8. Performance Dashboard (KPIs)

**Purpose:** Define, track, and govern KPIs using the Balanced Scorecard (BSC) framework.

### 8.1 BSC Perspectives

| Perspective | Description |
|---|---|
| Financial | Revenue, cost, profitability metrics |
| Customer | Satisfaction, retention, acquisition |
| Internal Processes | Operational efficiency, quality, sustainability targets |
| Learning & Growth | Training, innovation, employee development |

### 8.2 KPI Record Fields

| Field | Type | Notes |
|---|---|---|
| Name | Text | Short label |
| Description | Text | Full definition |
| Perspective | Enum | BSC quadrant |
| Frequency | Enum | Monthly / Quarterly / Annually |
| Unit | Text | %, THB, #, tCO2e, etc. |
| Target value | Number | |
| Current value | Number | Used to compute % progress |
| Linked KPI IDs | Array | Causal links to other KPIs |
| RACI | Object | Responsible, Accountable, Consulted, Informed |
| History | Array | `{ date, value }` entries for trend lines |

### 8.3 AI KPI Suggestion

The system can suggest a set of KPIs based on the company description and the material topics identified in the assessment. The user selects which suggestions to accept.

### 8.4 Visualization

- Progress bars showing current vs. target for each KPI
- Trend line chart (historical values) per KPI
- Filter by perspective, frequency, or ownership

**Persistence:** Many rows per organization in `kpis`. Explicit save (no auto-save).

---

## 9. Action Plan (Task Management)

**Purpose:** Bridge the gap between strategy and execution. Convert material topics and underperforming KPIs into actionable tasks.

**Features:**
- **AI Task Generation**: The system evaluates material topics, low-scoring KPIs, and SWOT weaknesses, suggesting tasks categorized by action type (Fix, Comply, Improve).
- **Task Lifecycle**: Tasks can be assigned (RACI integration), given priority and status (To Do, In Progress, Review, Done).
- **Linkage**: Tasks maintain a direct link to their source (e.g., specific KPI item or DMA topic), allowing users to navigate straight to the root context.
- **Excel Export/Import**: Users can export the action plan to `.xlsx` for offline sharing or bulk editing.

**Persistence:** Many rows per organization in `tasks`. Explicit save.

---

## 10. Carbon Quest (Carbon Accounting)

**Purpose:** Dedicated workflow to estimate, measure, and track the organization's carbon footprint (Scopes 1, 2, and 3).

**Features:**
- **Wizard**: A guided setup helping users identify what emission sources apply to them based on industry and operations.
- **Dashboard**: Summarizes emissions across scopes, rendering breakdown charts and identifying emission hotspots.

---

## 11. Data Completeness Dashboard

**Purpose:** Provide a single-screen progress indicator showing how complete each section of the workflow is.

Completeness is calculated per section:
- Company Profile: % of required fields filled
- Business Model Canvas: % of blocks with content
- Assessments: number of topics assessed / 10
- SWOT: % of four quadrants filled
- KPIs: number of KPIs defined

A visual indicator (e.g., progress ring or checklist) gives the user a clear at-a-glance view of what remains before generating the Sustainability Statement.

---

## 12. Sustainability Statement

**Purpose:** Generate a draft report compliant with ESRS 2 (General Disclosures) and the applicable topical standards for all material topics.

### 12.1 Generation

Triggered by a single button. The system:
1. Collects company profile, canvas, SWOT, all material assessments, and KPIs
2. Sends a structured prompt to the Gemini API via `/.netlify/functions/api`
3. Returns a formatted narrative document organized by ESRS section

### 12.2 Document Structure

The generated statement includes:

- **ESRS 2 — General Disclosures:** Company overview, governance structure, strategy, double materiality process description
- **Topical disclosures:** One section per material topic (E1–G1), covering IRO descriptions and relevant data points
- **GRI Content Index:** A cross-reference table mapping each ESRS topic to the corresponding GRI standards

### 12.3 GRI Mapping

| ESRS Topic | GRI Standards |
|---|---|
| E1 Climate Change | GRI 305, GRI 302, GRI 201-2 |
| E2 Pollution | GRI 305-6, GRI 305-7 |
| E3 Water | GRI 303 |
| E4 Biodiversity | GRI 304 |
| E5 Resource Use | GRI 301, GRI 306 |
| S1 Own Workforce | GRI 401, GRI 403, GRI 404 |
| S2 Value Chain Workers | GRI 414 |
| S3 Communities | GRI 413 |
| S4 Consumers | GRI 416 |
| G1 Business Conduct | GRI 205, GRI 206 |

### 12.4 Export

The statement can be exported to PDF from the browser's print dialog. The UI renders a clean, print-optimized layout.

---

## 13. AI Usage Panel

**Purpose:** Provide transparency on AI consumption to org Owners and Admins.

Displays:
- Token usage per call (input + output)
- Model used
- Feature / action type
- Timestamp
- Running total for the current billing period

Data sourced from `ai_usage_log` table, which is populated by `api.ts` on every Gemini call.

---

## 14. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| Multi-tenancy | Complete data isolation between organizations via Postgres RLS |
| Data persistence | All user data persisted to Supabase; no client-only state |
| Auto-save | Singleton tables (profile, canvas, SWOT) auto-save on change |
| Responsive | Designed for desktop (1280px+) and tablet (768px+); mobile sidebar collapses |
| Dark mode | User preference stored in `localStorage` (per-device) |
| AI availability | AI features are optional — all manual entry paths are available without AI |
| Accessibility | Standard HTML semantics; keyboard navigation supported |
