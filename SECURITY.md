<!-- Version: 1.0.0 — Last updated: 2026-05-01 -->

# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| Latest `main` | Yes |
| Older tags | No — please upgrade to the latest commit on `main` |

AeternumAlly does not yet use semantic versioning. The production-ready code is always on `main`. Security fixes are applied there and deployed immediately.

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

## Known open issues

The following gaps are documented openly. They are tracked and prioritized for remediation — they are not unknown. If you are self-hosting in production, review the [production hardening checklist](./docs/DEPLOYMENT.md#production-hardening-checklist) before going live.

| Gap | Risk level | Location |
|---|---|---|
| No CORS headers on Netlify Functions | Medium | `netlify/functions/*.ts` |
| No rate limit on `request_resend` (invite) | Medium | `netlify/functions/invite.ts` |
| No server-side AI model allowlist | Low | `netlify/functions/api.ts` |
| No prompt-injection sanitisation on user input fed to Gemini | Low | `netlify/functions/api.ts` |
| Tailwind CSS loaded via CDN (no SRI hash) | Low | `index.html` |
| No HTTP-method guard on `invite.ts` | Low | `netlify/functions/invite.ts` |

Full details and planned mitigations: [docs/TECH_STACK.md — Known gaps](./docs/TECH_STACK.md#known-gaps--hardening-backlog).

---

## Security design

For a full description of the security architecture (RLS, key isolation, invite token lifecycle, tenant isolation), see [docs/ARCHITECTURE.md — Security Boundaries](./docs/ARCHITECTURE.md#5-security-boundaries).

### Key points

- The Gemini API key and Supabase service-role key never reach the browser. All privileged operations go through Netlify Functions (server-side).
- Tenant isolation is enforced by Postgres Row-Level Security, independently of application code.
- Invite tokens are UUID v4, single-use, and expire after 7 days.
- Authentication is email magic-link via Supabase Auth. No passwords are stored.
- The anon key (exposed to the browser) is safe to expose — RLS prevents it from being used to access other tenants' data.

---

## Scope

This policy covers the AeternumAlly application code in this repository. It does not cover:
- Supabase infrastructure (report to [Supabase's security team](https://supabase.com/security))
- Google Gemini API (report to Google)
- Netlify infrastructure (report to Netlify)
- Third-party npm dependencies (report to the relevant package maintainer; we also appreciate a heads-up)
