<!-- Version: 1.1.0 - Last updated: 2026-08-18 -->

# Known Issues - Security Review

This register records confirmed application-security findings and dependency risks for Aeternum Ally. The baseline review was performed on 2026-05-11; remediation status was reconciled with deployed `main`, GitHub issues, merged pull requests, Supabase migrations, and security regression tests on 2026-08-18.

## How to use this file

1. Start with the status table to see what still needs action.
2. Follow the linked GitHub issue for ownership and the pull request for implementation details.
3. Before closing a finding, run the named regression test, `npm run test:security`, `npx tsc --noEmit`, and `npm run build`.
4. For database changes, apply the listed migration to every Supabase environment before publishing dependent code.
5. Change a finding to `Closed` only after preview testing, merge, and published-deploy verification. Use `Needs manual verification` when runtime or provider behavior cannot be proven from code alone.

Status meanings:

| Status | Meaning |
|---|---|
| Open | Confirmed risk with remediation still required |
| Deferred | Confirmed risk accepted temporarily with compensating controls |
| In progress | A remediation branch or pull request is active |
| Needs manual verification | Code evidence is incomplete or a provider/runtime check is required |
| Closed | Fix merged, tested, and verified in a published deployment |

## Current status

| Severity | Finding | Status | Tracking | Remediation |
|---|---|---|---|---|
| Critical | Background AI functions accepted unauthenticated requests | Closed | [#153](https://github.com/narapat/Aeternum-Ally/issues/153) | [#158](https://github.com/narapat/Aeternum-Ally/pull/158) |
| Critical | Admin magic-link endpoint could expose a development link | Closed | [#154](https://github.com/narapat/Aeternum-Ally/issues/154) | [#159](https://github.com/narapat/Aeternum-Ally/pull/159) |
| High | Organization BYOK credential was browser-readable | Closed | [#155](https://github.com/narapat/Aeternum-Ally/issues/155) | [#161](https://github.com/narapat/Aeternum-Ally/pull/161), [#162](https://github.com/narapat/Aeternum-Ally/pull/162) |
| High | Google Drive OAuth tokens could be returned to organization members | Closed | [#156](https://github.com/narapat/Aeternum-Ally/issues/156) | [#163](https://github.com/narapat/Aeternum-Ally/pull/163) |
| High | Vulnerable direct `xlsx` runtime parser | Closed | [#151](https://github.com/narapat/Aeternum-Ally/issues/151) | [#164](https://github.com/narapat/Aeternum-Ally/pull/164) |
| Medium | Unsafe evidence URLs could be stored or opened | Closed | [#157](https://github.com/narapat/Aeternum-Ally/issues/157) | [#166](https://github.com/narapat/Aeternum-Ally/pull/166) |
| Medium | Public invite resend endpoint lacked abuse controls | Closed | [#167](https://github.com/narapat/Aeternum-Ally/issues/167) | [#168](https://github.com/narapat/Aeternum-Ally/pull/168) |
| High | Ally support route lacked authentication and tenant verification | Closed | [#169](https://github.com/narapat/Aeternum-Ally/issues/169) | [#170](https://github.com/narapat/Aeternum-Ally/pull/170) |
| High | Client error logging allowed cross-tenant log poisoning | Closed | [#171](https://github.com/narapat/Aeternum-Ally/issues/171) | [#172](https://github.com/narapat/Aeternum-Ally/pull/172) |
| Medium | AI handlers logged tenant-generated content | Closed | [#173](https://github.com/narapat/Aeternum-Ally/issues/173) | [#174](https://github.com/narapat/Aeternum-Ally/pull/174) |
| High | Unpatched `extract-zip` in Netlify development tooling | Deferred | [#152](https://github.com/narapat/Aeternum-Ally/issues/152) | [#165](https://github.com/narapat/Aeternum-Ally/pull/165) reduced exposure |

## Closed findings

### 1. Background AI functions accepted unauthenticated requests

- **Severity:** Critical
- **Location:** `netlify/functions/report-background.ts`, `dma-background.ts`, `assessment-background.ts`; dispatch from `netlify/functions/api.ts`
- **Evidence from code:** The historical handlers accepted caller-supplied job and organization payloads without authenticating the caller. The current handlers call `requireInternalJobAuth()` before parsing the body, and `api.ts` supplies `X-Internal-Job-Secret` from `INTERNAL_JOB_SECRET`.
- **Why this was risky:** An Internet caller could trigger privileged AI work, consume paid AI capacity, or attempt to corrupt another tenant's job/report state.
- **Exploit scenario:** An attacker posts a guessed job ID and organization ID directly to a background function and causes work to run outside the authenticated API path.
- **Recommended fix:** Authenticate internal dispatch, fail closed when the secret is missing, use a trusted deployment URL, and keep tenant/job validation in the worker.
- **Minimal patch suggestion:** Shared constant-time internal-secret validation plus authenticated headers from `api.ts` to all three workers.
- **Test case:** `tests/security/background-job-auth.test.mjs` rejects missing/invalid credentials before body parsing and accepts only the configured secret.
- **Resolution:** Migration-free code fix merged in PR #158 and verified after publish.

### 2. Admin magic-link endpoint could expose a development link

- **Severity:** Critical
- **Location:** `netlify/functions/admin-magic-link.ts`, `netlify/functions/_shared/adminMagicLinkSecurity.js`
- **Evidence from code:** The historical failure path could return `dev_link`. The current implementation returns a link only when `ALLOW_DEV_ADMIN_MAGIC_LINKS=true`, Netlify Dev is detected, and the request host is loopback; production requires configured, successful email delivery.
- **Why this was risky:** Anyone who knew an active platform-admin email could receive a platform-level login URL if production was misconfigured or email delivery failed.
- **Exploit scenario:** An attacker requests a magic link for a known administrator while the email provider is unavailable and reads the returned link from the API response.
- **Recommended fix:** Fail closed in production, use generic responses for unknown admins, and rate-limit the route.
- **Minimal patch suggestion:** Centralize environment checks and prohibit `dev_link` unless every explicit local-development condition is true.
- **Test case:** `tests/security/admin-magic-link-security.test.mjs` covers production failure, local-only link return, generic responses, method/origin/content-type checks, and rate-limit configuration.
- **Resolution:** PR #159 merged and verified after publish.

### 3. Organization BYOK credential was browser-readable

- **Severity:** High
- **Location:** Historical `organization_ai_settings.byok_api_key` RLS; current `organization_ai_secrets`, `netlify/functions/byok-settings.ts`, migrations `020` and `021`
- **Evidence from code:** Members could historically select `organization_ai_settings`, including the raw key. Migration `020_expand_organization_ai_secrets.sql` moved credentials to a service-role-only table; migration `021_contract_legacy_byok_key.sql` removed the legacy column.
- **Why this was risky:** Any organization member with browser access could extract the customer's external AI credential and use it outside the application.
- **Exploit scenario:** A Consultant queries Supabase REST directly and reuses the organization's Gemini key for unrelated workloads.
- **Recommended fix:** Store secrets in a table with no browser grants or RLS policies and expose only safe configuration metadata through an authenticated server endpoint.
- **Minimal patch suggestion:** Add `organization_ai_secrets`, revoke `anon`/`authenticated`, migrate keys, drop the browser-readable column, and return only `has_byok_key`.
- **Test case:** `tests/security/byok-secret-isolation.test.mjs` verifies grants, migration safety, role checks, tenant checks, response redaction, and credential rotation behavior.
- **Resolution:** PRs #161 and #162 plus migrations `020` and `021`; deployed and verified.

### 4. Google Drive OAuth tokens could be returned to organization members

- **Severity:** High
- **Location:** `netlify/functions/google-drive.ts`, `google-callback.ts`, `organization_integrations`, migration `022_google_drive_token_isolation.sql`
- **Evidence from code:** The historical token action returned a raw access token. The current endpoint performs Drive operations server-side, returns reduced file metadata only, and migration `022` revokes browser access to integration token rows.
- **Why this was risky:** A member could replay the token against Google APIs and access data beyond the application's intended file-selection workflow.
- **Exploit scenario:** A Manager copies the OAuth token from the API response and lists or downloads Drive files using an external client.
- **Recommended fix:** Keep access and refresh tokens service-role-only; proxy fixed, allowlisted Drive operations; authorize connection management by organization role.
- **Minimal patch suggestion:** Remove token response actions, add authenticated status/list/connect/disconnect operations, and restrict Owner/Admin to connection management while allowing members to select evidence files.
- **Test case:** `tests/security/google-drive-token-isolation.test.mjs` checks tenant membership, role behavior, OAuth state hashing, fixed Google origins, bounded search, and absence of tokens in every response.
- **Resolution:** PR #163 and migration `022`; multi-role and cross-Google-domain behavior verified after publish.

### 5. Vulnerable direct `xlsx` runtime parser

- **Severity:** High
- **Location:** Historical `xlsx` dependency and spreadsheet import paths in Carbon Dashboard and Task Management; current `services/spreadsheetService.ts`, `services/spreadsheetPolicy.ts`, and `services/spreadsheetImport.worker.ts`
- **Evidence from code:** Dependabot alerts #59 and #60 affected the direct SheetJS runtime dependency, which parsed uploaded workbooks. PR #164 removed `xlsx`, replaced it with `read-excel-file`, `write-excel-file`, and `papaparse`, and moved XLSX parsing into a bounded Web Worker.
- **Why this was risky:** Crafted workbooks could trigger prototype pollution, excessive CPU use, browser hangs, or unsafe object construction in a customer session.
- **Exploit scenario:** A user imports a malicious workbook that blocks the UI or mutates inherited properties before imported rows are written.
- **Recommended fix:** Remove the unpatched parser, validate content rather than extension alone, bound all parser inputs, isolate parsing, and reject prototype-sensitive headers.
- **Minimal patch suggestion:** Enforce 2 MB, 2-sheet, 1,000-row, 50-column, 10,000-character-cell, and 8-second limits before database writes.
- **Test case:** `tests/security/spreadsheet-import-security.test.mjs` covers oversized, malformed, disguised, structurally excessive, duplicate-header, and prototype-sensitive inputs.
- **Resolution:** Issue #151 closed by PR #164; valid, invalid-format, oversized, renamed-PDF, Carbon, and Task import flows were manually verified.

### 6. Unsafe evidence URLs could be stored or opened

- **Severity:** Medium
- **Location:** `services/evidenceUrlSecurity.ts`, `services/evidenceService.ts`, `components/EvidenceBadge.tsx`, migration `023_validate_evidence_external_urls.sql`
- **Evidence from code:** Historical evidence records accepted arbitrary external URL strings. The shared validator now requires public HTTPS URLs, rejects credentials/local networks/unsafe schemes, applies provider hostname allowlists, and the database adds a matching check constraint.
- **Why this was risky:** Malicious links could execute browser schemes, leak information through tracking destinations, impersonate trusted cloud providers, or target local network resources.
- **Exploit scenario:** A tenant member saves a `javascript:` URL or a lookalike `drive.google.com.attacker.example` destination and another member opens it as evidence.
- **Recommended fix:** Canonicalize and validate before save and render, enforce provider hosts, block automatic preview for generic URLs, and add a database constraint.
- **Minimal patch suggestion:** One shared URL policy used by service and renderer plus migration `023` as defense in depth.
- **Test case:** `tests/security/evidence-url-security.test.mjs` covers schemes, credentials, local/private targets, encoded hostname bypasses, provider suffix bypasses, length, rendering, and migration policy.
- **Resolution:** PR #166 and migration `023`; deployed and verified.

### 7. Public invite resend endpoint lacked abuse controls

- **Severity:** Medium
- **Location:** `netlify/functions/invite.ts`, `_shared/inviteResendSecurity.js`, migration `024_rate_limit_invite_resends.sql`
- **Evidence from code:** `request_resend` is intentionally unauthenticated and historically had no request or delivery limit. It now returns one generic response, HMACs the client IP, atomically limits a client to 10 requests per 60 seconds, and enforces a five-minute email cooldown.
- **Why this was risky:** Attackers could consume transactional email quota, create operational noise, and use response differences to enumerate pending invitations.
- **Exploit scenario:** A script repeatedly submits a target email to exhaust Supabase or SMTP delivery capacity.
- **Recommended fix:** Keep the endpoint enumeration-resistant, centrally rate-limit across function instances, and claim delivery atomically.
- **Minimal patch suggestion:** Add a service-role-only rate-limit table/RPC and schedule email delivery only after an eligible invite is claimed.
- **Test case:** `tests/security/invite-resend-rate-limit.test.mjs` validates email bounds, HMAC identifiers, fail-closed behavior, generic responses, atomic SQL, cooldown, and method guards.
- **Resolution:** PR #168 and migration `024`; deployed and verified.

### 8. Ally support route lacked authentication and tenant verification

- **Severity:** High
- **Location:** `netlify/functions/ally-support.ts`, `_shared/allySupportSecurity.js`, client Ally service
- **Evidence from code:** The historical route trusted organization/user fields in the request. It now verifies the Bearer JWT, confirms membership in the supplied organization, derives identity from the verified session, bounds conversation input, and escapes support-email content.
- **Why this was risky:** An unauthenticated caller could consume AI capacity, spoof another tenant, poison tenant conversation storage, or inject content into support email.
- **Exploit scenario:** An attacker posts another organization's ID and a forged Owner identity to store or generate support content under that tenant.
- **Recommended fix:** Authenticate before parsing expensive input, enforce membership before all side effects, ignore caller-supplied identity, and validate/escape bounded content.
- **Minimal patch suggestion:** Shared parser plus server-derived user and organization context before AI, Blob, database, or email operations.
- **Test case:** `tests/security/ally-support-auth.test.mjs` covers missing/expired sessions, outsider access, tenant spoofing, size limits, Blob isolation, and HTML escaping.
- **Resolution:** PR #170; deployed and verified.

### 9. Client error logging allowed cross-tenant log poisoning

- **Severity:** High
- **Location:** `error_log` RLS in `supabase/schema.sql`; migration `025_secure_error_log_inserts.sql`; `services/errorLogService.ts`
- **Evidence from code:** The historical insert policy allowed untrusted client values without tying `user_id` and `organization_id` to the authenticated caller. The current policy requires `authenticated`, `user_id = auth.uid()`, `source = 'client'`, and membership when an organization is present; anonymous inserts are revoked.
- **Why this was risky:** A user could forge security telemetry attributed to another tenant or user, undermining incident response and administrative trust.
- **Exploit scenario:** A malicious member inserts false error records using a victim organization's ID and misleading metadata.
- **Recommended fix:** Bind identity in RLS, require tenant membership, constrain source, and let service-role functions write server events separately.
- **Minimal patch suggestion:** Replace the insert policy and explicitly revoke `PUBLIC` and `anon` grants.
- **Test case:** `tests/security/error-log-rls.test.mjs` verifies authenticated-only grants, user binding, source binding, and tenant membership checks.
- **Resolution:** PR #172 and migration `025`; deployed and verified.

### 10. AI handlers logged tenant-generated content

- **Severity:** Medium
- **Location:** `netlify/functions/api.ts`, `assessment-background.ts`, `dma-background.ts`, `report-background.ts`
- **Evidence from code:** Historical diagnostic logs included raw AI responses, tails, snippets, and parse-failure content. Current logging records only bounded metadata such as character counts, action, status, and timing.
- **Why this was risky:** AI output can contain company profiles, assessments, materiality analysis, report text, or personal information; provider/runtime logs may have broader access and longer retention than tenant data.
- **Exploit scenario:** An operator or compromised logging integration reads customer report content that should only exist in tenant-authorized storage.
- **Recommended fix:** Never log prompts, raw outputs, snippets, tokens, or secrets; log structured metadata and stable error categories only.
- **Minimal patch suggestion:** Remove content-bearing fields and replace them with lengths and non-sensitive diagnostics.
- **Test case:** `tests/security/ai-log-redaction.test.mjs` scans every AI handler for prohibited raw-response logging and expected safe metadata.
- **Resolution:** PR #174; tested, merged, and verified in the published deployment.

## Deferred finding

### 11. Unpatched `extract-zip` in Netlify development tooling

- **Severity:** High (upstream advisory); reduced application exposure
- **Location:** Transitive development path `netlify-cli -> @netlify/functions-dev -> extract-zip@2.0.1`
- **Evidence from code:** `npm audit --omit=dev` reports zero production vulnerabilities. The application does not import `extract-zip`, direct `@netlify/functions` no longer depends on it, and the remaining package is used by Netlify local tooling. Dependabot still reports one open High development/transitive alert with no patched release.
- **Why this is risky:** If an untrusted function archive reaches the affected Netlify Dev extraction path, symlink path traversal could write outside the intended extraction directory.
- **Exploit scenario:** A developer runs local Netlify tooling against a malicious ZIP-based function artifact supplied from an untrusted source.
- **Recommended fix:** Upgrade when Netlify removes or patches the dependency. Until then, do not process untrusted ZIP function bundles and keep CI/development workspaces isolated.
- **Minimal patch suggestion:** No safe package override exists today. Continue pinning the supported Netlify dependency tree and fail regression tests if the dependency becomes production-reachable or a patched release becomes available.
- **Test case:** `tests/security/netlify-tooling-dependencies.test.mjs` verifies the dependency is development-only, absent from direct runtime paths, and that previously vulnerable image/tooling packages remain patched.
- **Status:** Deferred under issue #152. Recheck after Netlify CLI or `@netlify/functions-dev` releases. **Needs manual verification** of the upstream fix before closing.

## Verification baseline

Run before changing any status:

```bash
npm ci
npm run test:security
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

For a deployment that includes migrations, also confirm migrations `020` through `025` have been applied to each Supabase environment and repeat the affected role/tenant flow in the deploy preview before publishing.
