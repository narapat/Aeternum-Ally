// @ts-check

const GENERIC_DELIVERY_ERROR =
  "Admin sign-in email is temporarily unavailable. Please try again later.";

function deliveryUnavailableError() {
  return Object.assign(new Error(GENERIC_DELIVERY_ERROR), { status: 503 });
}

/**
 * Dev links require three independent signals so a single production
 * misconfiguration cannot expose a platform-admin sign-in URL.
 *
 * @param {string} requestHost
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isExplicitLocalAdminMagicLinkMode(requestHost, env = process.env) {
  if (
    env.ALLOW_DEV_ADMIN_MAGIC_LINKS !== "true" ||
    env.NETLIFY_DEV !== "true"
  ) {
    return false;
  }

  if (!requestHost || /[@/?#]/.test(requestHost)) return false;

  try {
    const hostname = new URL(`http://${requestHost}`).hostname;
    return ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

/**
 * Check delivery configuration before looking up an email address. This keeps
 * missing-provider behavior uniform for admin and non-admin addresses.
 *
 * @param {boolean} emailDeliveryConfigured
 * @param {boolean} allowDevLink
 */
export function requireAdminMagicLinkDelivery(
  emailDeliveryConfigured,
  allowDevLink,
) {
  if (!emailDeliveryConfigured && !allowDevLink) {
    throw deliveryUnavailableError();
  }
}

/**
 * @param {{
 *   magicLink: string,
 *   emailDeliveryConfigured: boolean,
 *   allowDevLink: boolean,
 *   sendEmail: () => Promise<void>
 * }} options
 */
export async function deliverAdminMagicLink(options) {
  const {
    magicLink,
    emailDeliveryConfigured,
    allowDevLink,
    sendEmail,
  } = options;

  requireAdminMagicLinkDelivery(emailDeliveryConfigured, allowDevLink);

  if (!emailDeliveryConfigured) {
    return { sent: true, dev_link: magicLink };
  }

  try {
    await sendEmail();
    return { sent: true };
  } catch {
    if (allowDevLink) return { sent: true, dev_link: magicLink };
    throw deliveryUnavailableError();
  }
}
