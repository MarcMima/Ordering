// supabase/functions/dispatch-order/index.ts
// Versie 2 — gebaseerd op officiële API documentatie:
//   Van Gelder: UPD interface v1.4 (Order-JSON v2.1)
//   Bidfood:    A0022 Sales Order API v1.0 (Basic Auth)
//
// Deploy: supabase functions deploy dispatch-order
//
// Aanroepen:
//   POST /functions/v1/dispatch-order
//   Body: { "order_id": "<uuid>", "dry_run": false }
//
// Secrets (Supabase Vault → Edge Function secrets):
//   VAN_GELDER_API_KEY        — legacy static bearer token (optional fallback)
//   VAN_GELDER_CLIENT_ID      — OAuth client id
//   VAN_GELDER_CLIENT_SECRET  — OAuth client secret
//   VAN_GELDER_TOKEN_URL      — OAuth token endpoint
//   VAN_GELDER_SCOPE          — OAuth scope (api://.../.default)
//   VAN_GELDER_SUBSCRIPTION_KEY — Ocp-Apim-Subscription-Key
//   VAN_GELDER_BASE_URL       — bijv. https://api.vangeldernederland.nl
//   VAN_GELDER_CUSTOMER_CODE  — Debiteurnummer (override van DB config)
//   VAN_GELDER_DELIVERY_CITY      — LeveringAdres.Plaats
//   VAN_GELDER_DELIVERY_STREET    — LeveringAdres.Straat
//   VAN_GELDER_DELIVERY_POSTCODE  — LeveringAdres.Postcode
//   VAN_GELDER_DELIVERY_COUNTRY   — LeveringAdres.Landcode (bijv. NL)
//   VAN_GELDER_DELIVERY_NAME      — LeveringAdres.Naam (optioneel; fallback: locatie naam)
//   VAN_GELDER_DELIVERY_KLANTCODE — LeveringAdres.Klantcode (optioneel; fallback: Debiteurnummer)
//   VAN_GELDER_DELIVERY_HOUSENUMBER — LeveringAdres.Huisnummer (optioneel)
//   VAN_GELDER_DELIVERY_PHONE       — LeveringAdres.Telefoonnummer (optioneel)
//   BIDFOOD_USERNAME          — Basic Auth gebruikersnaam
//   BIDFOOD_PASSWORD          — Basic Auth wachtwoord
//   BIDFOOD_SYSTEM_NAME       — bijv. 'MIMA' (optioneel, voor third-party header)
//   RESEND_API_KEY            — voor e-mail (resend.com)
//   FROM_EMAIL                — bijv. bestelling@mimafood.nl
//   WHATSAPP_API_TOKEN        — WhatsApp Business API (optioneel)
//   WHATSAPP_PHONE_ID         — WhatsApp Business phone ID (optioneel)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderLine = {
  id: string;
  raw_ingredient_id: string;
  quantity: number;
  unit: string;
  raw_ingredient: { name: string };
  supplier_ingredient: {
    ean_code: string | null; // GTIN-14 voor Bidfood, GTIN-13 voor Van Gelder
    supplier_article_code: string | null; // 6-cijferig Bidfood ARTNUM
    supplier_article_name: string | null;
    order_unit: string | null; // Bidfood: productUom bijv. 'BB', 'ZK', 'KG'
    order_unit_size: number | null;
  } | null;
};

type ChannelConfig = {
  channel: string;
  api_base_url: string | null;
  api_customer_code: string | null;
  email_to: string | null;
  email_cc: string | null;
  email_subject_template: string | null;
  whatsapp_phone: string | null;
  whatsapp_use_api: boolean;
  auto_send: boolean;
};

type Order = {
  id: string;
  location_id: string;
  supplier_id: string;
  requested_delivery_date: string;
  notes: string | null;
  order_line_items: OrderLine[];
  supplier: {
    name: string;
    supplier_order_channels: ChannelConfig | null;
  };
};

type DispatchResult = {
  success: boolean;
  channel: string;
  supplier_order_number?: string;
  message?: string;
  error?: string;
  message_body?: string;
};

// ─── Van Gelder (Order-JSON v2.1) ─────────────────────────────────────────────
// Docs: UPD interface klant v1.4
// Endpoint: POST {base_url}/orders (exact endpoint bij Van Gelder opvragen)
// Auth: OAuth2 client credentials + Ocp-Apim-Subscription-Key

async function getVanGelderAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get("VAN_GELDER_CLIENT_ID");
  const clientSecret = Deno.env.get("VAN_GELDER_CLIENT_SECRET");
  const tokenUrl = Deno.env.get("VAN_GELDER_TOKEN_URL");
  const scope = Deno.env.get("VAN_GELDER_SCOPE");

  if (!clientId || !clientSecret || !tokenUrl || !scope) return null;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Van Gelder OAuth token error ${response.status}: ${errorBody}`);
  }

  const json = (await response.json()) as { access_token?: string };
  return json.access_token ?? null;
}

async function dispatchVanGelder(
  order: Order,
  channel: ChannelConfig,
  dryRun: boolean
): Promise<DispatchResult> {
  const legacyApiKey = Deno.env.get("VAN_GELDER_API_KEY");
  const subscriptionKey = Deno.env.get("VAN_GELDER_SUBSCRIPTION_KEY");
  const baseUrl = channel.api_base_url ?? Deno.env.get("VAN_GELDER_BASE_URL");
  const customerCode =
    channel.api_customer_code ?? Deno.env.get("VAN_GELDER_CUSTOMER_CODE");
  const deliveryCity = Deno.env.get("VAN_GELDER_DELIVERY_CITY");
  const deliveryStreet = Deno.env.get("VAN_GELDER_DELIVERY_STREET");
  const deliveryPostcode = Deno.env.get("VAN_GELDER_DELIVERY_POSTCODE");
  const deliveryCountry = Deno.env.get("VAN_GELDER_DELIVERY_COUNTRY");
  const deliveryName =
    Deno.env.get("VAN_GELDER_DELIVERY_NAME") ?? `MIMA ${order.location_id.slice(0, 8)}`;
  const deliveryKlantcode =
    Deno.env.get("VAN_GELDER_DELIVERY_KLANTCODE") ?? customerCode ?? "";
  const deliveryHouseNumber = Deno.env.get("VAN_GELDER_DELIVERY_HOUSENUMBER") ?? "";
  const deliveryPhone = Deno.env.get("VAN_GELDER_DELIVERY_PHONE") ?? "";

  let accessToken: string | null = null;
  try {
    accessToken = (await getVanGelderAccessToken()) ?? legacyApiKey ?? null;
  } catch (e) {
    return {
      success: false,
      channel: "van_gelder_api",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (
    !accessToken ||
    !subscriptionKey ||
    !baseUrl ||
    !customerCode ||
    !deliveryCity ||
    !deliveryStreet ||
    !deliveryPostcode ||
    !deliveryCountry
  ) {
    return {
      success: false,
      channel: "van_gelder_api",
      error:
        "Incomplete Van Gelder config. Required: OAuth credentials (or VAN_GELDER_API_KEY fallback), VAN_GELDER_SUBSCRIPTION_KEY, api_base_url, api_customer_code, and delivery address envs (CITY/STREET/POSTCODE/COUNTRY).",
    };
  }

  // Controleer EAN codes — Van Gelder werkt op GTIN-13
  const missingEan = order.order_line_items.filter(
    (l) => !l.supplier_ingredient?.ean_code
  );
  if (missingEan.length > 0) {
    return {
      success: false,
      channel: "van_gelder_api",
      error: `EAN-code ontbreekt voor: ${missingEan.map((l) => l.raw_ingredient.name).join(", ")}. Invullen via Admin → Leveranciers → EAN-codes.`,
    };
  }

  // Van Gelder Order-JSON v2.1 formaat (zie UPD interface docs)
  const orderPayload = {
    Header: {
      Ordernummer: `MIMA-${order.id.slice(0, 8).toUpperCase()}`,
      Debiteurnummer: customerCode,
      Leverdatum: order.requested_delivery_date, // YYYY-MM-DD
      Email: "",
      Commentaar: order.notes ?? "",
      Routenummer: "",
    },
    LeveringAdres: {
      Naam: deliveryName,
      Klantcode: deliveryKlantcode,
      Plaats: deliveryCity,
      Straat: deliveryStreet,
      Huisnummer: deliveryHouseNumber,
      Postcode: deliveryPostcode,
      Landcode: deliveryCountry,
      Telefoonnummer: deliveryPhone,
    },
    Regels: order.order_line_items.map((line, idx) => ({
      Regelnummer: String(idx + 1),
      EANCode: line.supplier_ingredient!.ean_code!,
      Aantal: Math.ceil(line.quantity),
    })),
  };

  if (dryRun) {
    return {
      success: true,
      channel: "van_gelder_api",
      message: "Dry run — niet verstuurd",
      message_body: JSON.stringify(orderPayload, null, 2),
    };
  }

  const response = await fetch(`${baseUrl}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
    },
    body: JSON.stringify(orderPayload),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      success: false,
      channel: "van_gelder_api",
      error: `Van Gelder API ${response.status}: ${JSON.stringify(responseData)}`,
    };
  }

  return {
    success: true,
    channel: "van_gelder_api",
    supplier_order_number: responseData?.ordernummer ?? responseData?.OrderId,
    message_body: JSON.stringify(orderPayload),
  };
}

// ─── Bidfood (A0022 Sales Order API v1.0) ────────────────────────────────────
// Docs: API-A0022-v1-Bidfood_Verkoop_Order_API_version_20251110.yaml
// Endpoint: POST https://bas.bidfood.nl/a0022/v1/customers/{customerNumber}/orders
// Auth: Basic Auth (username:password)
// Artikelidentificatie: productId (6-cijferig ARTNUM) + productUom (2-letter code)
//   of skuId (productId+productUom, bijv. "001990TR")
//   of gtin (GTIN-14, 14 cijfers — EAN met voorloopnul)

async function dispatchBidfood(
  order: Order,
  channel: ChannelConfig,
  dryRun: boolean
): Promise<DispatchResult> {
  const username = Deno.env.get("BIDFOOD_USERNAME");
  const password = Deno.env.get("BIDFOOD_PASSWORD");
  const systemName = Deno.env.get("BIDFOOD_SYSTEM_NAME") ?? "MIMA";
  const customerNumber = channel.api_customer_code;
  const baseUrl = channel.api_base_url ?? "https://bas.bidfood.nl";

  if (!username || !password || !customerNumber) {
    return {
      success: false,
      channel: "bidfood_api",
      error:
        "Configuratie onvolledig. Vereist: BIDFOOD_USERNAME, BIDFOOD_PASSWORD, api_customer_code (klantnummer 6-cijferig).",
    };
  }

  // Bidfood identificeert producten via:
  //   - skuId = ARTNUM (6 cijfers) + productUom (2 letters), bijv. "013147BB"
  //   - gtin = GTIN-14 (EAN met voorloopnul voor 13-cijferige EAN codes)
  // We prefereren skuId (ARTNUM + UOM) want dat is meest stabiel.
  // Fallback: gtin als ean_code begint met 08 of 14 cijfers heeft.

  const missingCode = order.order_line_items.filter(
    (l) =>
      !l.supplier_ingredient?.supplier_article_code &&
      !l.supplier_ingredient?.ean_code
  );
  if (missingCode.length > 0) {
    return {
      success: false,
      channel: "bidfood_api",
      error: `Artikelcode ontbreekt voor: ${missingCode.map((l) => l.raw_ingredient.name).join(", ")}. Invullen via Admin → Leveranciers → Artikelcodes.`,
    };
  }

  // Bouw Bidfood order payload (A0022 OrderCreate schema)
  const products = order.order_line_items.map((line, idx) => {
    const si = line.supplier_ingredient!;
    const qty = Math.ceil(line.quantity);

    // Bepaal het product identifier
    let productIdentifier: Record<string, string>;
    if (si.supplier_article_code && si.order_unit) {
      // skuId = ARTNUM + productUom, bijv. "013147BB"
      productIdentifier = { skuId: `${si.supplier_article_code}${si.order_unit}` };
    } else if (si.ean_code) {
      // GTIN-14: Bidfood verwacht 14 cijfers. Pad EAN-13 met voorloopnul.
      const gtin = si.ean_code.length === 13 ? `0${si.ean_code}` : si.ean_code;
      productIdentifier = { gtin };
    } else {
      productIdentifier = {
        productId: si.supplier_article_code!,
        productUom: si.order_unit ?? "ST",
      };
    }

    return {
      ...productIdentifier,
      orderLineReference: String(idx + 1),
      quantityOrdered: qty,
    };
  });

  const orderPayload = {
    orderReference: `MIMA-${order.id.slice(0, 8).toUpperCase()}`,
    deliveryDate: order.requested_delivery_date, // YYYY-MM-DD
    products,
  };

  if (dryRun) {
    return {
      success: true,
      channel: "bidfood_api",
      message: "Dry run — niet verstuurd",
      message_body: JSON.stringify(orderPayload, null, 2),
    };
  }

  // POST naar Bidfood Order Create endpoint
  const credentials = btoa(`${username}:${password}`);
  const response = await fetch(
    `${baseUrl}/a0022/v1/customers/${customerNumber}/orders`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
        "system-Name": systemName, // optionele header voor third-party apps
      },
      body: JSON.stringify(orderPayload),
    }
  );

  // Bidfood retourneert 201 Created bij succes
  const responseData = await response.json().catch(() => ({}));

  if (response.status !== 201) {
    return {
      success: false,
      channel: "bidfood_api",
      error: `Bidfood API ${response.status}: ${JSON.stringify(responseData)}`,
    };
  }

  // Bidfood kan meerdere orders retourneren als artikelen in aparte batches vallen
  const bidfoodOrderNumbers = responseData?.orders
    ?.map((o: { orderNumber: string }) => o.orderNumber)
    ?.join(", ");

  return {
    success: true,
    channel: "bidfood_api",
    supplier_order_number: bidfoodOrderNumbers,
    message_body: JSON.stringify(orderPayload),
  };
}

// ─── Bidfood Availability Check (A0021) ──────────────────────────────────────
// Optioneel: controleer beschikbaarheid VOOR het plaatsen van de order.
// Aanroepen vanuit de ordering UI om waarschuwingen te tonen.

export async function checkBidfoodAvailability(
  customerNumber: string,
  items: Array<{
    skuId?: string;
    gtin?: string;
    quantityRequested: number;
    deliveryDate: string;
  }>
): Promise<
  Array<{
    skuId?: string;
    gtin?: string;
    isAvailabilityIssue: boolean;
    firstPossibleDeliveryDate?: string;
    netSkuPrice?: number;
    reasons?: string[];
  }>
> {
  const username = Deno.env.get("BIDFOOD_USERNAME");
  const password = Deno.env.get("BIDFOOD_PASSWORD");
  const baseUrl = "https://bas.bidfood.nl";

  if (!username || !password) throw new Error("Bidfood credentials ontbreken");

  const credentials = btoa(`${username}:${password}`);
  const response = await fetch(
    `${baseUrl}/a0021/v1/customers/${customerNumber}/products/availability/check`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({ products: items }),
    }
  );

  if (!response.ok)
    throw new Error(`Bidfood availability check mislukt: ${response.status}`);

  const data = await response.json();
  return data.products ?? [];
}

// ─── E-mail (Tuana, Today Food Group) ────────────────────────────────────────

function buildOrderEmailBody(order: Order): string {
  const lines = order.order_line_items
    .map((line, idx) => {
      const name =
        line.supplier_ingredient?.supplier_article_name ?? line.raw_ingredient.name;
      const unit = line.supplier_ingredient?.order_unit ?? line.unit;
      return `${idx + 1}. ${name} — ${Math.ceil(line.quantity)} ${unit}`;
    })
    .join("\n");

  return `Beste ${order.supplier.name},

Hierbij onze bestelling voor levering op ${order.requested_delivery_date}:

${lines}
${order.notes ? `\nOpmerking: ${order.notes}\n` : ""}
Met vriendelijke groet,
MIMA Kitchen`;
}

async function dispatchEmail(
  order: Order,
  channel: ChannelConfig,
  dryRun: boolean
): Promise<DispatchResult> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL") ?? "bestelling@mimafood.nl";

  if (!channel.email_to) {
    return { success: false, channel: "email", error: "email_to niet ingevuld." };
  }

  const subject = (
    channel.email_subject_template ?? "Bestelling MIMA {datum} — levering {leverdatum}"
  )
    .replace("{datum}", new Date().toLocaleDateString("nl-NL"))
    .replace("{leverdatum}", order.requested_delivery_date);

  const body = buildOrderEmailBody(order);

  if (dryRun || !resendKey) {
    return {
      success: true,
      channel: "email",
      message: dryRun ? "Dry run — niet verstuurd" : "RESEND_API_KEY ontbreekt",
      message_body: `Aan: ${channel.email_to}\nOnderwerp: ${subject}\n\n${body}`,
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [channel.email_to],
      cc: channel.email_cc ? [channel.email_cc] : [],
      subject,
      text: body,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return { success: false, channel: "email", error: `Resend fout: ${err}` };
  }

  return {
    success: true,
    channel: "email",
    message: `Verstuurd naar ${channel.email_to}`,
    message_body: body,
  };
}

// ─── WhatsApp (Java Bakery) ───────────────────────────────────────────────────

function buildWhatsAppMessage(order: Order): string {
  const lines = order.order_line_items
    .map((line) => {
      const name =
        line.supplier_ingredient?.supplier_article_name ?? line.raw_ingredient.name;
      const unit = line.supplier_ingredient?.order_unit ?? line.unit;
      return `• ${name}: ${Math.ceil(line.quantity)} ${unit}`;
    })
    .join("\n");

  return `Hoi! Bestelling MIMA voor levering ${order.requested_delivery_date}:\n\n${lines}${order.notes ? `\n\nOpmerking: ${order.notes}` : ""}`;
}

async function dispatchWhatsApp(
  order: Order,
  channel: ChannelConfig,
  dryRun: boolean
): Promise<DispatchResult> {
  const message = buildWhatsAppMessage(order);

  if (!channel.whatsapp_phone) {
    return {
      success: false,
      channel: "whatsapp",
      error: "whatsapp_phone niet ingevuld.",
    };
  }

  if (channel.whatsapp_use_api && !dryRun) {
    const token = Deno.env.get("WHATSAPP_API_TOKEN");
    const phoneId = Deno.env.get("WHATSAPP_PHONE_ID");

    if (!token || !phoneId) {
      return {
        success: false,
        channel: "whatsapp",
        error: "WHATSAPP_API_TOKEN of WHATSAPP_PHONE_ID ontbreekt.",
      };
    }

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: channel.whatsapp_phone.replace(/[^0-9]/g, ""),
          type: "text",
          text: { body: message },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return { success: false, channel: "whatsapp", error: `WhatsApp API fout: ${err}` };
    }

    return {
      success: true,
      channel: "whatsapp",
      message: `Verstuurd naar ${channel.whatsapp_phone}`,
      message_body: message,
    };
  }

  // Genereer wa.me link (handmatig versturen vanuit de app)
  const phone = channel.whatsapp_phone.replace(/[^0-9]/g, "");
  const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  return {
    success: true,
    channel: "whatsapp",
    message: dryRun
      ? "Dry run — WhatsApp link gegenereerd"
      : "WhatsApp link gegenereerd",
    message_body: waLink,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const { order_id, dry_run = false } = await req.json();

  if (!order_id) {
    return new Response(JSON.stringify({ error: "order_id vereist" }), { status: 400 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(`
      *,
      supplier:suppliers (
        name,
        supplier_order_channels (*)
      ),
      order_line_items (
        *,
        raw_ingredient:raw_ingredients (name),
        supplier_ingredient:supplier_ingredients (
          ean_code,
          supplier_article_code,
          supplier_article_name,
          order_unit,
          order_unit_size
        )
      )
    `)
    .eq("id", order_id)
    .single();

  if (orderError || !order) {
    return new Response(
      JSON.stringify({ error: "Order niet gevonden", detail: orderError?.message }),
      { status: 404 }
    );
  }

  const typedOrder = order as Order & { supplier_id: string };
  const channel = typedOrder.supplier.supplier_order_channels;

  if (!channel) {
    return new Response(
      JSON.stringify({ error: "Geen bestelkanaal geconfigureerd voor deze leverancier." }),
      { status: 400 }
    );
  }

  // Maak dispatch log entry
  const { data: dispatch } = await supabase
    .from("order_dispatches")
    .insert({
      order_id,
      supplier_id: typedOrder.supplier_id,
      channel: channel.channel,
      status: "sending",
      sent_by: "system",
    })
    .select()
    .single();

  let result: DispatchResult;

  switch (channel.channel) {
    case "van_gelder_api":
      result = await dispatchVanGelder(typedOrder, channel, dry_run);
      break;
    case "bidfood_api":
      result = await dispatchBidfood(typedOrder, channel, dry_run);
      break;
    case "email":
      result = await dispatchEmail(typedOrder, channel, dry_run);
      break;
    case "whatsapp":
      result = await dispatchWhatsApp(typedOrder, channel, dry_run);
      break;
    default:
      result = {
        success: false,
        channel: channel.channel,
        error: `Onbekend kanaal: ${channel.channel}`,
      };
  }

  // Update dispatch log
  if (dispatch) {
    await supabase
      .from("order_dispatches")
      .update({
        status: result.success ? (dry_run ? "pending" : "sent") : "failed",
        dispatched_at: result.success && !dry_run ? new Date().toISOString() : null,
        supplier_order_number: result.supplier_order_number ?? null,
        response_raw: result,
        error_message: result.error ?? null,
        message_body: result.message_body ?? null,
      })
      .eq("id", dispatch.id);
  }

  return new Response(JSON.stringify({ ok: result.success, ...result }), {
    status: result.success ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
});
