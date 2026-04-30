import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.VITE_APP_URL || "http://localhost:8888";

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * Send (or resend) an invite email.
 *
 * Strategy:
 * 1. inviteUserByEmail  — creates the Supabase Auth user (if new) AND sends the
 *    branded invite email. Works perfectly for first-time invitees.
 * 2. signInWithOtp      — for users already registered in Supabase Auth,
 *    inviteUserByEmail throws "User already registered". signInWithOtp sends
 *    a magic-link email to any existing user and honours the same redirectTo.
 *    shouldCreateUser: false ensures we don't accidentally create duplicates.
 *
 * generateLink is intentionally NOT used as a fallback because it only returns
 * a URL — it does not deliver any email.
 *
 * Returns { link: null } when an email was dispatched, or { link: string } as
 * a last-resort copy-able URL if both email paths fail.
 */
async function sendInviteEmail(
  admin: any,
  email: string,
  inviteToken: string,
  companyName: string
): Promise<{ link: string | null }> {
  // Path 1 uses the full token URL so new users land with the token in the URL.
  // Paths 2 & 3 use the base URL only — auto-join is email-based so the token
  // in the redirect URL is not required, and Supabase rejects URLs with query
  // params that aren't explicitly listed in the allowed-redirects config.
  const redirectWithToken = `${appUrl}?invite_token=${inviteToken}`;
  const redirectBase = appUrl;
  const data = { company_name: companyName, app_name: "Aeternum Ally" };

  // Path 1: new users — creates account + sends invite email via Supabase template.
  try {
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectWithToken,
      data,
    });
    if (!error) return { link: null };
    console.warn("inviteUserByEmail error:", error.message);
  } catch (e: any) {
    console.warn("inviteUserByEmail threw:", e?.message ?? e);
  }

  // Path 2: existing users — sends a magic-link email to their inbox.
  // Use the base app URL (no query params) so it passes Supabase redirect validation.
  // Auto-join matches the user by email after they authenticate, no token needed.
  try {
    const { error } = await admin.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectBase,
        shouldCreateUser: false,
      },
    });
    if (!error) return { link: null };
    console.warn("signInWithOtp error:", error.message);
  } catch (e: any) {
    console.warn("signInWithOtp threw:", e?.message ?? e);
  }

  // Last resort: generate a link the admin can copy and share manually.
  // This does NOT send an email.
  try {
    const { data: linkData, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: redirectBase },
    });
    if (!error) return { link: linkData?.properties?.action_link ?? null };
  } catch (e: any) {
    console.warn("generateLink threw:", e?.message ?? e);
  }

  return { link: null };
}

const handler = async (event: any) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!supabaseUrl || !serviceKey) {
    return json(503, {
      error:
        "Team invitations are unavailable. The server has not been configured with Supabase credentials. Please contact the administrator.",
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let body: any;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const { action, email, role, organization_id, invite_id } = body || {};

  // ── REQUEST_RESEND (unauthenticated) ──────────────────────────────────────
  // Called from the sign-in page when a user's invite link has expired.
  // Looks up any pending invite for the email and fires a fresh link.
  // Always returns 200 (no email enumeration).
  if (action === "request_resend") {
    if (!email) return json(400, { error: "Missing email." });

    const { data: invite } = await admin
      .from("organization_invites")
      .select("id, email, organization_id")
      .eq("email", email.trim().toLowerCase())
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invite) {
      const { data: profile } = await admin
        .from("company_profiles")
        .select("name")
        .eq("organization_id", invite.organization_id)
        .maybeSingle();
      const companyName = profile?.name ?? "your team";
      const { link } = await sendInviteEmail(admin, invite.email, invite.id, companyName);
      void link;
    }

    // Always return the same message to prevent email enumeration.
    return json(200, {
      success: true,
      message: "If a pending invitation exists for this email, a new link has been sent. Check your inbox.",
    });
  }

  // All other actions require authentication.
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json(401, { error: "You must be signed in to invite team members." });
  }
  const accessToken = authHeader.slice("Bearer ".length);

  const { data: userResp, error: userErr } = await admin.auth.getUser(accessToken);
  if (userErr || !userResp?.user) {
    return json(401, { error: "Your session has expired. Please sign in again." });
  }
  const inviter = userResp.user;

  if (!organization_id) {
    return json(400, { error: "Missing required field: organization_id." });
  }

  // Check inviter is Owner/Admin of the org
  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization_id)
    .eq("user_id", inviter.id)
    .maybeSingle();

  if (!membership || !["Owner", "Admin"].includes(membership.role)) {
    return json(403, { error: "Only Owners and Admins can manage invitations." });
  }

  // ── LIST PENDING INVITES (authenticated, Owner/Admin only) ────────────────
  if (action === "list") {
    const { data: invites, error: listErr } = await admin
      .from("organization_invites")
      .select("id, email, role, expires_at, created_at, invited_by")
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: false });

    if (listErr) return json(500, { error: listErr.message });
    return json(200, { invites: invites ?? [] });
  }

  // ── RESEND (authenticated, Owner/Admin only) ──────────────────────────────
  if (action === "resend") {
    if (!invite_id) return json(400, { error: "Missing invite_id for resend." });

    const { data: existingInvite } = await admin
      .from("organization_invites")
      .select("id, email")
      .eq("id", invite_id)
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (!existingInvite) return json(404, { error: "Invitation not found." });

    const { data: profile } = await admin
      .from("company_profiles")
      .select("name")
      .eq("organization_id", organization_id)
      .maybeSingle();
    const companyName = profile?.name ?? "your team";

    const { link } = await sendInviteEmail(admin, existingInvite.email, existingInvite.id, companyName);

    return json(200, {
      success: true,
      invite_token: existingInvite.id,
      // link is non-null only when Supabase couldn't send the email itself
      // (existing-user fallback). Show it in the UI so the admin can copy it.
      fallback_link: link,
    });
  }

  // ── NEW INVITE ────────────────────────────────────────────────────────────
  if (!email) return json(400, { error: "Missing required field: email." });
  if (!role) return json(400, { error: "Missing required field: role." });
  if (!["Admin", "Manager", "Consultant"].includes(role)) {
    return json(400, { error: "Invalid role. Must be Admin, Manager, or Consultant." });
  }

  // Always normalise to lowercase so the OrgSetupScreen lookup (case-sensitive
  // .eq) matches the stored value, and the RLS policy (which uses lower()) stays consistent.
  const normalizedEmail = email.trim().toLowerCase();

  const { data: existingMember } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", organization_id)
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (existingMember) {
    return json(409, { error: "This person is already a member of your team." });
  }

  const { data: existingInvite } = await admin
    .from("organization_invites")
    .select("id")
    .eq("organization_id", organization_id)
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (existingInvite) {
    return json(409, { error: "An invitation has already been sent to this email. Use Resend to send a new link." });
  }

  const { data: invite, error: insertErr } = await admin
    .from("organization_invites")
    .insert({ organization_id, email: normalizedEmail, role, invited_by: inviter.id })
    .select()
    .single();
  if (insertErr || !invite) {
    return json(500, { error: insertErr?.message ?? "Failed to create invitation." });
  }

  const { data: profile } = await admin
    .from("company_profiles")
    .select("name")
    .eq("organization_id", organization_id)
    .maybeSingle();
  const companyName = profile?.name ?? "your team";

  const { link } = await sendInviteEmail(admin, normalizedEmail, invite.id, companyName);

  return json(200, {
    success: true,
    invite_token: invite.id,
    expires_at: invite.expires_at,
    fallback_link: link,
  });
};

export { handler };
