import assert from "node:assert/strict";
import test from "node:test";

import adminMagicLinkHandler, {
  config as adminMagicLinkConfig,
} from "../../netlify/functions/admin-magic-link.ts";
import { handler as legacyAdminHandler } from "../../netlify/functions/admin.ts";
import {
  deliverAdminMagicLink,
  isExplicitLocalAdminMagicLinkMode,
  requireAdminMagicLinkDelivery,
} from "../../netlify/functions/_shared/adminMagicLinkSecurity.js";

const MAGIC_LINK =
  "https://example.supabase.co/auth/v1/verify?token=top-secret-admin-token";

test("production mode never enables admin dev links", () => {
  const productionEnv = {
    ALLOW_DEV_ADMIN_MAGIC_LINKS: "true",
    NETLIFY_DEV: "false",
  };

  assert.equal(
    isExplicitLocalAdminMagicLinkMode(
      "app.example.com",
      productionEnv,
    ),
    false,
  );
});

test("dev links require an explicit flag, Netlify Dev, and loopback host", () => {
  const localEnv = {
    ALLOW_DEV_ADMIN_MAGIC_LINKS: "true",
    NETLIFY_DEV: "true",
  };

  assert.equal(
    isExplicitLocalAdminMagicLinkMode(
      "localhost:8888",
      localEnv,
    ),
    true,
  );
  assert.equal(
    isExplicitLocalAdminMagicLinkMode(
      "app.example.com",
      localEnv,
    ),
    false,
  );
  assert.equal(
    isExplicitLocalAdminMagicLinkMode(
      "localhost:8888",
      { ...localEnv, ALLOW_DEV_ADMIN_MAGIC_LINKS: "false" },
    ),
    false,
  );
});

test("missing production email configuration fails closed", () => {
  assert.throws(
    () => requireAdminMagicLinkDelivery(false, false),
    (error) => {
      assert.equal(error.status, 503);
      assert.doesNotMatch(error.message, /supabase|token|RESEND_API_KEY/i);
      return true;
    },
  );
});

test("production email failure never returns or throws the magic link", async () => {
  await assert.rejects(
    () =>
      deliverAdminMagicLink({
        magicLink: MAGIC_LINK,
        emailDeliveryConfigured: true,
        allowDevLink: false,
        sendEmail: async () => {
          throw new Error(`Provider rejected ${MAGIC_LINK}`);
        },
      }),
    (error) => {
      assert.equal(error.status, 503);
      assert.doesNotMatch(error.message, /top-secret-admin-token|supabase/i);
      return true;
    },
  );
});

test("explicit local mode may return a dev link", async () => {
  const result = await deliverAdminMagicLink({
    magicLink: MAGIC_LINK,
    emailDeliveryConfigured: false,
    allowDevLink: true,
    sendEmail: async () => assert.fail("email should not be sent"),
  });

  assert.deepEqual(result, { sent: true, dev_link: MAGIC_LINK });
});

test("successful production delivery returns no dev link", async () => {
  let sent = false;
  const result = await deliverAdminMagicLink({
    magicLink: MAGIC_LINK,
    emailDeliveryConfigured: true,
    allowDevLink: false,
    sendEmail: async () => {
      sent = true;
    },
  });

  assert.equal(sent, true);
  assert.deepEqual(result, { sent: true });
  assert.equal("dev_link" in result, false);
});

test("production handler with missing email configuration returns no link", async (t) => {
  const originalResendKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  t.after(() => {
    if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalResendKey;
  });

  const response = await adminMagicLinkHandler(new Request(
    "https://app.example.com/.netlify/functions/admin-magic-link",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com" }),
    },
  ));
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal("dev_link" in body, false);
  assert.doesNotMatch(JSON.stringify(body), /supabase|token|RESEND_API_KEY/i);
});

test("legacy admin endpoint no longer accepts unauthenticated magic-link requests", async () => {
  const response = await legacyAdminHandler({
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({
      action: "request_admin_magic_link",
      email: "admin@example.com",
    }),
  });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 401);
  assert.equal("dev_link" in body, false);
});

test("magic-link endpoint rejects cross-origin requests", async () => {
  const response = await adminMagicLinkHandler(new Request(
    "https://app.example.com/.netlify/functions/admin-magic-link",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      body: JSON.stringify({ email: "admin@example.com" }),
    },
  ));

  assert.equal(response.status, 403);
});

test("dedicated magic-link endpoint has a strict per-IP rate limit", () => {
  assert.equal(adminMagicLinkConfig.path, "/.netlify/functions/admin-magic-link");
  assert.deepEqual(adminMagicLinkConfig.rateLimit.aggregateBy, ["ip", "domain"]);
  assert.equal(adminMagicLinkConfig.rateLimit.windowLimit, 5);
  assert.equal(adminMagicLinkConfig.rateLimit.windowSize, 60);
});
