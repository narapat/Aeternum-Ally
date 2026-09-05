<!-- Version: 1.0.0 — Last updated: 2026-09-05 -->

# Roadmap

What is planned, what is deliberately not planned, and why. `CONTRIBUTING.md`
points contributors here before they pick up work.

This file states intent. It is not a commitment to dates. Confirmed security
findings are tracked separately in
[`Docs v1.1.0/known issue - security review.md`](./Docs%20v1.1.0/known%20issue%20-%20security%20review.md);
shipped work is in [`CHANGELOG.md`](./CHANGELOG.md).

---

## Where the product stands

Phase 1 (v1.0.0) delivered the core reporting workflow. Phase 2 delivered the
DMA Insight Hub, Task Management, Carbon Accounting, and the Evidence Vault —
the planning package is archived under
`Archived/docs/phase-2-planning-2026-05/`. An unplanned platform-admin console,
the Ally support assistant, the Start Here onboarding paths, and the Company
Strategic Report were added alongside them.

The August 2026 security cycle closed ten findings, each with a named
regression test.

So the product surface is broad. What is thin is everything that turns that
surface into a business: the commercial loop is not closed, correctness of the
generated numbers is not covered by tests, and the output is not yet something
an assurance provider could sign.

That shapes the ordering below.

---

## Now

Closing the gap between what the product does and what it can charge for or
guarantee. Small, mostly unglamorous, all blocking.

| Item | Why it is first |
|---|---|
| **Enforce the AI ceiling** | Platform AI spend had no upper bound per tenant. Fixed; ceilings still need commercial numbers rather than placeholders. |
| **Working tier entitlements** | The evidence upload gate read a column that does not exist, so the only paid feature could not be switched on for anyone. |
| **CI on every pull request** | `AGENTS.md` mandates four verification steps before merge. Until now all four ran only if someone remembered. |
| **This file, and accurate docs** | `CONTRIBUTING.md` sent contributors to a roadmap that did not exist; `README.md` linked to a `docs/` directory that does not exist. |
| **Drop the AI Studio import map** | `index.html` still carries a scaffold import map pointing React, recharts and lucide at a third-party CDN. Inert after bundling, but it has to go before a restrictive CSP is possible. |

### Also in this bucket, not yet started

- **Set the real quota and storage numbers.** The tier limits currently in
  `_shared/aiQuota.js` and `evidence.ts` are placeholders.
- **Resolve the duplicate `008_` migration prefix.** Two files share it, while
  the documented rule is "apply in filename order". Ordering is currently
  decided by alphabetical luck.
- **Decide what to do with `notification_channels`.** The table and its
  delivery log exist in the schema with no product code behind them. Either
  build the reminder feature Phase 2 implied, or drop the tables.

---

## Next

### 1. Close the commercial loop

Tiers exist in the database and in the admin console. There is no billing, no
self-serve upgrade, and no way for an organization to move between plans
without a platform admin editing a row. The Phase 2 success metric — 18% free
to Pro conversion — cannot be measured, let alone hit, until this exists.

Deliberately staged: an admin-activated paid tier with manual invoicing is a
legitimate first version and answers the question that matters, which is
whether anyone pays at all. Self-serve checkout can follow the evidence.

### 2. Test the numbers, not just the boundaries

The security suite is strong. There is no test anywhere for the arithmetic the
product exists to produce:

- the impact score formula and the materiality threshold in `constants.ts`
- emission factor selection and Scope 1/2/3 totals
- spreadsheet import column mapping and unit conversion
- GRI ↔ ESRS index mapping

For a compliance tool the calculations *are* the product. A wrong materiality
score is a worse failure than an outage.

### 3. Trust and provenance

Before anything generated here goes in front of an auditor, a reader needs to
know where each statement came from:

- per-field provenance — AI-drafted vs. human-edited, by whom, when
- report versioning, so a published statement can be reproduced later
- evidence linked to the specific disclosure it supports, not just the topic
- a tenant-visible audit trail

This is also the most defensible thing to charge for.

### 4. Systematic AI trust boundaries

Tracked in `AGENTS.md` under known gaps. Tenant-supplied text is interpolated
into prompts whose output becomes a published compliance statement. Prompt
trust boundaries, structured output validation on every action, and an
explicit human approval step before AI text is persisted.

---

## Later

- **Assurance-ready export.** Structured/tagged output rather than
  print-to-PDF, and multi-year comparatives.
- **Build-time Tailwind and a restrictive CSP.** Blocked on removing the CDN
  script tag; tracked in `AGENTS.md` known gaps.
- **Centralized origin/CORS policy** across Netlify Functions.
- **Multi-organization membership.** `fetchMembership()` takes the first row it
  finds and there is no organization switcher, so a user belongs to exactly one
  organization in practice. The README names ESG consultants as a target user;
  a consultant with two clients cannot currently serve both from one account.
- **Internationalization.** There is no i18n layer. The Tailwind font stack
  already lists `Noto Sans Thai`, so the intent exists; the decision is whether
  the market justifies the cost before the string count grows further.

---

## Open questions

These are unresolved, and the answers change the ordering above.

**Which standard should an SME be pushed toward?** The product assumes full
ESRS topical reporting with double materiality. If most SMEs are now outside
mandatory CSRD scope and are being pulled in instead by supply-chain and bank
requests, the standard they are actually asked for may be materially lighter
than what the workflow produces. The "Stakeholder Request Readiness" path in
Start Here is the closest thing to an answer already in the product. Validate
against the current directive text before committing engineering to it.

**Is the surface already too wide for the team?** Nineteen views and
twenty-nine tables. Every new feature is a permanent maintenance obligation.
The bar for adding another one should be higher than the bar was for the last.

**What is the smallest paid thing someone would buy today?** Worth answering
before building the billing system that assumes the answer.
