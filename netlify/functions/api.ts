import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import {
  createInternalFunctionUrl,
  createInternalJobHeaders,
} from "./_shared/internalJobAuth.js";
import { withAIRequestFence } from "./_shared/aiRequestFence.js";
import { loadOrganizationAiConfig } from "./_shared/organizationAiConfig.js";
import { loadOrganizationTier } from "./_shared/organizationTier.js";
import {
  checkMonthlyAiQuota,
  platformQuotaType,
  quotaExceededResponse,
} from "./_shared/aiQuota.js";

const apiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEFAULT_MODEL = "gemini-2.5-flash";

// Per-model capabilities and pricing.
// Update this table whenever a new model is added to the admin model picker.
// canDisableThinking: true  → thinkingBudget:0 is valid (Flash family)
// canDisableThinking: false → model always thinks; don't pass thinkingConfig (Pro family)
// canDisableThinking: null  → unknown/BYOK model; falls back to name heuristic below
const MODEL_REGISTRY: Record<string, { input: number; output: number; canDisableThinking: boolean }> = {
  "gemini-2.5-flash-lite": { input: 0.10, output: 0.40,  canDisableThinking: true  },
  "gemini-2.5-flash":      { input: 0.30, output: 2.50,  canDisableThinking: true  },
  "gemini-2.5-pro":        { input: 1.25, output: 10.00, canDisableThinking: false },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_REGISTRY[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const handler = async (event: any) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing in environment variables.");
    return json(503, {
      error:
        "AI features are currently unavailable. The API key has not been configured on the server. Please contact the administrator.",
    });
  }

  if (!supabaseUrl || !serviceKey) {
    return json(503, {
      error:
        "AI features are unavailable. The server is missing Supabase credentials. Please contact the administrator.",
    });
  }

  // ai is instantiated later (after BYOK settings are resolved) — placeholder kept for structure
  const admin = createClient(supabaseUrl, serviceKey);

  // ------------------------------------------------------------------
  // 1. Authenticate the caller
  // ------------------------------------------------------------------
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json(401, { error: "You must be signed in to use AI features." });
  }
  const accessToken = authHeader.slice("Bearer ".length);
  const { data: userResp, error: userErr } = await admin.auth.getUser(accessToken);
  if (userErr || !userResp?.user) {
    return json(401, { error: "Your session has expired. Please sign in again." });
  }
  const user = userResp.user;

  // ------------------------------------------------------------------
  // 2. Parse + validate request
  // ------------------------------------------------------------------
  let body: any;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid request body." });
  }
  const { action, organization_id, ...params } = body;

  if (!action) return json(400, { error: "Missing 'action' field." });
  if (!organization_id) return json(400, { error: "Missing 'organization_id' field." });

  // ------------------------------------------------------------------
  // 3. Verify org membership
  // ------------------------------------------------------------------
  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return json(403, {
      error: "You don't have access to this organization's AI features.",
    });
  }

  // ------------------------------------------------------------------
  // 4. Look up the org's chosen model + BYOK settings
  // ------------------------------------------------------------------
  let aiConfig;
  try {
    aiConfig = await loadOrganizationAiConfig(
      admin,
      organization_id,
      apiKey,
      DEFAULT_MODEL,
    );
  } catch {
    console.error(`[api] AI configuration unavailable org=${organization_id}`);
    return json(503, {
      error: "AI settings are temporarily unavailable. Please try again later.",
    });
  }
  const {
    model,
    useBYOK,
    resolvedApiKey,
    quotaType,
    softQuotaMonthly,
  } = aiConfig;

  // ------------------------------------------------------------------
  // 4a. Monthly AI quota (platform calls only; BYOK bills the tenant)
  // ------------------------------------------------------------------
  // The ceiling is the org's `soft_quota_monthly` override when set, otherwise
  // the tier default. Exceeding it returns 429 before any provider call, so
  // platform AI spend has an upper bound per tenant per month.
  let effectiveQuotaType = quotaType;
  if (!useBYOK) {
    const tier = await loadOrganizationTier(admin, organization_id);
    effectiveQuotaType = platformQuotaType(tier);

    const quota = await checkMonthlyAiQuota(
      admin,
      organization_id,
      tier,
      softQuotaMonthly,
    );

    if (!quota.allowed) {
      console.warn(
        `[quota] org=${organization_id} tier=${tier} used=${quota.used}/${quota.limit} — request blocked`,
      );
      return json(429, quotaExceededResponse(quota));
    }
  }

  // ------------------------------------------------------------------
  // 5. Run the action with timing + usage tracking
  // ------------------------------------------------------------------
  // Instantiate AI client now that we know which key to use
  const ai = new GoogleGenAI({ apiKey: resolvedApiKey });
  const start = Date.now();
  let result: any = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let success = true;
  let errorMessage: string | null = null;
  let aiResponseChars: number | null = null;
  let upstreamStatus: number | null = null;
  let userFacingMessage = "Something went wrong while contacting the AI service.";

  try {
    const outcome = await withAIRequestFence(
      runAction(ai, model, action, params, event, organization_id, user),
      action,
    );
    result = outcome.result;
    inputTokens = outcome.inputTokens;
    outputTokens = outcome.outputTokens;
  } catch (error: any) {
    success = false;
    aiResponseChars = Number.isSafeInteger(error?.aiResponseChars)
      ? error.aiResponseChars
      : null;
    upstreamStatus =
      error?.isTimeout
        ? 504
        : (typeof error?.status === "number" && error.status) ||
          (typeof error?.error?.code === "number" && error.error.code) ||
          null;
    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(
      `[api] AI request failed action=${action} status=${upstreamStatus ?? "unknown"} type=${errorType}`,
    );
    errorMessage = error?.error?.message || (error instanceof Error ? error.message : String(error));
    userFacingMessage =
      error?.isTimeout
        ? "The AI request timed out. Please try again — complex topics occasionally need a second attempt."
        : upstreamStatus === 503
        ? "The AI service is temporarily overloaded. Please try again in a moment."
        : upstreamStatus === 429
        ? "AI rate limit reached. Please wait a minute and try again."
        : userFacingMessage;
  }

  const durationMs = Date.now() - start;

  // ------------------------------------------------------------------
  // 6. Log the call (best-effort; never fail the response if logging fails)
  // ------------------------------------------------------------------
  try {
    const skipLogging = action.startsWith("trigger") || action === "getAssessmentJobStatus";
    if (!skipLogging) {
      await admin.from("ai_usage_log").insert({
        organization_id,
        user_id: user.id,
        user_email: user.email ?? null,
        action,
        provider: "gemini",
        model,
        input_tokens: inputTokens || null,
        output_tokens: outputTokens || null,
        duration_ms: durationMs,
        success,
        error_message: success ? null : errorMessage,
        http_status: success ? null : upstreamStatus,
        estimated_cost_usd: success ? Number(estimateCost(model, inputTokens, outputTokens).toFixed(6)) : 0,
        quota_type: effectiveQuotaType,
      });
    }
  } catch (logErr) {
    console.warn("Failed to log AI usage:", logErr);
  }

  // On failure, write a richer row to error_log so admins can debug
  if (!success) {
    try {
      await admin.from("error_log").insert({
        organization_id,
        user_id: user.id,
        user_email: user.email ?? null,
        source: "server",
        context: "ai_function",
        action,
        error_message: errorMessage ?? "Unknown error",
        http_status: upstreamStatus,
        metadata: {
          model,
          duration_ms: durationMs,
          response_chars: aiResponseChars,
        },
      });
    } catch (logErr) {
      console.warn("Failed to write error_log:", logErr);
    }
  }

  // ------------------------------------------------------------------
  // 7. Return
  // ------------------------------------------------------------------
  if (!success) {
    return json(
      upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 500,
      { error: userFacingMessage }
    );
  }
  return json(200, result);
};

// =============================================================
// Action dispatch
// Each handler returns { result, inputTokens, outputTokens }
// =============================================================
async function runAction(
  ai: GoogleGenAI,
  model: string,
  action: string,
  params: any,
  event: any,
  organization_id: string,
  user: { id: string; email?: string | null }
): Promise<{ result: any; inputTokens: number; outputTokens: number }> {
  switch (action) {
    case "generateAssessmentSuggestions":
      return generateAssessmentSuggestions(ai, model, params);
    case "generateAssessmentScoring":
      return generateAssessmentScoring(ai, model, params);
    case "generateCanvasSuggestion":
      return generateCanvasSuggestion(ai, model, params);
    case "generateSwotInternal":
      return generateSwotInternal(ai, model, params);
    case "generateSwotExternal":
      return generateSwotExternal(ai, model, params);
    case "generateKPISuggestions":
      return generateKPISuggestions(ai, model, params);
    case "generateCompanyStrategicReport":
      return generateCompanyStrategicReport(ai, model, params);
    case "triggerReportGeneration":
      return triggerReportGeneration(event, { ...params, organization_id, user_id: user.id, user_email: user.email ?? null });
    case "triggerDMAAnalysis":
      return triggerDMAAnalysis(event, { ...params, organization_id, user_id: user.id, user_email: user.email ?? null });
    case "triggerAssessmentAutofill":
      return triggerAssessmentAutofill(event, { ...params, organization_id, user_id: user.id, user_email: user.email ?? null });
    case "triggerAssessmentScoring":
      return triggerAssessmentScoring(event, { ...params, organization_id, user_id: user.id, user_email: user.email ?? null });
    case "analyzeTopicQuality":
      return analyzeTopicQuality(ai, model, params);
    case "analyzeDMASynthesis":
      return analyzeDMASynthesis(ai, model, params);
    case "analyzeDMAQuality":
      return analyzeDMAQuality(ai, model, params);
    case "generateTasks":
      return generateTasks(ai, model, params);
    case "generateDMAGuide":
      return generateDMAGuide(ai, model, params);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// Returns { thinkingConfig: { thinkingBudget: 0 } } for models that support disabling thinking,
// or {} for models that don't (Pro) or are unknown (BYOK).
// Prefer MODEL_REGISTRY lookup; fall back to name heuristic for unknown future models.
function noThinkingConfig(model: string): object {
  const entry = MODEL_REGISTRY[model];
  const canDisable = entry != null ? entry.canDisableThinking : model.includes("flash");
  return canDisable ? { thinkingConfig: { thinkingBudget: 0 } } : {};
}

// Pull token counts out of Gemini's response in a tolerant way.
function extractTokens(response: any): { inputTokens: number; outputTokens: number } {
  const u = response?.usageMetadata ?? {};
  return {
    inputTokens: Number(u.promptTokenCount ?? 0),
    outputTokens: Number(u.candidatesTokenCount ?? u.responseTokenCount ?? 0),
  };
}

// Shared JSON parser with fallback for markdown-wrapped responses.
// Used by all action functions so error handling is consistent.
function parseAIJson<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  // 1. Direct parse (works when schema mode is used correctly)
  try { return JSON.parse(text) as T; } catch {}
  // 2. Strip markdown code fences and retry
  const stripped = text.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/m, "").trim();
  try { return JSON.parse(stripped) as T; } catch {}
  // 3. Extract first [...] or {...} block as last resort
  const block = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (block) try { return JSON.parse(block[0]) as T; } catch {}
  console.warn(
    `parseAIJson: could not parse response; returning fallback (chars=${text.length}).`,
  );
  return fallback;
}

// For actions that cannot use schema mode (e.g. Google Search grounding),
// append this to the prompt and parse the result with parseAIJson.
const STRUCTURED_OUTPUT_INSTRUCTION = `
CRITICAL: Return ONLY valid JSON. No markdown code fences (\`\`\`json), no preamble, no explanation.
Return an empty array [] if no items apply.
`;

// Build a consistent company context block from a structured profile object.
function buildCompanyContext(profile: any): string {
  return [
    `Company: ${profile.name} (${profile.industry}, ISIC: ${profile.isicCode})`,
    `Scale: ${profile.employeeCount} employees, Revenue: ${profile.revenueRange}`,
    `Description: ${profile.description}`,
    `Mission: ${profile.mission}`,
    `Vision: ${profile.vision}`,
    `Key Products / Services: ${profile.productsServices}`,
  ].join('\n');
}

// Join a BMC field (string[] after migration) for use in AI prompts.
const joinField = (v: string | string[]): string =>
  Array.isArray(v) ? v.join(", ") : (v ?? "");

const SBMC_BLOCKS = [
  "Key Partners",
  "Key Activities",
  "Key Resources",
  "Value Propositions",
  "Customer Relationships",
  "Channels",
  "Customer Segments",
  "Cost Structure",
  "Revenue Streams",
  "Eco-Social Costs",
  "Eco-Social Benefits",
] as const;

type SBMCBlockLabel = typeof SBMC_BLOCKS[number];

const SBMC_FIELD_BY_LABEL: Record<SBMCBlockLabel, string> = {
  "Key Partners": "keyPartners",
  "Key Activities": "keyActivities",
  "Key Resources": "keyResources",
  "Value Propositions": "valueProposition",
  "Customer Relationships": "customerRelationships",
  "Channels": "channels",
  "Customer Segments": "customerSegments",
  "Cost Structure": "costStructure",
  "Revenue Streams": "revenueStreams",
  "Eco-Social Costs": "ecoSocialCosts",
  "Eco-Social Benefits": "ecoSocialBenefits",
};

const SBMC_BLOCK_DEFINITIONS: Record<SBMCBlockLabel, string> = {
  "Key Partners": "External organizations or parties the company depends on or intentionally collaborates with to operate, deliver value, reduce risk, or scale. Do not treat standards bodies as partners merely because their standards are referenced.",
  "Key Activities": "The most important internal activities the company must perform to create, deliver, sell, support, and improve its value proposition. Do not include external partners, customer groups, channels, or resources unless the activity itself is the point.",
  "Key Resources": "The critical assets, capabilities, data, people, technology, intellectual property, financial resources, or physical resources the company needs to operate and deliver value. Do not list activities, partners, or customer-facing promises.",
  "Value Propositions": "The specific products, services, outcomes, and differentiated value the company offers to customers or beneficiaries. Do not list customer segments, channels, internal activities, or unsupported impact claims.",
  "Customer Relationships": "How the company acquires, supports, retains, and interacts with customers. Do not include partnerships, marketing channels, customer segments, or internal activities.",
  "Channels": "The routes and touchpoints through which the company reaches customer segments for awareness, sales, delivery, service, or communication. Do not include relationship styles, customer types, or partner organizations unless they are explicitly a route to market.",
  "Customer Segments": "The distinct groups of customers, users, beneficiaries, or buyers the company serves or intends to serve. Do not include channels, relationships, partners, or generic stakeholder categories without support from the company context.",
  "Cost Structure": "The main economic cost drivers and operating expenses required to run the business model. Do not include environmental or social externalities here unless they are also explicit financial costs.",
  "Revenue Streams": "The ways the company earns or could earn money from customers for delivered value, such as subscriptions, usage fees, licensing, services, or transactions. Do not invent monetization models unsupported by the company context.",
  "Eco-Social Costs": "Credible actual or potential negative environmental or social externalities arising from the company's technology, activities, operations, or business relationships. Do not confuse ordinary operating expenses with eco-social externalities.",
  "Eco-Social Benefits": "Positive environmental or social outcomes the company's products, services, or business model can support or enable. Do not guarantee outcomes, invent impacts, or imply unsupported causality.",
};

type NormalizedCanvas = Record<string, string[]>;

function toPromptArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map(item => item.trim())
    : [];
}

function normalizeCanvasContext(bmcData: any = {}): NormalizedCanvas {
  return Object.fromEntries(
    SBMC_BLOCKS.map(label => [SBMC_FIELD_BY_LABEL[label], toPromptArray(bmcData?.[SBMC_FIELD_BY_LABEL[label]])]),
  );
}

function getSBMCBlockLabel(fieldLabel: unknown): SBMCBlockLabel {
  if (typeof fieldLabel !== "string") {
    throw new Error("Canvas suggestion requires a valid field label.");
  }
  const match = SBMC_BLOCKS.find(label => label.toLowerCase() === fieldLabel.trim().toLowerCase());
  if (!match) {
    throw new Error("Canvas suggestion requires a recognized SBMC block label.");
  }
  return match;
}

function buildCanvasContextBlock(bmcData: any = {}): string {
  const normalized = normalizeCanvasContext(bmcData);
  return SBMC_BLOCKS
    .map(label => {
      const items = normalized[SBMC_FIELD_BY_LABEL[label]];
      return `- ${label}: ${items.length ? items.join("; ") : "(empty)"}`;
    })
    .join("\n");
}

function buildCanvasSuggestionPrompt(profile: any, fieldLabel: unknown, bmcData: any = {}): string {
  const blockLabel = getSBMCBlockLabel(fieldLabel);
  const blockDefinition = SBMC_BLOCK_DEFINITIONS[blockLabel];
  const currentBlockItems = normalizeCanvasContext(bmcData)[SBMC_FIELD_BY_LABEL[blockLabel]];

  return `
    Act as a business strategy consultant specializing in Sustainable Business Model Canvas.

    --- COMPANY CONTEXT ---
    ${buildCompanyContext(profile)}
    -----------------------

    --- CURRENT SBMC CONTENT ---
    ${buildCanvasContextBlock(bmcData)}
    ----------------------------

    Requested block: "${blockLabel}"
    Requested block definition:
    ${blockDefinition}

    Existing items in the requested block:
    ${currentBlockItems.length ? currentBlockItems.map(item => `- ${item}`).join("\n") : "- (empty)"}

    Task:
    Suggest concise content for the requested SBMC block only.

    Grounding and classification rules:
    - Treat only explicitly supplied company information and current canvas content as factual context.
    - Do not assume common industry practices, partnerships, channels, capabilities, customers, revenue models, teams, certifications, or operational practices already exist.
    - Strategic possibilities may be suggested, but they must not be worded as established facts when unsupported.
    - Apply the requested SBMC block definition strictly.
    - Do not suggest an item if it primarily belongs to another SBMC block.
    - Avoid duplicate or semantically overlapping suggestions already present anywhere in the current canvas.
    - Avoid contradictions with existing canvas content.
    - Prefer company-specific strategic suggestions over generic SaaS or sustainability-business statements.
    - Prefer fewer high-quality suggestions rather than filling the block artificially.

    Sustainability claim guardrails:
    - For Eco-Social Benefits, describe outcomes the company can support or enable.
    - Do not guarantee environmental or social outcomes.
    - Do not claim "significant" reductions or improvements without evidence.
    - Do not invent biodiversity, climate, social, or governance impacts.
    - Do not imply causality unsupported by the supplied information.
    - Prefer wording such as "supports", "enables", "helps identify", "helps manage", or "may contribute to" when actual outcomes are unavailable.
    - For Eco-Social Costs, focus on credible actual or potential negative environmental/social externalities from technology, activities, operations, or business relationships.
    - Do not confuse ordinary operating expenses with eco-social externalities.

    CRITICAL: Return ONLY a valid JSON array of strings.
    Each string is one concise point under 15 words.
    Return [] if no grounded, block-appropriate suggestions apply.
    No markdown, no backticks, no explanation.
  `;
}

function limitedItems(items: unknown, maxItems = 8): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map(item => item.trim())
    .slice(0, maxItems);
}

function buildCompanyStrategicBmcContext(bmcData: any = {}, maxItems = 8): string {
  const normalized = normalizeCanvasContext(bmcData);
  return SBMC_BLOCKS
    .map(label => {
      const items = limitedItems(normalized[SBMC_FIELD_BY_LABEL[label]], maxItems);
      if (!items.length) return "";
      return `- ${label}: ${items.join("; ")}`;
    })
    .filter(Boolean)
    .join("\n") || "No SBMC content provided.";
}

function buildSwotContext(swotData: any = {}, maxItems = 8): string {
  const sections = [
    ["Strengths", limitedItems(swotData?.strengths, maxItems)],
    ["Weaknesses", limitedItems(swotData?.weaknesses, maxItems)],
    ["Opportunities", limitedItems(swotData?.opportunities, maxItems)],
    ["Threats", limitedItems(swotData?.threats, maxItems)],
  ];
  return sections
    .map(([label, items]) => {
      const list = items as string[];
      if (!list.length) return "";
      return `- ${label}: ${list.join("; ")}`;
    })
    .filter(Boolean)
    .join("\n") || "No SWOT content provided.";
}

function buildCompanyStrategicReportPrompt(profile: any, bmcData: any = {}, swotData: any = {}): string {
  return `
    You are a senior business and sustainability strategy consultant.
    Create a concise company strategic profile report from user-supplied data.

    --- COMPANY PROFILE ---
    ${buildCompanyContext(profile)}
    Website: ${profile?.website || "Not provided"}
    Founding year: ${profile?.foundingYear || "Not provided"}
    Address: ${[
      profile?.addressStreet,
      profile?.addressCity,
      profile?.addressState,
      profile?.addressPostalCode,
      profile?.addressCountry,
    ].filter(Boolean).join(", ") || "Not provided"}
    Contact: ${[profile?.contactEmail, profile?.contactPhone].filter(Boolean).join(", ") || "Not provided"}
    -----------------------

    --- SUSTAINABLE BUSINESS MODEL CANVAS ---
    ${buildCompanyStrategicBmcContext(bmcData)}
    ------------------------------------------

    --- SWOT ANALYSIS ---
    ${buildSwotContext(swotData)}
    ---------------------

    Grounding rules:
    - Treat only the supplied company profile, SBMC, and SWOT content as factual.
    - Do not invent customers, products, partnerships, certifications, locations, revenue models, operational practices, or quantified impacts.
    - If making an inference, phrase it as an interpretation, not an established fact.
    - Prefer company-specific strategic analysis over generic sustainability language.
    - Identify missing information instead of filling gaps with assumptions.
    - Keep the report useful for internal strategy review, not as an ESRS disclosure statement.
    - Avoid repeating the same point across sections.

    Output requirements:
    - Return ONLY valid JSON.
    - profileSummary: 90-130 words summarizing company identity and offering.
    - businessModelSummary: 120-170 words analyzing how the SBMC creates and captures value.
    - swotAnalysis: 120-170 words synthesizing the SWOT into strategic implications.
    - strategicCommentary: 120-170 words connecting profile, SBMC, and SWOT into a practical business analysis.
    - dataGaps: 3-6 concise strings naming missing or weak inputs.
    - recommendations: 3-6 concise strings with practical next steps.
    - No markdown, no source citations, no extra keys.
  `;
}

// =============================================================
// Action implementations
// =============================================================

// ESRS topic-specific required disclosure areas (used in auto-fill prompt to ensure quality-check compliance)
const ESRS_TOPIC_GUIDANCE: Record<string, { impactAreas: string; financialAreas: string }> = {
  "E1": {
    impactAreas: "GHG emissions (Scope 1, 2, 3), energy consumption mix, climate transition plan, carbon reduction targets, physical climate risks to operations and value chain",
    financialAreas: "carbon pricing exposure, stranded asset risk, energy cost volatility, regulatory compliance costs (EU ETS, carbon border adjustment), green financing opportunities",
  },
  "E2": {
    impactAreas: "air pollutants (NOx, SOx, PM), water and soil contamination, hazardous substance releases, impact on human health and ecosystems near operations",
    financialAreas: "regulatory fines and cleanup liability, licence-to-operate risk, pollution insurance costs, market access restrictions for polluting products",
  },
  "E3": {
    impactAreas: "water withdrawal volumes and sources, wastewater quality and discharge, impact on water-stressed catchments, effects on marine ecosystems",
    financialAreas: "water scarcity risk to production continuity, regulatory permit costs, water treatment capex, reputational risk in water-stressed regions",
  },
  "E4": {
    impactAreas: "land use change, habitat fragmentation, use of threatened species, impacts on ecosystem services (pollination, soil health, carbon sequestration)",
    financialAreas: "deforestation-linked supply chain disruptions, biodiversity regulation compliance costs (EU Nature Restoration Law), ecosystem service dependency risk",
  },
  "E5": {
    impactAreas: "primary material consumption, product end-of-life (landfill vs. recyclable), packaging waste, waste generation rates, circular design adoption",
    financialAreas: "raw material price volatility, extended producer responsibility (EPR) costs, waste disposal costs, circular revenue models, resource efficiency savings",
  },
  "S1": {
    impactAreas: "employee health & safety (injury rates, occupational diseases), fair wages and living wage alignment, diversity & inclusion metrics, training hours per employee, freedom of association",
    financialAreas: "talent attraction and retention costs, absenteeism and turnover impact, legal exposure from labour violations, productivity link to workforce wellbeing",
  },
  "S2": {
    impactAreas: "supplier labour conditions (forced/child labour risk), safety in Tier-1 and Tier-2 supply chain, supplier audit coverage, remediation mechanisms",
    financialAreas: "supply chain disruption from supplier non-compliance, reputational risk from negative supplier incidents, cost of supplier audits vs. sourcing risk reduction",
  },
  "S3": {
    impactAreas: "community consultation processes, land rights and displacement risk, local economic contribution vs. harm, access to essential services affected by operations",
    financialAreas: "social licence-to-operate risk, community litigation or protest costs, local partnership opportunities, impact on permits and expansion plans",
  },
  "S4": {
    impactAreas: "product safety and recall history, data privacy and user rights, accessibility for vulnerable consumers, transparent marketing practices, responsible use of AI or data",
    financialAreas: "product liability and recall costs, consumer protection regulatory fines (GDPR, etc.), brand value erosion from safety incidents, customer loyalty linked to trust",
  },
  "G1": {
    impactAreas: "anti-corruption policies and training coverage, lobbying transparency, whistleblower protection mechanisms, supplier code of conduct compliance, political contributions",
    financialAreas: "corruption investigation and penalty exposure, governance-linked cost of capital, contract exclusion risk from procurement rules, ESG rating impact on investor access",
  },
};

async function generateAssessmentSuggestions(
  ai: GoogleGenAI,
  model: string,
  { profile, topic, qualityCheckContext }: any
) {
  const topicCode = String(topic).split(" ")[0];
  const guidance = ESRS_TOPIC_GUIDANCE[topicCode];
  const companyName = profile.name || "this company";
  const industryCtx = [profile.industry, profile.isicCode].filter(Boolean).join(", ISIC: ");
  const companyCtx = buildCompanyContext(profile);

  // If quality check issues are provided, convert them to explicit AI instructions
  const qualityFixBlock = qualityCheckContext?.issues?.length
    ? `
QUALITY CHECK FEEDBACK — the previous description failed review on these points.
Your new description MUST explicitly address each one:
${(qualityCheckContext.issues as any[]).map((i: any) =>
  `• [${(i.severity ?? "").toUpperCase()}] ${i.title}: ${i.description} — Fix: ${i.fix_suggestion} (${i.esrs_ref})`
).join('\n')}
`.trim()
    : "";

  const sharedRules = `
    Ground every sentence in ${companyName}'s actual industry (${industryCtx}), business model,
    products/services, and operations described above.
    Select only the ESRS areas genuinely material for a company of this type — skip irrelevant ones.
    Name specific activities, processes, or products. Do not write generic statements.
    Do NOT use vague hedging ("may have", "could affect"). Be direct. Length: 80–120 words.
  `.trim();

  const impactPrompt = `
    You are a senior sustainability consultant writing a CSRD/ESRS Double Materiality Assessment.

    --- COMPANY CONTEXT ---
    ${companyCtx}
    -----------------------
    ESRS Topic: "${topic}"

    Write the IMPACT DESCRIPTION (Inside-out / Impact Materiality):
    Describe how ${companyName} impacts people and the environment on this topic.
    ${guidance ? `ESRS disclosure areas to address (select relevant ones): ${guidance.impactAreas}` : "Cover key environmental and social impact pathways."}
    ${qualityFixBlock ? `\n${qualityFixBlock}` : ""}

    ${sharedRules}
    Return ONLY the plain text description. No JSON, no markdown, no label.
  `;

  const financialPrompt = `
    You are a senior sustainability consultant writing a CSRD/ESRS Double Materiality Assessment.

    --- COMPANY CONTEXT ---
    ${companyCtx}
    -----------------------
    ESRS Topic: "${topic}"

    Write the FINANCIAL DESCRIPTION (Outside-in / Financial Materiality):
    Describe how this sustainability topic creates financial risks or opportunities for ${companyName}.
    Name regulatory frameworks, cost lines, or market mechanisms relevant to its industry.
    ${guidance ? `ESRS financial exposure areas to address (select relevant ones): ${guidance.financialAreas}` : "Cover key financial risks and opportunities."}
    ${qualityFixBlock ? `\n${qualityFixBlock}` : ""}

    ${sharedRules}
    Return ONLY the plain text description. No JSON, no markdown, no label.
  `;

  // Run both descriptions in parallel — halves latency vs a single combined call.
  const [impactResp, financialResp] = await Promise.all([
    ai.models.generateContent({ model, contents: impactPrompt, config: noThinkingConfig(model) }),
    ai.models.generateContent({ model, contents: financialPrompt, config: noThinkingConfig(model) }),
  ]);

  const impactTokens = extractTokens(impactResp);
  const financialTokens = extractTokens(financialResp);

  return {
    result: {
      impactSuggestion: impactResp.text?.trim() ?? "",
      financialSuggestion: financialResp.text?.trim() ?? "",
    },
    inputTokens: impactTokens.inputTokens + financialTokens.inputTokens,
    outputTokens: impactTokens.outputTokens + financialTokens.outputTokens,
  };
}

async function generateCanvasSuggestion(
  ai: GoogleGenAI,
  model: string,
  { profile, fieldLabel, bmcData }: any
) {
  const prompt = buildCanvasSuggestionPrompt(profile, fieldLabel, bmcData);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      ...noThinkingConfig(model),
    },
  });

  const parsed = parseAIJson<string[]>(response.text, []);
  return {
    result: Array.isArray(parsed) ? parsed : [],
    ...extractTokens(response),
  };
}

async function generateSwotInternal(
  ai: GoogleGenAI,
  model: string,
  { profile, bmcData }: any
) {
  const prompt = `
    Act as a strategic business analyst.

    ${buildCompanyContext(profile)}

    Based on the full Business Model Canvas data for "${profile.name}" below, suggest a list of:
    1. STRENGTHS (Internal positive factors)
    2. WEAKNESSES (Internal negative factors)

    BMC Data:
    - Value Proposition: ${joinField(bmcData.valueProposition)}
    - Key Partners: ${joinField(bmcData.keyPartners)}
    - Key Activities: ${joinField(bmcData.keyActivities)}
    - Key Resources: ${joinField(bmcData.keyResources)}
    - Customer Relationships: ${joinField(bmcData.customerRelationships)}
    - Channels: ${joinField(bmcData.channels)}
    - Customer Segments: ${joinField(bmcData.customerSegments)}
    - Cost Structure: ${joinField(bmcData.costStructure)}
    - Revenue Streams: ${joinField(bmcData.revenueStreams)}
    - Eco-Social Benefits: ${joinField(bmcData.ecoSocialBenefits)}
    - Eco-Social Costs: ${joinField(bmcData.ecoSocialCosts)}

    CRITICAL: Return ONLY a JSON object with keys "strengths" and "weaknesses".
    Each value must be an array of short, distinct strings (one factor per item, under 15 words each).
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
  });

  return {
    result: parseAIJson(response.text, { strengths: [], weaknesses: [] }),
    ...extractTokens(response),
  };
}

async function generateSwotExternal(
  ai: GoogleGenAI,
  model: string,
  { profile, type }: any
) {
  const prompt = `
    Act as a market researcher. Search for recent news, market trends, and regulatory changes relevant to:
    ${buildCompanyContext(profile)}

    Based on the search results, list the key ${type} (External factors) for this business.
    Focus on:
    - Market trends
    - Competitor moves
    - New regulations (especially sustainability/ESG)
    - Technological shifts

    Provide the answer as a bulleted list. Cite sources if possible.
  `;

  // Google Search grounding is incompatible with JSON schema mode; parse text manually.
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { tools: [{ googleSearch: {} }] },
  });

  const items = (response.text || "")
    .split("\n")
    .map((line: string) => line.replace(/^[\s•\-\*–\d\.]+/, "").replace(/\*+/g, "").trim())
    .filter((line: string) => line.length > 0 && !line.startsWith("---") && !line.startsWith("#"));

  return {
    result: items,
    ...extractTokens(response),
  };
}

async function generateKPISuggestions(
  ai: GoogleGenAI,
  model: string,
  { profile, perspective }: any
) {
  const prompt = `
    Act as a Strategy Performance Manager using the Balanced Scorecard framework.

    ${buildCompanyContext(profile)}

    Task: Suggest 3 strategic KPIs for the "${perspective}" perspective aligned with the company's mission and vision.

    Format the response as a JSON Array of objects, where each object has:
    - name: KPI Name (Short title)
    - description: Why this is important for this company.
    - unit: Measurement unit (e.g., %, THB, #)
    - targetSuggestion: A placeholder target value (number) appropriate for an SME.
    - frequency: How often this should be measured — one of "Monthly", "Quarterly", or "Annually".
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: ["name", "description", "unit", "targetSuggestion", "frequency"],
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            unit: { type: Type.STRING },
            targetSuggestion: { type: Type.NUMBER },
            frequency: { type: Type.STRING },
          },
        },
      },
    },
  });

  return {
    result: parseAIJson<object[]>(response.text, []),
    ...extractTokens(response),
  };
}

async function generateCompanyStrategicReport(
  ai: GoogleGenAI,
  model: string,
  { profile, bmcData, swotData }: any
) {
  const fallback = {
    profileSummary: "",
    businessModelSummary: "",
    swotAnalysis: "",
    strategicCommentary: "",
    dataGaps: [],
    recommendations: [],
  };

  const response = await ai.models.generateContent({
    model,
    contents: buildCompanyStrategicReportPrompt(profile, bmcData, swotData),
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: [
          "profileSummary",
          "businessModelSummary",
          "swotAnalysis",
          "strategicCommentary",
          "dataGaps",
          "recommendations",
        ],
        properties: {
          profileSummary: { type: Type.STRING },
          businessModelSummary: { type: Type.STRING },
          swotAnalysis: { type: Type.STRING },
          strategicCommentary: { type: Type.STRING },
          dataGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
      ...noThinkingConfig(model),
    },
  });

  const parsed = parseAIJson<any>(response.text, fallback);

  return {
    result: {
      profileSummary: typeof parsed.profileSummary === "string" ? parsed.profileSummary : "",
      businessModelSummary: typeof parsed.businessModelSummary === "string" ? parsed.businessModelSummary : "",
      swotAnalysis: typeof parsed.swotAnalysis === "string" ? parsed.swotAnalysis : "",
      strategicCommentary: typeof parsed.strategicCommentary === "string" ? parsed.strategicCommentary : "",
      dataGaps: Array.isArray(parsed.dataGaps) ? parsed.dataGaps.filter((item: any) => typeof item === "string") : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.filter((item: any) => typeof item === "string") : [],
    },
    ...extractTokens(response),
  };
}

async function generateAssessmentScoring(
  ai: GoogleGenAI,
  model: string,
  { topic, topicTitle, profile, bmcData, swotData, impactDescription, financialDescription }: any
) {
  const keyActivities = joinField(bmcData?.keyActivities);
  const ecoSocialCosts = joinField(bmcData?.ecoSocialCosts);
  const ecoSocialBenefits = joinField(bmcData?.ecoSocialBenefits);
  const threats = joinField(swotData?.threats);
  const opportunities = joinField(swotData?.opportunities);

  const prompt = `
You are an ESRS materiality expert helping SMEs assess ${topic} ${topicTitle}.

${buildCompanyContext(profile)}

Business context:
- Key activities: ${keyActivities || "Not provided"}
- Eco-social costs: ${ecoSocialCosts || "Not provided"}
- Eco-social benefits: ${ecoSocialBenefits || "Not provided"}
- Business threats: ${threats || "Not provided"}
- Business opportunities: ${opportunities || "Not provided"}

${impactDescription ? `User's impact description: "${impactDescription}"` : ""}
${financialDescription ? `User's financial risk/opportunity description: "${financialDescription}"` : ""}

Task: Suggest materiality scores (1-5 scale) for each criterion. If the user provided descriptions above, align scores with what they described — scores should reflect the severity/likelihood implied in the descriptions.

Scoring guidelines:
- Impact Scale: 1=minimal severity, 3=moderate, 5=severe
- Impact Scope: 1=internal only, 3=regional/industry, 5=global
- Irremediability: 1=fully reversible, 3=partially reversible, 5=irreversible
- Impact Likelihood: 1=rare/unlikely, 3=possible, 5=certain/ongoing
- Financial Magnitude: 1=less than 0.5% of revenue, 3=0.5–2%, 5=greater than 5%
- Financial Likelihood: 1=unlikely within 3 years, 3=possible, 5=almost certain

Be specific in reasoning — reference the industry, activities, and descriptions provided.

Return ONLY valid JSON, no markdown:
{
  "impact": {
    "scale": { "score": number, "reasoning": string },
    "scope": { "score": number, "reasoning": string },
    "irremediability": { "score": number, "reasoning": string },
    "likelihood": { "score": number, "reasoning": string }
  },
  "financial": {
    "magnitude": { "score": number, "reasoning": string },
    "likelihood": { "score": number, "reasoning": string }
  }
}
  `;

  const scoringCriterion = {
    type: Type.OBJECT,
    required: ["score", "reasoning"],
    properties: {
      score:     { type: Type.NUMBER },
      reasoning: { type: Type.STRING },
    },
  };

  let rawText = "";

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        ...noThinkingConfig(model),
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["impact", "financial"],
          properties: {
            impact: {
              type: Type.OBJECT,
              required: ["scale", "scope", "irremediability", "likelihood"],
              properties: {
                scale:           scoringCriterion,
                scope:           scoringCriterion,
                irremediability: scoringCriterion,
                likelihood:      scoringCriterion,
              },
            },
            financial: {
              type: Type.OBJECT,
              required: ["magnitude", "likelihood"],
              properties: {
                magnitude: scoringCriterion,
                likelihood: scoringCriterion,
              },
            },
          },
        },
      },
    });

    rawText = response.text ?? "";

    const fallback = {
      impact: {
        scale:           { score: 1, reasoning: "" },
        scope:           { score: 1, reasoning: "" },
        irremediability: { score: 1, reasoning: "" },
        likelihood:      { score: 1, reasoning: "" },
      },
      financial: {
        magnitude: { score: 1, reasoning: "" },
        likelihood: { score: 1, reasoning: "" },
      },
    };

    const parsed = parseAIJson(rawText, fallback);

    // Deep-merge with fallback so any missing nested field gets a safe default
    // rather than throwing when Gemini omits a field despite the required schema.
    const safeField = (field: any, fb: any) => ({
      score:     typeof field?.score === "number" ? field.score : fb.score,
      reasoning: typeof field?.reasoning === "string" ? field.reasoning : fb.reasoning,
    });

    const safe = {
      impact: {
        scale:           safeField(parsed?.impact?.scale,           fallback.impact.scale),
        scope:           safeField(parsed?.impact?.scope,           fallback.impact.scope),
        irremediability: safeField(parsed?.impact?.irremediability, fallback.impact.irremediability),
        likelihood:      safeField(parsed?.impact?.likelihood,      fallback.impact.likelihood),
      },
      financial: {
        magnitude: safeField(parsed?.financial?.magnitude, fallback.financial.magnitude),
        likelihood: safeField(parsed?.financial?.likelihood, fallback.financial.likelihood),
      },
    };

    // Clamp all scores to 1–5
    const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(Number(n) || 1)));
    safe.impact.scale.score           = clamp(safe.impact.scale.score);
    safe.impact.scope.score           = clamp(safe.impact.scope.score);
    safe.impact.irremediability.score = clamp(safe.impact.irremediability.score);
    safe.impact.likelihood.score      = clamp(safe.impact.likelihood.score);
    safe.financial.magnitude.score    = clamp(safe.financial.magnitude.score);
    safe.financial.likelihood.score   = clamp(safe.financial.likelihood.score);

    return { result: safe, ...extractTokens(response) };

  } catch (err: any) {
    // Preserve response size for diagnostics without retaining tenant content.
    const enriched = new Error(err instanceof Error ? err.message : String(err)) as any;
    enriched.aiResponseChars = rawText.length;
    throw enriched;
  }
}

async function triggerReportGeneration(event: any, { organization_id, profile, materialAssessments, user_id, user_email }: any) {
  const url = createInternalFunctionUrl(event, "report-background");
  const internalJobHeaders = createInternalJobHeaders();
  
  console.log(`[api] Triggering background report at ${url}`);
  
  const admin = createClient(supabaseUrl!, serviceKey!);
  await admin
    .from("sustainability_reports")
    .upsert({ organization_id, status: "processing", updated_at: new Date().toISOString() }, { onConflict: "organization_id" });

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: internalJobHeaders,
      body: JSON.stringify({ organization_id, profile, materialAssessments, user_id, user_email }),
    });
    console.log(`[api] Background function trigger status: ${resp.status}`);
  } catch (e) {
    console.error("[api] Failed to trigger background function:", e);
  }

  return {
    result: { message: "Report generation started", triggeredUrl: url },
    inputTokens: 0,
    outputTokens: 0,
  };
}

async function triggerDMAAnalysis(event: any, { organization_id, profile, assessments, bmcData, swotData, user_id, user_email }: any) {
  const url = createInternalFunctionUrl(event, "dma-background");
  const internalJobHeaders = createInternalJobHeaders();
  
  console.log(`[api] Triggering background DMA analysis at ${url}`);

  const admin = createClient(supabaseUrl!, serviceKey!);
  await admin
    .from("dma_analysis_jobs")
    .upsert({ organization_id, status: "processing", quality_result: [], updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
  
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: internalJobHeaders,
      body: JSON.stringify({ organization_id, profile, assessments, bmcData, swotData, user_id, user_email }),
    });
    console.log(`[api] Background function trigger status: ${resp.status}`);
  } catch (e) {
    console.error("[api] Failed to trigger background function:", e);
  }

  return {
    result: { message: "DMA analysis started" },
    inputTokens: 0,
    outputTokens: 0,
  };
}

async function triggerAssessmentAutofill(event: any, { organization_id, assessment_id, topic, profile, qualityCheckContext, user_id, user_email }: any) {
  const url = createInternalFunctionUrl(event, "assessment-background");
  const internalJobHeaders = createInternalJobHeaders();
  
  console.log(`[api] Triggering background assessment autofill at ${url}`);

  const admin = createClient(supabaseUrl!, serviceKey!);
  await admin
    .from("assessment_ai_jobs")
    .upsert({ organization_id, assessment_id, topic, autofill_status: "processing", updated_at: new Date().toISOString() }, { onConflict: "organization_id,assessment_id" });
  
  try {
    fetch(url, {
      method: "POST",
      headers: internalJobHeaders,
      body: JSON.stringify({ organization_id, assessment_id, action: 'autofill', topic, profile, qualityCheckContext, user_id, user_email }),
    }).then(resp => console.log(`[api] Background function trigger status: ${resp.status}`))
      .catch(e => console.error("[api] Failed to trigger background function:", e));
  } catch (e) {
    console.error("[api] Failed to trigger background function:", e);
  }

  return {
    result: { message: "Assessment autofill started" },
    inputTokens: 0,
    outputTokens: 0,
  };
}

async function triggerAssessmentScoring(event: any, { organization_id, assessment_id, topic, profile, bmcData, swotData, impactDescription, financialDescription, user_id, user_email }: any) {
  const url = createInternalFunctionUrl(event, "assessment-background");
  const internalJobHeaders = createInternalJobHeaders();
  
  console.log(`[api] Triggering background assessment scoring at ${url}`);

  const admin = createClient(supabaseUrl!, serviceKey!);
  await admin
    .from("assessment_ai_jobs")
    .upsert({ organization_id, assessment_id, topic, scoring_status: "processing", updated_at: new Date().toISOString() }, { onConflict: "organization_id,assessment_id" });
  
  try {
    fetch(url, {
      method: "POST",
      headers: internalJobHeaders,
      body: JSON.stringify({ organization_id, assessment_id, action: 'scoring', topic, profile, bmcData, swotData, impactDescription, financialDescription, user_id, user_email }),
    }).then(resp => console.log(`[api] Background function trigger status: ${resp.status}`))
      .catch(e => console.error("[api] Failed to trigger background function:", e));
  } catch (e) {
    console.error("[api] Failed to trigger background function:", e);
  }

  return {
    result: { message: "Assessment scoring started" },
    inputTokens: 0,
    outputTokens: 0,
  };
}

function buildDMACompanySection(profile: any, bmcItems: any, swotItems: any): string {
  const companyCtx = profile ? buildCompanyContext(profile) : "";
  const bmcContext = bmcItems
    ? [
        bmcItems.key_activities?.length ? `Key activities: ${joinField(bmcItems.key_activities)}` : "",
        bmcItems.eco_social_costs?.length ? `Eco-social costs: ${joinField(bmcItems.eco_social_costs)}` : "",
        bmcItems.eco_social_benefits?.length ? `Eco-social benefits: ${joinField(bmcItems.eco_social_benefits)}` : "",
      ].filter(Boolean).join("\n")
    : "";
  const swotContext = swotItems
    ? [
        swotItems.threats?.length ? `Threats: ${joinField(swotItems.threats)}` : "",
        swotItems.opportunities?.length ? `Opportunities: ${joinField(swotItems.opportunities)}` : "",
      ].filter(Boolean).join("\n")
    : "";
  return [
    companyCtx,
    bmcContext ? `Business context:\n${bmcContext}` : "",
    swotContext ? `Strategic context:\n${swotContext}` : "",
  ].filter(Boolean).join("\n\n");
}

// Pass 1 — single topic quality check. One call per topic from the frontend.
async function analyzeTopicQuality(
  ai: GoogleGenAI,
  model: string,
  { assessment, profile, bmcItems, swotItems }: any
) {
  const a = assessment;
  const topicCode  = String(a.topic).split(" ")[0];
  const topicTitle = String(a.topic).replace(/^[A-Z0-9]+ /, "");
  const companySection = buildDMACompanySection(profile, bmcItems, swotItems);
  const scores = a.impactScore ?? {};

  const prompt = `
You are a senior ESRS/CSRD auditor reviewing one topic in a Double Materiality Assessment.

${companySection}

Topic under review: ${a.topic}
Material: ${(a.isMaterial ?? false) ? "Yes" : "No"}
Impact score: ${a.impactMaterialityValue ?? 0}/100 — "${a.impactDescription || "No description provided"}"
Financial score: ${a.financialMaterialityValue ?? 0}/100 — "${a.financialDescription || "No description provided"}"
${scores.scale ? `Sub-scores: scale=${scores.scale} scope=${scores.scope} irremediability=${scores.irremediability} likelihood=${scores.likelihood}` : ""}

Assess quality:
- "needs_fix": critical gap that would fail a CSRD compliance review
- "review": minor concern worth addressing, not blocking
- "ok": meets minimum ESRS requirements for this topic

Flag issues only if genuinely present. Return at most 2 issues. Keep descriptions concise (under 30 words each).
Return ONLY valid JSON — no markdown, no backticks.
  `.trim();

  const issueSchema = {
    type: Type.OBJECT,
    required: ["severity", "title", "description", "esrs_ref", "fix_suggestion"],
    properties: {
      severity:       { type: Type.STRING },
      title:          { type: Type.STRING },
      description:    { type: Type.STRING },
      esrs_ref:       { type: Type.STRING },
      fix_suggestion: { type: Type.STRING },
    },
  };

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      ...noThinkingConfig(model),
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["topic", "topicTitle", "status", "issues"],
        properties: {
          topic:      { type: Type.STRING },
          topicTitle: { type: Type.STRING },
          status:     { type: Type.STRING },
          issues:     { type: Type.ARRAY, items: issueSchema },
        },
      },
    },
  });

  const parsed = parseAIJson<any>(response.text, { topic: topicCode, topicTitle, status: "ok", issues: [] });
  // Always override topic/topicTitle from source data to prevent AI drift
  return {
    result: { ...parsed, topic: topicCode, topicTitle },
    ...extractTokens(response),
  };
}

// Pass 2 — holistic synthesis. Fired once after all topic calls complete.
async function analyzeDMASynthesis(
  ai: GoogleGenAI,
  model: string,
  { qualityChecks, assessments, profile, bmcItems, swotItems }: any
) {
  const companySection = buildDMACompanySection(profile, bmcItems, swotItems);

  const allTopicsSummary = (assessments ?? []).map((a: any) =>
    `${a.topic}: material=${(a.isMaterial ?? false) ? "yes" : "no"} impact=${a.impactMaterialityValue ?? 0}/100 financial=${a.financialMaterialityValue ?? 0}/100`
  ).join(" | ");

  const materialTopics = (assessments ?? [])
    .filter((a: any) => a.isMaterial ?? false)
    .map((a: any) => String(a.topic).split(" ")[0])
    .join(", ") || "none identified";

  // Summarise quality check results for the synthesis prompt
  const qualitySummary = (qualityChecks ?? []).map((c: any) =>
    `${c.topic} (${c.status})${c.issues?.length ? ": " + c.issues.map((i: any) => i.title).join("; ") : ""}`
  ).join("\n");

  const prompt = `
You are a senior sustainability strategy advisor briefing a CEO on their completed Double Materiality Assessment (DMA).

${companySection}

All ESRS topics summary (topic: material? impact/100 financial/100):
${allTopicsSummary}

Material topics: ${materialTopics}

Quality check results per topic:
${qualitySummary}

TASK 1 — STRATEGIC INSIGHT (plain language, no ESRS jargon):
- summary: 2-3 sentences on what this DMA reveals about the business
- keyRisks: exactly 3-5 strings, each describing a specific material risk with business impact
- opportunities: exactly 3-5 strings, each describing a concrete strategic opportunity
- bottomLine: one sentence — the single most important thing this company must do now

TASK 2 — RECOMMENDED ACTIONS: Generate exactly 5 to 8 actions covering all three types.
Each action MUST have ALL of these fields:
- id: "action-1", "action-2", etc.
- type: "fix" (correct an incomplete assessment), "comply" (meet ESRS requirement for material topic), or "improve" (strategic opportunity)
- priority: "high", "medium", or "low"
- title: short action title (under 10 words)
- description: what to do and why (under 25 words)
- esrs_ref: relevant ESRS standard (e.g. "ESRS E1-6", "ESRS S1-1")
- source_type: "dma"
- source_id: the ESRS topic code this action relates to (e.g. "E1", "S1")
- estimated_time: realistic estimate (e.g. "2 hours", "1 day", "1 week")

Distribute actions: at least 1 "fix", 2 "comply", 1 "improve". Prioritise material topics and topics with needs_fix status.

Return ONLY valid JSON — no markdown, no backticks.
  `.trim();

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      ...noThinkingConfig(model),
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["strategicInsight", "recommendedActions"],
        properties: {
          strategicInsight: {
            type: Type.OBJECT,
            required: ["summary", "keyRisks", "opportunities", "bottomLine"],
            properties: {
              summary:       { type: Type.STRING },
              keyRisks:      { type: Type.ARRAY, items: { type: Type.STRING } },
              opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
              bottomLine:    { type: Type.STRING },
            },
          },
          recommendedActions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["id", "type", "priority", "title", "description", "esrs_ref", "source_type", "source_id", "estimated_time"],
              properties: {
                id:             { type: Type.STRING },
                type:           { type: Type.STRING },
                priority:       { type: Type.STRING },
                title:          { type: Type.STRING },
                description:    { type: Type.STRING },
                esrs_ref:       { type: Type.STRING },
                source_type:    { type: Type.STRING },
                source_id:      { type: Type.STRING },
                estimated_time: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });

  const parsed = parseAIJson(response.text, {
    strategicInsight: { summary: "", keyRisks: [], opportunities: [], bottomLine: "" },
    recommendedActions: [],
  });

  return {
    result: {
      strategicInsight:   parsed?.strategicInsight  ?? { summary: "", keyRisks: [], opportunities: [], bottomLine: "" },
      recommendedActions: Array.isArray(parsed?.recommendedActions) ? parsed.recommendedActions : [],
    },
    ...extractTokens(response),
  };
}

// Legacy single-call version — kept for backward compat but no longer called by the UI.
async function analyzeDMAQuality(
  ai: GoogleGenAI,
  model: string,
  { assessments, bmcItems, swotItems, profile }: any
) {
  if (!assessments || assessments.length === 0) {
    return {
      result: { qualityChecks: [], strategicInsight: { summary: "", keyRisks: [], opportunities: [], bottomLine: "" }, recommendedActions: [] },
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const companyCtx = profile ? buildCompanyContext(profile) : "";

  const bmcContext = bmcItems
    ? [
        bmcItems.key_activities?.length ? `Key activities: ${joinField(bmcItems.key_activities)}` : "",
        bmcItems.eco_social_costs?.length ? `Eco-social costs: ${joinField(bmcItems.eco_social_costs)}` : "",
        bmcItems.eco_social_benefits?.length ? `Eco-social benefits: ${joinField(bmcItems.eco_social_benefits)}` : "",
      ].filter(Boolean).join("\n")
    : "";

  const swotContext = swotItems
    ? [
        swotItems.threats?.length ? `Threats: ${joinField(swotItems.threats)}` : "",
        swotItems.opportunities?.length ? `Opportunities: ${joinField(swotItems.opportunities)}` : "",
      ].filter(Boolean).join("\n")
    : "";

  const companySection = [
    companyCtx,
    bmcContext ? `Business context:\n${bmcContext}` : "",
    swotContext ? `Strategic context:\n${swotContext}` : "",
  ].filter(Boolean).join("\n\n");

  // ── Build a mini-summary of ALL topics (for the insight call context) ──────
  const allTopicsSummary = assessments.map((a: any) => {
    const impactScore = a.impactMaterialityValue ?? 0;
    const financialScore = a.financialMaterialityValue ?? 0;
    const material = a.isMaterial ?? false;
    return `${a.topic}: material=${material ? "yes" : "no"} impact=${impactScore}/100 financial=${financialScore}/100`;
  }).join(" | ");

  const issueSchema = {
    type: Type.OBJECT,
    required: ["severity", "title", "description", "esrs_ref", "fix_suggestion"],
    properties: {
      severity:       { type: Type.STRING },
      title:          { type: Type.STRING },
      description:    { type: Type.STRING },
      esrs_ref:       { type: Type.STRING },
      fix_suggestion: { type: Type.STRING },
    },
  };

  const qualityCheckSchema = {
    type: Type.OBJECT,
    required: ["topic", "topicTitle", "status", "issues"],
    properties: {
      topic:      { type: Type.STRING },
      topicTitle: { type: Type.STRING },
      status:     { type: Type.STRING },
      issues:     { type: Type.ARRAY, items: issueSchema },
    },
  };

  // ── One tiny call per topic (all in parallel) ─────────────────────────────
  const topicQualityCalls = assessments.map((a: any) => {
    const impactScore = a.impactMaterialityValue ?? 0;
    const financialScore = a.financialMaterialityValue ?? 0;
    const material = a.isMaterial ?? false;
    const impactDesc = a.impactDescription ?? "";
    const financialDesc = a.financialDescription ?? "";
    const topicCode = String(a.topic).split(" ")[0];
    const topicTitle = String(a.topic).replace(/^[A-Z0-9]+ /, "");
    const scores = a.impactScore ?? {};

    const prompt = `
You are a senior ESRS/CSRD auditor reviewing one topic in a Double Materiality Assessment.

${companySection}

Topic under review: ${a.topic}
Material: ${material ? "Yes" : "No"}
Impact score: ${impactScore}/100 — "${impactDesc || "No description provided"}"
Financial score: ${financialScore}/100 — "${financialDesc || "No description provided"}"
${scores.scale ? `Sub-scores: scale=${scores.scale} scope=${scores.scope} irremediability=${scores.irremediability} likelihood=${scores.likelihood}` : ""}

Assess quality:
- "needs_fix": critical gap that would fail a CSRD compliance review
- "review": minor concern worth addressing, not blocking
- "ok": meets minimum ESRS requirements for this topic

Flag issues only if genuinely present. Return at most 2 issues. Keep descriptions concise (under 30 words each).
Return ONLY valid JSON — no markdown, no backticks.
    `.trim();

    return ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          ...qualityCheckSchema,
          properties: {
            ...qualityCheckSchema.properties,
            topic:      { type: Type.STRING, description: topicCode },
            topicTitle: { type: Type.STRING, description: topicTitle },
          },
        },
      },
    });
  });

  // ── Insight + actions call (fires in parallel with topic calls) ───────────
  const materialTopics = assessments
    .filter((a: any) => a.isMaterial ?? false)
    .map((a: any) => String(a.topic).split(" ")[0])
    .join(", ") || "none identified";

  const insightPrompt = `
You are a senior sustainability strategy advisor briefing a CEO on their completed Double Materiality Assessment (DMA).

${companySection}

All 10 ESRS topics summary (topic: material? impact/100 financial/100):
${allTopicsSummary}

Material topics: ${materialTopics}

TASK 1 — STRATEGIC INSIGHT (plain language, no ESRS jargon):
- summary: 2-3 sentences on what this DMA reveals about the business
- keyRisks: exactly 3-5 strings, each describing a specific material risk with business impact
- opportunities: exactly 3-5 strings, each describing a concrete strategic opportunity
- bottomLine: one sentence — the single most important thing this company must do now

TASK 2 — RECOMMENDED ACTIONS: Generate exactly 5 to 8 actions covering all three types.
Each action MUST have ALL of these fields:
- id: "action-1", "action-2", etc.
- type: one of "fix" (correct an incomplete assessment), "comply" (meet an ESRS requirement for a material topic), or "improve" (strategic opportunity)
- priority: "high", "medium", or "low"
- title: short action title (under 10 words)
- description: what to do and why (under 25 words)
- esrs_ref: relevant ESRS standard (e.g. "ESRS E1-6", "ESRS S1-1")
- source_type: "dma"
- source_id: the ESRS topic code this action relates to (e.g. "E1", "S1")
- estimated_time: realistic estimate (e.g. "2 hours", "1 day", "1 week")

Distribute actions: include at least 1 "fix", 2 "comply", and 1 "improve".
Prioritise material topics.

Return ONLY valid JSON — no markdown, no backticks.
  `.trim();

  const insightCall = ai.models.generateContent({
    model,
    contents: insightPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["strategicInsight", "recommendedActions"],
        properties: {
          strategicInsight: {
            type: Type.OBJECT,
            required: ["summary", "keyRisks", "opportunities", "bottomLine"],
            properties: {
              summary:       { type: Type.STRING },
              keyRisks:      { type: Type.ARRAY, items: { type: Type.STRING } },
              opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
              bottomLine:    { type: Type.STRING },
            },
          },
          recommendedActions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["id", "type", "priority", "title", "description", "esrs_ref", "source_type", "source_id", "estimated_time"],
              properties: {
                id:             { type: Type.STRING },
                type:           { type: Type.STRING },
                priority:       { type: Type.STRING },
                title:          { type: Type.STRING },
                description:    { type: Type.STRING },
                esrs_ref:       { type: Type.STRING },
                source_type:    { type: Type.STRING },
                source_id:      { type: Type.STRING },
                estimated_time: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });

  // Fire all calls in parallel
  const allResps = await Promise.all([...topicQualityCalls, insightCall]);
  const topicResps = allResps.slice(0, assessments.length);
  const insightResp = allResps[assessments.length];

  const qualityChecks = topicResps.map((r, i) => {
    const a = assessments[i];
    const topicCode = String(a.topic).split(" ")[0];
    const topicTitle = String(a.topic).replace(/^[A-Z0-9]+ /, "");
    const parsed = parseAIJson<any>(r.text, { topic: topicCode, topicTitle, status: "ok", issues: [] });
    // Ensure topic/topicTitle are always correct regardless of AI output
    return { ...parsed, topic: topicCode, topicTitle };
  });

  const insightParsed = parseAIJson(insightResp.text, {
    strategicInsight: { summary: "", keyRisks: [], opportunities: [], bottomLine: "" },
    recommendedActions: [],
  });

  const inputTokens = allResps.reduce((s, r) => s + Number(r.usageMetadata?.promptTokenCount ?? 0), 0);
  const outputTokens = allResps.reduce((s, r) => s + Number(r.usageMetadata?.candidatesTokenCount ?? 0), 0);

  return {
    result: {
      qualityChecks,
      strategicInsight:   insightParsed?.strategicInsight ?? { summary: "", keyRisks: [], opportunities: [], bottomLine: "" },
      recommendedActions: Array.isArray(insightParsed?.recommendedActions) ? insightParsed.recommendedActions : [],
    },
    inputTokens,
    outputTokens,
  };
}

// =============================================================
// generateTasks — produce fix/comply/improve tasks from DMA data
// =============================================================

async function generateTasks(
  ai: GoogleGenAI,
  model: string,
  { qualityChecks, assessments, kpis, swotItems, profile }: any
) {
  const companyCtx = profile ? buildCompanyContext(profile) : "";

  // Material topics for comply tasks
  const materialTopics = (assessments ?? [])
    .filter((a: any) => a.isMaterial)
    .map((a: any) => `${a.topic} (impact=${a.impactMaterialityValue}/100, financial=${a.financialMaterialityValue}/100)`)
    .join("; ");

  // Quality issues for fix tasks
  const fixContext = (qualityChecks ?? [])
    .filter((q: any) => q.status !== "ok")
    .map((q: any) => {
      const issues = (q.issues ?? []).map((i: any) => `    - [${i.severity}] ${i.title}: ${i.fix_suggestion}`).join("\n");
      return `${q.topic} ${q.topicTitle} (${q.status}):\n${issues}`;
    })
    .join("\n");

  // KPI data for improve tasks
  const kpiContext = (kpis ?? [])
    .slice(0, 8)
    .map((k: any) => `${k.name} (ID: ${k.id}) (${k.perspective}): current=${k.currentValue}${k.unit}, target=${k.targetValue}${k.unit}`)
    .join("; ");

  // SWOT for improve tasks
  const swotContext = swotItems
    ? [
        swotItems.strengths?.length ? `Strengths: ${joinField(swotItems.strengths)}` : "",
        swotItems.opportunities?.length ? `Opportunities: ${joinField(swotItems.opportunities)}` : "",
        swotItems.weaknesses?.length ? `Weaknesses: ${joinField(swotItems.weaknesses)}` : "",
      ].filter(Boolean).join("\n")
    : "";

  const prompt = `
You are an ESRS/CSRD compliance and sustainability strategy expert generating an actionable task list for an SME.

COMPANY:
${companyCtx}

MATERIAL TOPICS (for "comply" tasks):
${materialTopics || "None identified yet"}

QUALITY ISSUES TO FIX (for "fix" tasks):
${fixContext || "None — all quality checks passed"}

KPI PERFORMANCE (for "improve" tasks):
${kpiContext || "No KPI data"}

SWOT CONTEXT (for "improve" tasks):
${swotContext || "No SWOT data"}

TASK TYPES:
- "fix": Correct incomplete or low-quality DMA assessments (from quality issues above)
- "comply": Meet ESRS reporting requirements for each material topic
- "improve": Strategic sustainability improvements based on KPIs, opportunities, and weaknesses

INSTRUCTIONS:
Generate 8 to 15 tasks total. Include ALL THREE types. Prioritise based on materiality and severity.
- At least 2 "fix" tasks (if quality issues exist)
- At least 3 "comply" tasks (one per material topic, max 5)
- At least 2 "improve" tasks (from SWOT opportunities and KPI gaps)

Each task MUST have ALL fields:
- title: concise action title (max 10 words)
- description: what to do and measurable outcome (max 30 words)
- type: "fix" | "comply" | "improve"
- priority: "high" | "medium" | "low"
- esrs_ref: relevant standard code (e.g. "ESRS E1-6", "ESRS S1-1") or "" if none
- source_type: "insight_hub" for fix, "dma" for comply, "kpi" for improve
- source_id: ESRS topic code (e.g. "E1") or KPI ID (provided as ID: ...)
- estimated_time: realistic time (e.g. "2 hours", "3 days", "1 week")

Return ONLY a valid JSON array of task objects. No markdown, no backticks, no explanation.
  `.trim();

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: ["title", "description", "type", "priority", "esrs_ref", "source_type", "source_id", "estimated_time"],
          properties: {
            title:          { type: Type.STRING },
            description:    { type: Type.STRING },
            type:           { type: Type.STRING },
            priority:       { type: Type.STRING },
            esrs_ref:       { type: Type.STRING },
            source_type:    { type: Type.STRING },
            source_id:      { type: Type.STRING },
            estimated_time: { type: Type.STRING },
          },
        },
      },
      ...noThinkingConfig(model),
    },
  });

  const tasks = parseAIJson<any[]>(response.text, []);
  const { inputTokens, outputTokens } = extractTokens(response);

  return { result: tasks, inputTokens, outputTokens };
}

async function generateDMAGuide(
  ai: GoogleGenAI,
  model: string,
  { profile }: { profile: any }
) {
  const companyName = profile.name || "this company";
  const companyCtx = `
Company Name: ${companyName}
Industry: ${profile.industry || "Not specified"}
ISIC Code: ${profile.isicCode || "Not specified"}
Description: ${profile.description || "Not specified"}
Employees: ${profile.employees || "Not specified"}
Revenue: ${profile.revenue || "Not specified"}
`;

  const prompt = `
You are an ESRS/CSRD sustainability expert.
Based on the following company context, suggest the top 3 Double Materiality Assessment (DMA) topics that this company should focus on.

Company Context:
${companyCtx}

Provide a short guide message and the top 3 topics.
Each topic must have a reason why it is a focus area, and the related ESRS standard (e.g. "ESRS E1", "ESRS S1").
Keep the total response short and precise. The explanation for all 3 topics combined should not exceed 100 words.
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          message: { type: Type.STRING },
          topics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                reason: { type: Type.STRING },
                esrs_ref: { type: Type.STRING }
              },
              required: ["topic", "reason", "esrs_ref"]
            }
          }
        },
        required: ["message", "topics"]
      },
      ...noThinkingConfig(model),
    },
  });

  const result = parseAIJson<any>(response.text, { message: "", topics: [] });
  const { inputTokens, outputTokens } = extractTokens(response);

  return { result, inputTokens, outputTokens };
}

export {
  buildCanvasContextBlock,
  buildCanvasSuggestionPrompt,
  buildCompanyStrategicBmcContext,
  buildCompanyStrategicReportPrompt,
  getSBMCBlockLabel,
  handler,
  normalizeCanvasContext,
  parseAIJson,
  SBMC_BLOCK_DEFINITIONS,
  SBMC_BLOCKS,
};
