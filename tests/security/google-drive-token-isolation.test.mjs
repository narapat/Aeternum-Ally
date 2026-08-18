import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createGoogleDriveHandler,
  config as googleDriveConfig,
} from "../../netlify/functions/google-drive.ts";
import {
  buildGoogleDriveFilesUrl,
  canManageGoogleDrive,
  hashGoogleOAuthState,
  isValidGoogleOAuthState,
  normalizeGoogleDriveListParams,
  toSafeGoogleDriveList,
} from "../../netlify/functions/_shared/googleDriveSecurity.js";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const OAUTH_STATE = "s".repeat(43);
const GOOGLE_ACCESS_TOKEN = "google-access-token-must-not-leak";
const GOOGLE_REFRESH_TOKEN = "google-refresh-token-must-not-leak";
const NOW = new Date("2026-08-18T10:00:00.000Z");

function createAdminMock({
  role = "Owner",
  integration = {
    id: "33333333-3333-4333-8333-333333333333",
    access_token: GOOGLE_ACCESS_TOKEN,
    refresh_token: GOOGLE_REFRESH_TOKEN,
    expires_at: "2026-08-18T12:00:00.000Z",
  },
} = {}) {
  const calls = [];
  const admin = {
    calls,
    auth: {
      getUser: async (token) => {
        calls.push({ operation: "getUser", token });
        return {
          data: { user: { id: USER_ID } },
          error: null,
        };
      },
    },
    from(table) {
      const filters = [];
      let operation = null;
      let columns = null;
      let payload = null;
      const query = {
        select(value) {
          operation = "select";
          columns = value;
          return query;
        },
        insert(value) {
          operation = "insert";
          payload = value;
          calls.push({ table, operation, payload });
          return Promise.resolve({ error: null });
        },
        update(value) {
          operation = "update";
          payload = value;
          return query;
        },
        delete() {
          operation = "delete";
          return query;
        },
        eq(column, value) {
          filters.push([column, value]);
          return query;
        },
        async maybeSingle() {
          calls.push({ table, operation, columns, filters });
          if (table === "organization_members") {
            return { data: role ? { role } : null, error: null };
          }
          if (table === "organization_integrations") {
            return { data: integration, error: null };
          }
          throw new Error(`Unexpected table ${table}`);
        },
        then(resolve, reject) {
          calls.push({ table, operation, columns, filters, payload });
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return admin;
}

function createHandler(admin, fetchImpl = async () => {
  throw new Error("Unexpected provider request");
}) {
  return createGoogleDriveHandler({
    createAdminClient: () => admin,
    fetchImpl,
    clientId: "google-client-id",
    clientSecret: "google-client-secret",
    appUrl: "https://app.example.com",
    createState: () => OAUTH_STATE,
    now: () => NOW,
  });
}

function apiRequest(path, options = {}) {
  return new Request(`https://app.example.com/.netlify/functions/google-drive${path}`, options);
}

test("only Owner and Admin roles can manage the Google Drive integration", () => {
  assert.equal(canManageGoogleDrive("Owner"), true);
  assert.equal(canManageGoogleDrive("Admin"), true);
  assert.equal(canManageGoogleDrive("Manager"), false);
  assert.equal(canManageGoogleDrive("Consultant"), false);
  assert.equal(canManageGoogleDrive(undefined), false);
});

test("OAuth state is opaque, fixed-length, and stored as a one-way hash", () => {
  assert.equal(isValidGoogleOAuthState(OAUTH_STATE), true);
  assert.equal(isValidGoogleOAuthState(Buffer.from(`${ORG_ID}:${USER_ID}`).toString("base64")), false);
  assert.match(hashGoogleOAuthState(OAUTH_STATE), /^[a-f0-9]{64}$/);
  assert.notEqual(hashGoogleOAuthState(OAUTH_STATE), OAUTH_STATE);
});

test("Drive list inputs stay on the fixed Google API origin and escape search syntax", () => {
  const params = normalizeGoogleDriveListParams("Q3's \\ report", "page-token");
  const url = buildGoogleDriveFilesUrl(params);

  assert.equal(url.origin, "https://www.googleapis.com");
  assert.equal(url.pathname, "/drive/v3/files");
  assert.match(url.searchParams.get("q"), /name contains 'Q3\\'s \\\\ report'/);
  assert.equal(url.searchParams.get("pageToken"), "page-token");
  assert.throws(
    () => normalizeGoogleDriveListParams("x".repeat(101), null),
    /search is invalid/,
  );
});

test("provider payload is reduced to safe file metadata", () => {
  const safe = toSafeGoogleDriveList({
    access_token: GOOGLE_ACCESS_TOKEN,
    refresh_token: GOOGLE_REFRESH_TOKEN,
    nextPageToken: "next-page",
    files: [
      {
        id: "safe-file-id",
        name: "Board report.pdf",
        mimeType: "application/pdf",
        size: "4096",
        modifiedTime: "2026-08-17T09:00:00.000Z",
        owners: [{ emailAddress: "private@example.com" }],
      },
      { id: "../../unsafe", name: "drop-me" },
    ],
  });

  assert.equal(safe.files.length, 1);
  assert.deepEqual(safe.files[0], {
    id: "safe-file-id",
    name: "Board report.pdf",
    url: "https://drive.google.com/open?id=safe-file-id",
    mimeType: "application/pdf",
    sizeBytes: 4096,
    modifiedTime: "2026-08-17T09:00:00.000Z",
  });
  assert.equal(safe.next_page_token, "next-page");
  assert.doesNotMatch(JSON.stringify(safe), /access_token|refresh_token|private@example\.com/);
});

test("Google Drive endpoint rejects cross-origin and unauthenticated requests early", async () => {
  const admin = createAdminMock();
  const handler = createHandler(admin);

  const crossOrigin = await handler(apiRequest(
    `?action=status&organization_id=${ORG_ID}`,
    { headers: { Origin: "https://attacker.example" } },
  ));
  assert.equal(crossOrigin.status, 403);

  const unauthenticated = await handler(apiRequest(
    `?action=status&organization_id=${ORG_ID}`,
  ));
  assert.equal(unauthenticated.status, 401);
  assert.equal(admin.calls.length, 0);
});

test("no organization role can receive a raw OAuth token", async () => {
  for (const role of ["Consultant", "Manager", "Admin", "Owner"]) {
    const admin = createAdminMock({ role });
    const response = await createHandler(admin)(apiRequest(
      `?action=token&organization_id=${ORG_ID}`,
      { headers: { Authorization: `Bearer ${role.toLowerCase()}-token` } },
    ));
    const body = await response.json();

    assert.equal(response.status, 404, role);
    assert.equal("access_token" in body, false, role);
    assert.equal("refresh_token" in body, false, role);
    assert.doesNotMatch(JSON.stringify(body), /google-access-token|google-refresh-token/);
  }
});

test("status returns safe connection metadata and server-derived management permission", async () => {
  const admin = createAdminMock({ role: "Manager" });
  const response = await createHandler(admin)(apiRequest(
    `?action=status&organization_id=${ORG_ID}`,
    { headers: { Authorization: "Bearer manager-token" } },
  ));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    configured: true,
    connected: true,
    can_manage: false,
  });
  assert.equal("access_token" in body, false);
  assert.equal("refresh_token" in body, false);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(GOOGLE_ACCESS_TOKEN));
});

test("cross-tenant requests are rejected before integration credentials are read", async () => {
  const admin = createAdminMock({ role: null });
  const response = await createHandler(admin)(apiRequest(
    `?action=files&organization_id=${ORG_ID}`,
    { headers: { Authorization: "Bearer outsider-token" } },
  ));

  assert.equal(response.status, 403);
  assert.equal(
    admin.calls.some((call) => call.table === "organization_integrations"),
    false,
  );
});

test("Manager and Consultant cannot start OAuth or create state rows", async () => {
  for (const role of ["Manager", "Consultant"]) {
    const admin = createAdminMock({ role });
    const response = await createHandler(admin)(apiRequest("", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${role.toLowerCase()}-token`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "connect", organization_id: ORG_ID }),
    }));

    assert.equal(response.status, 403, role);
    assert.equal(
      admin.calls.some((call) => call.table === "organization_oauth_states"),
      false,
    );
  }
});

test("integration disconnect is denied to Manager and allowed to Owner", async () => {
  const managerAdmin = createAdminMock({ role: "Manager" });
  const managerResponse = await createHandler(managerAdmin)(apiRequest("", {
    method: "DELETE",
    headers: {
      Authorization: "Bearer manager-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ organization_id: ORG_ID }),
  }));
  assert.equal(managerResponse.status, 403);
  assert.equal(
    managerAdmin.calls.some((call) =>
      call.table === "organization_integrations" && call.operation === "delete"
    ),
    false,
  );

  const ownerAdmin = createAdminMock({ role: "Owner" });
  const ownerResponse = await createHandler(ownerAdmin)(apiRequest("", {
    method: "DELETE",
    headers: {
      Authorization: "Bearer owner-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ organization_id: ORG_ID }),
  }));
  assert.equal(ownerResponse.status, 200);
  assert.equal(
    ownerAdmin.calls.some((call) =>
      call.table === "organization_integrations" && call.operation === "delete"
    ),
    true,
  );
});

test("Owner starts OAuth with a hashed, expiring state and receives no credential", async () => {
  const admin = createAdminMock({ role: "Owner" });
  const response = await createHandler(admin)(apiRequest("", {
    method: "POST",
    headers: {
      Authorization: "Bearer owner-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "connect", organization_id: ORG_ID }),
  }));
  const body = await response.json();
  const stateInsert = admin.calls.find(
    (call) => call.table === "organization_oauth_states" && call.operation === "insert",
  );

  assert.equal(response.status, 200);
  assert.equal("access_token" in body, false);
  assert.equal("refresh_token" in body, false);
  assert.equal(stateInsert.payload.state_hash, hashGoogleOAuthState(OAUTH_STATE));
  assert.equal(JSON.stringify(stateInsert.payload).includes(OAUTH_STATE), false);
  assert.equal(stateInsert.payload.expires_at, "2026-08-18T10:10:00.000Z");

  const authorizationUrl = new URL(body.authorization_url);
  assert.equal(authorizationUrl.origin, "https://accounts.google.com");
  assert.equal(authorizationUrl.searchParams.get("state"), OAUTH_STATE);
  assert.equal(authorizationUrl.searchParams.get("scope"), "https://www.googleapis.com/auth/drive.readonly");
});

test("member file listing proxies the credential and returns only safe metadata", async () => {
  const admin = createAdminMock({ role: "Consultant" });
  let providerRequest = null;
  const handler = createHandler(admin, async (url, options) => {
    providerRequest = { url: url.toString(), options };
    return Response.json({
      access_token: GOOGLE_ACCESS_TOKEN,
      files: [{
        id: "drive-file-id",
        name: "Emissions.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: "1024",
        modifiedTime: "2026-08-18T09:00:00.000Z",
      }],
    });
  });
  const response = await handler(apiRequest(
    `?action=files&organization_id=${ORG_ID}&search=Emissions`,
    { headers: { Authorization: "Bearer consultant-token" } },
  ));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(new URL(providerRequest.url).origin, "https://www.googleapis.com");
  assert.equal(providerRequest.options.headers.Authorization, `Bearer ${GOOGLE_ACCESS_TOKEN}`);
  assert.equal(body.files.length, 1);
  assert.equal(body.files[0].id, "drive-file-id");
  assert.equal("access_token" in body, false);
  assert.equal("refresh_token" in body, false);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(GOOGLE_ACCESS_TOKEN));
});

test("provider failures do not copy response bodies or credentials into errors and logs", async (t) => {
  const admin = createAdminMock();
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  t.after(() => { console.error = originalConsoleError; });

  const handler = createHandler(admin, async () => new Response(
    `provider failure ${GOOGLE_ACCESS_TOKEN} ${GOOGLE_REFRESH_TOKEN}`,
    { status: 500 },
  ));
  const response = await handler(apiRequest(
    `?action=files&organization_id=${ORG_ID}`,
    { headers: { Authorization: "Bearer owner-token" } },
  ));
  const body = await response.text();
  const combined = `${body}\n${logs.join("\n")}`;

  assert.equal(response.status, 502);
  assert.doesNotMatch(combined, new RegExp(GOOGLE_ACCESS_TOKEN));
  assert.doesNotMatch(combined, new RegExp(GOOGLE_REFRESH_TOKEN));
  assert.doesNotMatch(combined, /provider failure/);
});

test("Google Drive endpoint has a strict per-IP rate limit", () => {
  assert.equal(googleDriveConfig.path, "/.netlify/functions/google-drive");
  assert.deepEqual(googleDriveConfig.rateLimit.aggregateBy, ["ip", "domain"]);
  assert.equal(googleDriveConfig.rateLimit.windowLimit, 60);
  assert.equal(googleDriveConfig.rateLimit.windowSize, 60);
});

test("migration denies browser roles access to OAuth credentials and state", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/022_google_drive_token_isolation.sql", import.meta.url),
    "utf8",
  );

  assert.match(
    migration,
    /REVOKE ALL ON TABLE organization_integrations FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(migration, /GRANT ALL ON TABLE organization_integrations TO service_role/i);
  assert.match(migration, /CREATE TABLE organization_oauth_states/i);
  assert.match(migration, /ALTER TABLE organization_oauth_states ENABLE ROW LEVEL SECURITY/i);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE organization_oauth_states FROM PUBLIC, anon, authenticated/i,
  );
  assert.doesNotMatch(migration, /CREATE POLICY[\s\S]+ON organization_oauth_states/i);
});

test("legacy callback consumes hashed state and keeps the raw-token route retired", async () => {
  const callbackSource = await readFile(
    new URL("../../netlify/functions/google-callback.ts", import.meta.url),
    "utf8",
  );

  assert.match(callbackSource, /from\('organization_oauth_states'\)[\s\S]+\.delete\(\)/);
  assert.match(callbackSource, /hashGoogleOAuthState\(state\)/);
  assert.match(callbackSource, /canManageGoogleDrive\(membership\.role\)/);
  assert.doesNotMatch(callbackSource, /Buffer\.from\(state/);
  assert.doesNotMatch(callbackSource, /return json\(200,\s*\{\s*access_token/);
  assert.match(
    callbackSource,
    /qs\.action === 'token'[\s\S]{0,500}return json\(404/,
  );
  assert.match(
    callbackSource,
    /qs\.error[\s\S]{0,600}from\('organization_oauth_states'\)[\s\S]{0,300}\.delete\(\)/,
  );
});

test("browser service contains no Google OAuth token or Picker API flow", async () => {
  const serviceSource = await readFile(
    new URL("../../services/googleDriveService.ts", import.meta.url),
    "utf8",
  );

  assert.match(serviceSource, /\.netlify\/functions\/google-drive/);
  assert.doesNotMatch(serviceSource, /getGoogleDriveAccessToken|openGooglePicker|setOAuthToken/);
  assert.doesNotMatch(serviceSource, /VITE_GOOGLE_API_KEY|VITE_GOOGLE_CLIENT_ID/);
  assert.doesNotMatch(serviceSource, /action=token/);
});

test("platform-admin company export excludes the OAuth credential table", async () => {
  const adminSource = await readFile(
    new URL("../../netlify/functions/admin.ts", import.meta.url),
    "utf8",
  );
  const tableList = adminSource.match(
    /const ORG_SCOPED_TABLES = \[([\s\S]*?)\] as const;/,
  );

  assert.ok(tableList);
  assert.doesNotMatch(tableList[1], /organization_integrations/);
});

test("Settings provides role-aware Drive management through the proxy", async () => {
  const settingsSource = await readFile(
    new URL("../../components/SettingsDashboard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(settingsSource, /id: 'integrations'/);
  assert.match(settingsSource, /getGoogleDriveStatus\(organizationId, token\)/);
  assert.match(settingsSource, /connectGoogleDrive\(organizationId, token\)/);
  assert.match(settingsSource, /disconnectGoogleDrive\(organizationId, token\)/);
  assert.match(settingsSource, /roleCanManage[\s\S]+Owner[\s\S]+Admin/);
  assert.match(settingsSource, /driveStatus\?\.canManage === true/);
  assert.doesNotMatch(settingsSource, /GOOGLE_CLIENT_SECRET|VITE_GOOGLE_API_KEY/);
  assert.doesNotMatch(settingsSource, /getGoogleDriveAccessToken|openGooglePicker/);
});

test("Evidence picker distinguishes a status failure from missing server configuration", async () => {
  const evidenceSource = await readFile(
    new URL("../../components/EvidenceBadge.tsx", import.meta.url),
    "utf8",
  );

  assert.match(evidenceSource, /driveStatusError/);
  assert.match(evidenceSource, /Could not check the Google Drive connection/);
  assert.match(evidenceSource, /Retry Google Drive status/);
  assert.doesNotMatch(evidenceSource, /\.catch\(\(\) => \{\}\)/);
});
