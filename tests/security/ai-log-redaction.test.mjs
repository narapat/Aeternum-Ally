import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI functions retain diagnostics without logging tenant response content", async () => {
  const [api, assessment, dma, report] = await Promise.all([
    readFile(new URL("../../netlify/functions/api.ts", import.meta.url), "utf8"),
    readFile(new URL(
      "../../netlify/functions/assessment-background.ts",
      import.meta.url,
    ), "utf8"),
    readFile(new URL("../../netlify/functions/dma-background.ts", import.meta.url), "utf8"),
    readFile(new URL(
      "../../netlify/functions/report-background.ts",
      import.meta.url,
    ), "utf8"),
  ]);

  assert.doesNotMatch(api, /raw_ai_response|rawAiResponse/);
  assert.doesNotMatch(api, /console\.(?:log|warn|error)\([^\n]*(?:rawText|response\.text)/);
  assert.doesNotMatch(api, /text\.slice\(0,\s*200\)/);
  assert.match(api, /response_chars: aiResponseChars/);
  assert.match(api, /enriched\.aiResponseChars = rawText\.length/);
  assert.match(api, /could not parse response; returning fallback \(chars=\$\{text\.length\}\)/);

  assert.doesNotMatch(assessment, /Scoring raw response/);
  assert.doesNotMatch(
    assessment,
    /console\.(?:log|info|warn|error)\([^\n]*response\.text\s*[,)]/,
  );
  assert.match(assessment, /Scoring output chars=\$\{response\.text\?\.length \?\? 0\}/);

  assert.doesNotMatch(dma, /Synthesis raw response|output tail|slice\(-1000\)/);
  assert.doesNotMatch(
    dma,
    /console\.(?:log|info|warn|error)\([^\n]*synthesisResponse\.text/,
  );
  assert.match(dma, /oversized output chars=\$\{text\.length\}/);
  assert.match(dma, /oversized synthesis output chars=\$\{text\.length\}/);

  assert.doesNotMatch(report, /Snippet of end|text\.slice\(-100\)/);
  assert.doesNotMatch(report, /Failed to parse AI JSON[^\n]*error\.message/i);
  assert.match(report, /Failed to parse AI JSON chars=\$\{text\.length\}/);
});
