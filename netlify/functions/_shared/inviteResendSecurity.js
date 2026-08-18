// @ts-check

export const INVITE_RESEND_COOLDOWN_MINUTES = 5;

export const GENERIC_INVITE_RESEND_BODY = Object.freeze({
  success: true,
  message: "If a pending invitation exists for this email, a new link has been sent. Check your inbox.",
});

/**
 * Normalize bounded email input before any database lookup.
 * Invalid input deliberately maps to null so callers can return the same
 * response as an unknown or throttled address.
 *
 * @param {unknown} value
 */
export function normalizeInviteResendEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (
    email.length === 0
    || email.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return null;
  }
  return email;
}

/**
 * Atomically reserve the latest eligible invite for a resend. The database
 * RPC owns the lock and cooldown so separate function instances cannot race.
 *
 * @param {any} admin Supabase service-role client
 * @param {unknown} rawEmail
 * @returns {Promise<{ id: string, email: string, organization_id: string } | null>}
 */
export async function claimPendingInviteResend(admin, rawEmail) {
  const email = normalizeInviteResendEmail(rawEmail);
  if (!email) return null;

  const { data, error } = await admin.rpc("claim_pending_invite_resend", {
    p_email: email,
  });
  if (error) {
    throw new Error("Invite resend claim failed.");
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (
    !row
    || typeof row.id !== "string"
    || typeof row.email !== "string"
    || typeof row.organization_id !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    organization_id: row.organization_id,
  };
}
