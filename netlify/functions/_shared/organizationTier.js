// @ts-check

/**
 * Organization billing/access tier resolution.
 *
 * The canonical column is `organizations.tier` (migration 015). It is the only
 * place a tier is stored — there is no `subscription_tier` column — so every
 * server-side entitlement check must read it through this helper.
 */

/** Tier identifiers accepted by the `organizations.tier` CHECK constraint. */
export const ORGANIZATION_TIERS = /** @type {const} */ ([
  "free",
  "starter",
  "pro",
  "enterprise",
]);

export const DEFAULT_ORGANIZATION_TIER = "free";

/**
 * Resolve an organization's tier. Fails closed to `free` when the row is
 * missing, the value is unrecognized, or the lookup errors, so a database
 * problem can never hand out paid capacity.
 *
 * @param {any} admin Supabase service-role client
 * @param {string} organizationId
 * @returns {Promise<string>}
 */
export async function loadOrganizationTier(admin, organizationId) {
  const { data, error } = await admin
    .from("organizations")
    .select("tier")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.error(`[tier] lookup failed org=${organizationId}`);
    return DEFAULT_ORGANIZATION_TIER;
  }

  return normalizeOrganizationTier(data?.tier);
}

/**
 * @param {unknown} tier
 * @returns {string}
 */
export function normalizeOrganizationTier(tier) {
  return typeof tier === "string" &&
    /** @type {readonly string[]} */ (ORGANIZATION_TIERS).includes(tier)
    ? tier
    : DEFAULT_ORGANIZATION_TIER;
}
