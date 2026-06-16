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
//   VAN_GELDER_SUBSCRIPTION_KEY_ORDERS (+ fallback VAN_GELDER_SUBSCRIPTION_KEY)
//   VAN_GELDER_SUBSCRIPTION_KEY_ARTICLES | _ASSORTMENTS | _CUSTOMER | _PRICES
//   VAN_GELDER_API_BASE_URL   — https://vg-acc-we-apim.azure-api.net (acc) of vg-prd (prod)
//   VAN_GELDER_ORDER_URL      — exact order endpoint (acc/prod …/api/orders/2.0/create)
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
//   BIDFOOD_USERNAME          — Basic Auth (fallback als geen per-klant secret)
//   BIDFOOD_PASSWORD / BIDFOOD_PASSWORD_B64 — idem fallback
//   Per klantnummer (productie, 3 users): BIDFOOD_USERNAME_074380, BIDFOOD_PASSWORD_B64_074380, enz.
//   BIDFOOD_SYSTEM_NAME       — alleen met BIDFOOD_SEND_SYSTEM_NAME=1 (header geeft anders 401 op prod én sandbox)
//   BIDFOOD_SEND_SYSTEM_NAME  — "true"/"1": stuur system-Name mee (standaard uit)
//   BIDFOOD_ORDER_USE_SKUID   — optioneel: "true" = A0022/A0021 lines gebruiken skuId i.p.v. productId+productUom
//   BIDFOOD_USE_SANDBOX       — "true"/"1": forceer Bidfood sandbox-URL + klant (zie BIDFOOD_SANDBOX_*); DB api_* blijft prod
//   BIDFOOD_SANDBOX_BASE_URL  — optioneel; default https://bas.staging.bidfood.nl/sandbox
//   BIDFOOD_SANDBOX_CUSTOMER  — optioneel; default 000040 (Bidfood test-PDF)
//   Of zonder BIDFOOD_USE_SANDBOX: zet op supplier_order_channels api_base_url + api_customer_code (zoals in test-PDF);
//     header X-Customer-Sandbox wordt gezet als de base URL staging/sandbox is.
//   RESEND_API_KEY            — voor e-mail (resend.com)
//   FROM_EMAIL                — bijv. bestelling@mimafood.nl
//   WHATSAPP_API_TOKEN        — WhatsApp Business API (optioneel)
//   WHATSAPP_PHONE_ID         — WhatsApp Business phone ID (optioneel)
//   JAVA_BAKERY_WHATSAPP_PHONE — fallback als DB whatsapp_phone leeg (Java bakery)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildVanGelderEanProductStatusIndex,
  isVanGelderEanDispatchAllowed,
  lookupVanGelderEanStatus,
  vanGelderSkipReasonForStatus,
} from "../import-van-gelder/vanGelderEanProductStatus.ts";
import { VG_EAN_TO_ARTICLE_ID } from "../import-van-gelder/vanGelderMimaEanArticleIndex.ts";
import {
  fetchVanGelderActivePriceEans,
  isEanOnActivePriceList,
  normalizeVanGelderEan,
} from "../import-van-gelder/vanGelderPrices.ts";
import {
  isVanGelderSupplierName,
  mergeVanGelderSupplierIngredient,
} from "../import-van-gelder/vanGelderSupplierIngredient.ts";
import {
  expandRedOnionBagQty,
  isRedOnionSlicedFineRawName,
  RED_ONION_VG_LOOSE_EAN,
  vanGelderDispatchQtyForLine,
  type VanGelderOrderRegel,
} from "../import-van-gelder/vanGelderOrderRegels.ts";
import type { VanGelderEanStatusEntry } from "../import-van-gelder/vanGelderEanProductStatus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    bf_is_active?: boolean | null; // false = uit assortiment (weekly Type 03 sync)
    bf_last_status?: string | null;
  } | null;
};

type VanGelderDeliveryAddress = {
  naam?: string;
  klantcode?: string;
  plaats?: string;
  straat?: string;
  huisnummer?: string;
  postcode?: string;
  landcode?: string;
  telefoon?: string;
};

type ChannelConfig = {
  channel: string;
  api_base_url: string | null;
  api_customer_code: string | null;
  delivery_address?: VanGelderDeliveryAddress | null;
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
  location_name?: string | null;
  supplier_id: string;
  order_date: string;
  requested_delivery_date?: string | null;
  notes?: string | null;
  order_line_items: OrderLine[];
  supplier: {
    name: string;
    contact_email?: string | null;
    contact_info?: string | null;
    supplier_order_channels: ChannelConfig | ChannelConfig[] | null;
  };
};

type DispatchResult = {
  success: boolean;
  channel: string;
  supplier_order_number?: string;
  message?: string;
  error?: string;
  message_body?: string;
  deferred_until_1800?: boolean;
};


type SupplierIngredientDetails = {
  raw_ingredient_id: string;
  supplier_sku: string | null;
  ean_code?: string | null;
  supplier_article_code?: string | null;
  supplier_article_name?: string | null;
  order_unit?: string | null;
  order_unit_size?: number | string | null;
  bf_is_active?: boolean | null;
  bf_last_status?: string | null;
  vg_last_status?: string | null;
};

function isVanGelderEanOrderable(
  ean: string,
  activePriceEans: Set<string>,
  statusIndex: Map<string, VanGelderEanStatusEntry>
): boolean {
  const norm = normalizeVanGelderEan(ean);
  if (!norm || !isEanOnActivePriceList(norm, activePriceEans)) return false;
  const entry = lookupVanGelderEanStatus(norm, statusIndex);
  return isVanGelderEanDispatchAllowed(entry?.productStatus);
}

function expandVanGelderLineToRegels(
  line: OrderLine,
  activePriceEans: Set<string>,
  statusIndex: Map<string, VanGelderEanStatusEntry>,
  infoNotes: string[]
): VanGelderOrderRegel[] {
  const bagQty = Math.max(1, Math.ceil(Number(line.quantity) || 0));

  if (isRedOnionSlicedFineRawName(line.raw_ingredient.name)) {
    const looseOk = isVanGelderEanOrderable(RED_ONION_VG_LOOSE_EAN, activePriceEans, statusIndex);
    const loose = bagQty % 12;
    if (loose > 0 && !looseOk) {
      infoNotes.push(
        `${line.raw_ingredient.name}: losse zak niet bestelbaar; ${loose} zak(ken) als extra krat`
      );
    }
    return expandRedOnionBagQty(bagQty, looseOk);
  }

  return [
    {
      ean: line.supplier_ingredient!.ean_code!,
      aantal: vanGelderDispatchQtyForLine(line),
    },
  ];
}

function orderDeliveryDate(order: Order): string {
  return order.requested_delivery_date ?? order.order_date;
}

function buildOrderNumber(order: Order): string {
  const loc = (order.location_name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6) || "MIMA";
  const date = (order.order_date ?? "").replace(/-/g, "");
  const short = order.id.slice(0, 8).toUpperCase();
  return `MIMA-${loc}-${date}-${short}`;
}

function amsterdamHourNow(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  const h = Number(hourPart);
  return Number.isFinite(h) ? h : 0;
}

function managerEmailForLocation(locationName: string | null | undefined): string | null {
  const n = (locationName ?? "").toLowerCase().trim();
  if (n.includes("pijp")) return "depijp@mimafood.nl";
  if (n.includes("zuidas")) return "zuidas@mimafood.nl";
  if (n.includes("west") || n.includes("amsterdam")) return "jph@mimafood.nl";
  return null;
}

async function sendManagerSkippedLinesEmail(params: {
  order: Order;
  locationName: string | null | undefined;
  skippedReasons: string[];
  sentLineCount: number;
}): Promise<string | null> {
  const { order, locationName, skippedReasons, sentLineCount } = params;
  if (skippedReasons.length === 0) return null;
  const managerEmail = managerEmailForLocation(locationName);
  if (!managerEmail) return "Manager-email onbekend voor locatie.";

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL") ?? "bestelling@mimafood.nl";
  if (!resendKey) return "RESEND_API_KEY ontbreekt; manager-mail niet verstuurd.";

  const supplierName = order.supplier?.name ?? "Van Gelder";
  const subject =
    `Waarschuwing bestelling ${supplierName}: regels overgeslagen (${locationName ?? order.location_id})`;
  const body = [
    `Locatie: ${locationName ?? order.location_id}`,
    `Leverancier: ${supplierName}`,
    `Order ref: MIMA-${order.id.slice(0, 8).toUpperCase()}`,
    `Leverdatum: ${orderDeliveryDate(order)}`,
    `Verstuurde regels: ${sentLineCount}`,
    "",
    "Overgeslagen regels / redenen:",
    ...skippedReasons.map((r) => `- ${r}`),
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [managerEmail],
      cc: ["abdulhadi@mimafood.nl"],
      subject,
      text: body,
    }),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => "");
    return `Manager-mail fout: ${response.status} ${err}`;
  }
  return null;
}

function pickSupplierChannel(value: ChannelConfig | ChannelConfig[] | null | undefined): ChannelConfig | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function defaultEmailForSupplierName(name: string): string | null {
  const n = name.toLowerCase().trim();
  if (n === "gédé" || n === "gedé") return "info@gede.nl";
  if (n === "tuana") return "Info@tuana-kruiden.nl";
  return null;
}

function defaultEmailCcForSupplierName(name: string): string | null {
  const n = name.toLowerCase().trim();
  if (n === "gédé" || n === "gedé") return "Tos@gede.nl";
  return null;
}

function parseEmailList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function enrichChannelFromSupplier(
  channel: ChannelConfig,
  supplier: Order["supplier"]
): ChannelConfig {
  const out = { ...channel };
  const contactEmail = supplier.contact_email?.trim() || null;
  const contactInfo = supplier.contact_info?.trim() || null;

  if (out.channel === "email") {
    out.email_to =
      out.email_to?.trim() ||
      contactEmail ||
      defaultEmailForSupplierName(supplier.name ?? "") ||
      null;
    out.email_cc =
      out.email_cc?.trim() || defaultEmailCcForSupplierName(supplier.name ?? "") || null;
    if (!out.email_subject_template) {
      const n = (supplier.name ?? "").toLowerCase().trim();
      if (n === "tuana") {
        out.email_subject_template =
          "Bestelling MIMA kruiden — {datum} (levering {leverdatum})";
      } else if (n === "today food group") {
        out.email_subject_template = "Bestelling MIMA — {datum} (levering {leverdatum})";
      } else {
        out.email_subject_template = "Bestelling MIMA {datum} — levering {leverdatum}";
      }
    }
  }

  if (out.channel === "whatsapp") {
    const supplierKey = (supplier.name ?? "").toLowerCase().trim();
    out.whatsapp_phone =
      out.whatsapp_phone?.trim() ||
      contactInfo ||
      contactEmail ||
      Deno.env.get("JAVA_BAKERY_WHATSAPP_PHONE")?.trim() ||
      (supplierKey === "java bakery" ? "+31620517867" : null);
    out.whatsapp_use_api = Boolean(out.whatsapp_use_api);
  }

  return out;
}

function inferChannelFromSupplierName(
  name: string | undefined,
  supplier?: Pick<Order["supplier"], "contact_email" | "contact_info">
): ChannelConfig | null {
  const n = (name ?? "").toLowerCase().trim();
  if (n === "van gelder") {
    return {
      channel: "van_gelder_api",
      api_base_url: null,
      api_customer_code: null,
      email_to: null,
      email_cc: null,
      email_subject_template: null,
      whatsapp_phone: null,
      whatsapp_use_api: false,
      auto_send: false,
    };
  }
  if (n === "bidfood") {
    return {
      channel: "bidfood_api",
      api_base_url: null,
      api_customer_code: null,
      email_to: null,
      email_cc: null,
      email_subject_template: null,
      whatsapp_phone: null,
      whatsapp_use_api: false,
      auto_send: false,
    };
  }
  if (n === "gédé" || n === "gedé") {
    return enrichChannelFromSupplier(
      {
        channel: "email",
        api_base_url: null,
        api_customer_code: null,
        email_to: defaultEmailForSupplierName(n),
        email_cc: defaultEmailCcForSupplierName(n),
        email_subject_template: "Bestelling MIMA {datum} — levering {leverdatum}",
        whatsapp_phone: null,
        whatsapp_use_api: false,
        auto_send: false,
      },
      { name: name ?? "", contact_email: supplier?.contact_email, contact_info: supplier?.contact_info }
    );
  }
  if (n === "tuana" || n === "today food group") {
    return enrichChannelFromSupplier(
      {
        channel: "email",
        api_base_url: null,
        api_customer_code: null,
        email_to: null,
        email_cc: null,
        email_subject_template: null,
        whatsapp_phone: null,
        whatsapp_use_api: false,
        auto_send: false,
      },
      { name: name ?? "", contact_email: supplier?.contact_email, contact_info: supplier?.contact_info }
    );
  }
  if (n === "java bakery") {
    return enrichChannelFromSupplier(
      {
        channel: "whatsapp",
        api_base_url: null,
        api_customer_code: null,
        email_to: null,
        email_cc: null,
        email_subject_template: null,
        whatsapp_phone: null,
        whatsapp_use_api: false,
        auto_send: false,
      },
      { name: name ?? "", contact_email: supplier?.contact_email, contact_info: supplier?.contact_info }
    );
  }
  return null;
}

function parseSkuToSupplierFields(sku: string | null): OrderLine["supplier_ingredient"] {
  if (!sku) return null;
  const compact = sku.trim().replace(/\s+/g, "");
  const digitsOnly = compact.replace(/\D/g, "");

  const fromSku: NonNullable<OrderLine["supplier_ingredient"]> = {
    ean_code: null,
    supplier_article_code: null,
    supplier_article_name: null,
    order_unit: null,
    order_unit_size: null,
  };

  if (/^\d{6}[A-Za-z]{2}$/.test(compact)) {
    fromSku.supplier_article_code = compact.slice(0, 6);
    fromSku.order_unit = compact.slice(6).toUpperCase();
    return fromSku;
  }
  if (/^\d{6}$/.test(digitsOnly)) {
    fromSku.supplier_article_code = digitsOnly;
    return fromSku;
  }
  // GTIN-13 / GTIN-14; 12 cijfers (UPC-A) → voorloopnul voor EAN-13
  if (digitsOnly.length === 12 || /^\d{13,14}$/.test(digitsOnly)) {
    const ean = digitsOnly.length === 12 ? `0${digitsOnly}` : digitsOnly;
    if (/^\d{13,14}$/.test(ean)) {
      fromSku.ean_code = ean;
      return fromSku;
    }
  }
  // Keep raw value as article code fallback for custom formats.
  fromSku.supplier_article_code = compact;
  return fromSku;
}

/** GTIN-13/14 from DB or free text; 12-digit UPC-A → leading 0 for EAN-13. */
function normalizeEanDigits(v: string | null | undefined): string | null {
  let d = (v ?? "").trim().replace(/\D/g, "");
  if (d.length === 12) d = `0${d}`;
  return /^\d{13,14}$/.test(d) ? d : null;
}

/**
 * Combines legacy `supplier_sku` parsing with structured columns filled by
 * import-bidfood-articles / Excel review (those paths often omit `supplier_sku`).
 */
function mergeSupplierIngredientForDispatch(row: SupplierIngredientDetails): OrderLine["supplier_ingredient"] {
  const parsed = parseSkuToSupplierFields(row.supplier_sku);
  const out: NonNullable<OrderLine["supplier_ingredient"]> = parsed
    ? { ...parsed }
    : {
        ean_code: null,
        supplier_article_code: null,
        supplier_article_name: null,
        order_unit: null,
        order_unit_size: null,
      };

  const eanCol = normalizeEanDigits(row.ean_code ?? null);
  if (eanCol) out.ean_code = eanCol;

  const artRaw = row.supplier_article_code?.trim();
  if (artRaw) {
    const asEan = normalizeEanDigits(artRaw);
    if (asEan) {
      out.ean_code = out.ean_code ?? asEan;
    } else {
      const compact = artRaw.replace(/\s+/g, "");
      if (/^\d{6}[A-Za-z]{2}$/i.test(compact)) {
        out.supplier_article_code = compact.slice(0, 6);
        if (!out.order_unit) out.order_unit = compact.slice(6).toUpperCase();
      } else {
        out.supplier_article_code = compact;
      }
    }
  }

  const uom = row.order_unit?.trim();
  if (uom) out.order_unit = uom.toUpperCase();

  const nm = row.supplier_article_name?.trim();
  if (nm) out.supplier_article_name = nm;

  if (row.order_unit_size != null) {
    const n =
      typeof row.order_unit_size === "string"
        ? parseFloat(row.order_unit_size)
        : Number(row.order_unit_size);
    if (Number.isFinite(n)) out.order_unit_size = n;
  }

  if (row.bf_is_active != null) out.bf_is_active = row.bf_is_active;
  if (row.bf_last_status?.trim()) out.bf_last_status = row.bf_last_status.trim();

  if (!out.ean_code && !out.supplier_article_code) return null;
  return out;
}

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

function normalizeVanGelderApiRoot(
  explicitOrderUrl: string | null | undefined,
  configuredBaseOrEndpoint: string | null | undefined
): string | null {
  const order = (explicitOrderUrl ?? "").trim();
  if (order) {
    try {
      const u = new URL(order);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* fall through */
    }
  }
  const base = (configuredBaseOrEndpoint ?? "").trim();
  if (!base) return null;
  if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, "");
  return null;
}

function deepFindBooleanByKeys(
  value: unknown,
  keys: Set<string>
): boolean | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFindBooleanByKeys(item, keys);
      if (found != null) return found;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase().replace(/[^a-z]/g, "");
    if (keys.has(key)) {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (
          s === "true" ||
          s === "ja" ||
          s === "yes" ||
          s === "actief" ||
          s === "active"
        ) return true;
        if (
          s === "false" ||
          s === "nee" ||
          s === "no" ||
          s === "niet actief" ||
          s === "inactive" ||
          s === "inactief"
        ) return false;
      }
      if (typeof v === "number") return v !== 0;
    }
    const nested = deepFindBooleanByKeys(v, keys);
    if (nested != null) return nested;
  }
  return null;
}

function resolveVanGelderDelivery(
  channel: ChannelConfig,
  customerCode: string,
  order: Order
): {
  city: string;
  street: string;
  postcode: string;
  country: string;
  name: string;
  klantcode: string;
  houseNumber: string;
  phone: string;
} {
  const db = channel.delivery_address ?? {};
  const customerCodeResolved =
    channel.api_customer_code ?? Deno.env.get("VAN_GELDER_CUSTOMER_CODE") ?? customerCode;
  return {
    city: db.plaats ?? Deno.env.get("VAN_GELDER_DELIVERY_CITY") ?? "",
    street: db.straat ?? Deno.env.get("VAN_GELDER_DELIVERY_STREET") ?? "",
    postcode: db.postcode ?? Deno.env.get("VAN_GELDER_DELIVERY_POSTCODE") ?? "",
    country: db.landcode ?? Deno.env.get("VAN_GELDER_DELIVERY_COUNTRY") ?? "",
    name:
      db.naam ??
      Deno.env.get("VAN_GELDER_DELIVERY_NAME") ??
      `MIMA ${order.location_id.slice(0, 8)}`,
    klantcode:
      db.klantcode ??
      Deno.env.get("VAN_GELDER_DELIVERY_KLANTCODE") ??
      customerCodeResolved ??
      "",
    houseNumber: db.huisnummer ?? Deno.env.get("VAN_GELDER_DELIVERY_HOUSENUMBER") ?? "",
    phone: db.telefoon ?? Deno.env.get("VAN_GELDER_DELIVERY_PHONE") ?? "",
  };
}

async function dispatchVanGelder(
  order: Order,
  channel: ChannelConfig,
  dryRun: boolean
): Promise<DispatchResult> {
  const legacyApiKey = Deno.env.get("VAN_GELDER_API_KEY");
  const subscriptionKey =
    (Deno.env.get("VAN_GELDER_SUBSCRIPTION_KEY_ORDERS") ??
      Deno.env.get("VAN_GELDER_SUBSCRIPTION_KEY") ??
      "")
      .trim() || null;
  const configuredBaseOrEndpoint =
    channel.api_base_url ?? Deno.env.get("VAN_GELDER_BASE_URL");
  const apiRoot =
    Deno.env.get("VAN_GELDER_API_BASE_URL") ??
    normalizeVanGelderApiRoot(Deno.env.get("VAN_GELDER_ORDER_URL"), configuredBaseOrEndpoint);
  const explicitOrderUrl = Deno.env.get("VAN_GELDER_ORDER_URL");
  const orderUrl =
    explicitOrderUrl ??
    (configuredBaseOrEndpoint
      ? /\/api\/orders\/\d+(?:\.\d+)?\/create\/?$/i.test(configuredBaseOrEndpoint)
        ? configuredBaseOrEndpoint
        : `${configuredBaseOrEndpoint.replace(/\/+$/, "")}/orders`
      : null);
  const customerCode =
    channel.api_customer_code ?? Deno.env.get("VAN_GELDER_CUSTOMER_CODE");
  const delivery = resolveVanGelderDelivery(channel, customerCode ?? "", order);

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
    !orderUrl ||
    !customerCode ||
    !delivery.city ||
    !delivery.street ||
    !delivery.postcode ||
    !delivery.country
  ) {
    return {
      success: false,
      channel: "van_gelder_api",
      error:
        "Incomplete Van Gelder config. Required: OAuth credentials (or VAN_GELDER_API_KEY fallback), VAN_GELDER_SUBSCRIPTION_KEY, VAN_GELDER_ORDER_URL (or api_base_url), api_customer_code (of supplier_order_channels), en leveradres (delivery_address in DB of VAN_GELDER_DELIVERY_* envs).",
    };
  }

  let validLines = [...order.order_line_items];
  const skippedReasons: string[] = [];

  // EAN ontbreekt → regel overslaan, rest doorzetten.
  const missingEan = validLines.filter((l) => !l.supplier_ingredient?.ean_code);
  if (missingEan.length > 0) {
    validLines = validLines.filter((l) => Boolean(l.supplier_ingredient?.ean_code));
    skippedReasons.push(
      `EAN-code ontbreekt: ${missingEan.map((l) => l.raw_ingredient.name).join(", ")}`
    );
  }

  let activePriceEans = new Set<string>();
  let statusIndex = new Map<string, VanGelderEanStatusEntry>();

  // Validatie via Prices API op EAN (geen artikelnummer).
  try {
    activePriceEans = await fetchVanGelderActivePriceEans();
    const notOnPriceList = validLines.filter((line) => {
      const ean = line.supplier_ingredient?.ean_code?.trim();
      return !isEanOnActivePriceList(ean, activePriceEans);
    });
    if (notOnPriceList.length > 0) {
      validLines = validLines.filter((line) => !notOnPriceList.includes(line));
      const details = notOnPriceList
        .map((line) => {
          const ean = line.supplier_ingredient?.ean_code?.trim() ?? "?";
          return `${line.raw_ingredient.name} (EAN ${ean}) → niet op actieve VG-prijslijst`;
        })
        .join("; ");
      skippedReasons.push(`EAN niet op Van Gelder prijslijst: ${details}`);
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    skippedReasons.push(`VG prijslijst-check mislukt: ${detail}`);
  }

  // ProductStatus per bestel-EAN (alle varianten onder artikelnummer; inactive/unavailable → skip).
  try {
    const articleIds = new Set<string>();
    for (const line of validLines) {
      const ean = normalizeVanGelderEan(line.supplier_ingredient?.ean_code);
      if (!ean) continue;
      const art = VG_EAN_TO_ARTICLE_ID[ean];
      if (art) articleIds.add(art);
      if (isRedOnionSlicedFineRawName(line.raw_ingredient.name)) {
        const looseArt = VG_EAN_TO_ARTICLE_ID[RED_ONION_VG_LOOSE_EAN];
        if (looseArt) articleIds.add(looseArt);
      }
    }
    if (articleIds.size > 0) {
      statusIndex = await buildVanGelderEanProductStatusIndex(articleIds);
      const blockedStatus = validLines.filter((line) => {
        const ean = normalizeVanGelderEan(line.supplier_ingredient?.ean_code);
        if (!ean) return false;
        const entry = lookupVanGelderEanStatus(ean, statusIndex);
        const ps =
          entry?.productStatus ??
          (line.supplier_ingredient as SupplierIngredientDetails | undefined)?.vg_last_status ??
          "";
        return !isVanGelderEanDispatchAllowed(ps);
      });
      if (blockedStatus.length > 0) {
        validLines = validLines.filter((line) => !blockedStatus.includes(line));
        const details = blockedStatus
          .map((line) => {
            const ean = line.supplier_ingredient?.ean_code?.trim() ?? "?";
            const entry = lookupVanGelderEanStatus(ean, statusIndex);
            const ps =
              entry?.productStatus ??
              (line.supplier_ingredient as SupplierIngredientDetails | undefined)?.vg_last_status ??
              "?";
            const reason = vanGelderSkipReasonForStatus(ps) ?? `ProductStatus ${ps}`;
            return `${line.raw_ingredient.name} (EAN ${ean}) → ${reason}`;
          })
          .join("; ");
        skippedReasons.push(`Niet available in Van Gelder catalogus: ${details}`);
      }
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    skippedReasons.push(`VG ProductStatus-check mislukt: ${detail}`);
  }

  if (validLines.length === 0) {
    return {
      success: false,
      channel: "van_gelder_api",
      error:
        `Geen geldige orderregels over voor Van Gelder. ` +
        `Overgeslagen: ${skippedReasons.join(" | ")}`,
    };
  }

  // Van Gelder Order-JSON v2.1 formaat (zie UPD interface docs)
  const deliveryAddress: Record<string, string> = {
    Naam: delivery.name,
    Klantcode: delivery.klantcode,
    Plaats: delivery.city,
    Straat: delivery.street,
    Huisnummer: delivery.houseNumber,
    Postcode: delivery.postcode,
    Landcode: delivery.country,
  };
  if (delivery.phone.trim()) {
    deliveryAddress.Telefoonnummer = delivery.phone.trim();
  }

  const expansionInfo: string[] = [];
  const regels = validLines.flatMap((line) =>
    expandVanGelderLineToRegels(line, activePriceEans, statusIndex, expansionInfo)
  );

  const orderPayload = {
    Header: {
      Ordernummer: `MIMA-${order.id.slice(0, 8).toUpperCase()}`,
      Debiteurnummer: customerCode,
      Leverdatum: orderDeliveryDate(order), // YYYY-MM-DD
      Email: "",
      Commentaar: order.notes ?? "",
      Routenummer: "",
    },
    LeveringAdres: deliveryAddress,
    Regels: regels.map((regel, idx) => ({
      Regelnummer: String(idx + 1),
      EANCode: regel.ean,
      Aantal: regel.aantal,
    })),
  };

  const expansionSuffix =
    expansionInfo.length > 0 ? ` | Verpakking: ${expansionInfo.join(" | ")}` : "";

  if (dryRun) {
    const warning = skippedReasons.length > 0 ? `Waarschuwing: ${skippedReasons.join(" | ")}` : undefined;
    const base = warning ? `Dry run — niet verstuurd. ${warning}` : "Dry run — niet verstuurd";
    return {
      success: true,
      channel: "van_gelder_api",
      message: `${base}${expansionSuffix}`,
      message_body: JSON.stringify(orderPayload, null, 2),
    };
  }

  const response = await fetch(orderUrl, {
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

  const sentParts: string[] = [];
  if (skippedReasons.length > 0) {
    sentParts.push(`Overgeslagen: ${skippedReasons.join(" | ")}`);
  }
  if (expansionSuffix) {
    sentParts.push(expansionSuffix.replace(/^ \| /, ""));
  }
  return {
    success: true,
    channel: "van_gelder_api",
    supplier_order_number: responseData?.ordernummer ?? responseData?.OrderId,
    message:
      sentParts.length > 0
        ? `Bestelling verstuurd (${regels.length} VG-regel(s)). ${sentParts.join(" | ")}`
        : undefined,
    message_body: JSON.stringify(orderPayload),
  };
}

// ─── Bidfood (A0022 Sales Order API v1.0) ────────────────────────────────────
// Docs: API-A0022-v1-Bidfood_Verkoop_Order_API_version_20251110.yaml
// Prod endpoint: POST https://bas.bidfood.nl/a0022/v1/customers/{customerNumber}/orders
// Sandbox: POST https://bas.staging.bidfood.nl/sandbox/a0022/v1/customers/{customerNumber}/orders (+ header X-Customer-Sandbox: true)
// Auth: Basic Auth (username:password)
// Artikelidentificatie: productId (6-cijferig ARTNUM) + productUom (2-letter code)
//   of skuId (productId+productUom, bijv. "001990TR")
//   of gtin (GTIN-14, 14 cijfers — EAN met voorloopnul)

const BIDFOOD_SANDBOX_DEFAULT_BASE = "https://bas.staging.bidfood.nl/sandbox";
const BIDFOOD_SANDBOX_DEFAULT_CUSTOMER = "000040";

function bidfoodSandboxEnvEnabled(): boolean {
  const v = (Deno.env.get("BIDFOOD_USE_SANDBOX") ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Sandbox: secret BIDFOOD_USE_SANDBOX, of klant 000040 (test-PDF) — nooit prod-URL + sandbox-login. */
function bidfoodShouldUseSandbox(channel: ChannelConfig): boolean {
  if (channel.channel !== "bidfood_api") return false;
  if (bidfoodSandboxEnvEnabled()) return true;
  const customer = (channel.api_customer_code ?? "").trim();
  if (customer === BIDFOOD_SANDBOX_DEFAULT_CUSTOMER) return true;
  const base = (channel.api_base_url ?? "").trim().toLowerCase();
  return bidfoodIsSandboxBaseUrl(base);
}

/** Sandbox-test: override DB-kanaal via secrets i.p.v. productie-klantnummers te migreren. */
function resolveBidfoodChannelForDispatch(channel: ChannelConfig): ChannelConfig {
  if (!bidfoodShouldUseSandbox(channel)) {
    return channel;
  }
  const baseFromEnv = (Deno.env.get("BIDFOOD_SANDBOX_BASE_URL") ?? "").trim().replace(/\/+$/, "");
  const customerFromEnv = (Deno.env.get("BIDFOOD_SANDBOX_CUSTOMER") ?? "").trim();
  return {
    ...channel,
    api_base_url: baseFromEnv || BIDFOOD_SANDBOX_DEFAULT_BASE,
    api_customer_code: customerFromEnv || BIDFOOD_SANDBOX_DEFAULT_CUSTOMER,
  };
}

function bidfoodIsSandboxBaseUrl(baseUrl: string): boolean {
  const u = baseUrl.trim().toLowerCase();
  return u.includes("staging.bidfood.nl") || u.includes("/sandbox");
}

function decodeBidfoodPasswordB64(envName: string): string | null {
  const b64 = (Deno.env.get(envName) ?? "").trim();
  if (!b64) return null;
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    );
  } catch {
    return null;
  }
}

/** Globale fallback: BIDFOOD_PASSWORD_B64 of BIDFOOD_PASSWORD. */
function getBidfoodPasswordGlobal(): string | null {
  const fromB64 = decodeBidfoodPasswordB64("BIDFOOD_PASSWORD_B64");
  if (fromB64) return fromB64;
  const plain = (Deno.env.get("BIDFOOD_PASSWORD") ?? "").trim();
  return plain || null;
}

/** Per klant: BIDFOOD_PASSWORD_B64_074380 (niet PASSWORD_074380_B64). */
function getBidfoodPasswordForCustomer(customerNumber: string): string | null {
  const cn = customerNumber.trim();
  const fromB64 = decodeBidfoodPasswordB64(`BIDFOOD_PASSWORD_B64_${cn}`);
  if (fromB64) return fromB64;
  const plain = (Deno.env.get(`BIDFOOD_PASSWORD_${cn}`) ?? "").trim();
  return plain || null;
}

/** Credentials per klantnummer (BIDFOOD_USERNAME_074380) met fallback naar globale secrets. */
function getBidfoodCredentials(
  customerNumber?: string | null
): { username: string; password: string } | null {
  const cn = (customerNumber ?? "").trim();
  const username = (
    (cn ? Deno.env.get(`BIDFOOD_USERNAME_${cn}`) : null) ??
    Deno.env.get("BIDFOOD_USERNAME") ??
    ""
  ).trim();
  if (!username) return null;

  const password = (cn ? getBidfoodPasswordForCustomer(cn) : null) ?? getBidfoodPasswordGlobal();
  if (!password) return null;
  return { username, password };
}

function bidfoodBasicAuthValue(username: string, password: string): string {
  const userPass = `${username}:${password}`;
  const bytes = new TextEncoder().encode(userPass);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function bidfoodSendSystemNameHeader(): boolean {
  const v = (Deno.env.get("BIDFOOD_SEND_SYSTEM_NAME") ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function bidfoodJsonHeaders(
  credentialsB64: string,
  systemName: string,
  baseUrl: string
): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Basic ${credentialsB64}`,
  };
  const sandbox =
    bidfoodIsSandboxBaseUrl(baseUrl) || bidfoodSandboxEnvEnabled();
  if (sandbox) {
    h["X-Customer-Sandbox"] = "true";
  }
  // BAS weigert system-Name op sandbox én productie (401); alleen optioneel meesturen.
  if (bidfoodSendSystemNameHeader() && systemName) {
    h["system-Name"] = systemName;
  }
  return h;
}

async function dispatchBidfood(
  order: Order,
  channel: ChannelConfig,
  dryRun: boolean
): Promise<DispatchResult> {
  const effectiveChannel = resolveBidfoodChannelForDispatch(channel);
  const customerNumber = effectiveChannel.api_customer_code;
  const creds = getBidfoodCredentials(customerNumber);
  const systemName = Deno.env.get("BIDFOOD_SYSTEM_NAME") ?? "MIMA";
  const baseUrl = (effectiveChannel.api_base_url ?? "https://bas.bidfood.nl").replace(
    /\/+$/,
    ""
  );

  if (!customerNumber) {
    return {
      success: false,
      channel: "bidfood_api",
      error:
        "Bidfood klantnummer ontbreekt voor deze locatie (supplier_order_channels.api_customer_code). Vul in via Admin of migratie 096.",
    };
  }
  if (!creds) {
    return {
      success: false,
      channel: "bidfood_api",
      error:
        `Bidfood inlog ontbreekt voor klant ${customerNumber}. Zet secrets BIDFOOD_USERNAME_${customerNumber} en BIDFOOD_PASSWORD_B64_${customerNumber}.`,
    };
  }

  // Bidfood identificeert producten via:
  //   - productId (6 cijfers) + productUom (2 letters) — voorbeeld uit Bidfood sandbox-mail
  //   - skuId = productId+productUom als één string — zet BIDFOOD_ORDER_USE_SKUID=true om dit te forceren
  //   - gtin = GTIN-14 (EAN met voorloopnul voor 13-cijferige EAN codes)

  const useSkuId =
    (Deno.env.get("BIDFOOD_ORDER_USE_SKUID") ?? "").toLowerCase() === "true" ||
    Deno.env.get("BIDFOOD_ORDER_USE_SKUID") === "1";

  let validLines = [...order.order_line_items];
  const skippedReasons: string[] = [];

  const inactiveLines = validLines.filter((l) => l.supplier_ingredient?.bf_is_active === false);
  if (inactiveLines.length > 0) {
    validLines = validLines.filter((l) => l.supplier_ingredient?.bf_is_active !== false);
    const details = inactiveLines
      .map((line) => {
        const code = line.supplier_ingredient?.supplier_article_code ?? "?";
        const uom = line.supplier_ingredient?.order_unit ?? "?";
        const status = line.supplier_ingredient?.bf_last_status ?? "uit assortiment";
        return `${line.raw_ingredient.name} (${code} ${uom}) → ${status}`;
      })
      .join("; ");
    skippedReasons.push(`Uit Bidfood-assortiment (weekly sync): ${details}`);
  }

  const missingCode = validLines.filter(
    (l) =>
      !l.supplier_ingredient?.supplier_article_code &&
      !l.supplier_ingredient?.ean_code
  );
  if (missingCode.length > 0 && !dryRun) {
    return {
      success: false,
      channel: "bidfood_api",
      error: `Artikelcode ontbreekt voor: ${missingCode.map((l) => l.raw_ingredient.name).join(", ")}. Invullen via Admin → Leveranciers → Artikelcodes.`,
    };
  }

  const orderableLines = validLines.filter(
    (line) =>
      Boolean(line.supplier_ingredient?.supplier_article_code) ||
      Boolean(line.supplier_ingredient?.ean_code)
  );

  if (orderableLines.length === 0) {
    return {
      success: false,
      channel: "bidfood_api",
      error:
        `Geen geldige orderregels over voor Bidfood.` +
        (skippedReasons.length > 0 ? ` Overgeslagen: ${skippedReasons.join(" | ")}` : ""),
    };
  }

  // Bouw Bidfood order payload (A0022 OrderCreate schema)
  const products = orderableLines
    .map((line, idx) => {
    const si = line.supplier_ingredient!;
    const qty = Math.ceil(line.quantity);

    // Bepaal het product identifier
    let productIdentifier: Record<string, string>;
    if (si.supplier_article_code && si.order_unit) {
      if (useSkuId) {
        productIdentifier = { skuId: `${si.supplier_article_code}${si.order_unit}` };
      } else {
        productIdentifier = {
          productId: si.supplier_article_code,
          productUom: si.order_unit,
        };
      }
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
      orderLineReference: String(idx + 1).padStart(2, "0"),
      quantityOrdered: qty,
    };
    });

  const orderPayload = {
    orderReference: `MIMA-${order.id.slice(0, 8).toUpperCase()}`,
    deliveryDate: orderDeliveryDate(order), // YYYY-MM-DD
    products,
  };

  if (dryRun) {
    const parts: string[] = [];
    if (missingCode.length > 0) {
      parts.push(
        `artikelcode ontbreekt voor ${missingCode.length} regel(s): ${missingCode
          .map((l) => l.raw_ingredient.name)
          .join(", ")}`
      );
    }
    if (skippedReasons.length > 0) parts.push(skippedReasons.join(" | "));
    const warning = parts.length > 0 ? parts.join(" | ") : undefined;
    return {
      success: true,
      channel: "bidfood_api",
      message: warning ? `Dry run — niet verstuurd. ${warning}` : "Dry run — niet verstuurd",
      message_body: JSON.stringify(orderPayload, null, 2),
    };
  }

  // POST naar Bidfood Order Create endpoint
  const credentials = bidfoodBasicAuthValue(creds.username, creds.password);
  const response = await fetch(
    `${baseUrl}/a0022/v1/customers/${customerNumber}/orders`,
    {
      method: "POST",
      headers: bidfoodJsonHeaders(credentials, systemName, baseUrl),
      body: JSON.stringify(orderPayload),
    }
  );

  // Prod: vaak 201 + { orders: [...] }; sandbox-doc: 200/201 met orderNumber op root
  const responseData = await response.json().catch(() => ({}));

  if (response.status !== 201 && response.status !== 200) {
    return {
      success: false,
      channel: "bidfood_api",
      error: `Bidfood API ${response.status} (${baseUrl}, klant ${customerNumber}): ${JSON.stringify(responseData)}`,
    };
  }

  // Prod: meerdere orders in `orders[]`; sandbox: één object met `orderNumber` op root
  const bidfoodOrderNumbers =
    responseData?.orders
      ?.map((o: { orderNumber: string | number }) => String(o.orderNumber))
      ?.join(", ") ??
    (responseData?.orderNumber != null ? String(responseData.orderNumber) : undefined);

  return {
    success: true,
    channel: "bidfood_api",
    supplier_order_number: bidfoodOrderNumbers,
    message:
      skippedReasons.length > 0
        ? `Bestelling verstuurd met ${orderableLines.length} regel(s). Overgeslagen: ${skippedReasons.join(" | ")}`
        : undefined,
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
    productId?: string;
    productUom?: string;
    gtin?: string;
    quantityRequested: number;
    deliveryDate: string;
  }>,
  baseUrl = "https://bas.bidfood.nl"
): Promise<
  Array<{
    skuId?: string;
    productId?: string;
    productUom?: string;
    gtin?: string;
    isAvailabilityIssue: boolean;
    firstPossibleDeliveryDate?: string;
    netSkuPrice?: number;
    reasons?: string[];
  }>
> {
  const creds = getBidfoodCredentials(customerNumber);
  const systemName = Deno.env.get("BIDFOOD_SYSTEM_NAME") ?? "MIMA";

  if (!creds) throw new Error("Bidfood credentials ontbreken");

  const root = baseUrl.replace(/\/+$/, "");
  const credentials = bidfoodBasicAuthValue(creds.username, creds.password);
  const response = await fetch(
    `${root}/a0021/v1/customers/${customerNumber}/products/availability/check`,
    {
      method: "POST",
      headers: bidfoodJsonHeaders(credentials, systemName, root),
      body: JSON.stringify({ products: items }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Bidfood availability check mislukt: ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.products ?? [];
}

async function diagnoseBidfoodAvailability(
  order: Order,
  channel: ChannelConfig
): Promise<DispatchResult> {
  const customerNumber = channel.api_customer_code;
  if (!customerNumber) {
    return {
      success: false,
      channel: "bidfood_api",
      error: "Bidfood customer number ontbreekt voor A0021 availability check.",
    };
  }

  const deliveryDate = orderDeliveryDate(order);
  const useSkuId =
    (Deno.env.get("BIDFOOD_ORDER_USE_SKUID") ?? "").toLowerCase() === "true" ||
    Deno.env.get("BIDFOOD_ORDER_USE_SKUID") === "1";

  const items = order.order_line_items
    .map((line) => {
      const si = line.supplier_ingredient;
      if (!si) return null;
      const qty = Math.ceil(line.quantity);
      if (si.supplier_article_code && si.order_unit) {
        if (useSkuId) {
          return {
            skuId: `${si.supplier_article_code}${si.order_unit}`,
            quantityRequested: qty,
            deliveryDate,
          };
        }
        return {
          productId: si.supplier_article_code,
          productUom: si.order_unit,
          quantityRequested: qty,
          deliveryDate,
        };
      }
      if (si.ean_code) {
        return {
          gtin: si.ean_code.length === 13 ? `0${si.ean_code}` : si.ean_code,
          quantityRequested: qty,
          deliveryDate,
        };
      }
      return null;
    })
    .filter((item): item is {
      skuId?: string;
      productId?: string;
      productUom?: string;
      gtin?: string;
      quantityRequested: number;
      deliveryDate: string;
    } => item != null);

  if (items.length === 0) {
    return {
      success: false,
      channel: "bidfood_api",
      error: "Geen Bidfood productcodes gevonden voor A0021 availability check.",
    };
  }

  try {
    const products = await checkBidfoodAvailability(
      customerNumber,
      items,
      (channel.api_base_url ?? "https://bas.bidfood.nl").replace(/\/+$/, "")
    );
    return {
      success: true,
      channel: "bidfood_api",
      message: "A0021 availability check OK",
      message_body: JSON.stringify({ request: { products: items }, response: { products } }, null, 2),
    };
  } catch (e) {
    return {
      success: false,
      channel: "bidfood_api",
      error: e instanceof Error ? e.message : String(e),
      message_body: JSON.stringify({ request: { products: items } }, null, 2),
    };
  }
}

// ─── E-mail (Tuana, Today Food Group) ────────────────────────────────────────

function buildOrderEmailBody(order: Order): string {
  const locationLabel = order.location_name?.trim() || order.location_id;
  const supplierName = (order.supplier?.name ?? "").toLowerCase().trim();
  const isGede = supplierName === "gédé" || supplierName === "gedé";
  const orderNumber = buildOrderNumber(order);
  const lines = order.order_line_items
    .map((line, idx) => {
      const isVg = isVanGelderSupplierName(order.supplier?.name);
      const lineCode = isVg
        ? line.supplier_ingredient?.ean_code ?? null
        : line.supplier_ingredient?.supplier_article_code ??
          line.supplier_ingredient?.supplier_sku ??
          line.supplier_ingredient?.ean_code ??
          null;
      const name = line.supplier_ingredient?.supplier_article_name ?? line.raw_ingredient.name;
      const rawUnit = (line.supplier_ingredient?.order_unit ?? line.unit ?? "").trim();
      const unit =
        isGede && /^(stuk|stuks)$/i.test(rawUnit)
          ? "COLLI"
          : rawUnit;
      const codePrefix = lineCode ? `[${lineCode}] ` : "";
      return `${idx + 1}. ${codePrefix}${name} — ${Math.ceil(line.quantity)} ${unit}`.trim();
    })
    .join("\n");

  return `Hello ${order.supplier.name},

Please deliver this order as soon as possible.
Order number: ${orderNumber}
Location: ${locationLabel}
Order date: ${order.order_date}

${lines}
${order.notes ? `\nNote: ${order.notes}\n` : ""}
Kind regards,
MIMA Kitchen`;
}

async function dispatchEmail(
  order: Order,
  supabase: SupabaseClient,
  channel: ChannelConfig,
  dryRun: boolean
): Promise<DispatchResult> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL") ?? "bestelling@mimafood.nl";

  if (!channel.email_to) {
    return { success: false, channel: "email", error: "email_to not configured." };
  }

  const subjectTemplate = channel.email_subject_template ?? "MIMA order {datum} — ASAP delivery";
  const orderNumber = buildOrderNumber(order);
  const subject = subjectTemplate
    .replace("{ordernummer}", orderNumber)
    .replace("{datum}", new Date().toLocaleDateString("en-GB"))
    .replace("{leverdatum}", orderDeliveryDate(order));

  const body = buildOrderEmailBody(order);
  const managerCc = managerEmailForLocation(order.location_name ?? null);
  const ccList = Array.from(
    new Set([
      ...parseEmailList(channel.email_cc),
      ...(managerCc ? [managerCc] : []),
    ])
  );

  if (dryRun || !resendKey) {
    return {
      success: true,
      channel: "email",
      message: dryRun ? "Dry run - not sent" : "RESEND_API_KEY missing",
      message_body: `To: ${channel.email_to}\nCC: ${ccList.join(", ") || "-"}\nSubject: ${subject}\n\n${body}`,
    };
  }

  // Safety net: avoid accidental duplicate e-mails with identical content in a short window.
  const dedupeSince = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data: dup } = await supabase
    .from("order_dispatches")
    .select("id")
    .eq("supplier_id", order.supplier_id)
    .eq("channel", "email")
    .eq("status", "sent")
    .eq("message_body", body)
    .gte("created_at", dedupeSince)
    .limit(1);
  if ((dup ?? []).length > 0) {
    return {
      success: true,
      channel: "email",
      message: "Duplicate prevention: identical email already sent recently.",
      message_body: body,
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
      cc: ccList,
      subject,
      text: body,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return { success: false, channel: "email", error: `Resend error: ${err}` };
  }

  return {
    success: true,
    channel: "email",
    message: `Sent to ${channel.email_to}`,
    message_body: body,
  };
}

// ─── WhatsApp (Java Bakery) ───────────────────────────────────────────────────

function buildWhatsAppMessage(order: Order): string {
  const locationLabel = order.location_name?.trim() || order.location_id;
  const lines = order.order_line_items
    .map((line) => {
      const articleCode =
        line.supplier_ingredient?.supplier_article_code ??
        line.supplier_ingredient?.supplier_sku ??
        line.supplier_ingredient?.ean_code ??
        null;
      const name = line.supplier_ingredient?.supplier_article_name ?? line.raw_ingredient.name;
      const unit = line.supplier_ingredient?.order_unit ?? line.unit;
      const codePrefix = articleCode ? `[${articleCode}] ` : "";
      return `- ${codePrefix}${name}: ${Math.ceil(line.quantity)} ${unit}`;
    })
    .join("\n");

  return `Hello! MIMA order.\nLocation: ${locationLabel}\nPlease deliver as soon as possible.\n\n${lines}${
    order.notes ? `\n\nNote: ${order.notes}` : ""
  }`;
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      order_id,
      dry_run = false,
      requested_delivery_date = null,
      action = null,
    } = await req.json();

    if (action === "flush_java_queue") {
      const nowHour = amsterdamHourNow();
      if (nowHour < 18) {
        return new Response(
          JSON.stringify({ ok: true, flushed: 0, message: "Too early. Java queue flush starts after 18:00." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: pendingRows, error: pendingErr } = await supabase
        .from("order_dispatches")
        .select("id, order_id")
        .eq("channel", "whatsapp")
        .eq("status", "pending")
        .limit(200);
      if (pendingErr) {
        return new Response(
          JSON.stringify({ error: "Could not load pending Java queue.", detail: pendingErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let flushed = 0;
      const errors: string[] = [];
      for (const row of (pendingRows as { id: string; order_id: string }[]) ?? []) {
        const { data: queuedOrder, error: queuedOrderError } = await supabase
          .from("orders")
          .select(`
            *,
            supplier:suppliers (
              name,
              contact_email,
              contact_info,
              supplier_order_channels (*)
            ),
            order_line_items (
              *,
              raw_ingredient:raw_ingredients (name)
            )
          `)
          .eq("id", row.order_id)
          .single();
        if (queuedOrderError || !queuedOrder) {
          errors.push(`${row.order_id}: order not found`);
          continue;
        }
        const typedQueuedOrder = queuedOrder as Order & { supplier_id: string };
        if ((typedQueuedOrder.supplier?.name ?? "").toLowerCase().trim() !== "java bakery") continue;

        const rawIds = [
          ...new Set((typedQueuedOrder.order_line_items ?? []).map((l) => l.raw_ingredient_id).filter(Boolean)),
        ];
        if (rawIds.length > 0) {
          const { data: siRows } = await supabase
            .from("supplier_ingredients")
            .select(
              "raw_ingredient_id, supplier_sku, ean_code, supplier_article_code, supplier_article_name, order_unit, order_unit_size, bf_is_active, bf_last_status, vg_last_status"
            )
            .eq("supplier_id", typedQueuedOrder.supplier_id)
            .in("raw_ingredient_id", rawIds);
          const byRaw: Record<string, SupplierIngredientDetails> = {};
          for (const s of (siRows as SupplierIngredientDetails[]) ?? []) byRaw[s.raw_ingredient_id] = s;
          typedQueuedOrder.order_line_items = (typedQueuedOrder.order_line_items ?? []).map((li) => ({
            ...li,
            supplier_ingredient: byRaw[li.raw_ingredient_id] ?? null,
            unit: byRaw[li.raw_ingredient_id]?.order_unit ?? li.unit,
          }));
        }

        const channelConfig =
          pickSupplierChannel(typedQueuedOrder.supplier?.supplier_order_channels) ??
          inferChannelFromSupplierName(typedQueuedOrder.supplier?.name, typedQueuedOrder.supplier);
        if (!channelConfig || channelConfig.channel !== "whatsapp") continue;
        const result = await dispatchWhatsApp(
          typedQueuedOrder,
          enrichChannelFromSupplier(channelConfig, typedQueuedOrder.supplier ?? { name: "" }),
          false
        );
        await supabase
          .from("order_dispatches")
          .update({
            status: result.success ? "sent" : "failed",
            dispatched_at: result.success ? new Date().toISOString() : null,
            response_raw: result,
            error_message: result.error ?? null,
            message_body: result.message_body ?? null,
          })
          .eq("id", row.id);
        if (result.success) flushed += 1;
        else errors.push(`${row.order_id}: ${result.error ?? "unknown error"}`);
      }

      return new Response(JSON.stringify({ ok: true, flushed, errors }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order_id) {
      return new Response(JSON.stringify({ error: "order_id vereist" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
      *,
      supplier:suppliers (
        name,
        contact_email,
        contact_info,
        supplier_order_channels (*)
      ),
      order_line_items (
        *,
        raw_ingredient:raw_ingredients (name)
      )
    `)
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Order niet gevonden", detail: orderError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedOrder = order as Order & { supplier_id: string };
    const { data: locationRow } = await supabase
      .from("locations")
      .select("name")
      .eq("id", typedOrder.location_id)
      .single();
    typedOrder.location_name = (locationRow as { name?: string } | null)?.name ?? null;
    if (
      typeof requested_delivery_date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(requested_delivery_date)
    ) {
      typedOrder.requested_delivery_date = requested_delivery_date;
    } else {
      typedOrder.requested_delivery_date = typedOrder.order_date;
    }
    const rawChannel =
      pickSupplierChannel(typedOrder.supplier?.supplier_order_channels) ??
      inferChannelFromSupplierName(typedOrder.supplier?.name, typedOrder.supplier);

    if (!rawChannel) {
      return new Response(
        JSON.stringify({
          error: "Geen bestelkanaal geconfigureerd voor deze leverancier.",
          detail:
            "supplier_order_channels row ontbreekt of kon niet worden gelezen, en supplier name geeft geen bekende fallback.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const channel = enrichChannelFromSupplier(rawChannel, typedOrder.supplier ?? { name: "" });

    const channelForBidfood =
      channel.channel === "bidfood_api" ? resolveBidfoodChannelForDispatch(channel) : channel;

    const lineItems = typedOrder.order_line_items ?? [];
    const rawIds = [...new Set(lineItems.map((l) => l.raw_ingredient_id).filter(Boolean))];
    let supplierIngredientByRawId: Record<string, SupplierIngredientDetails> = {};
    if (rawIds.length > 0) {
      const { data: siRows, error: siError } = await supabase
        .from("supplier_ingredients")
        .select(
          "raw_ingredient_id, supplier_sku, ean_code, supplier_article_code, supplier_article_name, order_unit, order_unit_size, bf_is_active, bf_last_status, vg_last_status"
        )
        .eq("supplier_id", typedOrder.supplier_id)
        .in("raw_ingredient_id", rawIds);
      if (siError) {
        return new Response(
          JSON.stringify({
            error: "Kon supplier_ingredients niet laden voor orderregels.",
            detail: siError.message,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      supplierIngredientByRawId = Object.fromEntries(
        ((siRows as SupplierIngredientDetails[]) ?? []).map((r) => [r.raw_ingredient_id, r])
      );
    }
    const supplierName = typedOrder.supplier?.name ?? "";
    const useVanGelderMerge = isVanGelderSupplierName(supplierName);
    typedOrder.order_line_items = lineItems.map((line) => {
      const row = supplierIngredientByRawId[line.raw_ingredient_id] ?? {
        raw_ingredient_id: line.raw_ingredient_id,
        supplier_sku: null,
      };
      const merged = useVanGelderMerge
        ? mergeVanGelderSupplierIngredient(row)
        : mergeSupplierIngredientForDispatch(row);
      return { ...line, supplier_ingredient: merged };
    });

    if (action === "bidfood_availability_check") {
      const result =
        channel.channel === "bidfood_api"
          ? await diagnoseBidfoodAvailability(typedOrder, channelForBidfood)
          : {
              success: false,
              channel: channel.channel,
              error: "A0021 availability check kan alleen voor Bidfood.",
            };
      return new Response(JSON.stringify({ ok: result.success, ...result }), {
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Maak dispatch log entry
    const { data: dispatch, error: dispatchInsertError } = await supabase
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

    if (dispatchInsertError) {
      return new Response(
        JSON.stringify({
          error: "Kon order_dispatches log niet aanmaken.",
          detail: dispatchInsertError.message,
          hint: "Controleer of channel geldig is en migratie 096 op dit Supabase project staat.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: DispatchResult;

    const isJavaBakery = (typedOrder.supplier?.name ?? "").toLowerCase().trim() === "java bakery";
    const nowHour = amsterdamHourNow();
    const shouldDeferJava =
      channel.channel === "whatsapp" &&
      isJavaBakery &&
      !dry_run &&
      action !== "force_send_java_now" &&
      nowHour < 18;

    if (shouldDeferJava) {
      result = {
        success: true,
        channel: "whatsapp",
        deferred_until_1800: true,
        message: "Order accepted. Java Bakery dispatch is queued for 18:00.",
      };
    } else {
      switch (channel.channel) {
      case "van_gelder_api":
        result = await dispatchVanGelder(typedOrder, channel, dry_run);
        break;
      case "bidfood_api":
        result = await dispatchBidfood(typedOrder, channelForBidfood, dry_run);
        break;
      case "email":
        result = await dispatchEmail(typedOrder, supabase, channel, dry_run);
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
    }

    // Update dispatch log
    if (dispatch) {
      await supabase
        .from("order_dispatches")
        .update({
          status: result.success
            ? dry_run || result.deferred_until_1800
              ? "pending"
              : "sent"
            : "failed",
          dispatched_at:
            result.success && !dry_run && !result.deferred_until_1800
              ? new Date().toISOString()
              : null,
          supplier_order_number: result.supplier_order_number ?? null,
          response_raw: result,
          error_message: result.error ?? null,
          message_body: result.message_body ?? null,
        })
        .eq("id", dispatch.id);
    }

    // Van Gelder / Bidfood: waarschuw manager wanneer regels zijn overgeslagen maar order wel is verstuurd.
    if (
      result.success &&
      !dry_run &&
      (channel.channel === "van_gelder_api" || channel.channel === "bidfood_api") &&
      result.message?.toLowerCase().includes("overgeslagen:")
    ) {
      const skippedPart = result.message.split("Overgeslagen:")[1]?.trim();
      const skippedReasons = skippedPart ? skippedPart.split(" | ").map((s) => s.trim()).filter(Boolean) : [];
      const sentLineCount =
        channel.channel === "bidfood_api"
          ? typedOrder.order_line_items.filter(
              (l) =>
                Boolean(l.supplier_ingredient?.supplier_article_code) ||
                Boolean(l.supplier_ingredient?.ean_code)
            ).length
          : typedOrder.order_line_items.filter((l) => Boolean(l.supplier_ingredient?.ean_code))
              .length;
      const notifyErr = await sendManagerSkippedLinesEmail({
        order: typedOrder,
        locationName: typedOrder.location_name ?? null,
        skippedReasons,
        sentLineCount,
      });
      if (notifyErr) {
        result.message = result.message
          ? `${result.message} | Manager-notificatie: ${notifyErr}`
          : `Manager-notificatie: ${notifyErr}`;
      }
    }

    return new Response(JSON.stringify({ ok: result.success, ...result }), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: "Unhandled dispatch-order error", detail }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
