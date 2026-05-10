import { GoogleGenAI } from "@google/genai";
import * as fs from 'fs';
import * as path from 'path';

const apiKey = process.env.GEMINI_API_KEY;
const resendKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@aeternumally.com';

export const handler = async (event: any) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { action, question, context, errors } = JSON.parse(event.body);

    if (!action) {
      return { statusCode: 400, body: "Missing action" };
    }

    if (action === "chat") {
      if (!apiKey) {
        return { statusCode: 500, body: "GEMINI_API_KEY is not configured" };
      }

      const ai = new GoogleGenAI({ apiKey: apiKey });
      
      // Attempt to load documentation
      let docsContent = "";
      try {
        // Netlify bundles included_files relative to the function or project root
        // We try a few paths to be safe
        const possiblePaths = [
          path.join(process.cwd(), "Docs v1.1.0", "USER_MANUAL.md"),
          path.join(__dirname, "Docs v1.1.0", "USER_MANUAL.md"),
          path.join(__dirname, "..", "Docs v1.1.0", "USER_MANUAL.md"),
        ];

        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            docsContent = fs.readFileSync(p, 'utf-8');
            console.log(`[ally-support] Loaded docs from ${p}`);
            break;
          }
        }
        
        if (!docsContent) {
          console.warn("[ally-support] Could not find USER_MANUAL.md in any expected path");
        }
      } catch (err) {
        console.error("[ally-support] Error reading docs:", err);
      }

      const prompt = `
        You are "Ally", an AI Assistant for the Aeternum Ally sustainability platform.
        Your goal is to help users navigate the app, understand sustainability concepts (ESRS/CSRD), and solve problems.

        User Context:
        - Current Page/Module: ${context || "Unknown"}
        - Recent Errors: ${errors || "None detected"}

        Here is the relevant application documentation to help you answer:
        ---
        ${docsContent.slice(0, 20000)} // Truncate if too large, but should fit
        ---

        User Question:
        ${question}

        Provide a helpful, concise, and friendly answer. If you don't know based on the documentation, say so and suggest they check the [User Manual](https://github.com/narapat/Aeternum-Ally/blob/main/Docs%20v1.1.0/USER_MANUAL.md) or use the "Report an issue" option to contact support.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: prompt,
        config: {
          maxOutputTokens: 1000,
        }
      });

      const text = typeof response.text === "function" ? response.text() : response.text;

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: text }),
      };
    } 
    
    if (action === "email") {
      if (!resendKey) {
        return { statusCode: 500, body: "RESEND_API_KEY is not configured" };
      }

      const emailBody = {
        from: `Ally Assistant <${fromEmail}>`,
        to: ["Support@aeternumally.com"],
        subject: `Support Request from Ally Assistant`,
        html: `
          <h3>New Support Request</h3>
          <p><strong>User Question/Feedback:</strong> ${question}</p>
          <p><strong>Context:</strong> ${context || "N/A"}</p>
          <p><strong>Captured Errors:</strong> ${errors || "None"}</p>
        `,
      };

      console.log("[ally-support] Sending email via Resend...");
      
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailBody),
      });

      const resendData = await resendResponse.json();

      if (!resendResponse.ok) {
        console.error("[ally-support] Resend error:", resendData);
        return { 
          statusCode: resendResponse.status, 
          body: JSON.stringify({ error: "Failed to send email", details: resendData }) 
        };
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, data: resendData }),
      };
    }

    return { statusCode: 400, body: "Invalid action" };

  } catch (error: any) {
    console.error("[ally-support] Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Internal Server Error" }),
    };
  }
};
