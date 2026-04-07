/** Minimal CSV field split; supports quoted fields with commas. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isProbablyHeaderRow(cells: string[]): boolean {
  if (cells.length < 2) return false;
  const a = cells[0]!.toLowerCase();
  const b = cells[1]!.toLowerCase();
  const nameLike = /^(product_?name|name|prep_?item|product)$/.test(a);
  const idLike = /^(prep_?item_?id|id|uuid)$/.test(a);
  const qtyLike = /base|quantity|qty|amount|verbruik|hoeveelheid/.test(b);
  return (nameLike || idLike) && qtyLike;
}

export type BaseQuantityCsvRow = { key: string; baseQuantity: number };

export function parseBaseQuantityCsvText(text: string): {
  headerSkipped: boolean;
  rows: BaseQuantityCsvRow[];
  lineErrors: string[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const lineErrors: string[] = [];
  const rows: BaseQuantityCsvRow[] = [];
  let headerSkipped = false;
  let start = 0;
  if (lines.length > 0) {
    const first = parseCsvLine(lines[0]!);
    if (isProbablyHeaderRow(first)) {
      headerSkipped = true;
      start = 1;
    }
  }
  for (let i = start; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    if (cells.length < 2) {
      lineErrors.push(`Line ${i + 1}: need at least 2 columns`);
      continue;
    }
    const key = cells[0]!;
    const qtyRaw = cells[1]!.replace(",", ".");
    const qty = parseFloat(qtyRaw);
    if (!Number.isFinite(qty) || qty < 0) {
      lineErrors.push(`Line ${i + 1}: invalid quantity "${cells[1]}"`);
      continue;
    }
    rows.push({ key: key.trim(), baseQuantity: qty });
  }
  return { headerSkipped, rows, lineErrors };
}

export type LocationPrepRowForCsv = {
  id: string;
  prep_item_id: string;
  base_quantity?: number | null;
  prep_items: { id: string; name: string } | null;
};

export function matchCsvToLocationPrepUpdates(
  csvRows: BaseQuantityCsvRow[],
  locationPrepItems: LocationPrepRowForCsv[]
): { updates: { id: string; base_quantity: number }[]; unmatched: string[] } {
  const nameToRow = new Map<string, LocationPrepRowForCsv>();
  for (const r of locationPrepItems) {
    const n = r.prep_items?.name?.trim().toLowerCase();
    if (n) nameToRow.set(n, r);
  }
  const idToRow = new Map(locationPrepItems.map((r) => [r.prep_item_id, r]));
  const updates: { id: string; base_quantity: number }[] = [];
  const unmatched: string[] = [];
  const seenLinkIds = new Set<string>();

  for (const { key, baseQuantity } of csvRows) {
    let row: LocationPrepRowForCsv | undefined;
    if (UUID_RE.test(key)) {
      row = idToRow.get(key);
    } else {
      row = nameToRow.get(key.toLowerCase());
    }
    if (!row) {
      unmatched.push(key);
      continue;
    }
    if (seenLinkIds.has(row.id)) continue;
    seenLinkIds.add(row.id);
    updates.push({ id: row.id, base_quantity: baseQuantity });
  }
  return { updates, unmatched };
}

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildBaseQuantityTemplateCsv(locationPrepItems: LocationPrepRowForCsv[]): string {
  const header = "product_name,base_quantity";
  const body = locationPrepItems.map((r) => {
    const name = r.prep_items?.name ?? r.prep_item_id;
    const q = r.base_quantity ?? 1;
    return `${escapeCsvCell(name)},${q}`;
  });
  return [header, ...body].join("\n");
}
