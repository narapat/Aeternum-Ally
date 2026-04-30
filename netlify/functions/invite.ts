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

  const { email, role, organization_id } = body || {};
  if (!email || !role || !organization_id) {
    return json(400, { error: "Missing required fields: email, role, organization_id." });
  }
  if (!["Admin", "Manager", "Consultant"].includes(role)) {
    return json(400, { error: "Invalid role. Must be Admin, Manager, or Consultant." });
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

  // Insert invite row (its UUID is the token)
  const { data: invite, error: insertErr } = await admin
    .from("organization_invites")
    .insert({ organization_id, email, role, invited_by: inviter.id })
    .select()
    .single();
  if (insertErr || !invite) {
    return json(500, { error: insertErr?.message ?? "Failed to create invitation." });
  }

  // Send the email via Supabase Auth admin API (uses Supabase's email templates).
  // If the user already exists, this still sends a magic-link-style email pointing at our app.
  try {
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}?invite_token=${invite.id}`,
    });
  } catch (e) {
    // Don't fail the whole request if email delivery is unavailable — admin can copy the token.
    // eslint-disable-next-line no-console
    console.warn("inviteUserByEmail failed:", e);
  }

  return json(200, {
    success: true,
    invite_token: invite.id,
    expires_at: invite.expires_at,
  });
};

export { handler };
