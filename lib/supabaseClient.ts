import { createClient } from "@supabase/supabase-js";

const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Surface a clear error in the console rather than failing silently inside Supabase calls.
  // eslint-disable-next-line no-console
  console.error(
    "Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file."
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // needed for invite/magic-link flows
  },
});

export const APP_URL =
  ((import.meta as any).env?.VITE_APP_URL as string | undefined) ||
  (typeof window !== "undefined" ? window.location.origin : "");
