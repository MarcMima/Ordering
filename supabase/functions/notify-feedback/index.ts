// Mails Marc when someone sends feedback from the app (FeedbackButton). Until 19-10-2026
// app_feedback was only written, never read, so feedback from the locations went unseen.
//   POST /functions/v1/notify-feedback  Body: { "id": "<app_feedback uuid>" }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOTIFY_TO = Deno.env.get("FEEDBACK_NOTIFY_TO") ?? "marc@mimafood.nl";
const APP_URL = Deno.env.get("APP_URL") ?? "https://ordering-alpha.vercel.app";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { id } = await req.json().catch(() => ({ id: null }));
  if (typeof id !== "string") return json({ error: "id required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: row, error } = await supabase
    .from("app_feedback")
    .select("id, page, type, message, created_at, location:locations(name)")
    .eq("id", id)
    .single();
  if (error || !row) return json({ error: "Feedback not found" }, 404);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ error: "RESEND_API_KEY missing" }, 500);

  const location = (row.location as { name?: string } | null)?.name ?? "No location";
  const subject = `App feedback (${row.type}) — ${location}: ${row.message.slice(0, 60)}`;
  const text = [
    `Location: ${location}`,
    `Page: ${row.page ?? "-"}`,
    `Type: ${row.type}`,
    "",
    row.message,
    "",
    `All feedback: ${APP_URL}/admin/feedback`,
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
    body: JSON.stringify({
      from: Deno.env.get("FROM_EMAIL") ?? "bestelling@mimafood.nl",
      to: [NOTIFY_TO],
      subject,
      text,
      html: `<p><strong>${escapeHtml(location)}</strong> · ${escapeHtml(row.page ?? "-")} · ${escapeHtml(row.type)}</p><p style="white-space:pre-wrap">${escapeHtml(row.message)}</p><p><a href="${APP_URL}/admin/feedback">All feedback</a></p>`,
    }),
  });
  if (!res.ok) return json({ error: `Resend ${res.status}: ${await res.text()}` }, 502);
  return json({ ok: true });
});
