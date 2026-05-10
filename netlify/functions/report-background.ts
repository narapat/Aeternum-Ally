import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const apiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEFAULT_MODEL = "gemini-2.5-flash";

const handler = async (event: any) => {
  // Netlify background functions are triggered by POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { organization_id, profile, materialAssessments, model = DEFAULT_MODEL } = JSON.parse(event.body);

  if (!organization_id || !profile || !materialAssessments) {
    console.error("Missing required fields in background function");
    return { statusCode: 400, body: "Missing required fields" };
  }

  const admin = createClient(supabaseUrl!, serviceKey!);

  // Helper to parse JSON from AI
  function parseAIJson<T>(text: string | undefined, fallback: T): T {
    if (!text) return fallback;
    try {
      // Remove markdown code blocks if present
      const cleaned = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      return JSON.parse(cleaned);
    } catch (e) {
      console.warn("Failed to parse AI JSON:", e);
      return fallback;
    }
  }

  try {
    // 1. Update status to processing
    await admin
      .from("sustainability_reports")
      .upsert({ organization_id, status: "processing", updated_at: new Date().toISOString() }, { onConflict: "organization_id" });

    const ai = new GoogleGenAI({ apiKey });
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
      Act as a Sustainability Reporting Officer drafting a "Sustainability Statement" aligned with ESRS and GRI Standards.

      ${companyContext}

      Material topics identified:
      ${topicSummary}

      Generate ONLY the two header sections below as JSON.

      1. generalDisclosure: "Basis of Preparation" (ESRS 2 BP-1/BP-2). Explain the Double Materiality approach. ~120 words.
      2. strategyDisclosure: "Strategy & Business Model" (ESRS 2 SBM-3). Summarise how the company's business model interacts with the material impacts. ~150 words.
    `;

    const headerRespPromise = ai.models.generateContent({
      model,
      contents: headerPrompt,
      config: {
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

    // ── Calls 2…N: One call per topic ────────────────────────
    const topicConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topicId: { type: Type.STRING },
          topicName: { type: Type.STRING },
          disclosureContent: { type: Type.STRING },
        },
      },
    };

    const topicCalls = materialAssessments.map((a: any) => {
      const topicCode = String(a.topic).split(" ")[0];
      const prompt = `
        Act as a Sustainability Reporting Officer drafting topical disclosures aligned with ESRS and GRI Standards.

        ${companyContext}

        Topic: ${a.topic} (code: "${topicCode}")
        Impact materiality score: ${a.impactMaterialityValue}/100 — ${a.impactDescription}
        Financial materiality score: ${a.financialMaterialityValue}/100 — ${a.financialDescription}

        Write a structured narrative disclosure for this single topic as JSON with:
        - topicId: the short code only — "${topicCode}"
        - topicName: the full string — "${a.topic}"
        - disclosureContent: 200-300 word multi-paragraph narrative.
      `;
      return ai.models.generateContent({ model, contents: prompt, config: topicConfig });
    });

    const [headerResp, ...topicResps] = await Promise.all([
      headerRespPromise,
      ...topicCalls
    ]);

    const header = parseAIJson(headerResp.text, { generalDisclosure: "", strategyDisclosure: "" });
    const topics = topicResps.map((r: any) => parseAIJson(r.text, { topicId: "", topicName: "", disclosureContent: "" }));

    const result = {
      generalDisclosure: header.generalDisclosure ?? "",
      strategyDisclosure: header.strategyDisclosure ?? "",
      topics,
    };

    // 2. Update status to completed
    const { error } = await admin
      .from("sustainability_reports")
      .update({ status: "completed", result, updated_at: new Date().toISOString() })
      .eq("organization_id", organization_id);

    if (error) throw error;

  } catch (error: any) {
    console.error("Background Report Generation Failed:", error);
    // Update status to failed
    await admin
      .from("sustainability_reports")
      .update({ status: "failed", error: error.message || String(error), updated_at: new Date().toISOString() })
      .eq("organization_id", organization_id);
  }

  return { statusCode: 200, body: "Done" };
};

export { handler };
