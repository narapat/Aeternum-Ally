import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AUTO_BURST_RATIO,
  authorizeAiCall,
  grantAutoBurst,
  loadActiveGrantTotal,
  monthEndIso,
  periodMonth,
} from "../../netlify/functions/_shared/aiQuota.js";

const NOW = new Date("2026-09-17T12:00:00.000Z");
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

/**
 * @param {{ used?: number, usageError?: object, grants?: object[],
 *           grantsError?: object, insertError?: object }} options
 */
function stubAdmin({ used = 0, usageError = null, grants = [], grantsError = null, insertError = null } = {}) {
  const state = { inserts: [], grantFilters: [] };
  return {
    state,
    from(table) {
      if (table === "ai_usage_log") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          gte: async () => ({ count: usageError ? null : used, error: usageError }),
        };
        return chain;
      }
      if (table === "ai_quota_grants") {
        const chain = {
          select: () => chain,
          eq: (column, value) => {
            state.grantFilters.push({ column, value });
            return chain;
          },
          gt: async (column, value) => {
            state.grantFilters.push({ column, value });
            return { data: grantsError ? null : grants, error: grantsError };
          },
          insert: async (row) => {
            state.inserts.push(row);
            return { error: insertError };
          },
        };
        return chain;
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

test("active grants are summed for the organization and the moment asked", async () => {
  const admin = stubAdmin({ grants: [{ additional_calls: 300 }, { additional_calls: 200 }] });

  assert.equal(await loadActiveGrantTotal(admin, "org-1", NOW), 500);
  assert.deepEqual(admin.state.grantFilters, [
    { column: "organization_id", value: "org-1" },
    { column: "expires_at", value: NOW.toISOString() },
  ]);
});

test("an unreadable grant costs headroom, never unauthorized spend", async () => {
  const admin = stubAdmin({ grantsError: { message: "timeout" } });
  assert.equal(await loadActiveGrantTotal(admin, "org-1", NOW), 0);
});

test("the automatic burst is a bounded share of the plan, expiring at the reset", async () => {
  const admin = stubAdmin();
  const granted = await grantAutoBurst(admin, "org-1", 100, NOW);

  assert.equal(granted, Math.ceil(100 * AUTO_BURST_RATIO));
  assert.equal(AUTO_BURST_RATIO, 0.25, "worst case stays at 125% of plan");

  const [row] = admin.state.inserts;
  assert.equal(row.organization_id, "org-1");
  assert.equal(row.source, "auto_burst");
  assert.equal(row.period_month, periodMonth(NOW));
  assert.equal(row.expires_at, monthEndIso(NOW));
  assert.equal(row.expires_at, "2026-10-01T00:00:00.000Z");
});

test("a second burst in the same month is refused by the database, not by chance", async () => {
  const already = stubAdmin({ insertError: { code: "23505" } });
  assert.equal(await grantAutoBurst(already, "org-1", 100, NOW), 0);

  const broken = stubAdmin({ insertError: { code: "42501" } });
  assert.equal(await grantAutoBurst(broken, "org-1", 100, NOW), 0);
});

test("a call under the ceiling is authorized without spending the burst", async () => {
  const admin = stubAdmin({ used: 40 });
  const quota = await authorizeAiCall(admin, "org-1", "free", null, NOW);

  assert.equal(quota.allowed, true);
  assert.equal(quota.limit, 100);
  assert.deepEqual(admin.state.inserts, [], "no burst until the ceiling is actually hit");
});

test("grants raise the ceiling that authorization uses", async () => {
  const admin = stubAdmin({ used: 120, grants: [{ additional_calls: 500 }] });
  const quota = await authorizeAiCall(admin, "org-1", "free", null, NOW);

  assert.equal(quota.baseLimit, 100);
  assert.equal(quota.grantedCalls, 500);
  assert.equal(quota.limit, 600);
  assert.equal(quota.allowed, true);
});

test("first breach of the month is absorbed by the burst instead of interrupting", async () => {
  const admin = stubAdmin({ used: 100 });
  const quota = await authorizeAiCall(admin, "org-1", "free", null, NOW);

  assert.equal(quota.allowed, true, "the customer is not hard-stopped");
  assert.equal(quota.autoBurstGranted, 25);
  assert.equal(quota.limit, 125);
  assert.equal(admin.state.inserts.length, 1);
});

test("once the burst is spent the call is refused", async () => {
  // 125 used against a 100 plan whose burst already exists: the top-up is in
  // grants, and a second insert loses the unique index.
  const admin = stubAdmin({
    used: 125,
    grants: [{ additional_calls: 25 }],
    insertError: { code: "23505" },
  });
  const quota = await authorizeAiCall(admin, "org-1", "free", null, NOW);

  assert.equal(quota.allowed, false);
  assert.equal(quota.limit, 125);
});

test("grants are service-role only and one auto-burst per org per month", async () => {
  const [migration, schema] = await Promise.all([
    read("../../supabase/migrations/027_ai_quota_grants.sql"),
    read("../../supabase/schema.sql"),
  ]);

  for (const source of [migration, schema]) {
    const executable = source.replace(/^\s*--.*$/gm, "");

    assert.match(executable, /ALTER TABLE public\.ai_quota_grants ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(executable, /CREATE POLICY[^;]*ai_quota_grants/,
      "RLS with no policy is what denies every browser role");
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      assert.match(
        executable,
        new RegExp(`REVOKE ALL ON public\\.ai_quota_grants FROM ${role}`),
      );
    }

    assert.match(
      executable,
      /CREATE UNIQUE INDEX[\s\S]*ai_quota_grants \(organization_id, period_month\)\s*WHERE source = 'auto_burst'/,
    );
    assert.match(executable, /CHECK \(source IN \('admin', 'auto_burst'\)\)/);
    assert.match(executable, /additional_calls > 0/);
  }
});

test("admin quota actions are authenticated, validated and attributed", async () => {
  const source = await read("../../netlify/functions/admin.ts");

  const requireAdmin = source.indexOf("await requireAdmin(authHeader)");
  for (const action of ["org_ai_quota", "grant_ai_quota", "set_ai_quota_override"]) {
    const index = source.indexOf(`case '${action}'`);
    assert.ok(index > requireAdmin, `${action} must sit in the post-auth switch`);
  }

  const grant = source.match(/async function handleGrantAiQuota[\s\S]*?\n}\n/)?.[0];
  assert.ok(grant);
  assert.match(grant, /Number\.isInteger\(calls\)/);
  assert.match(grant, /calls < 1 \|\| calls > 1_000_000/);
  assert.match(grant, /granted_by:\s*actorEmail/);
  assert.match(grant, /expires_at:\s*monthEndIso\(now\)/, "an ad-hoc grant must expire");
  assert.match(grant, /source:\s*'admin'/);

  const override = source.match(/async function handleSetAiQuotaOverride[\s\S]*?\n}\n/)?.[0];
  assert.ok(override);
  assert.match(override, /raw === null \|\| raw === ''/, "blank must clear the override");
  assert.match(override, /override < 0 \|\| override > 1_000_000/);
});
