import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_ORGANIZATION_TIER,
  ORGANIZATION_TIERS,
  loadOrganizationTier,
  normalizeOrganizationTier,
} from "../../netlify/functions/_shared/organizationTier.js";

/** Minimal service-role client stub: organizations.select().eq().maybeSingle() */
function stubAdmin(response) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push({ table });
      return {
        select(columns) {
          calls[calls.length - 1].columns = columns;
          return {
            eq(column, value) {
              calls[calls.length - 1].filter = { column, value };
              return { maybeSingle: async () => response };
            },
          };
        },
      };
    },
  };
}

test("the tier helper reads the canonical organizations.tier column", async () => {
  const admin = stubAdmin({ data: { tier: "pro" }, error: null });

  assert.equal(await loadOrganizationTier(admin, "org-1"), "pro");
  assert.deepEqual(admin.calls, [
    { table: "organizations", columns: "tier", filter: { column: "id", value: "org-1" } },
  ]);
});

test("tier resolution fails closed instead of granting paid capacity", async () => {
  const missingRow = stubAdmin({ data: null, error: null });
  assert.equal(await loadOrganizationTier(missingRow, "org-1"), "free");

  const lookupError = stubAdmin({ data: null, error: { message: "boom" } });
  assert.equal(await loadOrganizationTier(lookupError, "org-1"), "free");

  const unknownTier = stubAdmin({ data: { tier: "platinum" }, error: null });
  assert.equal(await loadOrganizationTier(unknownTier, "org-1"), "free");

  assert.equal(DEFAULT_ORGANIZATION_TIER, "free");
  for (const value of [undefined, null, "", "PRO", 3, {}]) {
    assert.equal(normalizeOrganizationTier(value), "free");
  }
});

test("the tier list matches the organizations.tier CHECK constraint", async () => {
  const [migration, schema] = await Promise.all([
    readFile(new URL("../../supabase/migrations/015_org_tier_status.sql", import.meta.url), "utf8"),
    readFile(new URL("../../supabase/schema.sql", import.meta.url), "utf8"),
  ]);

  for (const source of [migration, schema]) {
    const constraint = source.match(/CHECK \(tier IN \(([^)]*)\)\)/)?.[1];
    assert.ok(constraint, "organizations.tier CHECK constraint must exist");
    const declared = constraint.split(",").map((value) => value.trim().replace(/'/g, ""));
    assert.deepEqual(declared, [...ORGANIZATION_TIERS]);
  }
});

test("evidence uploads resolve entitlements from tier, with a quota for every tier", async () => {
  const source = await readFile(
    new URL("../../netlify/functions/evidence.ts", import.meta.url),
    "utf8",
  );

  // Regression: the handler previously queried a column that does not exist,
  // which silently downgraded every organization to the link-only free tier.
  assert.doesNotMatch(source, /subscription_tier/);
  assert.match(source, /loadOrganizationTier\(admin, orgId\)/);

  const quotaMap = source.match(/const QUOTA_MAP: Record<string, number> = \{([\s\S]*?)\};/)?.[1];
  assert.ok(quotaMap, "QUOTA_MAP must exist");

  const quotas = Object.fromEntries(
    [...quotaMap.matchAll(/^\s*(\w+):\s*([\d_]+),/gm)].map(([, tier, mb]) => [
      tier,
      Number(mb.replace(/_/g, "")),
    ]),
  );

  assert.deepEqual(Object.keys(quotas).sort(), [...ORGANIZATION_TIERS].sort());
  assert.equal(quotas.free, 0, "the free tier stays link-only");
  for (const tier of ORGANIZATION_TIERS.filter((t) => t !== "free")) {
    assert.ok(quotas[tier] > 0, `${tier} must receive upload capacity`);
  }

  // An unrecognized tier must map to 0 MB rather than an open-ended default.
  assert.match(source, /QUOTA_MAP\[tier\] \?\? 0/);
});
