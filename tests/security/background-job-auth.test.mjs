import assert from "node:assert/strict";
import test from "node:test";

import {
  createInternalFunctionUrl,
  createInternalJobHeaders,
  INTERNAL_JOB_SECRET_HEADER,
  requireInternalJobAuth,
} from "../../netlify/functions/_shared/internalJobAuth.js";
import { handler as assessmentHandler } from "../../netlify/functions/assessment-background.ts";
import { handler as dmaHandler } from "../../netlify/functions/dma-background.ts";
import { handler as reportHandler } from "../../netlify/functions/report-background.ts";

const VALID_SECRET = "a".repeat(64);
const INVALID_SECRET = "b".repeat(64);

test("internal job auth fails closed when the secret is not configured", () => {
  const response = requireInternalJobAuth({ headers: {} }, "");

  assert.equal(response?.statusCode, 503);
  assert.doesNotMatch(response?.body ?? "", /INTERNAL_JOB_SECRET|a{8}/);
});

test("internal job auth rejects missing and invalid credentials", () => {
  assert.equal(
    requireInternalJobAuth({ headers: {} }, VALID_SECRET)?.statusCode,
    401,
  );
  assert.equal(
    requireInternalJobAuth(
      { headers: { [INTERNAL_JOB_SECRET_HEADER]: INVALID_SECRET } },
      VALID_SECRET,
    )?.statusCode,
    401,
  );
});

test("internal job auth accepts a valid credential case-insensitively", () => {
  const response = requireInternalJobAuth(
    { headers: { "X-Internal-Job-Secret": VALID_SECRET } },
    VALID_SECRET,
  );

  assert.equal(response, null);
});

test("internal request headers fail closed and include the configured secret", () => {
  assert.throws(
    () => createInternalJobHeaders("too-short"),
    /Background processing is temporarily unavailable/,
  );

  assert.deepEqual(createInternalJobHeaders(VALID_SECRET), {
    "Content-Type": "application/json",
    [INTERNAL_JOB_SECRET_HEADER]: VALID_SECRET,
  });
});

test("internal function URLs use the trusted deployment URL instead of Host", () => {
  const url = createInternalFunctionUrl(
    { headers: { host: "attacker.example" } },
    "report-background",
    "https://deploy-preview-1--example.netlify.app",
  );

  assert.equal(
    url,
    "https://deploy-preview-1--example.netlify.app/.netlify/functions/report-background",
  );
});

test("internal function URLs prefer the current Netlify deploy over production", () => {
  const previous = {
    INTERNAL_FUNCTION_BASE_URL: process.env.INTERNAL_FUNCTION_BASE_URL,
    DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL,
    DEPLOY_URL: process.env.DEPLOY_URL,
    URL: process.env.URL,
  };

  try {
    delete process.env.INTERNAL_FUNCTION_BASE_URL;
    process.env.DEPLOY_PRIME_URL =
      "https://deploy-preview-158--example.netlify.app";
    process.env.DEPLOY_URL = "https://deploy-id--example.netlify.app";
    process.env.URL = "https://production.example.com";

    assert.equal(
      createInternalFunctionUrl({ headers: {} }, "report-background"),
      "https://deploy-preview-158--example.netlify.app/.netlify/functions/report-background",
    );
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("internal function URLs allow only loopback Host fallback", () => {
  assert.equal(
    createInternalFunctionUrl(
      { headers: { host: "localhost:8888" } },
      "dma-background",
      "",
    ),
    "http://localhost:8888/.netlify/functions/dma-background",
  );

  assert.throws(
    () =>
      createInternalFunctionUrl(
        { headers: { host: "attacker.example" } },
        "dma-background",
        "",
      ),
    /Background processing is temporarily unavailable/,
  );
});

test("internal function URLs reject cleartext non-loopback deployment URLs", () => {
  assert.throws(
    () =>
      createInternalFunctionUrl(
        { headers: {} },
        "assessment-background",
        "http://app.example.com",
      ),
    /Background processing is temporarily unavailable/,
  );
});

for (const [name, handler] of [
  ["report-background", reportHandler],
  ["dma-background", dmaHandler],
  ["assessment-background", assessmentHandler],
]) {
  test(`${name} rejects unauthenticated requests before parsing the body`, async () => {
    process.env.INTERNAL_JOB_SECRET = VALID_SECRET;

    const response = await handler({
      httpMethod: "POST",
      headers: {},
      body: "not-json",
    });

    assert.equal(response.statusCode, 401);
  });

  test(`${name} accepts the internal credential before validating fields`, async () => {
    process.env.INTERNAL_JOB_SECRET = VALID_SECRET;

    const response = await handler({
      httpMethod: "POST",
      headers: { [INTERNAL_JOB_SECRET_HEADER]: VALID_SECRET },
      body: "{}",
    });

    assert.equal(response.statusCode, 400);
  });
}
