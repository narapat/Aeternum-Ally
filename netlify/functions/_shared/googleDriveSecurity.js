// @ts-check

import { createHash, randomBytes } from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OAUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
const GOOGLE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export function isValidGoogleDriveOrganizationId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function canManageGoogleDrive(role) {
  return role === "Owner" || role === "Admin";
}

export function createGoogleOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function isValidGoogleOAuthState(value) {
  return typeof value === "string" && OAUTH_STATE_PATTERN.test(value);
}

export function hashGoogleOAuthState(value) {
  if (!isValidGoogleOAuthState(value)) {
    throw Object.assign(new Error("Invalid OAuth state."), { status: 400 });
  }
  return createHash("sha256").update(value).digest("hex");
}

function normalizeOptionalText(value, maxLength, fieldName) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw Object.assign(new Error(`${fieldName} must be a string.`), { status: 400 });
  }
  const normalized = value.trim();
  if (normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw Object.assign(new Error(`${fieldName} is invalid.`), { status: 400 });
  }
  return normalized || null;
}

export function normalizeGoogleDriveListParams(search, pageToken) {
  return {
    search: normalizeOptionalText(search, 100, "search"),
    pageToken: normalizeOptionalText(pageToken, 2048, "page_token"),
  };
}

function escapeDriveQueryValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function buildGoogleDriveFilesUrl({ search, pageToken }) {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  const query = [
    "trashed = false",
    `mimeType != '${GOOGLE_FOLDER_MIME_TYPE}'`,
  ];
  if (search) query.push(`name contains '${escapeDriveQueryValue(search)}'`);

  url.searchParams.set("q", query.join(" and "));
  url.searchParams.set("pageSize", "30");
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,size,modifiedTime)");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  return url;
}

function safeSize(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const size = Number(value);
  return Number.isSafeInteger(size) ? size : null;
}

export function toSafeGoogleDriveFile(file) {
  if (!DRIVE_FILE_ID_PATTERN.test(file?.id ?? "")) return null;
  const name = typeof file?.name === "string" ? file.name.slice(0, 512) : "Untitled file";
  const mimeType = typeof file?.mimeType === "string"
    ? file.mimeType.slice(0, 255)
    : "application/octet-stream";
  const modifiedTime = typeof file?.modifiedTime === "string"
    && !Number.isNaN(Date.parse(file.modifiedTime))
    ? file.modifiedTime
    : null;

  return {
    id: file.id,
    name,
    url: `https://drive.google.com/open?id=${encodeURIComponent(file.id)}`,
    mimeType,
    sizeBytes: safeSize(file.size),
    modifiedTime,
  };
}

export function toSafeGoogleDriveList(payload) {
  const files = Array.isArray(payload?.files)
    ? payload.files.map(toSafeGoogleDriveFile).filter(Boolean)
    : [];
  const nextPageToken = normalizeOptionalText(
    payload?.nextPageToken,
    2048,
    "next_page_token",
  );
  return { files, next_page_token: nextPageToken };
}
