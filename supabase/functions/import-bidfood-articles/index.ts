// supabase/functions/import-bidfood-articles/index.ts
//
// Importeert Bidfood artikelen uit de CSV (Type 06) naar:
//   - supplier_ingredients: artikelcode, EAN, UOM, naam, nettoprijs
//   - ingredient_prices: nettoprijs → ingredient_prices tabel
//   - ingredient_nutritional_values: allergenen (als die ontbreken)
//
// De CSV bevat ~130 kolommen; we pakken wat relevant is voor MIMA.
// Separator: puntkomma (;)
//
// Gebruik:
//   POST /functions/v1/import-bidfood-articles
//   Body: { "csv_url": "...", "dry_run": false }
//   OF:  stuur de CSV als base64 in de body: { "csv_base64": "..." }
//
// Typisch gebruik: download de CSV uit Bidfood portal, upload naar Supabase Storage,
// en roep deze function aan met de storage URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ─── CSV kolom indices (0-indexed, op basis van CSV Type 06 demo) ────────────
// Zie: Beschrijving_Bidfood_artikelbericht_03032026jkg_-_Type_06.pdf

const COL = {
  ARTNUM: 0, // Artikelnummer (6 cijfers, met voorloopnullen)
  ARDVKEH: 1, // Verkoopeenheid (UOM, 2 letters, bijv. BB, ZK, KG)
  CFDVEOM: 2, // Omschrijving verkoopeenheid
  MRVOMS: 3, // Merknaam
  ARTOMS: 4, // Omschrijving artikel
  ARTOMIH: 5, // Omschrijving inhoud (bijv. "2,5KG")
  ARDVKFK: 6, // Verkoopfaktor (aantal standaardeenheden per VE)
  ARTSTEH: 7, // Standaard eenheid (kleinste eenheid, bijv. KG)
  CFDSEOM: 8, // Omschrijving standaardeenheid
  ARDLVCD: 9, // Artikelleveringcode
  CFDLVOM: 10, // Levercode omschrijving
  ARDVRCD: 11, // Bestelstatus (0=beschikbaar, 2=uit assortiment etc.)
  CFDVCOM: 12, // Bestelstatus omschrijving
  CFDLDTM: 13, // Leadtime in uren
  CFDNETP: 14, // Nettoprijs (incl. klantconditie) — dit is de werkelijke prijs
  CFDVEAN: 43, // GTIN EAN Verpakkingseenheid (14 cijfers)
  CFDSEAN: 44, // GTIN EAN Standaardeenheid (14 cijfers)
  CFDVNTG: 78, // Netto Gewicht VE
  CFDSNTG: 85, // Netto Gewicht SE
  LARNTGW: 86, // Netto gewicht
  LARNTIH: 87, // Netto inhoud
  // Allergenen (kolom 103+)
  ALLERGEN_SULFIET: 103,
  ALLERGEN_PINDA: 104,
  ALLERGEN_BOOMNOTEN: 105,
  ALLERGEN_MELK: 106,
  ALLERGEN_LACTOSE: 107,
  ALLERGEN_SESAM: 108,
  ALLERGEN_GLUTEN: 109,
  ALLERGEN_MOSTERD: 110,
  ALLERGEN_SELDERIJ: 111,
  ALLERGEN_EI: 112,
  ALLERGEN_WEEKDIEREN: 113,
  ALLERGEN_SCHAALDIEREN: 114,
  ALLERGEN_VIS: 115,
  ALLERGEN_SOJA: 116,
};

type ParsedArticle = {
  artnum: string; // "013147"
  uom: string; // "BB"
  skuId: string; // "013147BB"
  description: string; // "KIPDIJVLEES SCHARR**"
  brand: string;
  contentDescription: string; // "2,5KG"
  salesFactor: number; // 2.5
  standardUnit: string; // "KG"
  deliveryCode: string; // "5" = crossdock
  orderStatus: number; // 0 = beschikbaar
  orderStatusDesc: string;
  leadtimeHours: number;
  netPriceCents: number; // prijs in eurocenten
  eanVe: string; // GTIN-14 VE
  eanSe: string; // GTIN-14 SE
  netWeightKg: number; // netto gewicht VE in kg
  netContentKg: number; // netto inhoud in kg
  allergens: Record<string, string>; // { gluten: "Bevat", melk: "Bevat geen" }
};

function parsePrice(raw: string): number {
  // Bidfood CSV gebruikt komma als decimaalteken: "134,01" → 13401 cents
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  return Math.round(parseFloat(cleaned || "0") * 100);
}

function parseNumber(raw: string): number {
  return parseFloat(raw.replace(",", ".") || "0");
}

function parseCSV(csvText: string): ParsedArticle[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  const articles: ParsedArticle[] = [];

  // Sla de header-rij over (eerste rij)
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    if (cols.length < 50) continue;

    const artnum = (cols[COL.ARTNUM] ?? "").trim().padStart(6, "0");
    const uom = (cols[COL.ARDVKEH] ?? "").trim();

    if (!artnum || artnum === "000000" || !uom) continue;

    articles.push({
      artnum,
      uom,
      skuId: `${artnum}${uom}`,
      description: (cols[COL.ARTOMS] ?? "").trim(),
      brand: (cols[COL.MRVOMS] ?? "").trim(),
      contentDescription: (cols[COL.ARTOMIH] ?? "").trim(),
      salesFactor: parseNumber(cols[COL.ARDVKFK] ?? "1"),
      standardUnit: (cols[COL.ARTSTEH] ?? "").trim(),
      deliveryCode: (cols[COL.ARDLVCD] ?? "").trim(),
      orderStatus: parseInt(cols[COL.ARDVRCD] ?? "0"),
      orderStatusDesc: (cols[COL.CFDVCOM] ?? "").trim(),
      leadtimeHours: parseInt(cols[COL.CFDLDTM] ?? "24"),
      netPriceCents: parsePrice(cols[COL.CFDNETP] ?? "0"),
      eanVe: (cols[COL.CFDVEAN] ?? "").trim(),
      eanSe: (cols[COL.CFDSEAN] ?? "").trim(),
      netWeightKg: parseNumber(cols[COL.CFDVNTG] ?? "0"),
      netContentKg: parseNumber(cols[COL.LARNTIH] ?? "0"),
      allergens: {
        sulfiet: (cols[COL.ALLERGEN_SULFIET] ?? "").trim(),
        pinda: (cols[COL.ALLERGEN_PINDA] ?? "").trim(),
        boomnoten: (cols[COL.ALLERGEN_BOOMNOTEN] ?? "").trim(),
        melk: (cols[COL.ALLERGEN_MELK] ?? "").trim(),
        lactose: (cols[COL.ALLERGEN_LACTOSE] ?? "").trim(),
        sesam: (cols[COL.ALLERGEN_SESAM] ?? "").trim(),
        gluten: (cols[COL.ALLERGEN_GLUTEN] ?? "").trim(),
        mosterd: (cols[COL.ALLERGEN_MOSTERD] ?? "").trim(),
        selderij: (cols[COL.ALLERGEN_SELDERIJ] ?? "").trim(),
        ei: (cols[COL.ALLERGEN_EI] ?? "").trim(),
        weekdieren: (cols[COL.ALLERGEN_WEEKDIEREN] ?? "").trim(),
        schaaldieren: (cols[COL.ALLERGEN_SCHAALDIEREN] ?? "").trim(),
        vis: (cols[COL.ALLERGEN_VIS] ?? "").trim(),
        soja: (cols[COL.ALLERGEN_SOJA] ?? "").trim(),
      },
    });
  }

  return articles;
}

async function importArticles(
  articles: ParsedArticle[],
  bidfoodSupplierId: string,
  dryRun: boolean
): Promise<{ updated: number; skipped: number; errors: string[] }> {
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const article of articles) {
    // Zoek raw_ingredient op naam (case-insensitive fuzzy match)
    // Dit is de moeilijkste stap: Bidfood naam ≠ interne naam.
    // We proberen een match op woorden, en loggen ongematchte artikelen.
    const descWords = article.description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3);

    let ingredientId: string | null = null;

    for (const word of descWords) {
      const { data } = await supabase
        .from("raw_ingredients")
        .select("id, name")
        .ilike("name", `%${word}%`)
        .limit(1)
        .single();

      if (data) {
        ingredientId = data.id;
        break;
      }
    }

    if (!ingredientId) {
      skipped++;
      // Log ongematchte artikelen voor handmatige koppeling
      await supabase
        .from("bidfood_unmatched_articles")
        .upsert(
          {
            artnum: article.artnum,
            sku_id: article.skuId,
            description: article.description,
            brand: article.brand,
            ean_ve: article.eanVe,
            net_price_cents: article.netPriceCents,
            order_status: article.orderStatus,
            last_seen: new Date().toISOString().split("T")[0],
          },
          { onConflict: "artnum" }
        )
        .catch(() => null);
      continue;
    }

    if (dryRun) {
      updated++;
      continue;
    }

    // Update supplier_ingredients
    const { error: siError } = await supabase
      .from("supplier_ingredients")
      .upsert(
        {
          raw_ingredient_id: ingredientId,
          supplier_id: bidfoodSupplierId,
          ean_code: article.eanVe.length === 14 ? article.eanVe : null,
          supplier_article_code: article.artnum,
          supplier_article_name: `${article.description} ${article.contentDescription}`.trim(),
          order_unit: article.uom,
          order_unit_size: article.netWeightKg > 0 ? article.netWeightKg * 1000 : null, // gram
          is_preferred: true,
          notes: `${article.brand} | ${article.orderStatusDesc} | leadtime ${article.leadtimeHours}u`,
        },
        { onConflict: "raw_ingredient_id,supplier_id" }
      );

    if (siError) {
      errors.push(`${article.artnum}: ${siError.message}`);
      continue;
    }

    // Sla nettoprijs op in ingredient_prices
    if (article.netPriceCents > 0 && article.netWeightKg > 0) {
      const packSizeGrams = article.netWeightKg * 1000;

      // Check of prijs is gewijzigd
      const { data: lastPrice } = await supabase
        .from("ingredient_prices")
        .select("price_cents")
        .eq("raw_ingredient_id", ingredientId)
        .eq("supplier_id", bidfoodSupplierId)
        .order("effective_date", { ascending: false })
        .limit(1)
        .single();

      if (!lastPrice || lastPrice.price_cents !== article.netPriceCents) {
        await supabase.from("ingredient_prices").insert({
          raw_ingredient_id: ingredientId,
          supplier_id: bidfoodSupplierId,
          pack_size_grams: packSizeGrams,
          pack_size_label: `${article.contentDescription} (${article.uom})`,
          price_cents: article.netPriceCents,
          price_includes_vat: false,
          effective_date: new Date().toISOString().split("T")[0],
          source: "invoice_import",
          notes: `Bidfood CSV import — ${article.skuId}`,
        });
      }
    }

    updated++;
  }

  return { updated, skipped, errors };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const body = await req.json();
  const { csv_url, csv_base64, dry_run = false } = body;

  // Haal de CSV op
  let csvText: string;
  if (csv_base64) {
    csvText = new TextDecoder("windows-1252").decode(
      Uint8Array.from(atob(csv_base64), (c) => c.charCodeAt(0))
    );
  } else if (csv_url) {
    const resp = await fetch(csv_url);
    const buffer = await resp.arrayBuffer();
    csvText = new TextDecoder("windows-1252").decode(buffer);
  } else {
    return new Response(
      JSON.stringify({ error: "csv_url of csv_base64 vereist" }),
      { status: 400 }
    );
  }

  // Zoek Bidfood supplier ID
  const { data: bidfoodSupplier } = await supabase
    .from("suppliers")
    .select("id")
    .ilike("name", "%bidfood%")
    .single();

  if (!bidfoodSupplier) {
    return new Response(
      JSON.stringify({ error: "Bidfood leverancier niet gevonden in DB" }),
      { status: 404 }
    );
  }

  // Parse en importeer
  const articles = parseCSV(csvText);
  const result = await importArticles(articles, bidfoodSupplier.id, dry_run);

  // Log de import
  await supabase.from("scraper_runs").insert({
    supplier_id: bidfoodSupplier.id,
    supplier_name: "Bidfood",
    status: result.errors.length === 0 ? "success" : "partial",
    prices_updated: result.updated,
    prices_unchanged: result.skipped,
    errors: result.errors.length ? result.errors : null,
    source_url: csv_url ?? "csv_base64_upload",
  });

  return new Response(
    JSON.stringify({
      ok: true,
      dry_run,
      total_in_csv: articles.length,
      matched_and_updated: result.updated,
      skipped_no_match: result.skipped,
      errors: result.errors,
      note:
        result.skipped > 0
          ? `${result.skipped} artikelen niet gematcht. Bekijk de bidfood_unmatched_articles tabel voor handmatige koppeling.`
          : undefined,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
