// @ts-check

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidOrganizationId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function canManageByok(role) {
  return role === "Owner" || role === "Admin";
}

export function toSafeByokMetadata(settings, hasSecret) {
  return {
    model: settings?.model ?? "gemini-2.5-flash",
    use_byok: settings?.use_byok === true,
    byok_provider: settings?.byok_provider ?? null,
    has_byok_key: Boolean(hasSecret),
    soft_quota_monthly: settings?.soft_quota_monthly ?? null,
  };
}

/**
 * @param {any} input
 * @param {boolean} hasExistingSecret
 */
export function normalizeByokUpdate(input, hasExistingSecret) {
  if (typeof input?.use_byok !== "boolean") {
    throw Object.assign(new Error("use_byok must be a boolean."), { status: 400 });
  }

  const provider = input.use_byok ? input.byok_provider : null;
  if (input.use_byok && provider !== "gemini") {
    throw Object.assign(new Error("Only the Gemini BYOK provider is supported."), {
      status: 400,
    });
  }

  const hasKeyField = Object.prototype.hasOwnProperty.call(input, "byok_api_key");
  if (!input.use_byok) {
    if (hasKeyField && input.byok_api_key !== null) {
      throw Object.assign(new Error("Disable BYOK before clearing its key."), {
        status: 400,
      });
    }
    return { useByok: false, provider: null, keyAction: "clear", key: null };
  }

  if (!hasKeyField) {
    if (!hasExistingSecret) {
      throw Object.assign(new Error("A BYOK API key is required."), { status: 400 });
    }
    return { useByok: true, provider, keyAction: "keep", key: null };
  }

  if (typeof input.byok_api_key !== "string") {
    throw Object.assign(new Error("A valid BYOK API key is required."), {
      status: 400,
    });
  }

  const key = input.byok_api_key.trim();
  if (key.length < 20 || key.length > 2048 || /\s|[\u0000-\u001f\u007f]/.test(key)) {
    throw Object.assign(new Error("A valid BYOK API key is required."), {
      status: 400,
    });
  }

  return { useByok: true, provider, keyAction: "set", key };
}
