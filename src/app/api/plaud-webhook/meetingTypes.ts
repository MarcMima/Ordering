// Pure, side-effect-vrije logica voor de Plaud-webhook meeting-type routing.
// GEEN Notion/Next/Anthropic imports -> los te unit-testen (geen drift met de route).

export type Period = "week" | "month" | "quarter";

export type MeetingType = {
  key: "MMMM" | "MMM" | "QMM";
  keyword: RegExp; // titel-laag: los woord, woordgrens, case-insensitief
  transcriptPhrase: RegExp; // transcript-laag: VOLLEDIGE AutoFlow-frase (geen los woord)
  meetingDbId: string;
  taskRelation: string; // relatie-property op de Tasks-DB
  horizon: "Operational" | "Tactical" | "Strategic";
  period: Period;
  cadence: string; // "weekly" | "monthly" | "quarterly" (voor de Claude-prompt)
};

// AutoFlow triggert alleen als de meeting-frase hardop klinkt in de opening (<=60s).
// 60s spraak ~= 900-1000 tekens; met marge kijken we in de eerste 1500 tekens.
export const TRANSCRIPT_WINDOW = 1500;

// Geverifieerd via de Notion API (titel + Date-property bevestigd).
export const MMMM_DB_ID = "35e21d9d-7c6a-808d-ab9e-de35fbe85b92";
export const MMM_DB_ID = "39c21d9d-7c6a-80ae-8178-f531269a51a7";
export const QMM_DB_ID = "39c21d9d-7c6a-80e3-8707-f6bb6f9dc5b1";

// Precedence: Quarterly > Monthly > Weekly — eerste match wint bij dubbelzinnige input.
// Titel-laag: los woord (de AI-titel bevat geen frases). Transcript-laag: de VOLLEDIGE
// AutoFlow-frase (\s+ tussen woorden vangt spatie/interpunctie-variatie uit de transcriptie),
// zodat incidenteel "monthly"/"quarterly" in een MMMM-gesprek niet fout routeert.
export const MEETING_TYPES: MeetingType[] = [
  { key: "QMM", keyword: /\bquarterly\b/i, transcriptPhrase: /quarterly\s+mima\s+meeting/i, meetingDbId: QMM_DB_ID, taskRelation: "Created in QMM", horizon: "Strategic", period: "quarter", cadence: "quarterly" },
  { key: "MMM", keyword: /\bmonthly\b/i, transcriptPhrase: /mima\s+monthly\s+meeting/i, meetingDbId: MMM_DB_ID, taskRelation: "Created in MMM", horizon: "Tactical", period: "month", cadence: "monthly" },
  { key: "MMMM", keyword: /\bweekly\b/i, transcriptPhrase: /mima\s+monday\s+morning\s+meeting/i, meetingDbId: MMMM_DB_ID, taskRelation: "Created in meeting", horizon: "Operational", period: "week", cadence: "weekly" },
];

// Twee-laags detectie (precedence Q>M>W in beide lagen):
//  1) VOLLEDIGE AutoFlow-frase in de eerste TRANSCRIPT_WINDOW tekens — leidend, want
//     deterministisch en vals-positief-vrij (AutoFlow vuurde alleen omdat de frase is
//     uitgesproken). Voorkomt dat een dubbelzinnige titel (bv. "Weekly Meeting: Monthly
//     Numbers") fout routeert.
//  2) anders: titel bevat weekly/monthly/quarterly (los woord) — fallback voor opnames
//     die zonder AutoFlow zijn verwerkt en dus geen gegarandeerde frase hebben.
//  3) anders null (de handler behandelt dit als foutgeval: Sync Log Failed + alert)
export function detectMeetingType(title: string, transcript = ""): MeetingType | null {
  const head = (transcript ?? "").slice(0, TRANSCRIPT_WINDOW);
  for (const mt of MEETING_TYPES) if (mt.transcriptPhrase.test(head)) return mt;
  const t = title ?? "";
  for (const mt of MEETING_TYPES) if (mt.keyword.test(t)) return mt;
  return null;
}

// Normaliseer apostrof-varianten/casing voor sectiedetectie.
export function normalizeForSection(s: string): string {
  return s.toUpperCase().replace(/[‘’ʼ`]/g, "'");
}

// Structuur-validatie: ALLEEN op "DOMAIN UPDATES" (identiek in alle meeting-templates,
// ongeacht type). Bewust NIET afhankelijk van "NEW TO-DO'S THIS WEEK/MONTH/QUARTER",
// zodat MMM/QMM-opnames niet worden afgewezen op hun tijdsaanduiding.
export function isValidSummary(summary: string): boolean {
  return normalizeForSection(summary).includes("DOMAIN UPDATES");
}

// Date-only venster (Europe/Amsterdam) voor de periode die create_time bevat.
// week = ma..zo, month = 1e..laatste, quarter = 1e..laatste van het kwartaal.
export function amsterdamPeriodWindow(
  createTimeIso: string,
  period: Period
): { start: string; end: string } {
  const d = new Date(createTimeIso);
  const amsDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d); // YYYY-MM-DD
  const [Y, M] = amsDate.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1-based

  if (period === "week") {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Amsterdam", weekday: "short" }).format(d);
    const idx: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const off = idx[weekday] ?? 0;
    // Anker op 12:00Z zodat dag-rekenwerk niet over een DST-grens schuift.
    const base = new Date(`${amsDate}T12:00:00Z`);
    const monday = new Date(base);
    monday.setUTCDate(base.getUTCDate() - off);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const ymd = (x: Date) => x.toISOString().slice(0, 10);
    return { start: ymd(monday), end: ymd(sunday) };
  }
  if (period === "month") {
    return { start: `${Y}-${pad(M)}-01`, end: `${Y}-${pad(M)}-${pad(lastDay(Y, M))}` };
  }
  // quarter
  const q = Math.floor((M - 1) / 3);
  const sm = q * 3 + 1;
  const em = sm + 2;
  return { start: `${Y}-${pad(sm)}-01`, end: `${Y}-${pad(em)}-${pad(lastDay(Y, em))}` };
}

// Claude-extractie-prompt per type. De VALIDATIE hangt hier niet vanaf; de cadence
// geeft Claude alleen context (helpt deadline-redenering). De to-do-sectie wordt
// generiek benoemd ("NEW TO-DO'S ...") zodat de exacte tijdsaanduiding niet hoeft te
// matchen — robuust tegen één gedeeld template.
export function buildSystemPrompt(type: MeetingType): string {
  return `You convert the action items of a ${type.cadence} team meeting into structured records.

STRICT 1-TO-1 MAPPING — THIS IS THE CORE RULE:
The "NEW TO-DO'S" section in the SUMMARY (its heading begins with "NEW TO-DO'S") contains one bullet line (starting with "•") per task. You MUST emit EXACTLY ONE output object for EACH such bullet line, in the same order. Do not skip any bullet. Do not summarise, group, or combine bullets. Do not decide which bullets are "worth" keeping — the task set IS the set of bullets, period. If there are N bullet lines, you return N objects (minus only literal duplicates, see below).

The ONLY permitted reduction: if two bullet lines are a WORD-FOR-WORD identical copy of each other (same action, same object, AND same owner — a literal duplicate Plaud emitted twice), output one object for them. If ANYTHING differs — different owner, different object, different wording, different scope, location or context — they are SEPARATE tasks and BOTH must be emitted. When in doubt, keep both. A duplicate the reviewer dismisses is acceptable; a lost task is not.

SCOPE: Use ONLY the bullets under the "NEW TO-DO'S" heading. That section ENDS at the next heading — typically "DECISIONS MADE ..." or "DOMAIN UPDATES". Bullets under "DECISIONS MADE ..." are past decisions, NOT action items — do NOT turn them into tasks. Likewise ignore "DOMAIN UPDATES", anything else in the summary, and the transcript. Use the TRANSCRIPT only as context to enrich each to-do bullet (domain, priority, deadline). Invent nothing.

YOUR JOB is to ENRICH each bullet, not to filter it. For every bullet, return an object with:
- "task": the cleaned-up task text (concise, imperative) — the same action as the bullet, just tidied.
- "original_bullet": the literal bullet line it came from, verbatim (including the "• " and the "– Owner: X" tail), for traceability.
- "owner": one of "Marc" | "Michiel" | "Hadi" | null. Read it from the "– Owner: X" marker on the bullet. If absent/unclear, use null.
- "domain": choose EXACTLY ONE of: Locations, Product development, Catering, Marketing, Systems, Finance, HR, Operations. Pick the best fit based on the task's content.
- "priority": one of "P1 (High)" | "P2 (Medium)" | "P3 (Low)". DEFAULT to "P2 (Medium)". Use "P1 (High)" ONLY when there is a hard/near deadline or explicit urgency. Use "P3 (Low)" only when explicitly optional/low/"someday".
- "deadline": an ISO date "YYYY-MM-DD" or null. Derive from explicit dates, or from relative language such as "by end of tomorrow", computed relative to the MEETING DATE provided.

OUTPUT: Respond with ONLY a JSON array of these objects. No prose, no explanation, no markdown code fences.`;
}
