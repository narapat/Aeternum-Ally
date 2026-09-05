import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MONTHLY_AI_CALL_LIMITS,
  checkMonthlyAiQuota,
  monthStartIso,
  platformQuotaType,
  quotaExceededResponse,
  resolveMonthlyCallLimit,
} from "../../netlify/functions/_shared/aiQuota.js";
import { ORGANIZATION_TIERS } from "../../netlify/functions/_shared/organizationTier.js";

/** Stub for admin.from("ai_usage_log").select(...).eq().eq().gte() */
function stubUsage(result) {
  const filters = [];
  return {
    filters,
    from() {
      const chain = {
        select: (columns, options) => {
          filters.push({ columns, options });
          return chain;
        },
        eq: (column, value) => {
          filters.push({ column, value });
          return chain;
        },
        gte: async (column, value) => {
          filters.push({ column, value });
          return result;
        },
      };
      return chain;
    },
  };
}

test("every tier has a monthly ceiling", () => {
  assert.deepEqual(
    Object.keys(MONTHLY_AI_CALL_LIMITS).sort(),
    [...ORGANIZATION_TIERS].sort(),
  );
  for (const tier of ORGANIZATION_TIERS) {
    assert.ok(MONTHLY_AI_CALL_LIMITS[tier] > 0, `${tier} needs an allowance`);
  }
});

test("an explicit per-org override wins over the tier default", () => {
  assert.equal(resolveMonthlyCallLimit("pro", 25), 25);
  assert.equal(resolveMonthlyCallLimit("pro", 0), 0, "0 suspends platform AI");
  assert.equal(resolveMonthlyCallLimit("pro", null), MONTHLY_AI_CALL_LIMITS.pro);
  assert.equal(resolveMonthlyCallLimit("pro", undefined), MONTHLY_AI_CALL_LIMITS.pro);
  assert.equal(resolveMonthlyCallLimit("pro", -5), MONTHLY_AI_CALL_LIMITS.pro);
  assert.equal(resolveMonthlyCallLimit("pro", "500"), MONTHLY_AI_CALL_LIMITS.pro);
  // An unknown tier must not inherit an enterprise-sized allowance.
  assert.equal(resolveMonthlyCallLimit("platinum", null), MONTHLY_AI_CALL_LIMITS.free);
});

test("quota_type is derived from the tier and stays within the CHECK constraint", async () => {
  const [migration, schema] = await Promise.all([
    readFile(new URL("../../supabase/migrations/026_ai_quota_enforcement.sql", import.meta.url), "utf8"),
    readFile(new URL("../../supabase/schema.sql", import.meta.url), "utf8"),
  ]);

  assert.equal(platformQuotaType("starter"), "platform_starter");
  assert.equal(platformQuotaType("platinum"), "platform_free");

  for (const source of [migration, schema]) {
    // Ignore SQL comments so a documented rollback statement is not mistaken
    // for the live constraint.
    const executable = source.replace(/^\s*--.*$/gm, "");
    const allowed = executable.match(/CHECK \(quota_type IN \(([\s\S]*?)\)\)/)?.[1];
    assert.ok(allowed, "quota_type CHECK constraint must exist");
    for (const tier of ORGANIZATION_TIERS) {
      assert.ok(
        allowed.includes(`'${platformQuotaType(tier)}'`),
        `${platformQuotaType(tier)} must be an accepted quota_type`,
      );
    }
    assert.ok(allowed.includes("'byok'"));
  }
});

test("calls are blocked once the month's allowance is spent", async () => {
  const under = stubUsage({ count: 99, error: null });
  const atLimit = stubUsage({ count: 100, error: null });
  const over = stubUsage({ count: 5_000, error: null });

  assert.equal((await checkMonthlyAiQuota(under, "org-1", "free", null)).allowed, true);
  assert.equal((await checkMonthlyAiQuota(atLimit, "org-1", "free", null)).allowed, false);
  assert.equal((await checkMonthlyAiQuota(over, "org-1", "free", null)).allowed, false);

  // The count is scoped to this org, successful calls only, this month only.
  assert.deepEqual(under.filters, [
    { columns: "id", options: { count: "exact", head: true } },
    { column: "organization_id", value: "org-1" },
    { column: "success", value: true },
    { column: "created_at", value: monthStartIso() },
  ]);

  const now = new Date("2026-09-17T12:34:56.000Z");
  assert.equal(monthStartIso(now), "2026-09-01T00:00:00.000Z");
});

test("a telemetry outage degrades to allow rather than taking AI offline", async () => {
  const broken = stubUsage({ count: null, error: { message: "timeout" } });
  const result = await checkMonthlyAiQuota(broken, "org-1", "free", null);

  assert.equal(result.allowed, true);
  assert.equal(result.degraded, true);
  assert.equal(result.used, null);
});

test("the quota response carries no tenant data", () => {
  const body = quotaExceededResponse({ used: 120, limit: 100 });
  assert.match(body.error, /100 AI requests/);
  assert.deepEqual(body.quota, { used: 120, limit: 100 });
  assert.doesNotMatch(JSON.stringify(body), /organization_id|user_id|@/);
});

test("both AI entry points enforce the ceiling before calling the provider", async () => {
  const [api, ally] = await Promise.all([
    readFile(new URL("../../netlify/functions/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../../netlify/functions/ally-support.ts", import.meta.url), "utf8"),
  ]);

  for (const [name, source] of [["api.ts", api], ["ally-support.ts", ally]]) {
    assert.match(source, /checkMonthlyAiQuota\(/, `${name} must check the quota`);
    assert.match(source, /json\(429, quotaExceededResponse\(quota\)\)/, `${name} must return 429`);
    assert.match(source, /platformQuotaType\(tier\)/, `${name} must log the tier-aware quota type`);

    // The gate must precede the provider call in source order.
    assert.ok(
      source.indexOf("checkMonthlyAiQuota(") < source.indexOf("generateContent"),
      `${name} must check the quota before calling Gemini`,
    );
  }

  // Regression: the old handler logged the breach and continued anyway.
  assert.doesNotMatch(api, /proceeding anyway/);
  assert.doesNotMatch(api, /PLATFORM_SOFT_LIMIT/);
});
