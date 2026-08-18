import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GENERIC_INVITE_RESEND_BODY,
  INVITE_RESEND_COOLDOWN_MINUTES,
  claimPendingInviteResend,
  normalizeInviteResendEmail,
} from "../../netlify/functions/_shared/inviteResendSecurity.js";
import { config as inviteConfig } from "../../netlify/functions/invite.ts";

const CLAIMED_INVITE = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "member@example.com",
  organization_id: "22222222-2222-4222-8222-222222222222",
};

test("invite resend email validation is bounded and normalized", () => {
  assert.equal(normalizeInviteResendEmail(" Member@Example.COM "), "member@example.com");
  assert.equal(normalizeInviteResendEmail(undefined), null);
  assert.equal(normalizeInviteResendEmail(""), null);
  assert.equal(normalizeInviteResendEmail("not-an-email"), null);
  assert.equal(normalizeInviteResendEmail("a".repeat(321)), null);
});

test("invalid resend input never reaches the database claim", async () => {
  const admin = {
    rpc: async () => assert.fail("invalid input must not query the database"),
  };

  assert.equal(await claimPendingInviteResend(admin, null), null);
  assert.equal(await claimPendingInviteResend(admin, "invalid"), null);
});

test("resend claims use one bounded RPC and expose no database errors", async () => {
  const calls = [];
  const admin = {
    rpc: async (name, params) => {
      calls.push({ name, params });
      return { data: [CLAIMED_INVITE], error: null };
    },
  };

  assert.deepEqual(
    await claimPendingInviteResend(admin, "Member@Example.com"),
    CLAIMED_INVITE,
  );
  assert.deepEqual(calls, [{
    name: "claim_pending_invite_resend",
    params: { p_email: "member@example.com" },
  }]);

  await assert.rejects(
    claimPendingInviteResend({
      rpc: async () => ({ data: null, error: { message: "sensitive database detail" } }),
    }, "member@example.com"),
    error => {
      assert.equal(error.message, "Invite resend claim failed.");
      assert.doesNotMatch(error.message, /sensitive|database detail/i);
      return true;
    },
  );
});

test("concurrent callers can observe only the single claim returned by the RPC", async () => {
  let available = true;
  const admin = {
    rpc: async () => {
      await Promise.resolve();
      if (!available) return { data: [], error: null };
      available = false;
      return { data: [CLAIMED_INVITE], error: null };
    },
  };

  const claims = await Promise.all([
    claimPendingInviteResend(admin, CLAIMED_INVITE.email),
    claimPendingInviteResend(admin, CLAIMED_INVITE.email),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
});

test("the public response and Netlify edge limit do not reveal claim state", () => {
  assert.deepEqual(GENERIC_INVITE_RESEND_BODY, {
    success: true,
    message: "If a pending invitation exists for this email, a new link has been sent. Check your inbox.",
  });
  assert.equal(INVITE_RESEND_COOLDOWN_MINUTES, 5);
  assert.equal(inviteConfig.path, "/.netlify/functions/invite");
  assert.deepEqual(inviteConfig.rateLimit.aggregateBy, ["ip", "domain"]);
  assert.equal(inviteConfig.rateLimit.windowLimit, 10);
  assert.equal(inviteConfig.rateLimit.windowSize, 60);
});

test("handler schedules delivery after its generic response and migration is atomic", async () => {
  const [handlerSource, migrationSource, authSource] = await Promise.all([
    readFile(new URL("../../netlify/functions/invite.ts", import.meta.url), "utf8"),
    readFile(new URL("../../supabase/migrations/024_rate_limit_invite_resends.sql", import.meta.url), "utf8"),
    readFile(new URL("../../components/AuthScreen.tsx", import.meta.url), "utf8"),
  ]);

  const resendBranch = handlerSource.match(
    /if \(action === "request_resend"\)[\s\S]+?return json\(200, GENERIC_INVITE_RESEND_BODY\);\n  }/,
  );
  assert.ok(resendBranch);
  assert.match(resendBranch[0], /claimPendingInviteResend\(admin, email\)/);
  assert.match(resendBranch[0], /waitUntil\(delivery\)/);
  assert.doesNotMatch(resendBranch[0], /return json\(400/);
  assert.match(handlerSource, /export default async \(request: Request, context: Context\)/);
  assert.doesNotMatch(handlerSource, /export\s+(?:const\s+handler|\{\s*handler\s*\})/);
  assert.match(handlerSource, /context\.waitUntil\(promise\)/);
  assert.match(migrationSource, /last_email_sent_at/);
  assert.match(migrationSource, /interval '5 minutes'/);
  assert.match(migrationSource, /FOR UPDATE SKIP LOCKED/);
  assert.match(migrationSource, /REVOKE ALL[\s\S]+FROM PUBLIC, anon, authenticated/);
  assert.match(migrationSource, /GRANT EXECUTE[\s\S]+TO service_role/);
  assert.match(authSource, /action: "request_resend"/);
});
