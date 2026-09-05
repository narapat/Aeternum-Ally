import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { toSafeByokMetadata } from "../../netlify/functions/_shared/byokSecurity.js";
import { ORGANIZATION_TIERS } from "../../netlify/functions/_shared/organizationTier.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("changing a tier requires platform-admin authentication", async () => {
  const source = await read("../../netlify/functions/admin.ts");

  const requireAdmin = source.indexOf("await requireAdmin(authHeader)");
  const tierCase = source.indexOf("case 'set_company_tier'");
  assert.ok(requireAdmin > 0 && tierCase > 0, "both must exist");
  assert.ok(
    tierCase > requireAdmin,
    "set_company_tier must sit in the post-auth switch, not the pre-auth branch",
  );
});

test("tier updates are validated and attributed", async () => {
  const source = await read("../../netlify/functions/admin.ts");
  const handler = source.match(
    /async function handleSetCompanyTier[\s\S]*?\n}\n/,
  )?.[0];
  assert.ok(handler, "handleSetCompanyTier must exist");

  // Caller-supplied tiers reach a CHECK-constrained column: reject anything
  // that is not one of the four known tiers rather than relying on the DB.
  assert.match(handler, /ORGANIZATION_TIERS[\s\S]*\.includes\(tier\)/);
  assert.match(handler, /status: 400/);

  // Only the tier column may move — not is_active, and not another tenant.
  assert.match(handler, /\.update\(\{ tier \}\)\.eq\('id', id\)/);
  assert.doesNotMatch(handler, /is_active/);

  // Entitlement changes cost money; record who made them.
  assert.match(handler, /set_company_tier[\s\S]*actorEmail/);
});

test("the tenant sees the ceiling the server will actually enforce", async () => {
  const metadata = toSafeByokMetadata(
    { model: "gemini-2.5-flash", use_byok: false, byok_api_key: "secret-key-value-abcdefgh" },
    false,
    { tier: "pro", monthlyCallLimit: 2_000 },
  );

  assert.equal(metadata.tier, "pro");
  assert.equal(metadata.monthly_call_limit, 2_000);
  assert.equal("byok_api_key" in metadata, false);
  assert.doesNotMatch(JSON.stringify(metadata), /secret-key-value/);

  // Absent quota info must not imply a paid allowance.
  const unknown = toSafeByokMetadata(null, false);
  assert.equal(unknown.tier, "free");
  assert.equal(unknown.monthly_call_limit, null);
});

test("the limit is resolved server-side, not recomputed in the browser", async () => {
  const [settingsFn, panel] = await Promise.all([
    read("../../netlify/functions/byok-settings.ts"),
    read("../../components/AIUsagePanel.tsx"),
  ]);

  assert.match(settingsFn, /loadOrganizationTier\(admin, organizationId\)/);
  assert.match(settingsFn, /resolveMonthlyCallLimit\(tier, settings\?\.soft_quota_monthly\)/);

  assert.match(panel, /settings\.monthly_call_limit/);
  // Regression: the panel used to show a hardcoded 100 to every organization,
  // which is wrong for every tier above free.
  assert.doesNotMatch(panel, /PLATFORM_SOFT_LIMIT_DEFAULT/);
  assert.doesNotMatch(panel, /softQuotaMonthly \?\?/);
});

test("the quota warning no longer promises calls that will be refused", async () => {
  const panel = await read("../../components/AIUsagePanel.tsx");

  assert.doesNotMatch(panel, /AI calls are still allowed/);
  assert.doesNotMatch(panel, /soft limit|soft quota/i);
  assert.match(panel, /AI features are paused/);
});

test("the admin console can select every tier the database accepts", async () => {
  const panel = await read("../../components/admin/CompanyListPanel.tsx");

  const declared = panel.match(/const TIERS = \[([^\]]*)\]/)?.[1];
  assert.ok(declared, "TIERS must exist");
  assert.deepEqual(
    declared.split(",").map((t) => t.trim().replace(/'/g, "")).filter(Boolean),
    [...ORGANIZATION_TIERS],
  );

  assert.match(panel, /callAdmin\('set_company_tier'/);
  assert.match(panel, /window\.confirm\(/, "an entitlement change should be confirmed");
});
