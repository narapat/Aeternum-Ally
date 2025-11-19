
import { GoogleGenAI, Type } from "@google/genai";
import { ESRSTopic, SustainabilityBusinessModel, BSCPerspective, AssessmentData, CompanyProfile } from "../types";
import { GRI_MAPPING } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_ID = "gemini-2.5-flash";

export const generateAssessmentSuggestions = async (
  companyDescription: string,
  topic: ESRSTopic
) => {
  const prompt = `
    Act as a senior sustainability consultant specializing in ESRS (European Sustainability Reporting Standards).
    
    Analyze the following company: "${companyDescription}".
    
    For the ESRS Topic: "${topic}", provide:
    1. A summary of potential "Impacts" (Inside-out): How the company impacts people and the environment regarding this topic.
    2. A summary of potential "Risks & Opportunities" (Outside-in): How this sustainability matter triggers financial effects on the company.
    
    Keep descriptions concise (under 50 words each) and specific to the industry.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_ID,
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

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini API Error:", error);
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

  try {
    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
    });

    return response.text?.trim() || "";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Could not generate suggestion.";
  }
};

export const generateSwotInternal = async (
  companyName: string,
  bmcData: SustainabilityBusinessModel
) => {
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

  try {
    const response = await ai.models.generateContent({
      model: MODEL_ID,
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

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini API Error (Internal SWOT):", error);
    return { strengths: "", weaknesses: "" };
  }
};

export const generateSwotExternal = async (
  companyName: string,
  companyDescription: string,
  type: 'OPPORTUNITIES' | 'THREATS'
) => {
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

  try {
    // Using Google Search Grounding for external data
    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    // Search grounding responses are text/markdown, usually with citations
    return response.text?.trim() || "";
  } catch (error) {
    console.error(`Gemini API Error (External SWOT - ${type}):`, error);
    return `Could not generate ${type.toLowerCase()} based on external data.`;
  }
};

export const generateKPISuggestions = async (
  companyDescription: string,
  perspective: BSCPerspective
) => {
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

  try {
    const response = await ai.models.generateContent({
      model: MODEL_ID,
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

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Gemini API Error (KPIs):", error);
    return [];
  }
};

// --- Report Generation ---

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
  if (materialAssessments.length === 0) {
    return { generalDisclosure: "No data", strategyDisclosure: "No data", topics: [] };
  }

  const materialList = materialAssessments.map(a => `${a.topic} (Impact: ${a.impactDescription}, Financial: ${a.financialDescription})`).join('; ');

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

  try {
    const response = await ai.models.generateContent({
      model: MODEL_ID,
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
                  disclosureContent: { type: Type.STRING }
                }
              }
            }
          },
        },
      },
    });

    return JSON.parse(response.text || "{}") as GeneratedStatement;
  } catch (error) {
    console.error("Gemini API Error (Report):", error);
    return null;
  }
};
