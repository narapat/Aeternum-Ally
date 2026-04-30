import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.VITE_APP_URL || "http://localhost:8888";

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

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

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json(401, { error: "You must be signed in to invite team members." });
  }
  const accessToken = authHeader.slice("Bearer ".length);

  const admin = createClient(supabaseUrl, serviceKey);

  // Verify the inviter
  const { data: userResp, error: userErr } = await admin.auth.getUser(accessToken);
  if (userErr || !userResp?.user) {
    return json(401, { error: "Your session has expired. Please sign in again." });
  }
  const inviter = userResp.user;

  let body: any;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const { email, role, organization_id, action, invite_id } = body || {};
  if (!email || !organization_id) {
    return json(400, { error: "Missing required fields: email, organization_id." });
  }

  // Check inviter is Owner/Admin of the org
  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization_id)
    .eq("user_id", inviter.id)
    .maybeSingle();

  if (!membership || !["Owner", "Admin"].includes(membership.role)) {
    return json(403, { error: "Only Owners and Admins can invite team members." });
  }

  // ── RESEND: re-fire the email for an existing invite record ──────────────
  if (action === "resend") {
    if (!invite_id) return json(400, { error: "Missing invite_id for resend." });

    const { data: existingInvite } = await admin
      .from("organization_invites")
      .select("id, email")
      .eq("id", invite_id)
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (!existingInvite) {
      return json(404, { error: "Invitation not found." });
    }

    try {
      await admin.auth.admin.inviteUserByEmail(existingInvite.email, {
        redirectTo: `${appUrl}?invite_token=${existingInvite.id}`,
      });
    } catch (e) {
      console.warn("inviteUserByEmail (resend) failed:", e);
    }

    return json(200, { success: true, invite_token: existingInvite.id });
  }

  // ── NEW INVITE ────────────────────────────────────────────────────────────
  if (!role) return json(400, { error: "Missing required field: role." });
  if (!["Admin", "Manager", "Consultant"].includes(role)) {
    return json(400, { error: "Invalid role. Must be Admin, Manager, or Consultant." });
  }

  // Block re-invites if the email already belongs to a member of this org
  const { data: existingMember } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", organization_id)
    .eq("email", email)
    .maybeSingle();
  if (existingMember) {
    return json(409, { error: "This person is already a member of your team." });
  }

  // Block duplicate pending invites
  const { data: existingInvite } = await admin
    .from("organization_invites")
    .select("id")
    .eq("organization_id", organization_id)
    .eq("email", email)
    .maybeSingle();
  if (existingInvite) {
    return json(409, { error: "An invitation has already been sent to this email. Use Resend to send a new link." });
  }

  // Insert invite row (its UUID is the token)
  const { data: invite, error: insertErr } = await admin
    .from("organization_invites")
    .insert({ organization_id, email, role, invited_by: inviter.id })
    .select()
    .single();
  if (insertErr || !invite) {
    return json(500, { error: insertErr?.message ?? "Failed to create invitation." });
  }

  // Send the email via Supabase Auth admin API.
  try {
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}?invite_token=${invite.id}`,
    });
  } catch (e) {
    // Don't fail — admin can copy the token manually.
    console.warn("inviteUserByEmail failed:", e);
  }

  return json(200, {
    success: true,
    invite_token: invite.id,
    expires_at: invite.expires_at,
  });
};

export { handler };
