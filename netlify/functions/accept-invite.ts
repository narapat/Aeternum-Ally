import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
        "Invitation acceptance is unavailable. The server is missing Supabase credentials. Please contact the administrator.",
    });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json(401, { error: "You must be signed in to accept an invitation." });
  }
  const accessToken = authHeader.slice("Bearer ".length);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userResp, error: userErr } = await admin.auth.getUser(accessToken);
  if (userErr || !userResp?.user) {
    return json(401, { error: "Your session has expired. Please sign in again." });
  }
  const user = userResp.user;

  let body: any;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid request body." });
  }
  const { invite_token } = body || {};
  if (!invite_token) {
    return json(400, { error: "Missing invite token." });
  }

  // Look up invite by token (id), check not expired
  const { data: invite, error: inviteErr } = await admin
    .from("organization_invites")
    .select("*")
    .eq("id", invite_token)
    .maybeSingle();

  if (inviteErr) return json(500, { error: inviteErr.message });
  if (!invite) {
    return json(404, { error: "This invitation could not be found. It may have already been used." });
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return json(410, { error: "This invitation has expired. Please ask your admin for a new one." });
  }
  if (user.email && invite.email && user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return json(403, {
      error: `This invitation was sent to ${invite.email}. Please sign in with that email address to accept.`,
    });
  }

  // Fetch company name for the welcome message (best-effort)
  const { data: profile } = await admin
    .from("company_profiles")
    .select("name")
    .eq("organization_id", invite.organization_id)
    .maybeSingle();
  const companyName: string = profile?.name || "";

  // Add to org
  const { error: memberErr } = await admin.from("organization_members").insert({
    organization_id: invite.organization_id,
    user_id: user.id,
    role: invite.role,
    email: user.email ?? invite.email,
    invited_by: invite.invited_by,
  });
  if (memberErr) {
    if (memberErr.code === "23505") {
      // already a member — clean up the invite anyway
      await admin.from("organization_invites").delete().eq("id", invite_token);
      return json(200, { success: true, organization_id: invite.organization_id, company_name: companyName });
    }
    return json(500, { error: memberErr.message });
  }

  // Burn the invite
  await admin.from("organization_invites").delete().eq("id", invite_token);

  return json(200, { success: true, organization_id: invite.organization_id, company_name: companyName });
};

export { handler };
