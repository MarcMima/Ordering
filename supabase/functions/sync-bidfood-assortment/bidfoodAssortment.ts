import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

export type AssortmentRow = {
  artnum: string;
  uom: string;
  description: string;
  contentDescription: string;
  voorraadcode: string;
  voorraadDesc: string;
  netPriceCents: number;
  eanVe: string;
  eanSe: string;
  replacementCode: string;
  altCode: string;
};

export type MappingRow = {
  id: string;
  supplier_id: string;
  raw_ingredient_id: string;
  supplier_article_code: string | null;
  order_unit: string | null;
  supplier_article_name: string | null;
  raw_ingredient: { name: string } | null;
  supplier: { name: string; location_id: string } | null;
};

export type SyncLineResult = {
  ingredient: string;
  location: string;
  oldCode: string;
  oldUom: string;
  action: "ok" | "updated" | "auto_replaced" | "inactive" | "not_in_file" | "skipped";
  detail: string;
  newCode?: string;
  newUom?: string;
};

export type SyncResult = {
  ok: boolean;
  dryRun: boolean;
  rowsInFile: number;
  mappingsChecked: number;
  mappingsUpdated: number;
  autoReplaced: number;
  inactive: number;
  notInFile: number;
  lines: SyncLineResult[];
  errors: string[];
};

function parsePrice(raw: unknown): number {
  const s = String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function padArt(v: unknown): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.padStart(6, "0").slice(-6);
}

function normUom(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toUpperCase();
}

function pickReplacement(alt: string, repl: string): string {
  const r = padArt(repl);
  if (r && r !== "000000") return r;
  const a = padArt(alt);
  if (a && a !== "000000") return a;
  return "";
}

function isOrderable(voorraadcode: string): boolean {
  return voorraadcode !== "2";
}

export function parseBidfoodType03Xlsx(bytes: Uint8Array): AssortmentRow[] {
  const wb = XLSX.read(bytes, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes("type")) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const rows: AssortmentRow[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const cols = matrix[i] as unknown[];
    if (!cols || cols.length < 12) continue;
    const artnum = padArt(cols[0]);
    const uom = normUom(cols[1]);
    if (!artnum || !uom) continue;

    rows.push({
      artnum,
      uom,
      description: String(cols[4] ?? "").trim(),
      contentDescription: String(cols[5] ?? "").trim(),
      voorraadcode: String(cols[11] ?? "").trim(),
      voorraadDesc: String(cols[12] ?? "").trim(),
      netPriceCents: parsePrice(cols[14]),
      eanVe: String(cols[42] ?? "").trim(),
      eanSe: String(cols[43] ?? "").trim(),
      altCode: padArt(cols[92]),
      replacementCode: pickReplacement(String(cols[92] ?? ""), String(cols[93] ?? "")),
    });
  }

  return rows;
}

function indexAssortment(rows: AssortmentRow[]): Map<string, AssortmentRow> {
  const m = new Map<string, AssortmentRow>();
  for (const r of rows) {
    m.set(`${r.artnum}|${r.uom}`, r);
  }
  return m;
}

function findAssortmentRow(
  byKey: Map<string, AssortmentRow>,
  artnum: string,
  uom: string
): AssortmentRow | null {
  return byKey.get(`${artnum}|${uom}`) ?? null;
}

function normalizeEan(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12) d = `0${d}`;
  return d.length === 13 || d.length === 14 ? d : null;
}

export async function runBidfoodAssortmentSync(params: {
  supabase: SupabaseClient;
  xlsxBytes: Uint8Array;
  dryRun: boolean;
  source: string;
  fileName?: string;
}): Promise<SyncResult> {
  const { supabase, xlsxBytes, dryRun, source, fileName } = params;
  const assortment = parseBidfoodType03Xlsx(xlsxBytes);
  const byKey = indexAssortment(assortment);

  const { data: suppliers, error: supErr } = await supabase
    .from("suppliers")
    .select("id, name, location_id")
    .ilike("name", "%bidfood%");

  if (supErr) throw new Error(supErr.message);

  const supplierIds = (suppliers ?? []).map((s) => s.id);
  if (supplierIds.length === 0) {
    return {
      ok: false,
      dryRun,
      rowsInFile: assortment.length,
      mappingsChecked: 0,
      mappingsUpdated: 0,
      autoReplaced: 0,
      inactive: 0,
      notInFile: 0,
      lines: [],
      errors: ["No Bidfood supplier found in database."],
    };
  }

  const { data: mappings, error: mapErr } = await supabase
    .from("supplier_ingredients")
    .select(
      `id, supplier_id, raw_ingredient_id, supplier_article_code, order_unit, supplier_article_name,
       raw_ingredient:raw_ingredients(name),
       supplier:suppliers(name, location_id)`
    )
    .in("supplier_id", supplierIds)
    .not("supplier_article_code", "is", null);

  if (mapErr) throw new Error(mapErr.message);

  const allMappings = (mappings as MappingRow[]) ?? [];

  // Safety check: if >50% of mappings would be "not in file", the assortment
  // file is likely incomplete or mis-parsed. Abort to prevent mass deactivation.
  if (allMappings.length > 5) {
    let matchCount = 0;
    for (const m of allMappings) {
      const code = padArt(m.supplier_article_code);
      const uom = normUom(m.order_unit);
      if (code && findAssortmentRow(byKey, code, uom)) matchCount++;
    }
    const matchRate = matchCount / allMappings.length;
    if (matchRate < 0.5) {
      throw new Error(
        `Aborting: only ${matchCount}/${allMappings.length} (${Math.round(matchRate * 100)}%) mappings match the assortment file. File may be incomplete.`
      );
    }
  }

  const lines: SyncLineResult[] = [];
  const errors: string[] = [];
  let mappingsUpdated = 0;
  let autoReplaced = 0;
  let inactive = 0;
  let notInFile = 0;

  for (const m of allMappings) {
    const ing = m.raw_ingredient?.name ?? m.raw_ingredient_id;
    const loc = m.supplier?.name ?? "location";
    const oldCode = padArt(m.supplier_article_code);
    const oldUom = normUom(m.order_unit);
    if (!oldCode) continue;

    let row = findAssortmentRow(byKey, oldCode, oldUom);
    let effectiveCode = oldCode;
    const effectiveUom = oldUom;
    let action: SyncLineResult["action"] = "ok";
    let detail = "Active in assortment";
    let replacementApplied = false;

    if (!row) {
      notInFile++;
      action = "not_in_file";
      detail =
        "Not in weekly assortment file — add to Bidfood order list if still needed, or remove mapping.";
      if (!dryRun) {
        await supabase
          .from("supplier_ingredients")
          .update({
            bf_last_checked_at: new Date().toISOString(),
            bf_is_active: false,
            bf_last_status: detail,
            updated_at: new Date().toISOString(),
          })
          .eq("id", m.id);
      }
      lines.push({
        ingredient: ing,
        location: loc,
        oldCode,
        oldUom,
        action,
        detail,
      });
      continue;
    }

    if (!isOrderable(row.voorraadcode)) {
      const repl = row.replacementCode;
      const replRow = repl ? findAssortmentRow(byKey, repl, oldUom) : null;
      if (replRow && isOrderable(replRow.voorraadcode)) {
        effectiveCode = repl;
        row = replRow;
        action = "auto_replaced";
        detail = `Auto-replaced ${oldCode} → ${repl} (${replRow.description})`;
        autoReplaced++;
        replacementApplied = true;
      } else {
        inactive++;
        action = "inactive";
        detail = `Out of assortment (code ${row.voorraadcode}: ${row.voorraadDesc})${
          repl ? `; replacement ${repl} not usable` : ""
        }`;
        if (!dryRun) {
          await supabase
            .from("supplier_ingredients")
            .update({
              bf_last_checked_at: new Date().toISOString(),
              bf_is_active: false,
              bf_last_status: detail,
              bf_replacement_article_code: repl || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", m.id);
        }
        lines.push({
          ingredient: ing,
          location: loc,
          oldCode,
          oldUom,
          action,
          detail,
        });
        continue;
      }
    }

    const ean = normalizeEan(row.eanVe || row.eanSe);
    const articleName = `${row.description} ${row.contentDescription}`.trim();
    // Only update sync-managed (bf_*) and article-code fields.
    // Do NOT overwrite user-managed fields (order_unit, ean_code, notes).
    const patch: Record<string, unknown> = {
      supplier_article_code: effectiveCode,
      supplier_sku: `${effectiveCode}${effectiveUom}`,
      bf_last_checked_at: new Date().toISOString(),
      bf_is_active: true,
      bf_last_status: replacementApplied
        ? `Replaced; now ${row.voorraadDesc || "orderable"}`
        : row.voorraadDesc || "Orderable",
      bf_replacement_article_code: replacementApplied ? oldCode : null,
      updated_at: new Date().toISOString(),
    };
    // Only set article name if it was previously empty
    if (!m.supplier_article_name && articleName) {
      patch.supplier_article_name = articleName;
    }
    // Only set EAN/order_unit if not yet set on the mapping
    if (!m.ean_code && ean) patch.ean_code = ean;
    if (!m.order_unit && effectiveUom) patch.order_unit = effectiveUom;

    if (!dryRun) {
      const { error: upErr } = await supabase
        .from("supplier_ingredients")
        .update(patch)
        .eq("id", m.id);
      if (upErr) {
        errors.push(`${ing}: ${upErr.message}`);
        continue;
      }
    }

    mappingsUpdated++;
    if (action === "ok" && (effectiveCode !== oldCode || articleName !== m.supplier_article_name)) {
      action = "updated";
      detail = "Metadata refreshed from assortment file";
    }

    lines.push({
      ingredient: ing,
      location: loc,
      oldCode,
      oldUom,
      action,
      detail,
      newCode: effectiveCode !== oldCode ? effectiveCode : undefined,
      newUom: effectiveUom,
    });
  }

  const result: SyncResult = {
    ok: errors.length === 0,
    dryRun,
    rowsInFile: assortment.length,
    mappingsChecked: (mappings ?? []).length,
    mappingsUpdated,
    autoReplaced,
    inactive,
    notInFile,
    lines,
    errors,
  };

  if (!dryRun) {
    await supabase.from("bidfood_assortment_runs").insert({
      source,
      file_name: fileName ?? null,
      dry_run: dryRun,
      rows_in_file: assortment.length,
      mappings_checked: result.mappingsChecked,
      mappings_updated: mappingsUpdated,
      auto_replaced: autoReplaced,
      inactive,
      not_in_file: notInFile,
      report_json: {
        inactive: lines.filter((l) => l.action === "inactive"),
        auto_replaced: lines.filter((l) => l.action === "auto_replaced"),
        not_in_file: lines.filter((l) => l.action === "not_in_file"),
      },
    });
  }

  return result;
}

export function formatSyncReportEmail(result: SyncResult, fileName?: string): { subject: string; text: string } {
  const issues = result.lines.filter((l) => l.action !== "ok" && l.action !== "updated");
  const subject = `Bidfood assortment sync${result.dryRun ? " (dry run)" : ""} — ${
    issues.length > 0 ? `${issues.length} attention` : "all OK"
  }`;

  const lines: string[] = [
    `Bidfood assortment sync${result.dryRun ? " (DRY RUN — no database changes)" : ""}`,
    fileName ? `File: ${fileName}` : "",
    "",
    `Rows in file: ${result.rowsInFile}`,
    `Mappings checked: ${result.mappingsChecked}`,
    `Updated: ${result.mappingsUpdated}`,
    `Auto-replaced: ${result.autoReplaced}`,
    `Inactive (needs manual fix): ${result.inactive}`,
    `Not in assortment file: ${result.notInFile}`,
    "",
  ];

  if (result.autoReplaced > 0) {
    lines.push("Auto-replaced:");
    for (const l of result.lines.filter((x) => x.action === "auto_replaced")) {
      lines.push(`- ${l.ingredient} (${l.location}): ${l.detail}`);
    }
    lines.push("");
  }

  if (result.inactive > 0) {
    lines.push("Inactive — ordering blocked until fixed:");
    for (const l of result.lines.filter((x) => x.action === "inactive")) {
      lines.push(`- ${l.ingredient} (${l.location}): ${l.oldCode} ${l.oldUom} — ${l.detail}`);
    }
    lines.push("");
  }

  if (result.notInFile > 0) {
    lines.push("Not in weekly file:");
    for (const l of result.lines.filter((x) => x.action === "not_in_file")) {
      lines.push(`- ${l.ingredient} (${l.location}): ${l.oldCode} ${l.oldUom}`);
    }
    lines.push("");
  }

  if (result.errors.length > 0) {
    lines.push("Errors:");
    for (const e of result.errors) lines.push(`- ${e}`);
  }

  return { subject, text: lines.filter(Boolean).join("\n") };
}

export async function sendReportEmail(params: {
  subject: string;
  text: string;
  to?: string[];
}): Promise<string | null> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL") ?? "ordering@mimafood.nl";
  const to =
    params.to ??
    (Deno.env.get("BIDFOOD_SYNC_REPORT_TO") ?? "abdulhadi@mimafood.nl")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  if (!resendKey) return "RESEND_API_KEY missing";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to,
      subject: params.subject,
      text: params.text,
    }),
  });
  if (!response.ok) return `Resend error: ${await response.text()}`;
  return null;
}

export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}
