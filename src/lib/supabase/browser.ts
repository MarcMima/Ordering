import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Browser client: persists session in cookies (via @supabase/ssr). Use in Client Components. */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

/** Project ref from URL (e.g. "abcdefgh" from https://abcdefgh.supabase.co). */
export function getSupabaseProjectRef(): string {
  if (!supabaseUrl) return "not set";
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "unknown";
  } catch {
    return "invalid URL";
  }
}
