import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompanyContext,
  buildStructuredContextBlock,
  normalizeStructuredContext,
} from "../../netlify/functions/_shared/companyContext.js";

const profile = {
  name: "Acme", industry: "Sustainability software", isicCode: "6201",
  employeeCount: "Micro", revenueRange: "Pre-revenue",
  description: "Reporting software for SMEs.",
  mission: "m", vision: "v", productsServices: "p",
};

const item = (category, name, role, status = "current") => ({
  id: `${category}-${name}`, category, name, role, status, source: "user",
  updatedAt: "2026-09-06T00:00:00.000Z",
});

test("a profile without structured context renders exactly as before", () => {
  const legacy = buildCompanyContext(profile);

  assert.match(legacy, /Company: Acme/);
  assert.doesNotMatch(legacy, /COMPANY FACTUAL CONTEXT/);
  assert.equal(buildCompanyContext({ ...profile, structuredContext: [] }), legacy);
  // Older rows arrive as null or undefined and must not break the prompt.
  assert.equal(buildCompanyContext({ ...profile, structuredContext: null }), legacy);
});

test("stated facts reach the model grouped, with status attached", () => {
  const rendered = buildCompanyContext({
    ...profile,
    structuredContext: [
      item("technology", "Netlify", "Application hosting"),
      item("ecosystem", "Sustainability consultants", "Referral channel", "exploring"),
      item("standards", "GRI", "Framework supported"),
    ],
  });

  assert.match(rendered, /COMPANY FACTUAL CONTEXT/);
  assert.match(rendered, /Technology\n- Netlify: Application hosting \[Current\]/);
  assert.match(rendered, /Ecosystem\n- Sustainability consultants: Referral channel \[Exploring\]/);
  assert.match(rendered, /Standards\n- GRI: Framework supported \[Current\]/);
});

test("a referenced standard never appears as an ecosystem relationship", () => {
  const rendered = buildCompanyContext({
    ...profile,
    structuredContext: [item("standards", "GRI", "Framework supported")],
  });

  const ecosystem = rendered.split("Ecosystem")[1];
  assert.equal(ecosystem, undefined, "no Ecosystem section should exist");
  assert.match(rendered, /Standards/);
});

test("empty categories are omitted so there is no gap inviting invention", () => {
  const rendered = buildStructuredContextBlock([item("technology", "Supabase", "Database")]);

  assert.match(rendered, /Technology/);
  for (const absent of ["Business", "Operating Model", "Commercial", "Ecosystem", "Standards"]) {
    assert.doesNotMatch(rendered, new RegExp(`\\n${absent}\\n`), absent);
  }
});

test("the context states that absence means unknown and plans are not facts", () => {
  const rendered = buildStructuredContextBlock([item("commercial", "Subscription", "How customers pay", "planned")]);

  assert.match(rendered, /Anything absent is unknown and/);
  assert.match(rendered, /must not be inferred/);
  assert.match(rendered, /Planned, Exploring or Not established are\nnot current facts/);
  assert.match(rendered, /- Subscription: How customers pay \[Planned\]/);
});

test("malformed items are dropped, never repaired into facts", () => {
  const normalized = normalizeStructuredContext([
    item("technology", "Netlify", "Hosting"),
    { category: "technology" },                                        // no name
    { category: "not-a-category", name: "X", status: "current", source: "user" },
    { category: "ecosystem", name: "Y", status: "maybe", source: "user" },
    { category: "ecosystem", name: "Z", status: "current", source: "hearsay" },
    "nonsense",
  ]);

  assert.deepEqual(normalized.map(i => i.name), ["Netlify"]);
  assert.deepEqual(normalizeStructuredContext(null), []);
  assert.deepEqual(normalizeStructuredContext({ category: "technology" }), []);
});

// ── Requested grounding guarantees ──────────────────────────────────────────

test("a Planned item never reaches the model without its label", () => {
  const rendered = buildStructuredContextBlock([
    item("commercial", "SaaS subscription", "How customers will pay", "planned"),
    item("ecosystem", "Reseller agreement", "", "planned"),
  ]);

  // Both forms carry the label, including the one with no role — the label
  // must not depend on other fields being filled in.
  assert.match(rendered, /- SaaS subscription: How customers will pay \[Planned\]/);
  assert.match(rendered, /- Reseller agreement \[Planned\]/);

  // Nothing may reach the model as a bare item: every rendered entry ends in a
  // status label, so a plan can never read as something already true.
  const entries = rendered.split("\n").filter(line => line.startsWith("- "));
  assert.equal(entries.length, 2);
  for (const entry of entries) {
    assert.match(entry, /\[(Current|Planned|Exploring|Not established)\]$/, entry);
  }
  assert.doesNotMatch(rendered, /- SaaS subscription: How customers will pay$/m);
});

test("a Not established item renders as an explicit negative fact", () => {
  const rendered = buildStructuredContextBlock([
    item("operating", "Dedicated sales team", "No one does this yet", "not_established"),
  ]);

  assert.match(rendered, /- Dedicated sales team: No one does this yet \[Not established\]/);

  // It must be stated, not omitted: "we do not have this" is information the
  // model needs, and silence would invite it to assume the opposite.
  assert.match(rendered, /Dedicated sales team/);

  // And it must not be mistakable for something the company has.
  assert.doesNotMatch(rendered, /Dedicated sales team[^\n]*\[Current\]/);
  assert.match(rendered, /Not established are\nnot current facts/);
});

test("malformed category, status or source is dropped deterministically", () => {
  const good = item("technology", "Netlify", "Application hosting");
  const cases = [
    { label: "unknown category", raw: { ...good, category: "infrastructure" } },
    { label: "unknown status", raw: { ...good, status: "maybe" } },
    { label: "unknown source", raw: { ...good, source: "hearsay" } },
    { label: "empty status", raw: { ...good, status: "" } },
    { label: "missing status", raw: { ...good, status: undefined } },
    { label: "missing source", raw: { ...good, source: undefined } },
    { label: "status wrong type", raw: { ...good, status: 3 } },
    { label: "cased status", raw: { ...good, status: "Current" } },
  ];

  for (const { label, raw } of cases) {
    const out = normalizeStructuredContext([raw]);
    assert.deepEqual(out, [], `${label} must be dropped, not repaired`);

    // Specifically: never silently promoted to a present fact.
    assert.equal(out.some(i => i.status === "current"), false, label);
  }

  // Deterministic: identical input yields identical output every time, and a
  // bad item never contaminates a good one beside it.
  const mixed = [good, { ...good, name: "Ghost", status: "maybe" }];
  const first = normalizeStructuredContext(mixed);
  assert.deepEqual(first, normalizeStructuredContext(mixed));
  assert.deepEqual(first.map(i => i.name), ["Netlify"]);
  assert.doesNotMatch(buildStructuredContextBlock(mixed), /Ghost/);
});
