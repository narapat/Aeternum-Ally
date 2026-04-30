import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const apiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEFAULT_MODEL = "gemini-2.5-flash";

// Approximate Gemini pricing per 1M tokens (USD).
// Source: https://ai.google.dev/pricing
const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash-lite": { input: 0.10, output: 0.40 },
  "gemini-2.5-flash":      { input: 0.30, output: 2.50 },
  "gemini-2.5-pro":        { input: 1.25, output: 10.00 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
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

  const ai = new GoogleGenAI({ apiKey });
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
  // 4. Look up the org's chosen model
  // ------------------------------------------------------------------
  const { data: settings } = await admin
    .from("organization_ai_settings")
    .select("model")
    .eq("organization_id", organization_id)
    .maybeSingle();
  const model = settings?.model ?? DEFAULT_MODEL;

  // ------------------------------------------------------------------
  // 5. Run the action with timing + usage tracking
  // ------------------------------------------------------------------
  const start = Date.now();
  let result: any = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let success = true;
  let errorMessage: string | null = null;
  let upstreamStatus: number | null = null;
  let userFacingMessage = "Something went wrong while contacting the AI service.";

  try {
    const outcome = await runAction(ai, model, action, params);
    result = outcome.result;
    inputTokens = outcome.inputTokens;
    outputTokens = outcome.outputTokens;
  } catch (error: any) {
    console.error("API Error:", error);
    success = false;
    upstreamStatus =
      (typeof error?.status === "number" && error.status) ||
      (typeof error?.error?.code === "number" && error.error.code) ||
      null;
    errorMessage = error?.error?.message || (error instanceof Error ? error.message : String(error));
    userFacingMessage =
      upstreamStatus === 503
        ? "The AI service is temporarily overloaded. Please try again in a moment."
        : upstreamStatus === 429
        ? "AI rate limit reached. Please wait a minute and try again."
        : errorMessage || userFacingMessage;
  }

  const durationMs = Date.now() - start;

  // ------------------------------------------------------------------
  // 6. Log the call (best-effort; never fail the response if logging fails)
  // ------------------------------------------------------------------
  try {
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
      estimated_cost_usd: success ? Number(estimateCost(model, inputTokens, outputTokens).toFixed(6)) : 0,
    });
  } catch (logErr) {
    // eslint-disable-next-line no-console
    console.warn("Failed to log AI usage:", logErr);
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
  params: any
): Promise<{ result: any; inputTokens: number; outputTokens: number }> {
  switch (action) {
    case "generateAssessmentSuggestions":
      return generateAssessmentSuggestions(ai, model, params);
    case "generateCanvasSuggestion":
      return generateCanvasSuggestion(ai, model, params);
    case "generateSwotInternal":
      return generateSwotInternal(ai, model, params);
    case "generateSwotExternal":
      return generateSwotExternal(ai, model, params);
    case "generateKPISuggestions":
      return generateKPISuggestions(ai, model, params);
    case "generateSustainabilityStatement":
      return generateSustainabilityStatement(ai, model, params);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// Pull token counts out of Gemini's response in a tolerant way.
function extractTokens(response: any): { inputTokens: number; outputTokens: number } {
  const u = response?.usageMetadata ?? {};
  return {
    inputTokens: Number(u.promptTokenCount ?? 0),
    outputTokens: Number(u.candidatesTokenCount ?? u.responseTokenCount ?? 0),
  };
}

// =============================================================
// Action implementations
// =============================================================

async function generateAssessmentSuggestions(
  ai: GoogleGenAI,
  model: string,
  { companyDescription, topic }: any
) {
  const prompt = `
    Act as a senior sustainability consultant specializing in ESRS (European Sustainability Reporting Standards).

    Analyze the following company: "${companyDescription}".

    For the ESRS Topic: "${topic}", provide:
    1. A summary of potential "Impacts" (Inside-out): How the company impacts people and the environment regarding this topic.
    2. A summary of potential "Risks & Opportunities" (Outside-in): How this sustainability matter triggers financial effects on the company.

    Keep descriptions concise (under 50 words each) and specific to the industry.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          impactSuggestion: { type: Type.STRING },
          financialSuggestion: { type: Type.STRING },
        },
      },
    },
  });

  return {
    result: JSON.parse(response.text || "{}"),
    ...extractTokens(response),
  };
}

async function generateCanvasSuggestion(
  ai: GoogleGenAI,
  model: string,
  { companyName, companyDescription, fieldLabel }: any
) {
  const prompt = `
    Act as a business strategy consultant specializing in Sustainable Business Model Canvas.

    Context:
    Company Name: "${companyName}"
    Description: "${companyDescription}"

    Task:
    Suggest content for the "${fieldLabel}" block of the Business Model Canvas.
    The suggestion should be specific to the industry, concise, and formatted as a list of key points (bullet points).
    If the field is "Eco-Social Costs" or "Eco-Social Benefits", focus strictly on environmental and social externalities.

    Output plain text only.
  `;

  const response = await ai.models.generateContent({ model, contents: prompt });
  return {
    result: response.text?.trim() || "",
    ...extractTokens(response),
  };
}

async function generateSwotInternal(
  ai: GoogleGenAI,
  model: string,
  { companyName, bmcData }: any
) {
  const prompt = `
    Act as a strategic business analyst.

    Based on the following Business Model Canvas data for "${companyName}", suggest list of:
    1. STRENGTHS (Internal positive factors)
    2. WEAKNESSES (Internal negative factors)

    BMC Data:
    - Value Prop: ${bmcData.valueProposition}
    - Key Resources: ${bmcData.keyResources}
    - Key Activities: ${bmcData.keyActivities}
    - Cost Structure: ${bmcData.costStructure}

    Return the response in JSON format with keys "strengths" and "weaknesses".
    Provide bullet points using a hyphen (-).
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          strengths: { type: Type.STRING },
          weaknesses: { type: Type.STRING },
        },
      },
    },
  });

  return {
    result: JSON.parse(response.text || "{}"),
    ...extractTokens(response),
  };
}

async function generateSwotExternal(
  ai: GoogleGenAI,
  model: string,
  { companyName, companyDescription, type }: any
) {
  const prompt = `
    Act as a market researcher. Search for recent news, market trends, and regulatory changes relevant to:
    Company: "${companyName}"
    Context: "${companyDescription}"

    Based on the search results, list the key ${type} (External factors) for this business.
    Focus on:
    - Market trends
    - Competitor moves
    - New regulations (especially sustainability/ESG)
    - Technological shifts

    Provide the answer as a bulleted list. Cite sources if possible.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { tools: [{ googleSearch: {} }] },
  });

  return {
    result: response.text?.trim() || "",
    ...extractTokens(response),
  };
}

async function generateKPISuggestions(
  ai: GoogleGenAI,
  model: string,
  { companyDescription, perspective }: any
) {
  const prompt = `
    Act as a Strategy Performance Manager using the Balanced Scorecard framework.

    Company Context: "${companyDescription}"

    Task: Suggest 3 strategic KPIs for the "${perspective}" perspective.

    Format the response as a JSON Array of objects, where each object has:
    - name: KPI Name (Short title)
    - description: Why this is important for this company.
    - unit: Measurement unit (e.g., %, THB, #)
    - targetSuggestion: A placeholder target value (number) appropriate for an SME.
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
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            unit: { type: Type.STRING },
            targetSuggestion: { type: Type.NUMBER },
          },
        },
      },
    },
  });

  return {
    result: JSON.parse(response.text || "[]"),
    ...extractTokens(response),
  };
}

async function generateSustainabilityStatement(
  ai: GoogleGenAI,
  model: string,
  { profile, materialAssessments }: any
) {
  if (!materialAssessments || materialAssessments.length === 0) {
    return {
      result: { generalDisclosure: "No data", strategyDisclosure: "No data", topics: [] },
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const materialList = materialAssessments
    .map((a: any) => `${a.topic} (Impact: ${a.impactDescription}, Financial: ${a.financialDescription})`)
    .join("; ");

  const prompt = `
    Act as a Sustainability Reporting Officer drafting a "Sustainability Statement" in alignment with ESRS (European Sustainability Reporting Standards) and GRI Standards.

    Company: ${profile.name} (${profile.industry})
    Mission: ${profile.mission}
    Material Topics Identified: ${materialList}

    Task: Generate narrative content for the report in JSON format.

    1. generalDisclosure: Draft a "Basis of Preparation" (ESRS 2 BP-1, BP-2). Explain that this report uses a Double Materiality approach, considering both impact materiality (GRI-aligned) and financial materiality.
    2. strategyDisclosure: Draft a "Strategy" section (ESRS 2 SBM-3). Summarize how the company's business model interacts with these material impacts and risks.
    3. topics: For EACH material topic provided, generate a structured "Disclosure Requirement" text. This text should briefly suggest Policies, Actions, and Metrics (ESRS MDR-P, MDR-A, MDR-M) relevant to the topic. Mention specific GRI standard numbers where applicable (e.g., for Climate Change, mention GRI 305).

    Output JSON structure:
    {
      "generalDisclosure": "string",
      "strategyDisclosure": "string",
      "topics": [
        { "topicId": "E1", "topicName": "E1 Climate Change", "disclosureContent": "string" }
      ]
    }
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          generalDisclosure: { type: Type.STRING },
          strategyDisclosure: { type: Type.STRING },
          topics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topicId: { type: Type.STRING },
                topicName: { type: Type.STRING },
                disclosureContent: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });

  return {
    result: JSON.parse(response.text || "{}"),
    ...extractTokens(response),
  };
}

export { handler };
