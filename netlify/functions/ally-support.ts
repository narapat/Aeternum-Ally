import { GoogleGenAI } from "@google/genai";
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from "@supabase/supabase-js";
import { getStore } from "@netlify/blobs";

const apiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl!, serviceKey!);
const resendKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@aeternumally.com';

function redactSecrets(text: string): string {
  if (!text) return text;
  let redacted = text;
  // Redact potential passwords/keys in "label: value" format
  redacted = redacted.replace(/(password|secret|key|cred|credential|token)["']?\s*[:=]\s*["']?([^\s"']+)["']?/gi, '$1: ***');
  // Redact potential credit card numbers
  redacted = redacted.replace(/\b(?:\d[ -]*?){13,16}\b/g, '***');
  return redacted;
}

export const handler = async (event: any) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const start = Date.now();
  try {
    const { messages, context, errors, userInfo, sessionId } = JSON.parse(event.body);
    const organization_id = userInfo?.orgId;

    // Log the conversation for analysis and improvement
    console.log(`[ally-support] Conversation log for user ${userInfo?.email || 'unknown'} (org: ${organization_id || 'unknown'}):`, JSON.stringify(messages));

    // Save to Netlify Blobs for analysis and improvement
    try {
      const store = getStore("ally-conversations");
      const conversationId = `${userInfo?.orgId || 'no-org'}_${userInfo?.userId || 'anon'}_${sessionId || 'no-session'}`;
      await store.setJSON(conversationId, {
        messages,
        context,
        errors,
        userInfo,
        timestamp: new Date().toISOString()
      });
      console.log(`[ally-support] Saved conversation to blob: ${conversationId}`);
    } catch (blobErr) {
      console.error("[ally-support] Failed to save conversation to blob:", blobErr);
    }

    let activeModel = "gemini-2.5-flash"; // Default fallback
    if (organization_id) {
      const { data: settings } = await admin
        .from("organization_ai_settings")
        .select("model")
        .eq("organization_id", organization_id)
        .maybeSingle();
      
      if (settings?.model) {
        activeModel = settings.model;
      }
    }

    if (!messages || !Array.isArray(messages)) {
      return { statusCode: 400, body: "Missing or invalid messages array" };
    }

    if (!apiKey) {
      return { statusCode: 500, body: "GEMINI_API_KEY is not configured" };
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    // Attempt to load documentation
    let docsContent = "";
    try {
      const possiblePaths = [
        path.join(process.cwd(), "Docs v1.1.0", "USER_MANUAL.md"),
        path.join(__dirname, "Docs v1.1.0", "USER_MANUAL.md"),
        path.join(__dirname, "..", "Docs v1.1.0", "USER_MANUAL.md"),
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          docsContent = fs.readFileSync(p, 'utf-8');
          break;
        }
      }
    } catch (err) {
      console.error("[ally-support] Error reading docs:", err);
    }

    const systemInstruction = `
      You are "Ally", an AI Assistant for the Aeternum Ally sustainability platform.
      Your goal is to help users navigate the app, understand sustainability concepts (ESRS/CSRD), and solve problems.

      User Context:
      - Current Page/Module: ${context || "Unknown"}
      - Recent Errors: ${errors || "None detected"}

      Here is the relevant application documentation to help you answer:
      ---
      ${docsContent.slice(0, 15000)}
      ---

      Guidelines:
      1. Provide helpful, concise, and friendly answers.
      2. If you don't know based on the documentation, suggest checking the [User Manual](https://github.com/narapat/Aeternum-Ally/blob/main/Docs%20v1.1.0/USER_MANUAL.md).
      3. If the user wants to report an issue or give feedback, DO NOT just say "I'll send it". Ask them for details (what happened, how they feel, what they expect) if they haven't provided them yet.
      4. Once you have collected enough information about the issue or feedback and are ready to send it to support, end your message with the exact tag: [SEND_EMAIL].
         Example: "Got it! I have collected your feedback and sent it to support. [SEND_EMAIL]"
         Do NOT include this tag unless you have the actual feedback to send.
      5. When explaining how to use a module (like DMA) or answering based on the manual, DO NOT just throw the whole text at the user. Give a brief summary or the first step, and ask the user if they need to know more or if they want to explore that specific topic. Keep it interactive and conversational!
      6. Refuse to answer questions that are not related to the Aeternum Ally platform, general sustainability concepts (ESRS/CSRD), or support. If a user asks risky, harmful, inappropriate, or completely off-topic questions, politely decline and steer them back to how you can help them with the platform.
      7. Always maintain the persona of an AI assistant. Remind the user that you are an AI and can sometimes make mistakes, but you will try her best to help them succeed!
      8. DO NOT ask the user for any secrets, credentials, passwords, or highly confidential PII (Personally Identifiable Information). If the user shares any such information, remind them not to do so.
      9. Always respond in the same language that the user used to initiate or continue the conversation (e.g., if the user speaks Thai, respond in Thai; if Finnish, respond in Finnish).
      10. For languages other than English, when you translate technical terms, jargon, or platform-specific words, always keep the original English term in parentheses next to it (e.g., "การประเมินความสำคัญ (Materiality Assessment)") to ensure the user knows the original concept.
    `;

    // Map conversation history to Gemini format
    const contents = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }]
    }));

    const response = await ai.models.generateContent({
      model: activeModel,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        maxOutputTokens: 1000,
      }
    });

    let text = typeof response.text === "function" ? response.text() : response.text;

    // Log usage to ai_usage_log
    try {
      const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

      await admin.from("ai_usage_log").insert({
        organization_id: userInfo?.orgId || null,
        user_id: userInfo?.userId || null,
        user_email: userInfo?.email || null,
        action: "ally_assistant",
        provider: "gemini",
        model: activeModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        duration_ms: Date.now() - start,
        success: true
      });
    } catch (logErr) {
      console.error("[ally-support] Failed to log usage:", logErr);
    }

    // Check for email trigger
    if (text.includes("[SEND_EMAIL]") && resendKey) {
      console.log("[ally-support] Trigger detected. Sending email via Resend...");
      
      // Extract the last few messages for context
      const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop()?.text || "N/A";
      
      const emailBody = {
        from: `Ally Assistant <${fromEmail}>`,
        to: ["Support@aeternumally.com"],
        subject: `Support Request / Feedback from Ally Assistant`,
        html: `
          <h3>Support Request / Feedback</h3>
          <p><strong>User Email:</strong> ${userInfo?.email || "N/A"}</p>
          <p><strong>Company:</strong> ${userInfo?.company || "N/A"}</p>
          <p><strong>Role:</strong> ${userInfo?.role || "N/A"}</p>
          <p><strong>Latest User Input:</strong> ${redactSecrets(lastUserMessage)}</p>
          <p><strong>Context:</strong> ${context || "N/A"}</p>
          <p><strong>Captured Errors:</strong> ${errors || "None"}</p>
          <hr/>
          <h4>Full Conversation History:</h4>
          <ul>
             ${messages.map((m: any) => `<li><strong>${m.role}:</strong> ${redactSecrets(m.text)}</li>`).join('')}
          </ul>
        `,
      };

      try {
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(emailBody),
        });

        if (!resendResponse.ok) {
          const errData = await resendResponse.json();
          console.error("[ally-support] Resend error:", errData);
        }
      } catch (e) {
        console.error("[ally-support] Failed to send email:", e);
      }

      // Remove the tag from the text displayed to the user
      text = text.replace("[SEND_EMAIL]", "").trim();
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: text }),
    };

  } catch (error: any) {
    console.error("[ally-support] Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Internal Server Error" }),
    };
  }
};
