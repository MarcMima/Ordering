import type { HaccpBereidenMetingRow, HaccpBereidenRow } from "@/lib/haccp/types";

function jsonHasData(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  return raw.some((r: HaccpBereidenMetingRow) => {
    if (!r || typeof r !== "object") return false;
    const t = r.temp;
    if (t != null && Number.isFinite(Number(t))) return true;
    if (r.paraaf?.trim()) return true;
    if (r.product?.trim()) return true;
    if (r.datum?.trim()) return true;
    return false;
  });
}

/** Heuristic: week has meaningful entries (for HACCP overview “Done”). */
export function isBereidenWeekComplete(row: HaccpBereidenRow | null): boolean {
  if (!row) return false;
  if (row.terugkoelen_paraaf?.trim() || row.serveertemp_paraaf?.trim()) return true;
  if (row.terugkoelen_temp_begin != null && Number.isFinite(Number(row.terugkoelen_temp_begin))) return true;
  if (row.serveertemp_warm != null || row.serveertemp_koud != null) return true;
  if (row.regenereer_tijd_minuten != null && Number.isFinite(Number(row.regenereer_tijd_minuten))) return true;
  if (jsonHasData(row.kerntemp_gegaard)) return true;
  if (jsonHasData(row.kerntemp_warmhoud)) return true;
  if (jsonHasData(row.frituur_metingen)) return true;
  if (jsonHasData(row.regenereer_metingen)) return true;
  if (jsonHasData(row.buffet_warm)) return true;
  if (jsonHasData(row.buffet_koud)) return true;
  return false;
}
