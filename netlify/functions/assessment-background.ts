import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { requireInternalJobAuth } from "./_shared/internalJobAuth.js";

const apiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEFAULT_MODEL = "gemini-2.5-flash";

const MODEL_REGISTRY: Record<string, { input: number; output: number; canDisableThinking: boolean }> = {
  "gemini-2.5-flash-lite": { input: 0.10, output: 0.40,  canDisableThinking: true  },
  "gemini-2.5-flash":      { input: 0.30, output: 2.50,  canDisableThinking: true  },
  "gemini-2.5-pro":        { input: 1.25, output: 10.00, canDisableThinking: false },
};

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

const handler = async (event: any) => {
  const start = Date.now();
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const authError = requireInternalJobAuth(event);
  if (authError) return authError;

  const {
    organization_id,
    assessment_id,
    action,
    topic,
    profile,
    bmcData,
    swotData,
    qualityCheckContext,
    impactDescription,
    financialDescription,
    user_id,
    user_email
  } = JSON.parse(event.body);

  if (!organization_id || !assessment_id || !action || !topic) {
    console.error("[assessment-background] Missing required fields");
    return { statusCode: 400, body: "Missing required fields" };
  }

  console.log(`[assessment-background] Starting ${action} for org=${organization_id}, assessment=${assessment_id}`);

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

  console.log(`[assessment-background] Using model=${activeModel}, quotaType=${quotaType}`);

  function noThinkingConfig(m: string): object {
    const entry = MODEL_REGISTRY[m];
    const canDisable = entry != null ? entry.canDisableThinking : m.includes("flash");
    return canDisable ? { thinkingConfig: { thinkingBudget: 0 } } : {};
  }

  function parseAIJson<T>(text: string | undefined, fallback: T): T {
    if (!text) return fallback;
    try {
      const cleaned = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      return JSON.parse(cleaned);
    } catch (e) {
      console.warn("[assessment-background] Failed to parse AI JSON:", e);
      return fallback;
    }
  }

  function buildCompanyContext(p: any): string {
    return [
      `Company: ${p.name} (${p.industry}, ISIC: ${p.isicCode})`,
      `Scale: ${p.employeeCount} employees, Revenue: ${p.revenueRange}`,
      `Description: ${p.description}`,
      `Mission: ${p.mission}`,
      `Vision: ${p.vision}`,
      `Key Products / Services: ${p.productsServices}`,
    ].join('\n');
  }

  const joinField = (v: string | string[]): string =>
    Array.isArray(v) ? v.join(", ") : (v ?? "");

  function estimateCost(m: string, inputTokens: number, outputTokens: number): number {
    const p = MODEL_REGISTRY[m];
    if (!p) return 0;
    return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: resolvedApiKey });

    // Update status to processing
    const updateData: any = { updated_at: new Date().toISOString() };
    if (action === "autofill") {
      updateData.autofill_status = "processing";
    } else if (action === "scoring") {
      updateData.scoring_status = "processing";
    }

    console.log(`[assessment-background] Upserting job row...`);
    const { error: upsertError } = await admin
      .from("assessment_ai_jobs")
      .upsert({ organization_id, assessment_id, topic, ...updateData }, { onConflict: "organization_id,assessment_id" });

    if (upsertError) {
      console.error("[assessment-background] Upsert error:", upsertError);
      throw upsertError;
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    if (action === "autofill") {
      const topicCode = String(topic).split(" ")[0];
      const guidance = ESRS_TOPIC_GUIDANCE[topicCode];
      const companyName = profile.name || "this company";
      const industryCtx = [profile.industry, profile.isicCode].filter(Boolean).join(", ISIC: ");
      const companyCtx = buildCompanyContext(profile);

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

      console.log(`[assessment-background] Calling Gemini for autofill (impact & financial in parallel)...`);
      const [impactResp, financialResp] = await Promise.all([
        ai.models.generateContent({ model: activeModel, contents: impactPrompt, config: noThinkingConfig(activeModel) }),
        ai.models.generateContent({ model: activeModel, contents: financialPrompt, config: noThinkingConfig(activeModel) }),
      ]);

      totalInputTokens += Number(impactResp.usageMetadata?.promptTokenCount ?? 0);
      totalOutputTokens += Number(impactResp.usageMetadata?.candidatesTokenCount ?? 0);
      totalInputTokens += Number(financialResp.usageMetadata?.promptTokenCount ?? 0);
      totalOutputTokens += Number(financialResp.usageMetadata?.candidatesTokenCount ?? 0);

      const result = {
        impactSuggestion: impactResp.text?.trim() ?? "",
        financialSuggestion: financialResp.text?.trim() ?? "",
      };

      console.log(`[assessment-background] Updating job row to completed...`);
      const { error: updateError } = await admin
        .from("assessment_ai_jobs")
        .update({ autofill_status: "completed", autofill_result: result, updated_at: new Date().toISOString() })
        .eq("organization_id", organization_id)
        .eq("assessment_id", assessment_id);

      if (updateError) {
        console.error("[assessment-background] Update error:", updateError);
        throw updateError;
      }

      console.log(`[assessment-background] Autofill completed successfully.`);

    } else if (action === "scoring") {
      const keyActivities = joinField(bmcData?.keyActivities);
      const ecoSocialCosts = joinField(bmcData?.ecoSocialCosts);
      const ecoSocialBenefits = joinField(bmcData?.ecoSocialBenefits);
      const threats = joinField(swotData?.threats);
      const opportunities = joinField(swotData?.opportunities);

      const prompt = `
You are an ESRS materiality expert helping SMEs assess ${topic}.

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

      console.log(`[assessment-background] Calling Gemini for scoring...`);
      const response = await ai.models.generateContent({
        model: activeModel,
        contents: prompt,
        config: {
          ...noThinkingConfig(activeModel),
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

      console.log(`[assessment-background] Scoring raw response:`, response.text);

      totalInputTokens += Number(response.usageMetadata?.promptTokenCount ?? 0);
      totalOutputTokens += Number(response.usageMetadata?.candidatesTokenCount ?? 0);

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

      const parsed = parseAIJson(response.text, fallback);

      // Deep-merge and clamp as in api.ts
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

      const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(Number(n) || 1)));
      safe.impact.scale.score           = clamp(safe.impact.scale.score);
      safe.impact.scope.score           = clamp(safe.impact.scope.score);
      safe.impact.irremediability.score = clamp(safe.impact.irremediability.score);
      safe.impact.likelihood.score      = clamp(safe.impact.likelihood.score);
      safe.financial.magnitude.score    = clamp(safe.financial.magnitude.score);
      safe.financial.likelihood.score   = clamp(safe.financial.likelihood.score);

      console.log(`[assessment-background] Updating job row to completed...`);
      const { error: updateError } = await admin
        .from("assessment_ai_jobs")
        .update({ scoring_status: "completed", scoring_result: safe, updated_at: new Date().toISOString() })
        .eq("organization_id", organization_id)
        .eq("assessment_id", assessment_id);

      if (updateError) {
        console.error("[assessment-background] Update error:", updateError);
        throw updateError;
      }

      console.log(`[assessment-background] Scoring completed successfully.`);
    }

    // Log usage
    console.log(`[assessment-background] Logging AI usage...`);
    await admin.from("ai_usage_log").insert({
      organization_id,
      user_id: user_id || null,
      user_email: user_email || null,
      action: `assessment_${action}_job`,
      provider: "gemini",
      model: activeModel,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      duration_ms: Date.now() - start,
      estimated_cost_usd: Number(estimateCost(activeModel, totalInputTokens, totalOutputTokens).toFixed(6)),
      quota_type: quotaType,
      success: true
    });

  } catch (error: any) {
    console.error(`[assessment-background] Failed for ${action}:`, error);
    const failData: any = { updated_at: new Date().toISOString() };
    if (action === "autofill") {
      failData.autofill_status = "failed";
    } else if (action === "scoring") {
      failData.scoring_status = "failed";
    }
    
    let friendlyError = error.message || String(error);
    if (friendlyError.includes("fetch failed") || friendlyError.includes("Timeout")) {
      friendlyError = "The AI Model service timed out or failed to respond. This can happen with Gemini Pro on large tasks. Please try again or use Gemini Flash for faster results.";
    }
    
    await admin
      .from("assessment_ai_jobs")
      .update({ ...failData, error: friendlyError })
      .eq("organization_id", organization_id)
      .eq("assessment_id", assessment_id);
  }

  console.log(`[assessment-background] Finished ${action} in ${Date.now() - start}ms`);
  return { statusCode: 200, body: "Done" };
};

export { handler };
