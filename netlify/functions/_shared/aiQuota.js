// @ts-check

import { normalizeOrganizationTier } from "./organizationTier.js";

/**
 * Monthly platform AI call ceilings, by organization tier.
 *
 * These are the allowances the platform pays for. A tenant using its own key
 * (BYOK) is billed by the provider directly and is never counted here.
 * A per-organization override lives in
 * `organization_ai_settings.soft_quota_monthly`.
 */
export const MONTHLY_AI_CALL_LIMITS = {
  free: 100,
  starter: 500,
  pro: 2_000,
  enterprise: 10_000,
};

/**
 * `ai_usage_log.quota_type` value for a platform-funded call.
 *
 * @param {unknown} tier
 * @returns {string}
 */
export function platformQuotaType(tier) {
  return `platform_${normalizeOrganizationTier(tier)}`;
}

/**
 * The enforced ceiling for an organization. An explicit non-negative override
 * always wins, including 0, which suspends platform AI for that tenant.
 *
 * @param {unknown} tier
 * @param {unknown} softQuotaMonthly
 * @returns {number}
 */
export function resolveMonthlyCallLimit(tier, softQuotaMonthly) {
  if (Number.isInteger(softQuotaMonthly) && Number(softQuotaMonthly) >= 0) {
    return Number(softQuotaMonthly);
  }
  return MONTHLY_AI_CALL_LIMITS[normalizeOrganizationTier(tier)]
    ?? MONTHLY_AI_CALL_LIMITS.free;
}

/**
 * First instant of the current calendar month, in UTC.
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function monthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Decide whether an organization may make another platform AI call this month.
 *
 * If the usage lookup itself fails the call is allowed: that path is a
 * service-role read of our own telemetry, a tenant cannot induce it, and
 * taking every AI feature offline during a database incident is worse than
 * briefly over-serving. The `degraded` flag records that it happened.
 *
 * @param {any} admin Supabase service-role client
 * @param {string} organizationId
 * @param {unknown} tier
 * @param {unknown} softQuotaMonthly
 * @param {Date} [now]
 */
export async function checkMonthlyAiQuota(
  admin,
  organizationId,
  tier,
  softQuotaMonthly,
  now,
) {
  const limit = resolveMonthlyCallLimit(tier, softQuotaMonthly);

  const { count, error } = await admin
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("success", true)
    .gte("created_at", monthStartIso(now));

  if (error) {
    console.warn(
      `[quota] usage lookup failed org=${organizationId} — allowing call`,
    );
    return { allowed: true, used: null, limit, degraded: true };
  }

  const used = count ?? 0;
  return { allowed: used < limit, used, limit, degraded: false };
}

/**
 * User-facing 429 body. Deliberately free of tenant data.
 *
 * @param {{ used: number | null, limit: number }} quota
 */
export function quotaExceededResponse(quota) {
  return {
    error:
      `This organization has used its ${quota.limit} AI requests for this month. `
      + `The allowance resets on the 1st. An Owner or Admin can add the organization's `
      + `own API key under Settings to continue immediately.`,
    quota: { used: quota.used, limit: quota.limit },
  };
}
