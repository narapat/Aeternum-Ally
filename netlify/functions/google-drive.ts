import { createClient } from "@supabase/supabase-js";
import {
  buildGoogleDriveFilesUrl,
  canManageGoogleDrive,
  createGoogleOAuthState,
  hashGoogleOAuthState,
  isValidGoogleDriveOrganizationId,
  normalizeGoogleDriveListParams,
  toSafeGoogleDriveList,
} from "./_shared/googleDriveSecurity.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

type HandlerDependencies = {
  createAdminClient: () => any;
  fetchImpl: typeof fetch;
  clientId: string;
  clientSecret: string;
  appUrl: string;
  createState: () => string;
  now: () => Date;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

function getAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw Object.assign(new Error("Google Drive is temporarily unavailable."), {
      status: 503,
    });
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function defaultDependencies(): HandlerDependencies {
  return {
    createAdminClient: getAdminClient,
    fetchImpl: fetch,
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    appUrl: process.env.VITE_APP_URL ?? "http://localhost:8888",
    createState: createGoogleOAuthState,
    now: () => new Date(),
  };
}

function hasGoogleConfiguration(deps: HandlerDependencies) {
  return Boolean(deps.clientId && deps.clientSecret);
}

function redirectUri(appUrl: string) {
  return new URL("/.netlify/functions/google-callback", appUrl).toString();
}

function buildAuthorizationUrl(state: string, deps: HandlerDependencies) {
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("client_id", deps.clientId);
  url.searchParams.set("redirect_uri", redirectUri(deps.appUrl));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

async function getMembership(admin: any, organizationId: string, userId: string) {
  const { data, error } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not verify organization access.");
  return data ?? null;
}

async function getIntegration(admin: any, organizationId: string) {
  const { data, error } = await admin
    .from("organization_integrations")
    .select("id, access_token, refresh_token, expires_at")
    .eq("organization_id", organizationId)
    .eq("integration_type", "google_drive")
    .maybeSingle();
  if (error) throw new Error("Could not load Google Drive integration.");
  return data ?? null;
}

async function refreshAccessToken(
  refreshToken: string,
  deps: HandlerDependencies,
) {
  const response = await deps.fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: deps.clientId,
      client_secret: deps.clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!response.ok) {
    throw Object.assign(new Error("Google rejected the token refresh."), {
      status: 502,
      providerStatus: response.status,
    });
  }
  const tokens = await response.json() as GoogleTokenResponse;
  if (typeof tokens.access_token !== "string" || tokens.access_token.length === 0) {
    throw Object.assign(new Error("Google returned an invalid OAuth response."), { status: 502 });
  }
  return tokens;
}

async function getValidAccessToken(
  admin: any,
  integration: any,
  deps: HandlerDependencies,
) {
  const expiresAt = integration.expires_at
    ? new Date(integration.expires_at).getTime()
    : 0;
  if (expiresAt - deps.now().getTime() > 60_000) {
    return integration.access_token as string;
  }
  if (typeof integration.refresh_token !== "string" || !integration.refresh_token) {
    throw Object.assign(new Error("Google Drive must be reconnected."), { status: 409 });
  }

  const tokens = await refreshAccessToken(integration.refresh_token, deps);
  const expiresAtIso = new Date(
    deps.now().getTime() + (tokens.expires_in ?? 3600) * 1000,
  ).toISOString();
  const { error } = await admin
    .from("organization_integrations")
    .update({ access_token: tokens.access_token, expires_at: expiresAtIso })
    .eq("id", integration.id);
  if (error) throw new Error("Could not refresh Google Drive integration.");
  return tokens.access_token;
}

async function parseJsonBody(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw Object.assign(new Error("Content-Type must be application/json."), { status: 415 });
  }
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error("Invalid JSON."), { status: 400 });
  }
}

async function handleGoogleDrive(
  request: Request,
  deps: HandlerDependencies,
) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { Allow: "GET, POST, DELETE, OPTIONS" },
    });
  }
  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    return json(405, { error: "Method not allowed." });
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) {
    return json(403, { error: "Cross-origin requests are not allowed." });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "You must be signed in to use Google Drive." });
  }

  let body: any = null;
  if (["POST", "DELETE"].includes(request.method)) {
    try {
      body = await parseJsonBody(request);
    } catch (error: any) {
      return json(error.status ?? 400, { error: error.message });
    }
  }

  const action = request.method === "GET"
    ? requestUrl.searchParams.get("action")
    : body?.action ?? (request.method === "DELETE" ? "disconnect" : null);
  const organizationId = request.method === "GET"
    ? requestUrl.searchParams.get("organization_id")
    : body?.organization_id;
  if (!isValidGoogleDriveOrganizationId(organizationId)) {
    return json(400, { error: "A valid organization_id is required." });
  }

  try {
    const admin = deps.createAdminClient();
    const accessToken = authHeader.slice("Bearer ".length);
    const { data: userResponse, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !userResponse?.user) {
      return json(401, { error: "Your session has expired. Please sign in again." });
    }

    const membership = await getMembership(admin, organizationId, userResponse.user.id);
    if (!membership) {
      return json(403, { error: "You don't have access to this organization." });
    }

    if (request.method === "GET" && action === "token") {
      return json(404, { error: "This Google Drive operation is not available." });
    }

    if (request.method === "GET" && action === "status") {
      const integration = await getIntegration(admin, organizationId);
      return json(200, {
        configured: hasGoogleConfiguration(deps),
        connected: Boolean(integration),
        can_manage: canManageGoogleDrive(membership.role),
      });
    }

    if (request.method === "POST" && action === "connect") {
      if (!canManageGoogleDrive(membership.role)) {
        return json(403, { error: "Only Owners and Admins can connect Google Drive." });
      }
      if (!hasGoogleConfiguration(deps)) {
        return json(503, { error: "Google Drive is not configured on this server." });
      }

      const state = deps.createState();
      const expiresAt = new Date(deps.now().getTime() + OAUTH_STATE_TTL_MS).toISOString();
      const { error } = await admin.from("organization_oauth_states").insert({
        state_hash: hashGoogleOAuthState(state),
        organization_id: organizationId,
        user_id: userResponse.user.id,
        integration_type: "google_drive",
        expires_at: expiresAt,
      });
      if (error) throw new Error("Could not start Google Drive authorization.");
      return json(200, { authorization_url: buildAuthorizationUrl(state, deps) });
    }

    if (request.method === "GET" && action === "files") {
      if (!hasGoogleConfiguration(deps)) {
        return json(503, { error: "Google Drive is not configured on this server." });
      }
      const integration = await getIntegration(admin, organizationId);
      if (!integration) {
        return json(409, { error: "Google Drive is not connected for this organization." });
      }
      const params = normalizeGoogleDriveListParams(
        requestUrl.searchParams.get("search"),
        requestUrl.searchParams.get("page_token"),
      );
      const googleAccessToken = await getValidAccessToken(admin, integration, deps);
      const response = await deps.fetchImpl(buildGoogleDriveFilesUrl(params), {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
      });
      if (!response.ok) {
        throw Object.assign(new Error("Google Drive request failed."), {
          status: 502,
          providerStatus: response.status,
        });
      }
      return json(200, toSafeGoogleDriveList(await response.json()));
    }

    if (request.method === "DELETE" && action === "disconnect") {
      if (!canManageGoogleDrive(membership.role)) {
        return json(403, { error: "Only Owners and Admins can disconnect Google Drive." });
      }
      const { error } = await admin
        .from("organization_integrations")
        .delete()
        .eq("organization_id", organizationId)
        .eq("integration_type", "google_drive");
      if (error) throw new Error("Could not disconnect Google Drive.");
      return json(200, { success: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error: any) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const providerStatus = typeof error?.providerStatus === "number"
      ? ` provider_status=${error.providerStatus}`
      : "";
    console.error(`[google-drive] request failed status=${status}${providerStatus}`);
    const message = [400, 409, 415].includes(status)
      ? error.message
      : "Google Drive is temporarily unavailable. Please try again later.";
    return json(status, { error: message });
  }
}

export function createGoogleDriveHandler(
  overrides: Partial<HandlerDependencies> = {},
) {
  return (request: Request) => handleGoogleDrive(request, {
    ...defaultDependencies(),
    ...overrides,
  });
}

export default createGoogleDriveHandler();

export const config = {
  path: "/.netlify/functions/google-drive",
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
} as const;
