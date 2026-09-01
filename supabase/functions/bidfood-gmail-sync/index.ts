// supabase/functions/bidfood-gmail-sync/index.ts
//
// Receives the weekly Bidfood assortment workbook straight from Gmail.
//
// A small Google Apps Script in Marc's mailbox runs every Monday morning, finds
// the newest "assortiment" mail from bidfood.nl, and POSTs the .xlsx here as
// base64. No inbound-mail domain, no third-party automation service.
//
// Auth: shared token, hashed (SHA-256) in public.integration_tokens under the
// name 'bidfood_gmail_sync'. The caller sends the plain token in x-api-token.
// Deployed with --no-verify-jwt because Apps Script has no Supabase session.
//
// Body: { xlsx_base64: string, file_name?: string, dry_run?: boolean,
//         send_report?: boolean }

import {
  createServiceClient,
  formatSyncReportEmail,
  needsAttention,
  runBidfoodAssortmentSync,
  sendReportEmail,
} from "../sync-bidfood-assortment/bidfoodAssortment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-api-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createServiceClient();

  try {
    const token = req.headers.get("x-api-token") ?? "";
    if (!token) return json({ error: "Missing x-api-token" }, 401);

    const { data: tokenRow } = await supabase
      .from("integration_tokens")
      .select("name, token_hash")
      .eq("name", "bidfood_gmail_sync")
      .maybeSingle();

    if (!tokenRow?.token_hash) return json({ error: "Integration token not configured" }, 500);
    if (!timingSafeEqual(await sha256Hex(token), tokenRow.token_hash)) {
      return json({ error: "Invalid token" }, 401);
    }

    const body = (await req.json()) as {
      xlsx_base64?: string;
      file_name?: string;
      dry_run?: boolean;
      send_report?: boolean;
    };

    if (!body.xlsx_base64) return json({ error: "xlsx_base64 required" }, 400);

    const dryRun = Boolean(body.dry_run);
    const sendReport = body.send_report ?? true;
    const fileName = body.file_name ?? "bidfood-assortment.xlsx";

    const result = await runBidfoodAssortmentSync({
      supabase,
      xlsxBytes: base64ToBytes(body.xlsx_base64),
      dryRun,
      source: "gmail_apps_script",
      fileName,
    });

    let reportEmail: string | null = null;
    if (sendReport && needsAttention(result)) {
      const { subject, text } = formatSyncReportEmail(result, fileName);
      reportEmail = await sendReportEmail({ subject, text });
    }

    if (!dryRun) {
      await supabase
        .from("integration_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("name", "bidfood_gmail_sync");
    }

    return json({
      ok: result.ok,
      processed: true,
      file_name: fileName,
      dry_run: dryRun,
      rows_in_file: result.rowsInFile,
      mappings_checked: result.mappingsChecked,
      mappings_updated: result.mappingsUpdated,
      auto_replaced: result.autoReplaced,
      inactive: result.inactive,
      not_in_file: result.notInFile,
      price_changes: result.priceChanges,
      price_notes: result.priceNotes,
      errors: result.errors,
      report_email: !sendReport
        ? "disabled"
        : needsAttention(result)
        ? reportEmail ?? "sent"
        : "skipped_all_ok",
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    try {
      await sendReportEmail({
        subject: "Bidfood assortment sync FAILED",
        text: `The weekly Gmail sync failed:\n\n${detail}`,
      });
    } catch {
      // ignore
    }
    return json({ error: "bidfood-gmail-sync failed", detail }, 500);
  }
});
