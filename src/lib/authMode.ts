/** When true, login and per-user permissions are skipped (kitchen uses anon Supabase access). */
export function isAuthDisabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_DISABLED === "true";
}
