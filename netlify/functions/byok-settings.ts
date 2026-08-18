import { createClient } from "@supabase/supabase-js";
import {
  canManageByok,
  isValidOrganizationId,
  normalizeByokUpdate,
  toSafeByokMetadata,
} from "./_shared/byokSecurity.js";

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

function getAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw Object.assign(new Error("BYOK settings are temporarily unavailable."), {
      status: 503,
    });
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function loadSafeMetadata(admin: any, organizationId: string) {
  const [{ data: settings, error: settingsError }, { data: secret, error: secretError }] =
    await Promise.all([
      admin
        .from("organization_ai_settings")
        .select("model, use_byok, byok_provider, soft_quota_monthly")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      admin
        .from("organization_ai_secrets")
        .select("organization_id")
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);

  if (settingsError || secretError) {
    throw new Error("Could not load BYOK metadata.");
  }
  return toSafeByokMetadata(settings, Boolean(secret));
}

async function handleByokSettings(
  request: Request,
  createAdminClient: () => any,
) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { Allow: "GET, PUT, OPTIONS" } });
  }
  if (!["GET", "PUT"].includes(request.method)) {
    return json(405, { error: "Method not allowed." });
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) {
    return json(403, { error: "Cross-origin requests are not allowed." });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "You must be signed in to manage BYOK settings." });
  }

  let body: any = null;
  if (request.method === "PUT") {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return json(415, { error: "Content-Type must be application/json." });
    }
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "Invalid JSON." });
    }
  }

  const organizationId =
    request.method === "GET"
      ? requestUrl.searchParams.get("organization_id")
      : body?.organization_id;
  if (!isValidOrganizationId(organizationId)) {
    return json(400, { error: "A valid organization_id is required." });
  }

  try {
    const admin = createAdminClient();
    const accessToken = authHeader.slice("Bearer ".length);
    const { data: userResponse, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !userResponse?.user) {
      return json(401, { error: "Your session has expired. Please sign in again." });
    }

    const { data: membership, error: membershipError } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userResponse.user.id)
      .maybeSingle();
    if (membershipError || !membership) {
      return json(403, { error: "You don't have access to this organization." });
    }

    if (request.method === "GET") {
      return json(200, await loadSafeMetadata(admin, organizationId));
    }

    if (!canManageByok(membership.role)) {
      return json(403, { error: "Only Owners and Admins can manage BYOK settings." });
    }

    const { data: existingSecret, error: secretLookupError } = await admin
      .from("organization_ai_secrets")
      .select("organization_id")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (secretLookupError) throw new Error("Could not load BYOK metadata.");

    const update = normalizeByokUpdate(body, Boolean(existingSecret));

    if (update.keyAction === "set") {
      const { error } = await admin.from("organization_ai_secrets").upsert(
        { organization_id: organizationId, byok_api_key: update.key },
        { onConflict: "organization_id" },
      );
      if (error) throw new Error("Could not store the BYOK credential.");
    }

    const { error: settingsError } = await admin.from("organization_ai_settings").upsert(
      {
        organization_id: organizationId,
        use_byok: update.useByok,
        byok_provider: update.provider,
      },
      { onConflict: "organization_id" },
    );
    if (settingsError) throw new Error("Could not update BYOK settings.");

    if (update.keyAction === "clear") {
      const { error } = await admin
        .from("organization_ai_secrets")
        .delete()
        .eq("organization_id", organizationId);
      if (error) throw new Error("Could not clear the BYOK credential.");
    }

    return json(200, await loadSafeMetadata(admin, organizationId));
  } catch (error: any) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const message = status === 400 || status === 503
      ? error.message
      : "BYOK settings are temporarily unavailable. Please try again later.";
    console.error(`[byok-settings] request failed status=${status}`);
    return json(status, { error: message });
  }
}

export function createByokSettingsHandler(
  createAdminClient: () => any = getAdminClient,
) {
  return (request: Request) => handleByokSettings(request, createAdminClient);
}

export default createByokSettingsHandler();

export const config = {
  path: "/.netlify/functions/byok-settings",
  rateLimit: {
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
} as const;
