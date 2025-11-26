import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });
const MODEL_ID = "gemini-2.5-flash";

const handler = async (event: any) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    if (!apiKey) {
        console.error("GEMINI_API_KEY is missing in environment variables.");
        return { statusCode: 500, body: "Server Configuration Error" };
    }

    try {
        const body = JSON.parse(event.body || "{}");
        const { action, ...params } = body;

        let result;

        switch (action) {
            case "generateAssessmentSuggestions":
                result = await generateAssessmentSuggestions(params);
                break;
            case "generateCanvasSuggestion":
                result = await generateCanvasSuggestion(params);
                break;
            case "generateSwotInternal":
                result = await generateSwotInternal(params);
                break;
            case "generateSwotExternal":
                result = await generateSwotExternal(params);
                break;
            case "generateKPISuggestions":
                result = await generateKPISuggestions(params);
                break;
            case "generateSustainabilityStatement":
                result = await generateSustainabilityStatement(params);
                break;
            default:
                return { statusCode: 400, body: "Invalid action" };
        }

        return {
            statusCode: 200,
            body: JSON.stringify(result),
            headers: {
                "Content-Type": "application/json",
            },
        };
    } catch (error) {
        console.error("API Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) }),
        };
    }
};

// --- Helper Functions (Moved from frontend) ---

async function generateAssessmentSuggestions({ companyDescription, topic }: any) {
    const prompt = `
    Act as a senior sustainability consultant specializing in ESRS (European Sustainability Reporting Standards).
    
    Analyze the following company: "${companyDescription}".
    
    For the ESRS Topic: "${topic}", provide:
    1. A summary of potential "Impacts" (Inside-out): How the company impacts people and the environment regarding this topic.
    2. A summary of potential "Risks & Opportunities" (Outside-in): How this sustainability matter triggers financial effects on the company.
    
    Keep descriptions concise (under 50 words each) and specific to the industry.
  `;

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
}

async function generateCanvasSuggestion({ companyName, companyDescription, fieldLabel }: any) {
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

    const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: prompt,
    });

    return response.text?.trim() || "";
}

async function generateSwotInternal({ companyName, bmcData }: any) {
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
}

async function generateSwotExternal({ companyName, companyDescription, type }: any) {
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

    // Using Google Search Grounding for external data
    const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
        },
    });

    return response.text?.trim() || "";
}

async function generateKPISuggestions({ companyDescription, perspective }: any) {
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
}

async function generateSustainabilityStatement({ profile, materialAssessments }: any) {
    if (!materialAssessments || materialAssessments.length === 0) {
        return { generalDisclosure: "No data", strategyDisclosure: "No data", topics: [] };
    }

    const materialList = materialAssessments.map((a: any) => `${a.topic} (Impact: ${a.impactDescription}, Financial: ${a.financialDescription})`).join('; ');

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

    return JSON.parse(response.text || "{}");
}

export { handler };
