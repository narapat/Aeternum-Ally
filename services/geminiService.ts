import { ESRSTopic, SustainabilityBusinessModel, BSCPerspective, AssessmentData, CompanyProfile } from "../types";

const API_ENDPOINT = "/.netlify/functions/api";

async function callApi(action: string, params: any) {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...params }),
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
    console.error(`Gemini API Error (${action}):`, error);
    throw error;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";
}

export const generateAssessmentSuggestions = async (
  companyDescription: string,
  topic: ESRSTopic
) => {
  try {
    return await callApi("generateAssessmentSuggestions", { companyDescription, topic });
  } catch (error) {
    const msg = errorMessage(error);
    return { impactSuggestion: msg, financialSuggestion: msg };
  }
};

export const generateCanvasSuggestion = async (
  companyName: string,
  companyDescription: string,
  fieldLabel: string
) => {
  try {
    return await callApi("generateCanvasSuggestion", { companyName, companyDescription, fieldLabel });
  } catch (error) {
    return errorMessage(error);
  }
};

export const generateSwotInternal = async (
  companyName: string,
  bmcData: SustainabilityBusinessModel
) => {
  try {
    return await callApi("generateSwotInternal", { companyName, bmcData });
  } catch (error) {
    const msg = errorMessage(error);
    return { strengths: msg, weaknesses: msg };
  }
};

export const generateSwotExternal = async (
  companyName: string,
  companyDescription: string,
  type: 'OPPORTUNITIES' | 'THREATS'
) => {
  try {
    return await callApi("generateSwotExternal", { companyName, companyDescription, type });
  } catch (error) {
    return errorMessage(error);
  }
};

export const generateKPISuggestions = async (
  companyDescription: string,
  perspective: BSCPerspective
) => {
  try {
    return await callApi("generateKPISuggestions", { companyDescription, perspective });
  } catch (error) {
    return [];
  }
};

export interface GeneratedStatement {
  generalDisclosure: string;
  strategyDisclosure: string;
  topics: {
    topicId: string;
    topicName: string;
    disclosureContent: string; // Policies, Actions, Targets text
  }[];
}

export const generateSustainabilityStatement = async (
  profile: CompanyProfile,
  materialAssessments: AssessmentData[]
) => {
  try {
    return await callApi("generateSustainabilityStatement", { profile, materialAssessments });
  } catch (error) {
    return null;
  }
};
