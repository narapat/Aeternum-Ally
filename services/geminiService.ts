import { ESRSTopic, SustainabilityBusinessModel, BSCPerspective, AssessmentData, CompanyProfile } from "../types";
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

export const generateAssessmentSuggestions = async (
  profile: CompanyProfile,
  topic: ESRSTopic
) => {
  try {
    return await callApi("generateAssessmentSuggestions", { profile, topic });
  } catch (error) {
    const msg = errorMessage(error);
    return { impactSuggestion: msg, financialSuggestion: msg };
  }
};

export const generateCanvasSuggestion = async (
  profile: CompanyProfile,
  fieldLabel: string
) => {
  try {
    return await callApi("generateCanvasSuggestion", { profile, fieldLabel });
  } catch (error) {
    return errorMessage(error);
  }
};

export const generateSwotInternal = async (
  profile: CompanyProfile,
  bmcData: SustainabilityBusinessModel
) => {
  try {
    return await callApi("generateSwotInternal", { profile, bmcData });
  } catch (error) {
    const msg = errorMessage(error);
    return { strengths: msg, weaknesses: msg };
  }
};

export const generateSwotExternal = async (
  profile: CompanyProfile,
  type: "OPPORTUNITIES" | "THREATS"
) => {
  try {
    return await callApi("generateSwotExternal", { profile, type });
  } catch (error) {
    return errorMessage(error);
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

export const generateSustainabilityStatement = async (
  profile: CompanyProfile,
  materialAssessments: AssessmentData[]
): Promise<GeneratedStatement> => {
  // Re-throws so the caller can show a real error message instead of a silent null.
  return await callApi("generateSustainabilityStatement", { profile, materialAssessments });
};
