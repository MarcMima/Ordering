// Receives Bidfood weekly assortment via Resend inbound email (email.received webhook).
// Forward integratie-klant@bidfood.nl mails to your Resend receiving address.
//
// Secrets:
//   RESEND_API_KEY
//   RESEND_WEBHOOK_SECRET  (from Resend webhook settings)
//   BIDFOOD_SYNC_REPORT_TO (optional, default abdulhadi@mimafood.nl)
//
// Deploy: supabase functions deploy bidfood-inbound-email --no-verify-jwt

import {
  createServiceClient,
  formatSyncReportEmail,
  runBidfoodAssortmentSync,
  sendReportEmail,
} from "../sync-bidfood-assortment/bidfoodAssortment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

function isBidfoodAssortmentEmail(from: string, subject: string): boolean {
  const f = from.toLowerCase();
  const s = subject.toLowerCase();
  return (
    f.includes("bidfood") ||
    f.includes("integratie-klant") ||
    s.includes("assortiment") ||
    s.includes("artikelbericht")
  );
}

async function verifyResendWebhook(req: Request, rawBody: string): Promise<unknown> {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) {
    throw new Error("RESEND_WEBHOOK_SECRET not configured");
  }

  const { Resend } = await import("https://esm.sh/resend@4.0.0");
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

  return resend.webhooks.verify({
    payload: rawBody,
    headers: {
      id: req.headers.get("svix-id") ?? "",
      timestamp: req.headers.get("svix-timestamp") ?? "",
      signature: req.headers.get("svix-signature") ?? "",
    },
    webhookSecret: secret,
  });
}

async function downloadAttachment(
  emailId: string,
  attachments: { id: string; filename?: string; content_type?: string }[]
): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY missing");

  const xlsxAtt =
    attachments.find((a) => (a.filename ?? "").toLowerCase().endsWith(".xlsx")) ??
    attachments.find((a) =>
      (a.content_type ?? "").includes("spreadsheet") || (a.content_type ?? "").includes("excel")
    ) ??
    attachments[0];

  if (!xlsxAtt?.id) return null;

  const listResp = await fetch(
    `https://api.resend.com/emails/receiving/${emailId}/attachments`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!listResp.ok) {
    throw new Error(`Attachments list failed: ${await listResp.text()}`);
  }

  const listJson = (await listResp.json()) as {
    data?: { id: string; filename: string; download_url: string }[];
  };
  const item =
    listJson.data?.find((a) => a.id === xlsxAtt.id) ?? listJson.data?.[0];
  if (!item?.download_url) return null;

  const fileResp = await fetch(item.download_url);
  if (!fileResp.ok) {
    throw new Error(`Attachment download failed: ${fileResp.status}`);
  }

  return {
    bytes: new Uint8Array(await fileResp.arrayBuffer()),
    fileName: item.filename ?? xlsxAtt.filename ?? "bidfood-assortment.xlsx",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    let event: {
      type?: string;
      data?: {
        email_id?: string;
        from?: string;
        subject?: string;
        attachments?: { id: string; filename?: string; content_type?: string }[];
      };
    };

    try {
      event = (await verifyResendWebhook(req, rawBody)) as typeof event;
    } catch (verifyErr) {
      // Allow manual test with shared secret header when webhook not verified yet
      const testSecret = req.headers.get("x-bidfood-inbound-secret");
      const expected = Deno.env.get("BIDFOOD_INBOUND_SECRET");
      if (!expected || testSecret !== expected) {
        const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        return new Response(JSON.stringify({ error: "Webhook verification failed", detail: msg }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      event = JSON.parse(rawBody);
    }

    if (event.type !== "email.received" || !event.data?.email_id) {
      return new Response(JSON.stringify({ ok: true, skipped: "not email.received" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const from = event.data.from ?? "";
    const subject = event.data.subject ?? "";
    if (!isBidfoodAssortmentEmail(from, subject)) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "not a Bidfood assortment email", from, subject }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const attachments = event.data.attachments ?? [];
    if (attachments.length === 0) {
      return new Response(
        JSON.stringify({ error: "No attachments on Bidfood email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const file = await downloadAttachment(event.data.email_id, attachments);
    if (!file) {
      return new Response(
        JSON.stringify({ error: "Could not download Excel attachment" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createServiceClient();
    const result = await runBidfoodAssortmentSync({
      supabase,
      xlsxBytes: file.bytes,
      dryRun: false,
      source: "resend_inbound",
      fileName: file.fileName,
    });

    const needsAttention =
      result.errors.length > 0 ||
      result.inactive > 0 ||
      result.notInFile > 0 ||
      !result.ok;
    let reportEmail: string | null = null;
    if (needsAttention) {
      const { subject: reportSubject, text: reportText } = formatSyncReportEmail(
        result,
        file.fileName
      );
      reportEmail = await sendReportEmail({
        subject: reportSubject,
        text: `${reportText}\n\nSource email from: ${from}\nSubject: ${subject}`,
      });
    }

    return new Response(
      JSON.stringify({
        ok: result.ok,
        processed: true,
        file_name: file.fileName,
        ...result,
        report_email: needsAttention ? (reportEmail ?? "sent") : "skipped_all_ok",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    try {
      await sendReportEmail({
        subject: "Bidfood assortment sync FAILED",
        text: `Automatic sync failed:\n\n${detail}`,
      });
    } catch {
      // ignore
    }
    return new Response(JSON.stringify({ error: "bidfood-inbound-email failed", detail }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
