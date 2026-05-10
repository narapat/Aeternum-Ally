import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

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

  const { organization_id, profile, assessments, bmcData, swotData, user_id, user_email } = JSON.parse(event.body);

  if (!organization_id || !profile || !assessments) {
    console.error("[dma-background] Missing required fields");
    return { statusCode: 400, body: "Missing required fields" };
  }

  console.log(`[dma-background] Starting DMA analysis for org=${organization_id}, topics=${assessments.length}`);

  const admin = createClient(supabaseUrl!, serviceKey!);

  // Look up the org's chosen model + BYOK settings
  const { data: settings } = await admin
    .from("organization_ai_settings")
    .select("model, use_byok, byok_provider, byok_api_key")
    .eq("organization_id", organization_id)
    .maybeSingle();

  const activeModel = settings?.model ?? DEFAULT_MODEL;
  const useBYOK = settings?.use_byok === true && !!settings?.byok_api_key;
  const resolvedApiKey = useBYOK ? settings!.byok_api_key! : apiKey!;
  const quotaType = useBYOK ? "byok" : "platform_free";

  console.log(`[dma-background] Using model=${activeModel}, quotaType=${quotaType}`);

  function parseAIJson<T>(text: string | undefined, fallback: T): T {
    if (!text) return fallback;
    try {
      const cleaned = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      return JSON.parse(cleaned);
    } catch (e) {
      console.warn("[dma-background] Failed to parse AI JSON:", e);
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
      .from("dma_analysis_jobs")
      .upsert({ organization_id, status: "processing", quality_result: [], updated_at: new Date().toISOString() }, { onConflict: "organization_id" });

    const ai = new GoogleGenAI({ apiKey: resolvedApiKey });
    
    const companyContext = `
      Company: ${profile.name}
      Industry: ${profile.industry}
      Scale: ${profile.employeeCount} employees
      Description: ${profile.description}
    `;

    // Helper for Quality Check Prompt
    const buildDMACompanySection = (p: any, bmc: any, swot: any) => {
      return `
        ${companyContext}
        Business Context: ${bmc?.key_activities?.join(", ") || "N/A"}
        Strategic Context: ${swot?.opportunities?.join(", ") || "N/A"}
      `;
    };

    const quality_result: any[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Run Quality Checks SEQUENTIALLY for progressive updates and safety
    for (const a of assessments) {
      console.log(`[dma-background] Analyzing topic: ${a.topic}`);
      
      const topicCode  = String(a.topic).split(" ")[0];
      const companySection = buildDMACompanySection(profile, bmcData, swotData);
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

        Provide a critical review of this topic assessment.
        Return JSON matching the schema.
      `;

      const response = await ai.models.generateContent({
        model: activeModel,
        contents: prompt,
        config: {
          ...noThinkingConfig(activeModel),
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING, enum: ["needs_fix", "review", "ok"] },
              summary: { type: Type.STRING },
              issues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    severity: { type: Type.STRING, enum: ["high", "medium", "low"] },
                  },
                },
              },
              recommendation: { type: Type.STRING },
            },
          },
        },
      });

      totalInputTokens += response.usageMetadata?.promptTokenCount ?? 0;
      totalOutputTokens += response.usageMetadata?.candidatesTokenCount ?? 0;

      const parsed = parseAIJson(response.text, { status: "fail", summary: "Failed to generate", issues: [], recommendation: "" });
      
      const checkResult = {
        topic: a.topic,
        topicCode,
        ...parsed,
      };

      quality_result.push(checkResult);

      // Progressive update to DB
      console.log(`[dma-background] Updating DB with ${quality_result.length} completed checks`);
      await admin
        .from("dma_analysis_jobs")
        .update({ quality_result, updated_at: new Date().toISOString() })
        .eq("organization_id", organization_id);
    }

    // ── Call 2: Strategic Synthesis (InsightHub) ──────────
    console.log("[dma-background] Running Strategic Synthesis...");
    
    const qualitySummary = quality_result.map((c: any) =>
      `${c.topic} (${c.status})${c.issues?.length ? ": " + c.issues.map((i: any) => i.title).join("; ") : ""}`
    ).join("\n");

    const synthesisPrompt = `
      You are a Chief Sustainability Officer (CSO) synthesizing a Double Materiality Assessment.

      ${companyContext}

      Quality Check Results:
      ${qualitySummary}

      Generate a strategic insight report as JSON matching the requested schema.
      Ensure you populate all fields: summary, keyRisks, opportunities, bottomLine, and recommendedActions.
    `;

    const synthesisResponse = await ai.models.generateContent({
      model: activeModel,
      contents: synthesisPrompt,
      config: {
        ...noThinkingConfig(activeModel),
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            strategicInsight: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                keyRisks: { type: Type.ARRAY, items: { type: Type.STRING } },
                opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
                bottomLine: { type: Type.STRING },
              },
              required: ["summary", "keyRisks", "opportunities", "bottomLine"],
            },
            recommendedActions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ["fix", "comply", "improve"] },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  priority: { type: Type.STRING, enum: ["high", "medium", "low"] },
                  esrs_ref: { type: Type.STRING },
                },
                required: ["type", "title", "description", "priority"],
              },
            },
          },
          required: ["strategicInsight", "recommendedActions"],
        },
      },
    });

    console.log(`[dma-background] Synthesis raw response:`, synthesisResponse.text);

    const insight_result = parseAIJson(synthesisResponse.text, { 
      strategicInsight: { summary: "", keyRisks: [], opportunities: [], bottomLine: "" }, 
      recommendedActions: [] 
    });

    totalInputTokens += synthesisResponse.usageMetadata?.promptTokenCount ?? 0;
    totalOutputTokens += synthesisResponse.usageMetadata?.candidatesTokenCount ?? 0;

    // Log usage
    console.log(`[dma-background] Logging AI usage...`);
    await admin.from("ai_usage_log").insert({
      organization_id,
      user_id: user_id || null,
      user_email: user_email || null,
      action: "dma_analysis_job",
      provider: "gemini",
      model: activeModel,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      duration_ms: Date.now() - start,
      estimated_cost_usd: Number(estimateCost(activeModel, totalInputTokens, totalOutputTokens).toFixed(6)),
      quota_type: quotaType,
      success: true
    });

    // 3. Update status to completed
    const { error } = await admin
      .from("dma_analysis_jobs")
      .update({ status: "completed", insight_result, updated_at: new Date().toISOString() })
      .eq("organization_id", organization_id);

    if (error) throw error;

    console.log(`[dma-background] Successfully completed and saved to DB for org=${organization_id}`);

  } catch (error: any) {
    console.error("[dma-background] Failed:", error);
    let friendlyError = error.message || String(error);
    if (friendlyError.includes("fetch failed") || friendlyError.includes("Timeout")) {
      friendlyError = "The AI Model service timed out or failed to respond. This can happen with Gemini Pro on large tasks. Please try again or use Gemini Flash for faster results.";
    }
    await admin
      .from("dma_analysis_jobs")
      .update({ status: "failed", error: friendlyError, updated_at: new Date().toISOString() })
      .eq("organization_id", organization_id);
  }

  return { statusCode: 200, body: "Done" };
};

export { handler };
