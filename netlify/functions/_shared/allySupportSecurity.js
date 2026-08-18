// @ts-check

export const ALLY_MAX_REQUEST_BYTES = 64 * 1024;
export const ALLY_MAX_MESSAGES = 30;
export const ALLY_MAX_MESSAGE_CHARS = 4_000;
export const ALLY_MAX_TOTAL_MESSAGE_CHARS = 30_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const MESSAGE_ROLES = new Set(["user", "assistant"]);

function requestError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function normalizeOptionalText(value, maxLength, fieldName) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") {
    throw requestError(`${fieldName} must be a string.`);
  }
  if (value.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw requestError(`${fieldName} is invalid.`);
  }
  return value;
}

export function parseAllySupportBody(rawBody) {
  if (typeof rawBody !== "string") {
    throw requestError("Invalid request body.");
  }
  if (Buffer.byteLength(rawBody, "utf8") > ALLY_MAX_REQUEST_BYTES) {
    throw requestError("Request body is too large.", 413);
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw requestError("Invalid request body.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw requestError("Invalid request body.");
  }
  if (typeof body.organization_id !== "string" || !UUID_PATTERN.test(body.organization_id)) {
    throw requestError("A valid organization_id is required.");
  }
  if (typeof body.sessionId !== "string" || !SESSION_ID_PATTERN.test(body.sessionId)) {
    throw requestError("A valid sessionId is required.");
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw requestError("At least one message is required.");
  }
  if (body.messages.length > ALLY_MAX_MESSAGES) {
    throw requestError("Too many messages.", 413);
  }

  let totalChars = 0;
  const messages = body.messages.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw requestError("Each message must be an object.");
    }
    if (!MESSAGE_ROLES.has(message.role)) {
      throw requestError("Each message must have a valid role.");
    }
    if (typeof message.text !== "string" || message.text.trim().length === 0) {
      throw requestError("Each message must contain text.");
    }
    if (message.text.length > ALLY_MAX_MESSAGE_CHARS) {
      throw requestError("A message is too large.", 413);
    }
    totalChars += message.text.length;
    if (totalChars > ALLY_MAX_TOTAL_MESSAGE_CHARS) {
      throw requestError("Conversation is too large.", 413);
    }
    return { role: message.role, text: message.text };
  });

  return {
    organizationId: body.organization_id,
    sessionId: body.sessionId,
    messages,
    context: normalizeOptionalText(body.context, 256, "context"),
    errors: normalizeOptionalText(body.errors, 2_000, "errors"),
  };
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
