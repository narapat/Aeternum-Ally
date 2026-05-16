<!-- Version: 1.0.0 — Last updated: 2026-05-01 -->

# API Reference — Netlify Functions

AeternumAlly exposes three serverless HTTP endpoints. They are not a public API — they are internal to the application — but this document describes them precisely for contributors, integrators, and self-hosters who need to understand or extend them.

All endpoints are at `/.netlify/functions/<name>` relative to the deployment base URL.

---

## Common conventions

### Authentication

All endpoints (except `invite` with `action: "request_resend"`) require a valid Supabase JWT in the `Authorization` header:

```
Authorization: Bearer <supabase_access_token>
```

The token is obtained from `supabase.auth.getSession()` on the client.

### Request format

All endpoints accept `POST` only (except where noted). Request body must be `application/json`.

### Response format

All responses are `application/json`.

Success responses return HTTP 2xx with a JSON body. Error responses return HTTP 4xx or 5xx with:

```json
{ "error": "Human-readable error message" }
```

---

## 1. `POST /.netlify/functions/api`

Proxies all AI (Google Gemini) calls. Validates the caller's JWT, checks org membership, calls Gemini, and logs token usage.

### Request body

```json
{
  "action": "<action_name>",
  "organization_id": "<org_uuid>",
  ...action-specific parameters
}
```

### Actions

#### `generateAssessmentSuggestions`

Generate draft IRO descriptions and scoring hints for a given ESRS topic.

**Additional parameters:**

| Field | Type | Description |
|---|---|---|
| `companyDescription` | string | The company's general description from the Company Profile |
| `topic` | string | ESRS topic label (e.g. `"E1 Climate Change"`) |

**Response:**

```json
{
  "impactSuggestion": "string — draft impact description (inside-out)",
  "financialSuggestion": "string — draft risk/opportunity description (outside-in)"
}
```

---

#### `generateCanvasSuggestion`

Generate draft content for one block of the Business Model Canvas.

**Additional parameters:**

| Field | Type | Description |
|---|---|---|
| `companyName` | string | Company name from the profile |
| `companyDescription` | string | General description from the profile |
| `fieldLabel` | string | The canvas block name (e.g. `"Value Proposition"`, `"Eco-Social Costs"`) |

**Response:**

```json
"Plain text string — bulleted draft content for the block"
```

---

#### `generateSwotInternal`

Generate Strengths and Weaknesses based on the Business Model Canvas data.

**Additional parameters:**

| Field | Type | Description |
|---|---|---|
| `companyName` | string | Company name |
| `bmcData` | object | `SustainabilityBusinessModel` object (all 11 canvas fields) |

**Response:**

```json
{
  "strengths": "string — bulleted list",
  "weaknesses": "string — bulleted list"
}
```

---

#### `generateSwotExternal`

Generate Opportunities and Threats using Google Search grounding for live market and regulatory data.

**Additional parameters:**

| Field | Type | Description |
|---|---|---|
| `companyName` | string | Company name |
| `industry` | string | Industry sector from the profile |
| `companyDescription` | string | General description |

**Response:**

```json
{
  "opportunities": "string — bulleted list with grounded sources",
  "threats": "string — bulleted list with grounded sources"
}
```

---

#### `generateKPISuggestions`

Suggest a set of KPIs based on the company profile and material ESRS topics.

**Additional parameters:**

| Field | Type | Description |
|---|---|---|
| `companyDescription` | string | General description |
| `materialTopics` | string[] | Array of material ESRS topic labels |

**Response:**

```json
[
  {
    "name": "string",
    "description": "string",
    "perspective": "Financial | Customer | Internal Processes | Learning & Growth",
    "unit": "string",
    "frequency": "Monthly | Quarterly | Annually",
    "targetValue": number
  }
]
```

---

#### `generateSustainabilityStatement`

Generate a full draft Sustainability Statement from all org data.

**Additional parameters:**

| Field | Type | Description |
|---|---|---|
| `profile` | object | `CompanyProfile` |
| `canvas` | object | `SustainabilityBusinessModel` |
| `swot` | object | `SwotAnalysis` |
| `assessments` | object[] | Array of `AssessmentData` (material topics only) |
| `kpis` | object[] | Array of `KPI` |

**Response:**

```json
{
  "statement": "string — full Markdown-formatted Sustainability Statement"
}
```

### Error responses

| Status | Meaning |
|---|---|
| 400 | Missing `action` or `organization_id`, or malformed body |
| 401 | Missing or invalid JWT; caller is not a member of the org |
| 500 | Gemini API error or unexpected server error |
| 503 | `GEMINI_API_KEY` or Supabase credentials not configured |

---

## 2. `POST /.netlify/functions/invite`

Manages organization invitations. The `action` field in the body selects the operation.

### Actions

#### `invite` — Send an invitation

**Auth required:** Yes. Caller must be `Owner` or `Admin`.

**Body:**

```json
{
  "action": "invite",
  "organization_id": "<org_uuid>",
  "email": "invitee@example.com",
  "role": "Admin | Manager | Consultant"
}
```

**Response (success):**

```json
{ "invite_id": "<uuid>", "link": null }
```

`link` is non-null only as a last resort if email delivery fails — it is a copy-able invite URL for manual sharing.

**Errors:** 400 (missing fields or invalid role), 401 (not authenticated or insufficient role), 500 (DB or email error).

---

#### `list` — List pending invitations

**Auth required:** Yes. Any org member.

**Body:**

```json
{
  "action": "list",
  "organization_id": "<org_uuid>"
}
```

**Response:**

```json
[
  {
    "id": "<uuid>",
    "email": "invitee@example.com",
    "role": "Manager",
    "expires_at": "2026-05-08T12:00:00Z",
    "created_at": "2026-05-01T12:00:00Z"
  }
]
```

---

#### `resend` — Resend an existing invitation

**Auth required:** Yes. Caller must be `Owner` or `Admin`.

**Body:**

```json
{
  "action": "resend",
  "organization_id": "<org_uuid>",
  "invite_id": "<uuid>"
}
```

**Response:** `{ "ok": true }`

---

#### `cancel` — Cancel a pending invitation

**Auth required:** Yes. Caller must be `Owner` or `Admin`.

**Body:**

```json
{
  "action": "cancel",
  "organization_id": "<org_uuid>",
  "invite_id": "<uuid>"
}
```

**Response:** `{ "ok": true }`

---

#### `request_resend` — Self-service resend for expired links

**Auth required:** No. Intentionally unauthenticated so users with expired links can request a fresh one from the sign-in screen.

**Body:**

```json
{
  "action": "request_resend",
  "email": "invitee@example.com"
}
```

**Response:** Always `{ "ok": true }` (regardless of whether the email exists — prevents email enumeration).

> **Security note:** This endpoint has no rate limit in the current build. See [docs/TECH_STACK.md](./TECH_STACK.md#known-gaps--hardening-backlog) for the planned mitigation.

---

## 3. `POST /.netlify/functions/accept-invite`

Validates an invite token and adds the authenticated user to the organization.

**Auth required:** Yes. The caller must be signed in (they have authenticated via the magic-link from the invite email).

### Request body

```json
{
  "invite_token": "<uuid — the invite row ID>"
}
```

### Response

```json
{
  "organization_id": "<uuid>",
  "company_name": "ACME Corp"
}
```

The `company_name` is used to display a welcome message after joining.

### Error responses

| Status | Meaning |
|---|---|
| 400 | Missing `invite_token` |
| 401 | Missing or invalid JWT |
| 404 | Token not found or already used |
| 410 | Token expired |
| 409 | User is already a member of this organization |
| 503 | Supabase credentials not configured |

---

## Client-side usage

The browser never calls these endpoints directly with fetch. All calls go through the helpers in `services/geminiService.ts` (for `api`) and the team management UI (for `invite` / `accept-invite`). Those helpers:

1. Retrieve the Supabase access token from the current session
2. Set the `Authorization: Bearer <token>` header
3. Include the `organization_id` from the `useOrganization` hook context
4. Handle and surface errors to the UI
