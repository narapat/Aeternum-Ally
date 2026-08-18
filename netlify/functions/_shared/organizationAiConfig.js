// @ts-check

/**
 * Load non-secret settings and, only when BYOK is enabled, resolve the raw key
 * from the service-role-only secrets table.
 *
 * @param {any} admin Supabase service-role client
 * @param {string} organizationId
 * @param {string} platformApiKey
 * @param {string} defaultModel
 */
export async function loadOrganizationAiConfig(
  admin,
  organizationId,
  platformApiKey,
  defaultModel,
) {
  const { data: settings, error: settingsError } = await admin
    .from("organization_ai_settings")
    .select("model, use_byok, byok_provider, soft_quota_monthly")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (settingsError) {
    throw new Error("Organization AI settings are unavailable.");
  }

  const byokRequested = settings?.use_byok === true;
  if (byokRequested && settings?.byok_provider !== "gemini") {
    throw new Error("Organization AI credentials are unavailable.");
  }

  let byokApiKey = null;
  if (byokRequested) {
    const { data: secret, error: secretError } = await admin
      .from("organization_ai_secrets")
      .select("byok_api_key")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (secretError) {
      throw new Error("Organization AI credentials are unavailable.");
    }
    byokApiKey = secret?.byok_api_key ?? null;
    if (typeof byokApiKey !== "string" || byokApiKey.length === 0) {
      throw new Error("Organization AI credentials are unavailable.");
    }
  }

  if (!byokRequested && !platformApiKey) {
    throw new Error("Platform AI credentials are unavailable.");
  }

  return {
    model: settings?.model ?? defaultModel,
    useBYOK: byokRequested,
    resolvedApiKey: byokRequested ? byokApiKey : platformApiKey,
    quotaType: byokRequested ? "byok" : "platform_free",
    softQuotaMonthly: settings?.soft_quota_monthly ?? null,
  };
}
