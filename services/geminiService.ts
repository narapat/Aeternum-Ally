import { ESRSTopic, SustainabilityBusinessModel, SwotAnalysis, BSCPerspective, AssessmentData, CompanyProfile, AssessmentScoring, InsightHubResponse, QualityCheck, StrategicInsight, RecommendedAction, KPI, SuggestedTask } from "../types";
import { supabase } from "../lib/supabaseClient";

const API_ENDPOINT = "/.netlify/functions/api";

// ------------------------------------------------------------------
// Org context — set by App.tsx when an organization loads.
// All AI calls require this; without it the request is rejected
// before hitting the network so the user gets a clear message.
// ------------------------------------------------------------------
let currentOrgId: string | null = null;
export const setOrganizationContext = (orgId: string | null) => {
  currentOrgId = orgId;
};

async function callApi(action: string, params: any) {
  if (!currentOrgId) {
    throw new Error("AI features need an organization context. Please refresh and try again.");
  }

  const sessionResp = await supabase.auth.getSession();
  const accessToken = sessionResp.data.session?.access_token;
  if (!accessToken) {
    throw new Error("You must be signed in to use AI features.");
  }

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, organization_id: currentOrgId, ...params }),
    });

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
      } catch {}
      throw new Error(message);
    }

    return await response.json();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Gemini API Error (${action}):`, error);
    throw error;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";
}

// Re-throws on error — caller must catch and show an error state.
export const generateAssessmentSuggestions = async (
  profile: CompanyProfile,
  topic: ESRSTopic,
  qualityCheckContext?: QualityCheck,
): Promise<{ impactSuggestion: string; financialSuggestion: string }> => {
  return await callApi("generateAssessmentSuggestions", { profile, topic, qualityCheckContext });
};

export const generateAssessmentScoring = async (
  topic: ESRSTopic,
  profile: CompanyProfile,
  bmcData: SustainabilityBusinessModel,
  swotData: SwotAnalysis,
  impactDescription?: string,
  financialDescription?: string,
): Promise<AssessmentScoring | null> => {
  const topicTitle = String(topic).replace(/^[A-Z0-9]+ /, "");
  try {
    return await callApi("generateAssessmentScoring", {
      topic, topicTitle, profile, bmcData, swotData,
      impactDescription: impactDescription || "",
      financialDescription: financialDescription || "",
    });
  } catch {
    return null;
  }
};

export const triggerAssessmentAutofill = async (
  profile: CompanyProfile,
  topic: ESRSTopic,
  assessmentId: string,
  qualityCheckContext?: QualityCheck,
): Promise<{ message: string }> => {
  return await callApi("triggerAssessmentAutofill", { profile, topic, assessment_id: assessmentId, qualityCheckContext });
};

export const triggerAssessmentScoring = async (
  topic: ESRSTopic,
  profile: CompanyProfile,
  bmcData: SustainabilityBusinessModel,
  swotData: SwotAnalysis,
  impactDescription: string,
  financialDescription: string,
  assessmentId: string,
): Promise<{ message: string }> => {
  return await callApi("triggerAssessmentScoring", {
    topic, topicTitle: String(topic).replace(/^[A-Z0-9]+ /, ""), profile, bmcData, swotData,
    impactDescription, financialDescription, assessment_id: assessmentId
  });
};

export const getAssessmentJobStatus = async (assessmentId: string): Promise<any> => {
  const resp = await callApi("getAssessmentJobStatus", { assessment_id: assessmentId });
  return resp.result;
};

export const generateCanvasSuggestion = async (
  profile: CompanyProfile,
  fieldLabel: string
): Promise<string[]> => {
  try {
    return await callApi("generateCanvasSuggestion", { profile, fieldLabel });
  } catch {
    return [];
  }
};

export const generateSwotInternal = async (
  profile: CompanyProfile,
  bmcData: SustainabilityBusinessModel
): Promise<{ strengths: string[]; weaknesses: string[] }> => {
  try {
    return await callApi("generateSwotInternal", { profile, bmcData });
  } catch {
    return { strengths: [], weaknesses: [] };
  }
};

export const generateSwotExternal = async (
  profile: CompanyProfile,
  type: "OPPORTUNITIES" | "THREATS"
): Promise<string[]> => {
  try {
    return await callApi("generateSwotExternal", { profile, type });
  } catch {
    return [];
  }
};

export const generateKPISuggestions = async (
  profile: CompanyProfile,
  perspective: BSCPerspective
) => {
  return await callApi("generateKPISuggestions", { profile, perspective });
};

export interface GeneratedStatement {
  generalDisclosure: string;
  strategyDisclosure: string;
  topics: {
    topicId: string;
    topicName: string;
    disclosureContent: string;
  }[];
}

export const triggerReportGeneration = async (
  profile: CompanyProfile,
  materialAssessments: AssessmentData[]
): Promise<{ message: string }> => {
  return await callApi("triggerReportGeneration", { profile, materialAssessments });
};

export const getReportStatus = async (): Promise<{ status: string; result?: any; error?: string } | null> => {
  if (!currentOrgId) return null;
  const { data, error } = await supabase
    .from("sustainability_reports")
    .select("status, result, error")
    .eq("organization_id", currentOrgId)
    .maybeSingle();
    
  if (error) {
    console.warn("getReportStatus failed:", error.message);
    return null;
  }
  return data;
};

export const triggerDMAAnalysis = async (
  profile: CompanyProfile,
  materialAssessments: AssessmentData[],
  bmcItems: any,
  swotItems: any
): Promise<{ message: string }> => {
  return await callApi("triggerDMAAnalysis", { profile, materialAssessments, bmcItems, swotItems });
};

export const getDMAAnalysisStatus = async (): Promise<{ status: string; quality_result?: any[]; insight_result?: any; error?: string } | null> => {
  if (!currentOrgId) return null;
  const { data, error } = await supabase
    .from("dma_analysis_jobs")
    .select("status, quality_result, insight_result, error")
    .eq("organization_id", currentOrgId)
    .maybeSingle();
    
  if (error) {
    console.warn("getDMAAnalysisStatus failed:", error.message);
    return null;
  }
  return data;
};

// Pass 1 — quality check for a single topic. Called once per assessment from the frontend.
export const analyzeTopicQuality = async (
  assessment: AssessmentData,
  profile: CompanyProfile,
  bmcData: SustainabilityBusinessModel,
  swotData: SwotAnalysis,
): Promise<QualityCheck> => {
  const bmcItems = {
    key_activities: bmcData.keyActivities,
    eco_social_costs: bmcData.ecoSocialCosts,
    eco_social_benefits: bmcData.ecoSocialBenefits,
  };
  const swotItems = {
    threats: swotData.threats,
    opportunities: swotData.opportunities,
  };
  return await callApi("analyzeTopicQuality", { assessment, profile, bmcItems, swotItems });
};

// Pass 2 — holistic synthesis. Called once after all topic checks complete.
export const analyzeDMASynthesis = async (
  qualityChecks: QualityCheck[],
  assessments: AssessmentData[],
  profile: CompanyProfile,
  bmcData: SustainabilityBusinessModel,
  swotData: SwotAnalysis,
): Promise<{ strategicInsight: StrategicInsight; recommendedActions: RecommendedAction[] }> => {
  const bmcItems = {
    key_activities: bmcData.keyActivities,
    eco_social_costs: bmcData.ecoSocialCosts,
    eco_social_benefits: bmcData.ecoSocialBenefits,
  };
  const swotItems = {
    threats: swotData.threats,
    opportunities: swotData.opportunities,
  };
  return await callApi("analyzeDMASynthesis", { qualityChecks, assessments, profile, bmcItems, swotItems });
};

// Issue #7 — Generate actionable fix/comply/improve tasks from DMA data.
export const generateTasks = async (
  qualityChecks: QualityCheck[],
  assessments: AssessmentData[],
  kpis: KPI[],
  swotData: SwotAnalysis,
  profile: CompanyProfile,
): Promise<Omit<SuggestedTask, 'id' | 'organization_id' | 'dismissed' | 'dismissed_at' | 'dismissed_by' | 'converted_to_task_id' | 'converted_at' | 'created_at'>[]> => {
  const swotItems = {
    strengths: swotData.strengths,
    opportunities: swotData.opportunities,
    weaknesses: swotData.weaknesses,
  };
  return await callApi("generateTasks", { qualityChecks, assessments, kpis, swotItems, profile });
};

// Legacy — kept for backward compat, no longer used by the UI.
export const generateDMAInsight = async (
  assessments: AssessmentData[],
  bmcData: SustainabilityBusinessModel,
  swotData: SwotAnalysis,
  profile: CompanyProfile,
): Promise<InsightHubResponse> => {
  const bmcItems = {
    key_activities: bmcData.keyActivities,
    eco_social_costs: bmcData.ecoSocialCosts,
    eco_social_benefits: bmcData.ecoSocialBenefits,
  };
  const swotItems = {
    threats: swotData.threats,
    opportunities: swotData.opportunities,
  };
  return await callApi("analyzeDMAQuality", { assessments, bmcItems, swotItems, profile });
};
