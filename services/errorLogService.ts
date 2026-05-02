import { supabase } from "../lib/supabaseClient";

export interface ErrorLogEntry {
  context: string;
  action?: string;
  error: unknown;
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Log an application error to the error_log table.
 * Never throws — logging must not break the caller's flow.
 */
export async function logError({
  context,
  action,
  error,
  organizationId,
  metadata,
}: ErrorLogEntry): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const httpStatus: number | null = (error as any)?.status ?? null;

    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from("error_log").insert({
      organization_id: organizationId ?? null,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      source: "client",
      context,
      action: action ?? null,
      error_message: message,
      http_status: httpStatus,
      metadata: metadata ?? null,
    });
  } catch {
    // Intentionally silent — logging failure must never surface to the user.
  }
}
