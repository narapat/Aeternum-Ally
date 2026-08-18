<!-- Version: 1.1.0 - Last updated: 2026-08-18 -->

# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| Latest `main` | Yes |
| Older tags | No - upgrade to the latest commit on `main` |

Security fixes are applied to `main` through reviewed pull requests and are published after preview verification.

---

## Reporting a vulnerability

**Please do not report security vulnerabilities via public GitHub issues.**

Instead, email us at: **security@aeternumally.com**

Include:
- A description of the vulnerability
- Steps to reproduce it (proof-of-concept code or a request/response capture is helpful)
- The potential impact
- Any suggested mitigations you have in mind

We will acknowledge receipt within **48 hours** and aim to provide an initial assessment within **5 business days**.

We ask that you give us reasonable time to investigate and patch before any public disclosure. We will coordinate with you on a disclosure timeline and credit you in the fix if you wish.

---

## Current risk status

The 2026 security-remediation program closed the confirmed background-job authentication, admin magic-link, BYOK, Google Drive token, spreadsheet parsing, evidence URL, invite resend, Ally support, error-log RLS, and AI log-content findings.

The detailed evidence, issue/PR links, patches, and regression tests are maintained in [Known Issues - Security Review](./Docs%20v1.1.0/known%20issue%20-%20security%20review.md).

### Open or deferred

| Item | Priority | Current control |
|---|---|---|
| `extract-zip` symlink traversal advisory in Netlify development tooling ([#152](https://github.com/narapat/Aeternum-Ally/issues/152)) | High upstream advisory; reduced application exposure | Development-only transitive path, no application import, zero production audit findings, dependency regression test; waiting for an upstream patch |
| Prompt-injection resilience is not systematic across all AI prompt templates | Medium hardening | AI actions require authenticated tenant membership; users review generated content before saving; raw AI content is not logged |
| Tailwind is loaded from `cdn.tailwindcss.com` at runtime | Low hardening | HTTPS only; move Tailwind to the build and enforce CSP before handling higher-sensitivity production tenants |
| Netlify functions do not yet share one centralized origin/CORS policy | Low hardening | Sensitive newer routes enforce same-origin checks; Bearer auth, role checks, RLS, and internal-job authentication remain the authorization boundaries |
| AI model validation is enforced by the database `CHECK`, but is not repeated at the function boundary | Low defense in depth | `organization_ai_settings.model` accepts only the configured Gemini model IDs |

Do not treat CORS as an authorization control. Every function must still authenticate the caller and verify organization membership/role.

---

## Security design

For a full description of the security architecture, see [Architecture - Security Boundaries](./Docs%20v1.1.0/ARCHITECTURE.md#5-security-boundaries).

### Key points

- The service-role key, Gemini key, organization BYOK keys, Google OAuth tokens, admin credentials, and internal-job secret are server-only and never use a `VITE_` prefix.
- Tenant isolation is enforced by Postgres Row-Level Security and function-level membership/role checks, independently of UI visibility.
- Background AI functions require `INTERNAL_JOB_SECRET` before request-body parsing.
- Organization BYOK credentials and Google OAuth tokens are stored in service-role-only tables; raw values are never returned to the browser.
- Invite tokens are UUID v4, single-use, and expire after 7 days.
- Public invite resends return a generic response, are rate-limited, and enforce an email cooldown.
- Spreadsheet imports are bounded and XLSX parsing runs in a Web Worker with a timeout.
- AI logs contain diagnostic metadata rather than prompts, raw responses, report snippets, OAuth tokens, or API keys.
- The anon key is intentionally public; its safety depends on RLS remaining enabled and tested on every tenant-scoped table.

## Operator responsibilities

- Apply every required Supabase migration to each environment before publishing dependent code.
- Configure server secrets in Netlify and redeploy after changes.
- Rotate exposed or suspected credentials immediately.
- Run `npm run test:security`, `npx tsc --noEmit`, `npm run build`, and `npm audit --omit=dev` before security releases.
- Review the [production hardening checklist](./Docs%20v1.1.0/DEPLOYMENT.md#production-hardening-checklist).

---

## Scope

This policy covers the Aeternum Ally application code in this repository. It does not cover:
- Supabase infrastructure (report to [Supabase's security team](https://supabase.com/security))
- Google Gemini API (report to Google)
- Netlify infrastructure (report to Netlify)
- Third-party npm dependencies (report to the relevant package maintainer; we also appreciate a heads-up)
