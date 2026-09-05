import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanvasContextBlock,
  buildCanvasSuggestionPrompt,
  buildCompanyStrategicBmcContext,
  buildCompanyStrategicReportPrompt,
  getSBMCBlockLabel,
  normalizeCanvasContext,
  parseAIJson,
  SBMC_BLOCK_DEFINITIONS,
  SBMC_BLOCKS,
} from "../../netlify/functions/api.ts";

const profile = {
  name: "TraceGrid",
  industry: "Sustainability software",
  isicCode: "6201",
  employeeCount: "Small",
  revenueRange: "USD 1M-5M",
  description: "A platform helping manufacturers trace supplier ESG evidence.",
  mission: "Make audit-ready sustainability evidence easier to manage.",
  vision: "Transparent value chains for practical sustainability decisions.",
  productsServices: "Supplier evidence workflows, ESG risk dashboards",
};

const bmcData = {
  keyPartners: ["ERP integration vendors"],
  keyActivities: ["Supplier evidence validation"],
  keyResources: ["ESG data model"],
  valueProposition: ["Audit-ready supplier ESG evidence"],
  customerRelationships: ["Implementation support for compliance teams"],
  channels: ["Direct sales to manufacturers"],
  customerSegments: ["Mid-market manufacturing compliance teams"],
  costStructure: ["Cloud hosting and AI model usage"],
  revenueStreams: ["Annual SaaS subscriptions"],
  ecoSocialCosts: ["Energy use from cloud infrastructure"],
  ecoSocialBenefits: ["Helps identify supplier ESG risks"],
};

test("SBMC prompt definitions cover all 11 supported blocks", () => {
  assert.equal(SBMC_BLOCKS.length, 11);

  for (const label of SBMC_BLOCKS) {
    assert.equal(typeof SBMC_BLOCK_DEFINITIONS[label], "string");
    assert.ok(SBMC_BLOCK_DEFINITIONS[label].length > 40);
  }
});

test("SBMC block labels are selected case-insensitively and reject unknown labels", () => {
  assert.equal(getSBMCBlockLabel(" customer relationships "), "Customer Relationships");
  assert.throws(
    () => getSBMCBlockLabel("Partnerships"),
    /recognized SBMC block label/,
  );
});

test("current canvas context includes every block and existing values", () => {
  const context = buildCanvasContextBlock(bmcData);

  for (const label of SBMC_BLOCKS) {
    assert.match(context, new RegExp(`- ${label}:`));
  }
  assert.match(context, /- Key Partners: ERP integration vendors/);
  assert.match(context, /- Eco-Social Benefits: Helps identify supplier ESG risks/);
});

test("canvas suggestion prompt includes company context, block definition, canvas context, and guardrails", () => {
  const prompt = buildCanvasSuggestionPrompt(profile, "Eco-Social Benefits", bmcData);

  assert.match(prompt, /Company: TraceGrid/);
  assert.match(prompt, /Requested block: "Eco-Social Benefits"/);
  assert.match(prompt, /Positive environmental or social outcomes/);
  assert.match(prompt, /Annual SaaS subscriptions/);
  assert.match(prompt, /Treat only explicitly supplied company information and current canvas content as factual context/);
  assert.match(prompt, /Do not claim "significant" reductions or improvements without evidence/);
  assert.match(prompt, /Return ONLY a valid JSON array of strings/);
});

test("the prompt does not authorise speculative business-model elements", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../../netlify/functions/api.ts", import.meta.url),
    "utf8",
  );

  // Regression: this line permitted unsupported elements so long as they were
  // hedged. A string[] rendered as a canvas bullet cannot carry a hedge, so the
  // speculation reached the canvas as if it were fact.
  assert.doesNotMatch(source, /Strategic possibilities may be suggested/);

  // Regression: the Revenue Streams definition invited invented monetization
  // ("or could earn") in the same sentence that forbade it.
  assert.doesNotMatch(SBMC_BLOCK_DEFINITIONS["Revenue Streams"], /could earn/);
});

test("every block prompt states the evidence gate and refuses block completion", () => {
  for (const label of SBMC_BLOCKS) {
    const prompt = buildCanvasSuggestionPrompt(profile, label, bmcData);

    assert.match(prompt, /Plausibility is not evidence/, label);
    assert.match(prompt, /requires assuming a new capability/, label);
    assert.match(
      prompt,
      /Do not complete the block by adding what a company of this type would\s+typically have/,
      label,
    );
    // Improving what exists must outrank proposing something new.
    assert.match(prompt, /Improve, clarify, or consolidate existing items/, label);
    // The definition must not read as a list of categories to fill.
    assert.match(prompt, /not a checklist of categories to fill/, label);
    // Returning little must be an acceptable outcome, not a failure.
    assert.match(prompt, /A short list is not a\s+failure/, label);
  }
});

test("grounding is pinned to supplied context, not model creativity", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../../netlify/functions/api.ts", import.meta.url),
    "utf8",
  );

  // Provider default is 1.0, which rewards fluent completion of a familiar
  // business-model shape over checking the supplied evidence.
  assert.match(source, /const CANVAS_SUGGESTION_TEMPERATURE = 0\.2;/);
  assert.match(source, /temperature: CANVAS_SUGGESTION_TEMPERATURE/);
});

test("canvas context normalization keeps the string array contract for valid values", () => {
  const normalized = normalizeCanvasContext({
    keyPartners: ["Partner A", 42, " Partner B "],
    channels: "not an array",
  });

  assert.deepEqual(normalized.keyPartners, ["Partner A", "Partner B"]);
  assert.deepEqual(normalized.channels, []);
});

test("AI JSON parsing preserves string array responses and rejects malformed output to fallback", () => {
  assert.deepEqual(parseAIJson('["One", "Two"]', []), ["One", "Two"]);
  assert.deepEqual(parseAIJson("not json", []), []);
});

test("company strategic report prompt includes profile, SBMC, SWOT, and grounding rules", () => {
  const prompt = buildCompanyStrategicReportPrompt(profile, bmcData, {
    strengths: ["Strong supplier evidence workflows"],
    weaknesses: ["Limited implementation capacity"],
    opportunities: ["Growing ESG audit expectations"],
    threats: ["Changing sustainability reporting requirements"],
  });

  assert.match(prompt, /Company: TraceGrid/);
  assert.match(prompt, /Audit-ready supplier ESG evidence/);
  assert.match(prompt, /Strong supplier evidence workflows/);
  assert.match(prompt, /Treat only the supplied company profile, SBMC, and SWOT content as factual/);
  assert.match(prompt, /Return ONLY valid JSON/);
  assert.match(prompt, /profileSummary/);
  assert.match(prompt, /recommendations/);
});

test("company strategic report SBMC context omits empty blocks and caps long inputs", () => {
  const context = buildCompanyStrategicBmcContext({
    keyPartners: ["One", "Two", "Three"],
    channels: [],
  }, 2);

  assert.match(context, /Key Partners: One; Two/);
  assert.doesNotMatch(context, /Three/);
  assert.doesNotMatch(context, /Channels/);
});
