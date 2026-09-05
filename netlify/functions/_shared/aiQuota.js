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
 * Share of the base allowance granted automatically the first time an
 * organization crosses its ceiling in a month, so nobody is hard-stopped
 * before a human has had a chance to look. Bounds worst-case spend at
 * 125% of plan rather than leaving it open-ended.
 */
export const AUTO_BURST_RATIO = 0.25;

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
 * First instant of the next calendar month, in UTC — when the allowance
 * resets, and therefore when a grant for this month stops counting.
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function monthEndIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/**
 * `period_month` value for the current UTC month (YYYY-MM-DD).
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function periodMonth(now = new Date()) {
  return monthStartIso(now).slice(0, 10);
}

/**
 * Total calls added by grants that have not expired.
 *
 * Returns 0 on error: a grant is extra capacity, so failing to read one costs
 * a customer headroom rather than handing out spend that was never authorized.
 *
 * @param {any} admin Supabase service-role client
 * @param {string} organizationId
 * @param {Date} [now]
 * @returns {Promise<number>}
 */
export async function loadActiveGrantTotal(admin, organizationId, now = new Date()) {
  const { data, error } = await admin
    .from("ai_quota_grants")
    .select("additional_calls")
    .eq("organization_id", organizationId)
    .gt("expires_at", now.toISOString());

  if (error) {
    console.warn(`[quota] grant lookup failed org=${organizationId} — ignoring grants`);
    return 0;
  }

  return (data ?? []).reduce(
    (total, row) => total + (Number(row?.additional_calls) || 0),
    0,
  );
}

/**
 * Grant the one automatic burst this organization is allowed this month.
 *
 * Uniqueness is enforced by the partial index in migration 027, not here: a
 * duplicate insert loses the race and returns null, which is the correct
 * answer for a second concurrent request.
 *
 * @param {any} admin Supabase service-role client
 * @param {string} organizationId
 * @param {number} baseLimit
 * @param {Date} [now]
 * @returns {Promise<number>} calls granted, or 0 when none was
 */
export async function grantAutoBurst(admin, organizationId, baseLimit, now = new Date()) {
  const additionalCalls = Math.max(1, Math.ceil(baseLimit * AUTO_BURST_RATIO));

  const { error } = await admin.from("ai_quota_grants").insert({
    organization_id: organizationId,
    additional_calls: additionalCalls,
    source: "auto_burst",
    reason: "Automatic one-off top-up on first monthly ceiling breach",
    period_month: periodMonth(now),
    expires_at: monthEndIso(now),
  });

  if (error) {
    // 23505 = the org already used this month's burst. Anything else is a real
    // failure; either way the caller falls through to the refusal path.
    if (error.code !== "23505") {
      console.error(`[quota] auto-burst insert failed org=${organizationId}`);
    }
    return 0;
  }

  console.warn(
    `[quota] auto-burst granted org=${organizationId} calls=${additionalCalls} base=${baseLimit}`,
  );
  return additionalCalls;
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
  now = new Date(),
) {
  const baseLimit = resolveMonthlyCallLimit(tier, softQuotaMonthly);

  const [{ count, error }, grantedCalls] = await Promise.all([
    admin
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("success", true)
      .gte("created_at", monthStartIso(now)),
    loadActiveGrantTotal(admin, organizationId, now),
  ]);

  const limit = baseLimit + grantedCalls;

  if (error) {
    console.warn(
      `[quota] usage lookup failed org=${organizationId} — allowing call`,
    );
    return { allowed: true, used: null, limit, baseLimit, grantedCalls, degraded: true };
  }

  const used = count ?? 0;
  return {
    allowed: used < limit,
    used,
    limit,
    baseLimit,
    grantedCalls,
    degraded: false,
  };
}

/**
 * Full gate for one platform AI call: check the ceiling, and if it is spent,
 * try this month's automatic burst before refusing.
 *
 * @param {any} admin Supabase service-role client
 * @param {string} organizationId
 * @param {unknown} tier
 * @param {unknown} softQuotaMonthly
 * @param {Date} [now]
 */
export async function authorizeAiCall(
  admin,
  organizationId,
  tier,
  softQuotaMonthly,
  now = new Date(),
) {
  const quota = await checkMonthlyAiQuota(admin, organizationId, tier, softQuotaMonthly, now);
  if (quota.allowed) return quota;

  const burst = await grantAutoBurst(admin, organizationId, quota.baseLimit, now);
  if (burst === 0) return quota;

  const limit = quota.limit + burst;
  return {
    ...quota,
    allowed: quota.used === null || quota.used < limit,
    limit,
    grantedCalls: quota.grantedCalls + burst,
    autoBurstGranted: burst,
  };
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
