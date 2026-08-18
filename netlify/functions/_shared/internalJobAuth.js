// @ts-check

import { createHash, timingSafeEqual } from "node:crypto";

export const INTERNAL_JOB_SECRET_HEADER = "x-internal-job-secret";
const MIN_SECRET_LENGTH = 32;

const jsonError = (statusCode, error) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ error }),
});

/**
 * @param {Record<string, string | undefined> | undefined} headers
 * @param {string} name
 */
function getHeader(headers, name) {
  const entry = Object.entries(headers ?? {}).find(
    ([headerName]) => headerName.toLowerCase() === name,
  );
  return entry?.[1];
}

/** @param {string | undefined} secret */
function isConfiguredSecret(secret) {
  return typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH;
}

function unavailableError() {
  const error = new Error(
    "Background processing is temporarily unavailable. Please contact the administrator.",
  );
  // api.ts maps numeric status values to the HTTP response code.
  // @ts-ignore -- status is intentionally attached for the existing error mapper.
  error.status = 503;
  return error;
}

/**
 * Compare fixed-length hashes so the comparison does not reveal secret length.
 * @param {string} provided
 * @param {string} expected
 */
function secretsMatch(provided, expected) {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

/**
 * @param {{ headers?: Record<string, string | undefined> }} event
 * @param {string | undefined} [configuredSecret]
 */
export function requireInternalJobAuth(
  event,
  configuredSecret = process.env.INTERNAL_JOB_SECRET,
) {
  if (!isConfiguredSecret(configuredSecret)) {
    console.error(
      `[security] INTERNAL_JOB_SECRET must contain at least ${MIN_SECRET_LENGTH} characters.`,
    );
    return jsonError(503, "Background processing is temporarily unavailable.");
  }

  const providedSecret = getHeader(event.headers, INTERNAL_JOB_SECRET_HEADER);
  if (!providedSecret || !secretsMatch(providedSecret, configuredSecret)) {
    return jsonError(401, "Unauthorized background job request.");
  }

  return null;
}

/** @param {string | undefined} [configuredSecret] */
export function createInternalJobHeaders(
  configuredSecret = process.env.INTERNAL_JOB_SECRET,
) {
  if (!isConfiguredSecret(configuredSecret)) {
    console.error(
      `[security] INTERNAL_JOB_SECRET must contain at least ${MIN_SECRET_LENGTH} characters.`,
    );
    throw unavailableError();
  }

  return {
    "Content-Type": "application/json",
    [INTERNAL_JOB_SECRET_HEADER]: configuredSecret,
  };
}

/**
 * Build a trusted function URL without trusting a caller-controlled Host header.
 * The Host header is used only for loopback traffic during local development.
 *
 * @param {{ headers?: Record<string, string | undefined> }} event
 * @param {string} functionName
 * @param {string | undefined} [configuredBaseUrl]
 */
export function createInternalFunctionUrl(
  event,
  functionName,
  configuredBaseUrl =
    process.env.INTERNAL_FUNCTION_BASE_URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.DEPLOY_URL ||
    process.env.URL,
) {
  if (!/^[a-z0-9-]+$/.test(functionName)) {
    console.error("[security] Invalid internal function name.");
    throw unavailableError();
  }

  let baseUrl;
  if (configuredBaseUrl) {
    try {
      baseUrl = new URL(configuredBaseUrl);
    } catch {
      console.error("[security] Netlify deployment URL is invalid.");
      throw unavailableError();
    }
  } else {
    const host = getHeader(event.headers, "host");
    if (!host) {
      console.error("[security] No trusted deployment URL is available.");
      throw unavailableError();
    }

    try {
      baseUrl = new URL(`http://${host}`);
    } catch {
      console.error("[security] Local function host is invalid.");
      throw unavailableError();
    }
  }

  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(
    baseUrl.hostname,
  );
  if (baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && isLoopback)) {
    console.error("[security] Internal function URL must use HTTPS outside local development.");
    throw unavailableError();
  }

  if (!configuredBaseUrl && !isLoopback) {
    console.error("[security] Refusing an untrusted Host header for an internal function call.");
    throw unavailableError();
  }

  return new URL(`/.netlify/functions/${functionName}`, baseUrl).toString();
}
