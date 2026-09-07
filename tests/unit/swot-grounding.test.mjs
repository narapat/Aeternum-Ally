import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseSwotExternalLines } from "../../netlify/functions/api.ts";

const source = () => readFile(new URL("../../netlify/functions/api.ts", import.meta.url), "utf8");
const swotInternal = (s) => s.match(/async function generateSwotInternal[\s\S]*?\n}\n/)[0];
const swotExternal = (s) => s.match(/async function generateSwotExternal[\s\S]*?\n}\n/)[0];

test("internal SWOT requires evidence rather than plausible strategy language", async () => {
  const fn = swotInternal(await source());

  assert.match(fn, /Every factor must trace to something in the company context or the canvas/);
  assert.match(fn, /Plausibility is not evidence/);
  assert.match(fn, /Do not invent capabilities, teams, customers, funding, market position/);
  assert.match(fn, /An empty\s+array is the correct answer/);
});

test("an intention is not a strength, but a stated absence is a weakness", async () => {
  const fn = swotInternal(await source());

  // The asymmetry matters: treating a plan as an existing advantage is the
  // usual way this analysis goes wrong, while a stated gap is real evidence.
  assert.match(fn, /"\(planned\)" or "\(exploring\)" is not yet a strength/);
  assert.match(fn, /legitimate evidence for\s+a weakness/);
  assert.match(fn, /Say what is absent rather than inventing a problem/);
});

test("external SWOT keeps search results about the world, not about the company", async () => {
  const fn = swotExternal(await source());

  assert.match(fn, /Search tells you about the world, not about this company/);
  assert.match(fn, /A search result is not evidence about them/);
  // Opportunities must not be described as already being pursued.
  assert.match(fn, /Do not present an opportunity as one the company is already pursuing/);
});

test("sources are requested inline, because a separate list is discarded", async () => {
  const full = await source();
  const fn = swotExternal(full);

  // The response is flattened to string[], and Google's groundingMetadata is
  // never read, so a citation only survives if it is inside the line.
  assert.match(fn, /name the source inline in\s+the same line/);
  assert.doesNotMatch(fn, /Cite sources if possible/);
  assert.doesNotMatch(full, /groundingMetadata/);
});

test("both SWOT calls are pinned below the provider default", async () => {
  const full = await source();

  assert.match(full, /const SWOT_TEMPERATURE = 0\.3;/);
  assert.match(swotInternal(full), /temperature: SWOT_TEMPERATURE/);
  assert.match(swotExternal(full), /temperature: SWOT_TEMPERATURE/);
});

test("headings and lead-ins are not stored as SWOT factors", () => {
  const answer = [
    "Here are the key opportunities:",
    "* Growing demand for CSRD-ready reporting among EU suppliers (Reuters, March 2026)",
    "",
    "- Falling cost of carbon accounting tooling",
    "---",
    "### Threats",
    "1. New omnibus revisions may reduce mandatory scope (EFRAG, 2026)",
    "   •",
    "Summary:",
  ].join("\n");

  assert.deepEqual(parseSwotExternalLines(answer), [
    "Growing demand for CSRD-ready reporting among EU suppliers (Reuters, March 2026)",
    "Falling cost of carbon accounting tooling",
    "New omnibus revisions may reduce mandatory scope (EFRAG, 2026)",
  ]);
});

test("the parser tolerates an empty or absent answer", () => {
  assert.deepEqual(parseSwotExternalLines(""), []);
  assert.deepEqual(parseSwotExternalLines(null), []);
  assert.deepEqual(parseSwotExternalLines(undefined), []);
});
