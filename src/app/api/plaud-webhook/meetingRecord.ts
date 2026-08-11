// Verrijking van het meeting-record (MMMM/MMM/QMM) nadat de webhook taken heeft
// aangemaakt: titel met periode-nummer, Status -> Completed, Present -> aanwezigen.
// Alle drie de meeting-DB's delen dezelfde properties: Name (title), Status
// (status: Planned/Completed), Present (relation -> People), Date (date).
// Deze stap is best-effort: fouten mogen NOOIT de taak-aanmaak laten falen —
// de aanroeper wikkelt finalizeMeetingRecord in try/catch (log-only).

import type { Client } from "@notionhq/client";
import { type MeetingType, normalizeForSection } from "./meetingTypes";

// ---- Pure helpers (los te unit-testen) -------------------------------------

// ISO-8601-weeknummer (Europese standaard: week 1 bevat de eerste donderdag).
// Input is een date-only string (YYYY-MM-DD); 12:00Z-anker voorkomt DST-gedoe.
export function isoWeekNumber(ymd: string): number {
  const d = new Date(`${ymd}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // ma=0 .. zo=6
  d.setUTCDate(d.getUTCDate() - day + 3); // donderdag van deze ISO-week
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Thu = new Date(jan4);
  week1Thu.setUTCDate(jan4.getUTCDate() - jan4Day + 3);
  return 1 + Math.round((d.getTime() - week1Thu.getTime()) / (7 * 24 * 3600 * 1000));
}

// Nieuwe titel per meeting-type, afgeleid van de meeting-datum (YYYY-MM-DD).
// Engels (team-taalregel: Hadi leest mee).
export function meetingRecordTitle(typeKey: MeetingType["key"], ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  if (typeKey === "MMMM") return `MMMM Week ${isoWeekNumber(ymd)}`;
  if (typeKey === "MMM") {
    const month = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, 15))
    );
    return `MMM ${month} ${y}`;
  }
  return `QMM Q${Math.floor((m - 1) / 3) + 1} ${y}`;
}

// Alleen hernoemen als de titel nog de (native duplicate-)templatetitel is —
// een handmatig aangepaste titel blijft van de mens.
export function isTemplateTitle(typeKey: MeetingType["key"], title: string): boolean {
  const t = title.trim().toUpperCase();
  if (t === "") return true;
  if (typeKey === "MMMM") return t === "MMMM WEEK" || t === "MMMM";
  if (typeKey === "MMM") return t === "MMM MAAND" || t === "MMM";
  return t === "QMM KWARTAAL" || t === "QMM";
}

// Aanwezigen-heuristiek: namen die voorkomen in de DOMAIN UPDATES-sectie van de
// summary (daar spreken de aanwezigen; de to-do/decision-secties noemen ook
// owners die afwezig kunnen zijn). Best-effort — Marc kan Present altijd zelf
// bijwerken in Notion.
export function detectAttendees(summary: string, names: string[]): string[] {
  const norm = normalizeForSection(summary);
  const start = norm.indexOf("DOMAIN UPDATES");
  if (start < 0) return [];
  let end = norm.length;
  for (const heading of ["NEW TO-DO", "DECISIONS MADE"]) {
    const i = norm.indexOf(heading, start + 1);
    if (i > start && i < end) end = i;
  }
  const section = norm.slice(start, end);
  return names.filter((name) => new RegExp(`\\b${name.toUpperCase()}\\b`).test(section));
}

// ---- Notion-write -----------------------------------------------------------

function plain(rich: Array<{ plain_text?: string }> | undefined): string {
  return (rich ?? []).map((t) => t.plain_text ?? "").join("");
}

// Werkt het meeting-record bij: titel (alleen als nog templatetitel), Status ->
// Completed, Present -> unie van bestaande relaties + gedetecteerde aanwezigen.
// Geeft terug wat er is aangepast (voor de response/logging).
export async function finalizeMeetingRecord(
  notion: Client,
  type: MeetingType,
  meetingPageId: string,
  summary: string,
  people: Record<string, string>,
  fallbackYmd: string
): Promise<{ renamed: string | null; completed: boolean; present: string[] }> {
  const page = (await notion.pages.retrieve({ page_id: meetingPageId })) as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: Record<string, any>;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {};
  const result: { renamed: string | null; completed: boolean; present: string[] } = {
    renamed: null,
    completed: false,
    present: [],
  };

  // 1. Titel: "MMMM Week 33" / "MMM August 2026" / "QMM Q3 2026".
  const currentTitle = plain(page.properties?.Name?.title);
  const dateStart: string | undefined = page.properties?.Date?.date?.start;
  const ymd = (dateStart ?? fallbackYmd).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd) && isTemplateTitle(type.key, currentTitle)) {
    const newTitle = meetingRecordTitle(type.key, ymd);
    if (newTitle !== currentTitle) {
      properties["Name"] = { title: [{ text: { content: newTitle } }] };
      result.renamed = newTitle;
    }
  }

  // 2. Status: de meeting heeft plaatsgevonden (er is een opname verwerkt).
  const currentStatus: string | undefined = page.properties?.Status?.status?.name;
  if (currentStatus !== "Completed") {
    properties["Status"] = { status: { name: "Completed" } };
    result.completed = true;
  }

  // 3. Present: unie van bestaande relaties en namen uit DOMAIN UPDATES.
  const existingIds: string[] = (page.properties?.Present?.relation ?? []).map(
    (r: { id: string }) => r.id
  );
  const detected = detectAttendees(summary, Object.keys(people));
  const detectedIds = detected.map((n) => people[n]).filter(Boolean);
  const union = Array.from(new Set([...existingIds, ...detectedIds]));
  if (union.length > existingIds.length) {
    properties["Present"] = { relation: union.map((id) => ({ id })) };
    result.present = detected;
  }

  if (Object.keys(properties).length > 0) {
    await notion.pages.update({ page_id: meetingPageId, properties });
  }
  return result;
}
