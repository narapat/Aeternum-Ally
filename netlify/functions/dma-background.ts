import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const apiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEFAULT_MODEL = "gemini-2.5-flash";

const handler = async (event: any) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { organization_id, profile, materialAssessments, bmcItems, swotItems, model = DEFAULT_MODEL } = JSON.parse(event.body);

  if (!organization_id || !profile || !materialAssessments) {
    console.error("[dma-background] Missing required fields");
    return { statusCode: 400, body: "Missing required fields" };
  }

  console.log(`[dma-background] Starting DMA analysis for org=${organization_id}, topics=${materialAssessments.length}`);

  const admin = createClient(supabaseUrl!, serviceKey!);

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

  try {
    // 1. Update status to processing
    await admin
      .from("dma_analysis_jobs")
      .upsert({ organization_id, status: "processing", quality_result: [], updated_at: new Date().toISOString() }, { onConflict: "organization_id" });

    const ai = new GoogleGenAI({ apiKey });
    
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

    // Run Quality Checks SEQUENTIALLY for progressive updates and safety
    for (const a of materialAssessments) {
      console.log(`[dma-background] Analyzing topic: ${a.topic}`);
      
      const topicCode  = String(a.topic).split(" ")[0];
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

        Provide a critical review of this topic assessment.
        Return JSON matching the schema.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING, enum: ["pass", "warn", "fail"] },
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

      Generate a strategic insight report as JSON.
    `;

    const synthesisResponse = await ai.models.generateContent({
      model,
      contents: synthesisPrompt,
      config: {
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

    const insight_result = parseAIJson(synthesisResponse.text, { 
      strategicInsight: { summary: "", keyRisks: [], opportunities: [], bottomLine: "" }, 
      recommendedActions: [] 
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
    await admin
      .from("dma_analysis_jobs")
      .update({ status: "failed", error: error.message || String(error), updated_at: new Date().toISOString() })
      .eq("organization_id", organization_id);
  }

  return { statusCode: 200, body: "Done" };
};

export { handler };
