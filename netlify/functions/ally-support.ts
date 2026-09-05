import { GoogleGenAI } from "@google/genai";
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from "@supabase/supabase-js";
import { getStore } from "@netlify/blobs";
import {
  escapeHtml,
  parseAllySupportBody,
} from "./_shared/allySupportSecurity.js";
import { withAIRequestFence } from "./_shared/aiRequestFence.js";
import { loadOrganizationAiConfig } from "./_shared/organizationAiConfig.js";
import { loadOrganizationTier } from "./_shared/organizationTier.js";
import {
  authorizeAiCall,
  platformQuotaType,
  quotaExceededResponse,
} from "./_shared/aiQuota.js";

const DEFAULT_MODEL = "gemini-2.5-flash";

type HandlerDependencies = {
  createAdminClient: () => any;
  createAIClient: (apiKey: string) => GoogleGenAI;
  getConversationStore: () => ReturnType<typeof getStore>;
  fetchImpl: typeof fetch;
  platformApiKey: string;
  resendKey: string;
  fromEmail: string;
  now: () => Date;
};

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
  body: JSON.stringify(body),
});

function getAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase server credentials are unavailable.");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function defaultDependencies(): HandlerDependencies {
  return {
    createAdminClient: getAdminClient,
    createAIClient: (apiKey) => new GoogleGenAI({ apiKey }),
    getConversationStore: () => getStore("ally-conversations"),
    fetchImpl: fetch,
    platformApiKey: process.env.GEMINI_API_KEY ?? "",
    resendKey: process.env.RESEND_API_KEY ?? "",
    fromEmail: process.env.RESEND_FROM_EMAIL ?? "no-reply@aeternumally.com",
    now: () => new Date(),
  };
}

async function getMembership(admin: any, organizationId: string, userId: string) {
  const { data, error } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not verify organization access.");
  return data ?? null;
}

async function getCompanyName(admin: any, organizationId: string) {
  try {
    const { data, error } = await admin
      .from("company_profiles")
      .select("name")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) return "";
    return typeof data?.name === "string" ? data.name : "";
  } catch {
    return "";
  }
}

function redactSecrets(text: string): string {
  if (!text) return text;
  let redacted = text;
  // Redact potential passwords/keys in "label: value" format
  redacted = redacted.replace(/(password|secret|key|cred|credential|token)["']?\s*[:=]\s*["']?([^\s"']+)["']?/gi, '$1: ***');
  // Redact potential credit card numbers
  redacted = redacted.replace(/\b(?:\d[ -]*?){13,16}\b/g, '***');
  return redacted;
}

export function createAllySupportHandler(
  overrides: Partial<HandlerDependencies> = {},
) {
  const deps = { ...defaultDependencies(), ...overrides };

  return async (event: any) => {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed." });
    }

    let admin: any;
    try {
      admin = deps.createAdminClient();
    } catch {
      return json(503, { error: "Ally is temporarily unavailable." });
    }

    const authHeader = event.headers?.authorization ?? event.headers?.Authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "You must be signed in to use Ally." });
    }
    const accessToken = authHeader.slice("Bearer ".length);
    let userResponse;
    let userError;
    try {
      const authResult = await admin.auth.getUser(accessToken);
      userResponse = authResult.data;
      userError = authResult.error;
    } catch {
      return json(503, { error: "Ally could not verify your session." });
    }
    if (userError || !userResponse?.user) {
      return json(401, { error: "Your session has expired. Please sign in again." });
    }
    const user = userResponse.user;

    let requestBody;
    try {
      requestBody = parseAllySupportBody(event.body ?? "");
    } catch (error: any) {
      return json(error.status ?? 400, { error: error.message });
    }
    const {
      organizationId: organization_id,
      messages,
      context,
      errors,
      sessionId,
    } = requestBody;

    let membership;
    try {
      membership = await getMembership(admin, organization_id, user.id);
    } catch {
      return json(503, { error: "Organization access could not be verified." });
    }
    if (!membership) {
      return json(403, { error: "You don't have access to this organization." });
    }

    let aiConfig;
    try {
      aiConfig = await loadOrganizationAiConfig(
        admin,
        organization_id,
        deps.platformApiKey,
        DEFAULT_MODEL,
      );
    } catch {
      return json(503, { error: "Ally's AI settings are temporarily unavailable." });
    }

    // Ally draws on the same monthly platform allowance as the rest of the app,
    // so a long support conversation cannot bypass the tenant's ceiling.
    let quotaType = aiConfig.quotaType;
    if (!aiConfig.useBYOK) {
      const tier = await loadOrganizationTier(admin, organization_id);
      quotaType = platformQuotaType(tier);

      const quota = await authorizeAiCall(
        admin,
        organization_id,
        tier,
        aiConfig.softQuotaMonthly,
      );

      if (!quota.allowed) {
        console.warn(
          `[quota] ally org=${organization_id} tier=${tier} used=${quota.used}/${quota.limit} — request blocked`,
        );
        return json(429, quotaExceededResponse(quota));
      }
    }

    const company = await getCompanyName(admin, organization_id);
    const userInfo = {
      email: user.email ?? null,
      company,
      role: membership.role,
      userId: user.id,
      orgId: organization_id,
    };
    const start = Date.now();

    try {
      const store = deps.getConversationStore();
      const conversationId = `${organization_id}_${user.id}_${sessionId}`;
      await store.setJSON(conversationId, {
        messages,
        context,
        errors,
        userInfo,
        timestamp: deps.now().toISOString(),
      });
    } catch {
      console.error("[ally-support] Failed to save conversation.");
    }

    const activeModel = aiConfig.model;
    const ai = deps.createAIClient(aiConfig.resolvedApiKey);

    try {
    
    // Attempt to load documentation
    let docsContent = "";
    try {
      const possiblePaths = [
        path.join(process.cwd(), "Docs v1.1.0", "USER_MANUAL.md"),
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          docsContent = fs.readFileSync(p, 'utf-8');
          break;
        }
      }
    } catch {
      console.error("[ally-support] Could not load support documentation.");
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

    const response = await withAIRequestFence(
      ai.models.generateContent({
        model: activeModel,
        contents,
        config: {
          systemInstruction,
          maxOutputTokens: 1000,
        },
      }),
      "ally_support",
    );

    let text = response.text ?? "";

    // Log usage to ai_usage_log
    try {
      const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

      await admin.from("ai_usage_log").insert({
        organization_id,
        user_id: user.id,
        user_email: user.email ?? null,
        action: "ally_assistant",
        provider: "gemini",
        model: activeModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        duration_ms: Date.now() - start,
        success: true,
        quota_type: quotaType,
      });
    } catch {
      console.error("[ally-support] Failed to log usage.");
    }

    // Check for email trigger
    if (text.includes("[SEND_EMAIL]") && deps.resendKey) {
      // Extract the last few messages for context
      const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop()?.text || "N/A";
      const safeConversation = messages
        .map((m: any) => `<li><strong>${escapeHtml(m.role)}:</strong> ${escapeHtml(redactSecrets(m.text))}</li>`)
        .join("");
      
      const emailBody = {
        from: `Ally Assistant <${deps.fromEmail}>`,
        to: ["Support@aeternumally.com"],
        subject: `Support Request / Feedback from Ally Assistant`,
        html: `
          <h3>Support Request / Feedback</h3>
          <p><strong>User Email:</strong> ${escapeHtml(userInfo.email || "N/A")}</p>
          <p><strong>Company:</strong> ${escapeHtml(userInfo.company || "N/A")}</p>
          <p><strong>Role:</strong> ${escapeHtml(userInfo.role || "N/A")}</p>
          <p><strong>Latest User Input:</strong> ${escapeHtml(redactSecrets(lastUserMessage))}</p>
          <p><strong>Context:</strong> ${escapeHtml(context || "N/A")}</p>
          <p><strong>Captured Errors:</strong> ${escapeHtml(errors || "None")}</p>
          <hr/>
          <h4>Full Conversation History:</h4>
          <ul>${safeConversation}</ul>
        `,
      };

      try {
        const resendResponse = await deps.fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${deps.resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(emailBody),
        });

        if (!resendResponse.ok) {
          console.error(`[ally-support] Support email failed status=${resendResponse.status}`);
        }
      } catch {
        console.error("[ally-support] Failed to send support email.");
      }

      // Remove the tag from the text displayed to the user
      text = text.replace("[SEND_EMAIL]", "").trim();
    }

    return json(200, { response: text });

  } catch (error: any) {
    const timedOut = error?.isTimeout === true;
    console.error(`[ally-support] Request failed${timedOut ? " after timeout" : ""}.`);
    return json(timedOut ? 504 : 500, {
      error: timedOut
        ? "Ally took too long to respond. Please try again."
        : "Ally is temporarily unavailable. Please try again.",
    });
    }
  };
}

export const handler = createAllySupportHandler();
