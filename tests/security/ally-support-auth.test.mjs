import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ALLY_MAX_MESSAGE_CHARS,
  ALLY_MAX_MESSAGES,
  escapeHtml,
  parseAllySupportBody,
} from "../../netlify/functions/_shared/allySupportSecurity.js";
import { createAllySupportHandler } from "../../netlify/functions/ally-support.ts";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const VALID_BODY = JSON.stringify({
  organization_id: ORGANIZATION_ID,
  sessionId: "session_123",
  context: "/workspace",
  errors: "",
  messages: [{ role: "user", text: "How do I start?" }],
});

function createQuery(result) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => result,
  };
  return query;
}

function createHarness({
  authenticated = true,
  member = true,
  tier = "free",
  monthlyAiCalls = 0,
} = {}) {
  const state = {
    aiCalls: 0,
    blobWrites: [],
    databaseReads: [],
    inserts: [],
  };
  const admin = {
    auth: {
      getUser: async () => authenticated
        ? { data: { user: { id: USER_ID, email: "verified@example.com" } }, error: null }
        : { data: { user: null }, error: { message: "expired" } },
    },
    from: (table) => {
      state.databaseReads.push(table);
      if (table === "organization_members") {
        return createQuery({ data: member ? { role: "Manager" } : null, error: null });
      }
      if (table === "organization_ai_settings") {
        return createQuery({
          data: {
            model: "gemini-2.5-flash",
            use_byok: false,
            byok_provider: null,
            soft_quota_monthly: 100,
          },
          error: null,
        });
      }
      if (table === "company_profiles") {
        return createQuery({ data: { name: "Verified Company" }, error: null });
      }
      if (table === "organizations") {
        return createQuery({ data: { tier }, error: null });
      }
      if (table === "ai_quota_grants") {
        return {
          select: () => ({ eq: () => ({ gt: async () => ({ data: [], error: null }) }) }),
          // The auto-burst attempt on a breach; "already used this month".
          insert: async () => ({ error: { code: "23505" } }),
        };
      }
      if (table === "ai_usage_log") {
        const countQuery = {
          select: () => countQuery,
          eq: () => countQuery,
          gte: async () => ({ count: monthlyAiCalls, error: null }),
          insert: async (value) => {
            state.inserts.push(value);
            return { error: null };
          },
        };
        return countQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const handler = createAllySupportHandler({
    createAdminClient: () => admin,
    createAIClient: () => ({
      models: {
        generateContent: async () => {
          state.aiCalls += 1;
          return {
            text: "Start with your company profile.",
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
          };
        },
      },
    }),
    getConversationStore: () => ({
      setJSON: async (key, value) => state.blobWrites.push({ key, value }),
    }),
    fetchImpl: async () => assert.fail("support email should not be sent"),
    platformApiKey: "platform-test-key",
    resendKey: "",
    fromEmail: "no-reply@example.com",
    now: () => new Date("2026-08-18T00:00:00.000Z"),
  });
  return { handler, state };
}

test("Ally payload validation accepts only bounded tenant-scoped conversations", () => {
  const parsed = parseAllySupportBody(VALID_BODY);
  assert.equal(parsed.organizationId, ORGANIZATION_ID);
  assert.equal(parsed.messages.length, 1);

  assert.throws(
    () => parseAllySupportBody(JSON.stringify({
      organization_id: "not-a-uuid",
      sessionId: "session_123",
      messages: [{ role: "user", text: "hello" }],
    })),
    /organization_id/,
  );
  assert.throws(
    () => parseAllySupportBody(JSON.stringify({
      organization_id: ORGANIZATION_ID,
      sessionId: "session_123",
      messages: Array.from({ length: ALLY_MAX_MESSAGES + 1 }, () => ({
        role: "user",
        text: "hello",
      })),
    })),
    error => error.status === 413,
  );
  assert.throws(
    () => parseAllySupportBody(JSON.stringify({
      organization_id: ORGANIZATION_ID,
      sessionId: "session_123",
      messages: [{ role: "user", text: "a".repeat(ALLY_MAX_MESSAGE_CHARS + 1) }],
    })),
    error => error.status === 413,
  );
});

test("Ally rejects missing authentication before parsing or side effects", async () => {
  const { handler, state } = createHarness();
  const response = await handler({ httpMethod: "POST", headers: {}, body: "not-json" });

  assert.equal(response.statusCode, 401);
  assert.equal(state.aiCalls, 0);
  assert.deepEqual(state.databaseReads, []);
  assert.deepEqual(state.blobWrites, []);
});

test("Ally rejects expired sessions and non-members", async () => {
  const expired = createHarness({ authenticated: false });
  assert.equal((await expired.handler({
    httpMethod: "POST",
    headers: { authorization: "Bearer expired" },
    body: VALID_BODY,
  })).statusCode, 401);
  assert.equal(expired.state.aiCalls, 0);

  const outsider = createHarness({ member: false });
  assert.equal((await outsider.handler({
    httpMethod: "POST",
    headers: { authorization: "Bearer valid" },
    body: VALID_BODY,
  })).statusCode, 403);
  assert.equal(outsider.state.aiCalls, 0);
  assert.deepEqual(outsider.state.blobWrites, []);
});

test("Ally derives tenant identity from the verified session and membership", async () => {
  const { handler, state } = createHarness();
  const body = JSON.stringify({
    ...JSON.parse(VALID_BODY),
    userInfo: {
      orgId: "33333333-3333-4333-8333-333333333333",
      userId: "44444444-4444-4444-8444-444444444444",
      email: "spoofed@example.com",
      role: "Owner",
    },
  });
  const response = await handler({
    httpMethod: "POST",
    headers: { Authorization: "Bearer valid" },
    body,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(state.aiCalls, 1);
  assert.equal(state.blobWrites.length, 1);
  assert.equal(
    state.blobWrites[0].key,
    `${ORGANIZATION_ID}_${USER_ID}_session_123`,
  );
  assert.deepEqual(state.blobWrites[0].value.userInfo, {
    email: "verified@example.com",
    company: "Verified Company",
    role: "Manager",
    userId: USER_ID,
    orgId: ORGANIZATION_ID,
  });
  assert.equal(state.inserts[0].organization_id, ORGANIZATION_ID);
  assert.equal(state.inserts[0].user_id, USER_ID);
  assert.equal(state.inserts[0].user_email, "verified@example.com");
});

test("Ally refuses to spend AI budget past the organization's monthly ceiling", async () => {
  // soft_quota_monthly is 100 in the harness; 100 calls already logged.
  const exhausted = createHarness({ monthlyAiCalls: 100 });
  const blocked = await exhausted.handler({
    httpMethod: "POST",
    headers: { Authorization: "Bearer valid" },
    body: VALID_BODY,
  });

  assert.equal(blocked.statusCode, 429);
  assert.equal(exhausted.state.aiCalls, 0, "no provider call once the quota is spent");
  assert.deepEqual(exhausted.state.blobWrites, [], "no conversation is stored");

  const withinQuota = createHarness({ monthlyAiCalls: 99 });
  const allowed = await withinQuota.handler({
    httpMethod: "POST",
    headers: { Authorization: "Bearer valid" },
    body: VALID_BODY,
  });

  assert.equal(allowed.statusCode, 200);
  assert.equal(withinQuota.state.aiCalls, 1);
});

test("Ally records the usage row against the organization's tier", async () => {
  const { handler, state } = createHarness({ tier: "pro" });
  await handler({
    httpMethod: "POST",
    headers: { Authorization: "Bearer valid" },
    body: VALID_BODY,
  });

  assert.equal(state.inserts[0].quota_type, "platform_pro");
});

test("support email HTML escaping neutralizes caller markup", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});

test("frontend sends bearer auth and server console does not log conversations", async () => {
  const [clientSource, handlerSource] = await Promise.all([
    readFile(new URL("../../components/AllyAssistant.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../netlify/functions/ally-support.ts", import.meta.url), "utf8"),
  ]);

  assert.match(clientSource, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(clientSource, /organization_id: orgId/);
  assert.doesNotMatch(clientSource, /userInfo:/);
  assert.doesNotMatch(handlerSource, /Conversation log|JSON\.stringify\(messages\)/);
  assert.doesNotMatch(handlerSource, /import\.meta\.url|__dirname/);
  assert.match(handlerSource, /path\.join\(process\.cwd\(\), "Docs v1\.1\.0"/);
});
