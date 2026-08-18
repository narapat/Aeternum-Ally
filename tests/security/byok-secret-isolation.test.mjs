import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import byokSettingsHandler, {
  createByokSettingsHandler,
  config as byokSettingsConfig,
} from "../../netlify/functions/byok-settings.ts";
import {
  canManageByok,
  isValidOrganizationId,
  normalizeByokUpdate,
  toSafeByokMetadata,
} from "../../netlify/functions/_shared/byokSecurity.js";
import { loadOrganizationAiConfig } from "../../netlify/functions/_shared/organizationAiConfig.js";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const TEST_KEY = `test-${"a".repeat(32)}`;

function createAdminMock(rows) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        select(columns) {
          calls.push({ table, columns });
          return {
            eq(column, value) {
              assert.equal(column, "organization_id");
              assert.equal(value, ORG_ID);
              return {
                maybeSingle: async () => rows[table],
              };
            },
          };
        },
      };
    },
  };
}

function createEndpointAdminMock({ role = "Owner", hasSecret = true } = {}) {
  const calls = [];
  let storedSecret = hasSecret;
  let useByok = hasSecret;
  let provider = hasSecret ? "gemini" : null;
  const admin = {
    calls,
    auth: {
      getUser: async (token) => {
        calls.push({ operation: "getUser", token });
        return {
          data: { user: { id: "22222222-2222-4222-8222-222222222222" } },
          error: null,
        };
      },
    },
    from(table) {
      const filters = [];
      let operation = null;
      let columns = null;
      const query = {
        select(value) {
          operation = "select";
          columns = value;
          return query;
        },
        delete() {
          operation = "delete";
          return query;
        },
        async upsert(payload, options) {
          calls.push({ table, operation: "upsert", payload, options });
          if (table === "organization_ai_secrets") storedSecret = true;
          if (table === "organization_ai_settings") {
            useByok = payload.use_byok;
            provider = payload.byok_provider;
          }
          return { error: null };
        },
        eq(column, value) {
          filters.push([column, value]);
          return query;
        },
        async maybeSingle() {
          calls.push({ table, operation, columns, filters });
          if (table === "organization_members") {
            return { data: role ? { role } : null, error: null };
          }
          if (table === "organization_ai_settings") {
            return {
              data: {
                model: "gemini-2.5-flash",
                use_byok: useByok,
                byok_provider: provider,
                byok_api_key: TEST_KEY,
                soft_quota_monthly: 100,
              },
              error: null,
            };
          }
          if (table === "organization_ai_secrets") {
            return {
              data: storedSecret ? { organization_id: ORG_ID } : null,
              error: null,
            };
          }
          throw new Error(`Unexpected table ${table}`);
        },
        then(resolve, reject) {
          calls.push({ table, operation, columns, filters });
          if (table === "organization_ai_secrets" && operation === "delete") {
            storedSecret = false;
          }
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return admin;
}

test("only Owner and Admin roles can manage organization BYOK credentials", () => {
  assert.equal(canManageByok("Owner"), true);
  assert.equal(canManageByok("Admin"), true);
  assert.equal(canManageByok("Manager"), false);
  assert.equal(canManageByok("Consultant"), false);
  assert.equal(canManageByok(undefined), false);
});

test("organization identifiers must be valid UUIDs", () => {
  assert.equal(isValidOrganizationId(ORG_ID), true);
  assert.equal(isValidOrganizationId("../../another-tenant"), false);
  assert.equal(isValidOrganizationId("not-a-uuid"), false);
});

test("safe BYOK metadata never serializes a raw key", () => {
  const metadata = toSafeByokMetadata(
    {
      model: "gemini-2.5-flash",
      use_byok: true,
      byok_provider: "gemini",
      byok_api_key: TEST_KEY,
      soft_quota_monthly: 250,
    },
    true,
  );

  assert.equal(metadata.has_byok_key, true);
  assert.equal("byok_api_key" in metadata, false);
  assert.doesNotMatch(JSON.stringify(metadata), new RegExp(TEST_KEY));
});

test("BYOK updates validate provider, key presence, and key shape", () => {
  assert.deepEqual(
    normalizeByokUpdate(
      { use_byok: true, byok_provider: "gemini", byok_api_key: TEST_KEY },
      false,
    ),
    { useByok: true, provider: "gemini", keyAction: "set", key: TEST_KEY },
  );
  assert.deepEqual(
    normalizeByokUpdate({ use_byok: true, byok_provider: "gemini" }, true),
    { useByok: true, provider: "gemini", keyAction: "keep", key: null },
  );
  assert.deepEqual(
    normalizeByokUpdate(
      { use_byok: false, byok_provider: null, byok_api_key: null },
      true,
    ),
    { useByok: false, provider: null, keyAction: "clear", key: null },
  );
  assert.throws(
    () => normalizeByokUpdate({ use_byok: true, byok_provider: "openai" }, true),
    /Only the Gemini BYOK provider is supported/,
  );
  assert.throws(
    () => normalizeByokUpdate({ use_byok: true, byok_provider: "gemini" }, false),
    /API key is required/,
  );
  assert.throws(
    () => normalizeByokUpdate(
      { use_byok: true, byok_provider: "gemini", byok_api_key: "short" },
      false,
    ),
    /valid BYOK API key/,
  );
});

test("server resolver reads secret storage without selecting a key from settings", async () => {
  const admin = createAdminMock({
    organization_ai_settings: {
      data: {
        model: "gemini-2.5-pro",
        use_byok: true,
        byok_provider: "gemini",
        soft_quota_monthly: 300,
      },
      error: null,
    },
    organization_ai_secrets: {
      data: { byok_api_key: TEST_KEY },
      error: null,
    },
  });

  const config = await loadOrganizationAiConfig(
    admin,
    ORG_ID,
    "platform-test-key",
    "gemini-2.5-flash",
  );

  assert.equal(config.resolvedApiKey, TEST_KEY);
  assert.equal(config.quotaType, "byok");
  assert.equal(config.model, "gemini-2.5-pro");
  assert.equal(config.softQuotaMonthly, 300);
  assert.deepEqual(admin.calls, [
    {
      table: "organization_ai_settings",
      columns: "model, use_byok, byok_provider, soft_quota_monthly",
    },
    { table: "organization_ai_secrets", columns: "byok_api_key" },
  ]);
});

test("server resolver uses the platform key when BYOK is disabled", async () => {
  const admin = createAdminMock({
    organization_ai_settings: {
      data: {
        model: null,
        use_byok: false,
        byok_provider: null,
        soft_quota_monthly: null,
      },
      error: null,
    },
  });

  const config = await loadOrganizationAiConfig(
    admin,
    ORG_ID,
    "platform-test-key",
    "gemini-2.5-flash",
  );

  assert.equal(config.resolvedApiKey, "platform-test-key");
  assert.equal(config.quotaType, "platform_free");
  assert.equal(config.model, "gemini-2.5-flash");
  assert.equal(admin.calls.length, 1);
});

test("server resolver fails closed when BYOK is enabled without a credential", async () => {
  const admin = createAdminMock({
    organization_ai_settings: {
      data: {
        model: "gemini-2.5-flash",
        use_byok: true,
        byok_provider: "gemini",
        soft_quota_monthly: null,
      },
      error: null,
    },
    organization_ai_secrets: { data: null, error: null },
  });

  await assert.rejects(
    () => loadOrganizationAiConfig(
      admin,
      ORG_ID,
      "platform-test-key",
      "gemini-2.5-flash",
    ),
    /Organization AI credentials are unavailable/,
  );
});

test("BYOK endpoint rejects cross-origin and unauthenticated requests early", async () => {
  const crossOrigin = await byokSettingsHandler(new Request(
    `https://app.example.com/.netlify/functions/byok-settings?organization_id=${ORG_ID}`,
    { headers: { Origin: "https://attacker.example" } },
  ));
  assert.equal(crossOrigin.status, 403);

  const unauthenticated = await byokSettingsHandler(new Request(
    `https://app.example.com/.netlify/functions/byok-settings?organization_id=${ORG_ID}`,
  ));
  assert.equal(unauthenticated.status, 401);
});

test("authenticated members receive safe metadata for their organization", async () => {
  const admin = createEndpointAdminMock();
  const handler = createByokSettingsHandler(() => admin);
  const response = await handler(new Request(
    `https://app.example.com/.netlify/functions/byok-settings?organization_id=${ORG_ID}`,
    { headers: { Authorization: "Bearer member-token" } },
  ));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.has_byok_key, true);
  assert.equal("byok_api_key" in body, false);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(TEST_KEY));
  assert.equal(
    admin.calls.some((call) => call.table === "organization_ai_secrets"),
    true,
  );
});

test("non-members are rejected before the endpoint reads secret metadata", async () => {
  const admin = createEndpointAdminMock({ role: null });
  const handler = createByokSettingsHandler(() => admin);
  const response = await handler(new Request(
    `https://app.example.com/.netlify/functions/byok-settings?organization_id=${ORG_ID}`,
    { headers: { Authorization: "Bearer outsider-token" } },
  ));

  assert.equal(response.status, 403);
  assert.equal(
    admin.calls.some((call) => call.table === "organization_ai_secrets"),
    false,
  );
});

test("Manager cannot write BYOK settings or touch secret storage", async () => {
  const admin = createEndpointAdminMock({ role: "Manager" });
  const handler = createByokSettingsHandler(() => admin);
  const response = await handler(new Request(
    "https://app.example.com/.netlify/functions/byok-settings",
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer manager-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organization_id: ORG_ID,
        use_byok: true,
        byok_provider: "gemini",
        byok_api_key: TEST_KEY,
      }),
    },
  ));

  assert.equal(response.status, 403);
  assert.equal(
    admin.calls.some((call) => call.table === "organization_ai_secrets"),
    false,
  );
});

test("Owner can set a credential without receiving it in the response", async () => {
  const admin = createEndpointAdminMock({ role: "Owner", hasSecret: false });
  const handler = createByokSettingsHandler(() => admin);
  const response = await handler(new Request(
    "https://app.example.com/.netlify/functions/byok-settings",
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer owner-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organization_id: ORG_ID,
        use_byok: true,
        byok_provider: "gemini",
        byok_api_key: TEST_KEY,
      }),
    },
  ));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.use_byok, true);
  assert.equal(body.has_byok_key, true);
  assert.equal("byok_api_key" in body, false);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(TEST_KEY));
  assert.equal(
    admin.calls.some((call) =>
      call.table === "organization_ai_secrets" && call.operation === "upsert"
    ),
    true,
  );
});

test("Owner can disable BYOK and clear the server-only credential", async () => {
  const admin = createEndpointAdminMock({ role: "Owner", hasSecret: true });
  const handler = createByokSettingsHandler(() => admin);
  const response = await handler(new Request(
    "https://app.example.com/.netlify/functions/byok-settings",
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer owner-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organization_id: ORG_ID,
        use_byok: false,
        byok_provider: null,
        byok_api_key: null,
      }),
    },
  ));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.use_byok, false);
  assert.equal(body.has_byok_key, false);
  assert.equal(
    admin.calls.some((call) =>
      call.table === "organization_ai_secrets" && call.operation === "delete"
    ),
    true,
  );
});

test("BYOK endpoint has a strict per-IP rate limit", () => {
  assert.equal(byokSettingsConfig.path, "/.netlify/functions/byok-settings");
  assert.deepEqual(byokSettingsConfig.rateLimit.aggregateBy, ["ip", "domain"]);
  assert.equal(byokSettingsConfig.rateLimit.windowLimit, 20);
  assert.equal(byokSettingsConfig.rateLimit.windowSize, 60);
});

test("migration denies browser roles access to organization AI secrets", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/020_expand_organization_ai_secrets.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /ALTER TABLE organization_ai_secrets ENABLE ROW LEVEL SECURITY/i);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE organization_ai_secrets FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(migration, /GRANT ALL ON TABLE organization_ai_secrets TO service_role/i);
  assert.doesNotMatch(migration, /CREATE POLICY[\s\S]+ON organization_ai_secrets/i);
  assert.match(migration, /INSERT INTO organization_ai_secrets[\s\S]+FROM organization_ai_settings/i);
});

test("contract migration preserves rotated secrets before dropping the legacy column", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/021_contract_legacy_byok_key.sql", import.meta.url),
    "utf8",
  );
  const backfillIndex = migration.indexOf("INSERT INTO organization_ai_secrets");
  const guardIndex = migration.indexOf("IF EXISTS");
  const dropIndex = migration.indexOf("DROP COLUMN IF EXISTS byok_api_key");

  assert.ok(backfillIndex >= 0);
  assert.ok(guardIndex > backfillIndex);
  assert.ok(dropIndex > guardIndex);
  assert.match(migration, /ON CONFLICT \(organization_id\) DO NOTHING/i);
  assert.doesNotMatch(migration, /ON CONFLICT[\s\S]+DO UPDATE/i);
  assert.match(
    migration,
    /WHERE settings\.use_byok = true[\s\S]+secrets\.organization_id IS NULL/i,
  );
  assert.match(migration, /BEGIN;[\s\S]+COMMIT;/i);
});

test("browser data service uses the authenticated endpoint instead of raw table access", async () => {
  const source = await readFile(
    new URL("../../services/dbService.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /\.netlify\/functions\/byok-settings/);
  assert.doesNotMatch(
    source,
    /\.from\(["']organization_ai_settings["']\)[\s\S]{0,200}\.select\([^)]*byok_api_key/,
  );
  assert.doesNotMatch(
    source,
    /\.from\(["']organization_ai_settings["']\)[\s\S]{0,300}\.upsert\([^)]*byok_api_key/,
  );
});
