import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Project ref from URL (e.g. "abcdefgh" from https://abcdefgh.supabase.co) for comparison with Supabase Dashboard. */
export function getSupabaseProjectRef(): string {
  if (!supabaseUrl) return "not set";
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "unknown";
  } catch {
    return "invalid URL";
  }
}

export function createClient() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey);
}
