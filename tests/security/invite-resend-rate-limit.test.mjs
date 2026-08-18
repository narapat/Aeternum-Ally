import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GENERIC_INVITE_RESEND_BODY,
  INVITE_RESEND_COOLDOWN_MINUTES,
  INVITE_RESEND_IP_LIMIT,
  INVITE_RESEND_IP_WINDOW_SECONDS,
  claimPendingInviteResend,
  hashInviteResendClient,
  normalizeInviteResendEmail,
} from "../../netlify/functions/_shared/inviteResendSecurity.js";
import { config as inviteConfig } from "../../netlify/functions/invite.ts";

const CLAIMED_INVITE = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "member@example.com",
  organization_id: "22222222-2222-4222-8222-222222222222",
};
const CLIENT_HASH = "a".repeat(64);

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

  assert.equal(await claimPendingInviteResend(admin, null, CLIENT_HASH), null);
  assert.equal(await claimPendingInviteResend(admin, "invalid", CLIENT_HASH), null);
  assert.equal(await claimPendingInviteResend(admin, CLAIMED_INVITE.email, null), null);
});

test("client identifiers are HMACed and fail closed without trusted inputs", () => {
  const secret = "server-only-secret-material-1234567890";
  const first = hashInviteResendClient("203.0.113.10", secret);
  const second = hashInviteResendClient("203.0.113.10", secret);

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, hashInviteResendClient("203.0.113.11", secret));
  assert.equal(hashInviteResendClient(undefined, secret), null);
  assert.equal(hashInviteResendClient("   ", secret), null);
  assert.equal(hashInviteResendClient("203.0.113.10", "short"), null);
  assert.doesNotMatch(first, /203\.0\.113\.10/);
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
    await claimPendingInviteResend(admin, "Member@Example.com", CLIENT_HASH),
    CLAIMED_INVITE,
  );
  assert.deepEqual(calls, [{
    name: "claim_pending_invite_resend",
    params: {
      p_email: "member@example.com",
      p_client_hash: CLIENT_HASH,
    },
  }]);

  await assert.rejects(
    claimPendingInviteResend({
      rpc: async () => ({ data: null, error: { message: "sensitive database detail" } }),
    }, "member@example.com", CLIENT_HASH),
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
    claimPendingInviteResend(admin, CLAIMED_INVITE.email, CLIENT_HASH),
    claimPendingInviteResend(admin, CLAIMED_INVITE.email, CLIENT_HASH),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
});

test("the public response and distributed limits do not reveal claim state", () => {
  assert.deepEqual(GENERIC_INVITE_RESEND_BODY, {
    success: true,
    message: "If a pending invitation exists for this email, a new link has been sent. Check your inbox.",
  });
  assert.equal(INVITE_RESEND_COOLDOWN_MINUTES, 5);
  assert.equal(INVITE_RESEND_IP_LIMIT, 10);
  assert.equal(INVITE_RESEND_IP_WINDOW_SECONDS, 60);
  assert.equal(inviteConfig.path, "/.netlify/functions/invite");
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
  assert.match(resendBranch[0], /hashInviteResendClient\(requestContext\?\.ip, serviceKey\)/);
  assert.match(resendBranch[0], /claimPendingInviteResend\(admin, email, clientHash\)/);
  assert.match(resendBranch[0], /requestContext\.waitUntil\(delivery\)/);
  assert.doesNotMatch(resendBranch[0], /return json\(400/);
  assert.match(handlerSource, /export default async \(request: Request, context: Context\)/);
  assert.doesNotMatch(handlerSource, /export\s+(?:const\s+handler|\{\s*handler\s*\})/);
  assert.match(migrationSource, /last_email_sent_at/);
  assert.match(migrationSource, /interval '5 minutes'/);
  assert.match(migrationSource, /invite_resend_rate_limits/);
  assert.match(migrationSource, /interval '60 seconds'/);
  assert.match(migrationSource, /request_count <= 10/);
  assert.match(migrationSource, /FOR UPDATE SKIP LOCKED/);
  assert.match(migrationSource, /REVOKE ALL ON TABLE[\s\S]+FROM PUBLIC, anon, authenticated/);
  assert.match(migrationSource, /REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated/);
  assert.match(migrationSource, /GRANT EXECUTE[\s\S]+TO service_role/);
  assert.match(authSource, /action: "request_resend"/);
});
