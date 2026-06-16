import {
  createServiceClient,
  formatSyncReportEmail,
  runBidfoodAssortmentSync,
  sendReportEmail,
} from "./bidfoodAssortment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      xlsx_base64,
      xlsx_url,
      dry_run = false,
      send_report = true,
      file_name,
      source = "api",
    } = body as {
      xlsx_base64?: string;
      xlsx_url?: string;
      dry_run?: boolean;
      send_report?: boolean;
      file_name?: string;
      source?: string;
    };

    let bytes: Uint8Array;
    if (xlsx_base64) {
      const bin = atob(xlsx_base64);
      bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    } else if (xlsx_url) {
      const resp = await fetch(xlsx_url);
      if (!resp.ok) {
        return new Response(
          JSON.stringify({ error: `Could not fetch xlsx_url: ${resp.status}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      bytes = new Uint8Array(await resp.arrayBuffer());
    } else {
      return new Response(
        JSON.stringify({ error: "xlsx_base64 or xlsx_url required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createServiceClient();
    const result = await runBidfoodAssortmentSync({
      supabase,
      xlsxBytes: bytes,
      dryRun: Boolean(dry_run),
      source,
      fileName: file_name,
    });

    let reportEmail: string | null = null;
    const needsAttention =
      result.errors.length > 0 ||
      result.inactive > 0 ||
      result.notInFile > 0 ||
      !result.ok;
    if (send_report && needsAttention) {
      const { subject, text } = formatSyncReportEmail(result, file_name);
      reportEmail = await sendReportEmail({ subject, text });
    } else if (send_report) {
      reportEmail = "skipped_all_ok";
    }

    return new Response(
      JSON.stringify({
        ok: result.ok,
        ...result,
        report_email: reportEmail ? (reportEmail.startsWith("Resend") ? reportEmail : "sent") : "skipped",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: "sync-bidfood-assortment failed", detail }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
