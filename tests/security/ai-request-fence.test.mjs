import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_REQUEST_FENCE_MS,
  NETLIFY_SYNC_LIMIT_MS,
  withAIRequestFence,
} from "../../netlify/functions/_shared/aiRequestFence.js";

test("AI request fence leaves time for logging before the Netlify limit", () => {
  assert.equal(AI_REQUEST_FENCE_MS, 50_000);
  assert.ok(AI_REQUEST_FENCE_MS < NETLIFY_SYNC_LIMIT_MS);
});

test("AI request fence allows a response before the deadline", async () => {
  const result = await withAIRequestFence(Promise.resolve("ok"), "test", 20);

  assert.equal(result, "ok");
});

test("AI request fence marks deadline failures as timeouts", async () => {
  await assert.rejects(
    withAIRequestFence(
      new Promise(resolve => setTimeout(resolve, 30)),
      "generateSwotInternal",
      5,
    ),
    error => {
      assert.equal(error.isTimeout, true);
      assert.match(error.message, /generateSwotInternal/);
      return true;
    },
  );
});
