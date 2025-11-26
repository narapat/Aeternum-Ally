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
      throw new Error(`API request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Gemini API Error (${action}):`, error);
    // Return null or appropriate default based on usage, but for now let's return null or empty to match previous behavior partially
    // The previous implementation returned specific error objects or strings.
    // We'll handle defaults in the wrapper functions if needed, or just return null and let caller handle.
    throw error;
  }
}

export const generateAssessmentSuggestions = async (
  companyDescription: string,
  topic: ESRSTopic
) => {
  try {
    return await callApi("generateAssessmentSuggestions", { companyDescription, topic });
  } catch (error) {
    return {
      impactSuggestion: "AI generation failed. Please input manually.",
      financialSuggestion: "AI generation failed. Please input manually.",
    };
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
    return "Could not generate suggestion.";
  }
};

export const generateSwotInternal = async (
  companyName: string,
  bmcData: SustainabilityBusinessModel
) => {
  try {
    return await callApi("generateSwotInternal", { companyName, bmcData });
  } catch (error) {
    return { strengths: "", weaknesses: "" };
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
    return `Could not generate ${type.toLowerCase()} based on external data.`;
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
