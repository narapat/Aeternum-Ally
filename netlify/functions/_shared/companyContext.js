// @ts-check

/**
 * Company factual context shared by every AI feature.
 *
 * Dogfooding showed the Business Description was acting as the de facto
 * grounding layer: naming an infrastructure provider there was the difference
 * between SBMC returning Key Partners and returning nothing. Free prose is a
 * poor place for facts — nothing distinguishes what a company *does* from what
 * it is *considering*, and nothing survives into a later feature intact.
 *
 * `structured_context` holds those facts as items instead. One shape covers all
 * six categories, because they differ only in what `name` and `role` mean:
 * "Netlify / Application hosting" and "GHG Protocol / Methodology used" are the
 * same record with different meanings.
 *
 * The status field is what keeps a plan from being reported as a fact, and the
 * category is what keeps a referenced standard from becoming a partner.
 */

export const CONTEXT_CATEGORIES = /** @type {const} */ ([
  "business",
  "operating",
  "technology",
  "commercial",
  "ecosystem",
  "standards",
]);

/** Heading used for each category in the rendered context. */
export const CONTEXT_CATEGORY_LABELS = {
  business: "Business",
  operating: "Operating Model",
  technology: "Technology",
  commercial: "Commercial",
  ecosystem: "Ecosystem",
  standards: "Standards",
};

export const CONTEXT_STATUSES = /** @type {const} */ ([
  "current",
  "planned",
  "exploring",
  "not_established",
]);

/** How a status is written in the prompt. Absence means unknown. */
export const CONTEXT_STATUS_LABELS = {
  current: "Current",
  planned: "Planned",
  exploring: "Exploring",
  not_established: "Not established",
};

export const CONTEXT_SOURCES = /** @type {const} */ ([
  "user",
  "imported",
  "system_derived",
  "ai_suggested",
]);

const asText = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * Keep only fully well-formed items; drop everything else.
 *
 * Nothing is defaulted. An unrecognized status must never fall back to
 * "current", because that turns a malformed record into a stated present fact —
 * precisely the failure this layer exists to prevent. The same applies to
 * source: guessing "user" would fabricate provenance. Dropping an item costs a
 * suggestion; promoting one costs the grounding guarantee.
 *
 * @param {unknown} value
 * @returns {Array<{category: string, name: string, role: string, status: string, source: string}>}
 */
export function normalizeStructuredContext(value) {
  if (!Array.isArray(value)) return [];

  return value.flatMap(raw => {
    const category = asText(raw?.category, 40);
    const name = asText(raw?.name, 120);
    const status = asText(raw?.status, 40);
    const source = asText(raw?.source, 40);

    const valid =
      CONTEXT_CATEGORIES.includes(/** @type {any} */ (category))
      && name.length > 0
      && CONTEXT_STATUSES.includes(/** @type {any} */ (status))
      && CONTEXT_SOURCES.includes(/** @type {any} */ (source));

    return valid
      ? [{ category, name, role: asText(raw?.role, 200), status, source }]
      : [];
  });
}

/**
 * Render the structured items. Empty categories are omitted entirely: a heading
 * with nothing under it invites the model to fill the gap, which is the
 * behaviour this whole layer exists to prevent.
 *
 * @param {unknown} structuredContext
 * @returns {string}
 */
export function buildStructuredContextBlock(structuredContext) {
  const items = normalizeStructuredContext(structuredContext);
  if (items.length === 0) return "";

  const sections = CONTEXT_CATEGORIES
    .map(category => {
      const rows = items.filter(item => item.category === category);
      if (rows.length === 0) return "";

      const lines = rows.map(item => {
        const role = item.role ? `: ${item.role}` : "";
        return `- ${item.name}${role} [${CONTEXT_STATUS_LABELS[item.status]}]`;
      });
      return `${CONTEXT_CATEGORY_LABELS[category]}\n${lines.join("\n")}`;
    })
    .filter(Boolean);

  return [
    "",
    "",
    "COMPANY FACTUAL CONTEXT",
    "The items below are stated by the company. Anything absent is unknown and",
    "must not be inferred. Items marked Planned, Exploring or Not established are",
    "not current facts and must not be described as if they were.",
    "",
    sections.join("\n\n"),
  ].join("\n");
}

/**
 * The context every AI prompt interpolates. Identity stays prose because those
 * fields are genuinely prose; everything factual comes from the items.
 *
 * @param {any} profile
 * @returns {string}
 */
export function buildCompanyContext(profile) {
  const identity = [
    `Company: ${profile?.name} (${profile?.industry}, ISIC: ${profile?.isicCode})`,
    `Scale: ${profile?.employeeCount} employees, Revenue: ${profile?.revenueRange}`,
    `Description: ${profile?.description}`,
    `Mission: ${profile?.mission}`,
    `Vision: ${profile?.vision}`,
    `Key Products / Services: ${profile?.productsServices}`,
  ].join("\n");

  return identity + buildStructuredContextBlock(profile?.structuredContext);
}
