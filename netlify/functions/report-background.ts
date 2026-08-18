import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { requireInternalJobAuth } from "./_shared/internalJobAuth.js";
import { loadOrganizationAiConfig } from "./_shared/organizationAiConfig.js";

const apiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEFAULT_MODEL = "gemini-2.5-flash";

const MODEL_REGISTRY: Record<string, { input: number; output: number; canDisableThinking: boolean }> = {
  "gemini-2.5-flash-lite": { input: 0.10, output: 0.40,  canDisableThinking: true  },
  "gemini-2.5-flash":      { input: 0.30, output: 2.50,  canDisableThinking: true  },
  "gemini-2.5-pro":        { input: 1.25, output: 10.00, canDisableThinking: false },
};

const handler = async (event: any) => {
  const start = Date.now();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const authError = requireInternalJobAuth(event);
  if (authError) return authError;

  const { organization_id, profile, materialAssessments, user_id, user_email } = JSON.parse(event.body);

  if (!organization_id || !profile || !materialAssessments) {
    console.error("[report-background] Missing required fields");
    return { statusCode: 400, body: "Missing required fields" };
  }

  console.log(`[report-background] Starting generation for org=${organization_id}, topics=${materialAssessments.length}`);

  const admin = createClient(supabaseUrl!, serviceKey!);

  let aiConfig;
  try {
    aiConfig = await loadOrganizationAiConfig(
      admin,
      organization_id,
      apiKey!,
      DEFAULT_MODEL,
    );
  } catch {
    console.error(`[report-background] AI configuration unavailable org=${organization_id}`);
    return { statusCode: 503, body: "AI settings are temporarily unavailable" };
  }
  const {
    model: activeModel,
    resolvedApiKey,
    quotaType,
  } = aiConfig;

  console.log(`[report-background] Using model=${activeModel}, quotaType=${quotaType}`);

  function parseAIJson<T>(text: string | undefined, fallback: T): T {
    if (!text) return fallback;
    try {
      const cleaned = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      return JSON.parse(cleaned);
    } catch (error: any) {
      console.warn(
        `[report-background] Failed to parse AI JSON chars=${text.length} type=${error instanceof Error ? error.name : "UnknownError"}`,
      );
      return fallback;
    }
  }

  function estimateCost(m: string, inputTokens: number, outputTokens: number): number {
    const p = MODEL_REGISTRY[m];
    if (!p) return 0;
    return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  }

  function noThinkingConfig(m: string): object {
    const entry = MODEL_REGISTRY[m];
    const canDisable = entry != null ? entry.canDisableThinking : m.includes("flash");
    return canDisable ? { thinkingConfig: { thinkingBudget: 0 } } : {};
  }

  try {
    // 1. Update status to processing
    await admin
      .from("sustainability_reports")
      .upsert({ organization_id, status: "processing", updated_at: new Date().toISOString() }, { onConflict: "organization_id" });

    const ai = new GoogleGenAI({ apiKey: resolvedApiKey });
    const companyContext = `
      Company: ${profile.name}
      Industry: ${profile.industry}
      Scale: ${profile.employeeCount} employees
      Description: ${profile.description}
    `;

    const topicSummary = materialAssessments
      .map((a: any) => `- ${a.topic} (impact score: ${a.impactMaterialityValue}/100, financial score: ${a.financialMaterialityValue}/100): impact: ${a.impactDescription}; financial: ${a.financialDescription}`)
      .join("\n");

    // ── Call 1: Header sections ──────────────────
    const headerPrompt = `
      Act as a Sustainability Reporting Officer drafting a "Baseline Sustainability Statement" aligned with ESRS and GRI Standards.

      ${companyContext}

      Material topics identified:
      ${topicSummary}

      Generate ONLY the two header sections below as JSON.

      1. generalDisclosure: "Basis of Preparation" (ESRS 2 BP-1/BP-2). Explain the Double Materiality approach. ~120 words.
      2. strategyDisclosure: "Strategy & Business Model" (ESRS 2 SBM-3). Summarise how the company's business model interacts with the material impacts. ~150 words.

      You MUST follow these safety rules:
      - Do not invent policies, actions, targets, or historical data.
      - If information is missing, state clearly that it is not available.
      - Do not claim full compliance or assurance.
    `;

    console.log("[report-background] Requesting header sections...");
    const headerResp = await ai.models.generateContent({
      model: activeModel,
      contents: headerPrompt,
      config: {
        ...noThinkingConfig(activeModel),
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            generalDisclosure: { type: Type.STRING },
            strategyDisclosure: { type: Type.STRING },
          },
        },
      },
    });

    let totalInputTokens = headerResp.usageMetadata?.promptTokenCount ?? 0;
    let totalOutputTokens = headerResp.usageMetadata?.candidatesTokenCount ?? 0;

    const header = parseAIJson(headerResp.text, { generalDisclosure: "", strategyDisclosure: "" });

    const result = {
      generalDisclosure: header.generalDisclosure ?? "",
      strategyDisclosure: header.strategyDisclosure ?? "",
      topics: [] as any[],
    };

    // Save initial structure
    console.log("[report-background] Saving initial report structure to DB...");
    await admin
      .from("sustainability_reports")
      .update({ result, updated_at: new Date().toISOString() })
      .eq("organization_id", organization_id);

    // ── Calls 2…N: One call per topic (SEQUENTIAL) ────────────────────────
    const topicConfig = {
      ...noThinkingConfig(activeModel),
      responseMimeType: "application/json",
      maxOutputTokens: 1000,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topicId: { type: Type.STRING },
          topicName: { type: Type.STRING },
          disclosureContent: { type: Type.STRING },
        },
      },
    };

    console.log(`[report-background] Processing ${materialAssessments.length} topics sequentially...`);

    for (const a of materialAssessments) {
      console.log(`[report-background] Generating disclosure for topic: ${a.topic}`);
      const topicCode = String(a.topic).split(" ")[0];
      const prompt = `
        Act as a Sustainability Reporting Officer drafting topical disclosures aligned with ESRS and GRI Standards.

        ${companyContext}

        Topic: ${a.topic} (code: "${topicCode}")
        Impact materiality score: ${a.impactMaterialityValue}/100 — ${a.impactDescription?.substring(0, 1000)}
        Financial materiality score: ${a.financialMaterialityValue}/100 — ${a.financialDescription?.substring(0, 1000)}

        Write a structured narrative disclosure for this single topic as JSON with:
        - topicId: the short code only — "${topicCode}"
        - topicName: the full string — "${a.topic}"
        - disclosureContent: A concise narrative (approx 200-300 words total) following the structure below. Keep each section brief.

        You MUST follow these safety rules:
        - Do not invent policies, actions, targets, or historical data.
        - If information is missing, you MUST use the exact phrases below:
          - If policy is missing: "No formal policy has been documented in the platform for this topic."
          - If action is missing: "No formal action has been documented in the platform for this topic."
          - If KPI/target is missing: "No quantitative KPI or target has been documented for this topic."
          - If evidence is missing: "No evidence has been provided in the platform."
          - For other missing data: "Information is not yet available."

        The disclosureContent MUST follow this exact structure (include the headers):
        
        Why this topic is material
        [Explain based on the impact/financial descriptions provided]

        Current impact, risk, or opportunity
        [Explain based on the assessment provided]

        Current policies
        [State the policy or use the missing phrase]

        Current actions
        [State the actions or use the missing phrase]

        Metrics and targets
        [State the KPIs or use the missing phrase]

        Data limitations
        [State missing data clearly]

        Recommended next steps
        [Suggest practical next action based on missing data]
      `;

      try {
        const response = await ai.models.generateContent({ model: activeModel, contents: prompt, config: topicConfig });
        
        totalInputTokens += response.usageMetadata?.promptTokenCount ?? 0;
        totalOutputTokens += response.usageMetadata?.candidatesTokenCount ?? 0;

        const parsed = parseAIJson(response.text, { topicId: topicCode, topicName: String(a.topic), disclosureContent: "Failed to generate." });
        result.topics.push(parsed);

        // Progressive update
        console.log(`[report-background] Updating DB with ${result.topics.length} completed topics`);
        await admin
          .from("sustainability_reports")
          .update({ result, updated_at: new Date().toISOString() })
          .eq("organization_id", organization_id);

      } catch (e: any) {
        console.error(`[report-background] Failed for topic ${a.topic}:`, e);
        result.topics.push({
          topicId: topicCode,
          topicName: String(a.topic),
          disclosureContent: `Failed to generate disclosure due to an error: ${e.message || e}`
        });
        // Still update DB so we don't lose previous topics
        await admin
          .from("sustainability_reports")
          .update({ result, updated_at: new Date().toISOString() })
          .eq("organization_id", organization_id);
      }
    }

    // Log usage at the end
    console.log(`[report-background] Logging total AI usage...`);
    await admin.from("ai_usage_log").insert({
      organization_id,
      user_id: user_id || null,
      user_email: user_email || null,
      action: "report_generation_job",
      provider: "gemini",
      model: activeModel,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      duration_ms: Date.now() - start,
      estimated_cost_usd: Number(estimateCost(activeModel, totalInputTokens, totalOutputTokens).toFixed(6)),
      quota_type: quotaType,
      success: true
    });

    // 2. Update status to completed
    const { error } = await admin
      .from("sustainability_reports")
      .update({ status: "completed", result, updated_at: new Date().toISOString() })
      .eq("organization_id", organization_id);

    if (error) throw error;

    console.log(`[report-background] Successfully completed and saved to DB for org=${organization_id}`);

  } catch (error: any) {
    console.error("[report-background] Failed:", error);
    let friendlyError = error.message || String(error);
    if (friendlyError.includes("fetch failed") || friendlyError.includes("Timeout")) {
      friendlyError = "The AI Model service timed out or failed to respond. This can happen with Gemini Pro on large tasks. Please try again or use Gemini Flash for faster results.";
    }
    await admin
      .from("sustainability_reports")
      .update({ status: "failed", error: friendlyError, updated_at: new Date().toISOString() })
      .eq("organization_id", organization_id);
  }

  return { statusCode: 200, body: "Done" };
};

export { handler };
