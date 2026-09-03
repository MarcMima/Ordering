// Pure, side-effect-vrije logica voor de Plaud-webhook meeting-type routing.
// GEEN Notion/Next/Anthropic imports -> los te unit-testen (geen drift met de route).

export type Period = "week" | "month" | "quarter";
export type MeetingKey = "MMMM" | "MMM" | "QMM";

export type MeetingType = {
  key: MeetingKey;
  label: "Weekly" | "Monthly" | "Quarterly"; // = Sync Log "Meeting type"
  keyword: RegExp; // titel-laag: los woord, woordgrens, case-insensitief
  strongPhrases: RegExp[]; // transcript-laag: uitgesproken meeting-naam, volgorde-tolerant
  weakWords: RegExp; // transcript-laag: alleen in de openingszinnen (OPENING_WINDOW)
  meetingDbId: string;
  taskRelation: string; // relatie-property op de Tasks-DB
  horizon: "Operational" | "Tactical" | "Strategic";
  period: Period;
  cadence: string; // "weekly" | "monthly" | "quarterly" (voor de Claude-prompt)
};

// Venster waarin de meeting-naam wordt gezocht. De naam hoort in de opening te vallen
// (<=60s spraak ~ 900-1000 tekens), maar opnames die te vroeg starten of merges hebben
// ruis vooraf; daarom ruim: de eerste 4000 tekens.
export const TRANSCRIPT_WINDOW = 4000;
// Losse woorden (weekly/monthly/quarterly) tellen alleen in de echte openingszinnen,
// anders routeert "the monthly numbers" in een MMMM-gesprek verkeerd.
export const OPENING_WINDOW = 600;
// Onder deze duur is een opname per definitie geen management-meeting (memo, telefoontje).
export const MIN_MEETING_SECONDS = 15 * 60;
// Zonder duur-info: een transcript korter dan dit is ook geen meeting.
export const MIN_MEETING_TRANSCRIPT_CHARS = 8000;

// Geverifieerd via de Notion API (titel + Date-property bevestigd).
export const MMMM_DB_ID = "35e21d9d-7c6a-808d-ab9e-de35fbe85b92";
export const MMM_DB_ID = "39c21d9d-7c6a-80ae-8178-f531269a51a7";
export const QMM_DB_ID = "39c21d9d-7c6a-80e3-8707-f6bb6f9dc5b1";

// Precedence: Quarterly > Monthly > Weekly — eerste match wint bij dubbelzinnige input.
// strongPhrases zijn bewust tolerant voor woordvolgorde en tussenwoorden: mensen zeggen
// "the monthly Mima meeting", "Mima's monthly meeting", "Monthly Mima Meeting" door elkaar.
// Transcriptie plakt soms woorden dubbel ("Monthly Monthly Mima Meeting meeting") — de
// \s+ en [\s\S]{0,N} vangen dat.
export const MEETING_TYPES: MeetingType[] = [
  {
    key: "QMM",
    label: "Quarterly",
    keyword: /\bquarterly\b/i,
    strongPhrases: [
      /quarterly[\s\S]{0,25}mima[\s\S]{0,25}meeting/i,
      /mima[\s\S]{0,25}quarterly[\s\S]{0,25}meeting/i,
      /\bQMM\b/,
      /strategic\s+meeting/i,
    ],
    weakWords: /\bquarterly\b/i,
    meetingDbId: QMM_DB_ID,
    taskRelation: "Created in QMM",
    horizon: "Strategic",
    period: "quarter",
    cadence: "quarterly",
  },
  {
    key: "MMM",
    label: "Monthly",
    keyword: /\bmonthly\b/i,
    strongPhrases: [
      /mima[\s\S]{0,25}monthly[\s\S]{0,25}meeting/i,
      /monthly[\s\S]{0,25}mima[\s\S]{0,25}meeting/i,
      /\bMMM\b/,
      /tactical\s+meeting/i,
    ],
    weakWords: /\bmonthly\b/i,
    meetingDbId: MMM_DB_ID,
    taskRelation: "Created in MMM",
    horizon: "Tactical",
    period: "month",
    cadence: "monthly",
  },
  {
    key: "MMMM",
    label: "Weekly",
    keyword: /\bweekly\b/i,
    strongPhrases: [
      /monday\s+morning\s+meeting/i,
      /mima[\s\S]{0,25}weekly[\s\S]{0,25}meeting/i,
      /weekly[\s\S]{0,25}mima[\s\S]{0,25}meeting/i,
      /\bMMMM\b/,
      /operational\s+meeting/i,
    ],
    weakWords: /\bweekly\b/i,
    meetingDbId: MMMM_DB_ID,
    taskRelation: "Created in meeting",
    horizon: "Operational",
    period: "week",
    cadence: "weekly",
  },
];

export function meetingTypeByKey(key: string | null | undefined): MeetingType | null {
  if (!key) return null;
  const k = key.trim().toUpperCase();
  return MEETING_TYPES.find((m) => m.key === k) ?? null;
}

// Drie-laags deterministische detectie (precedence Q>M>W in elke laag):
//  1) sterke frase (de meeting-naam) in de eerste TRANSCRIPT_WINDOW tekens;
//  2) los woord weekly/monthly/quarterly in de echte opening (OPENING_WINDOW);
//  3) titel bevat weekly/monthly/quarterly (los woord).
// Geeft null als niets matcht; de route probeert dan de Claude-classificatie.
export function detectMeetingType(title: string, transcript = ""): MeetingType | null {
  const head = (transcript ?? "").slice(0, TRANSCRIPT_WINDOW);
  for (const mt of MEETING_TYPES) if (mt.strongPhrases.some((re) => re.test(head))) return mt;
  const opening = head.slice(0, OPENING_WINDOW);
  for (const mt of MEETING_TYPES) if (mt.weakWords.test(opening)) return mt;
  const t = title ?? "";
  for (const mt of MEETING_TYPES) if (mt.keyword.test(t)) return mt;
  return null;
}

// Normaliseer apostrof-varianten/casing voor sectiedetectie.
export function normalizeForSection(s: string): string {
  return s.toUpperCase().replace(/[‘’ʼ`]/g, "'");
}

// Structuur-signaal: "DOMAIN UPDATES" staat alleen in de meeting-templates. Aanwezig =>
// zeker een management-meeting. Afwezig zegt sinds 09-2026 NIETS meer (verkeerde
// AutoFlow-template komt voor) — de route beslist dan op duur + classificatie.
export function isValidSummary(summary: string): boolean {
  return normalizeForSection(summary ?? "").includes("DOMAIN UPDATES");
}

// Heeft de summary de to-do-sectie waar de 1-op-1 template-extractie op draait?
export function hasTodoSection(summary: string): boolean {
  return /NEW TO-DO/.test(normalizeForSection(summary ?? ""));
}

// Is dit qua omvang überhaupt een meeting-kandidaat? (duur leidend, anders transcriptlengte)
export function isMeetingSized(durationSec: number | null | undefined, transcript: string): boolean {
  if (typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0) {
    return durationSec >= MIN_MEETING_SECONDS;
  }
  return (transcript ?? "").length >= MIN_MEETING_TRANSCRIPT_CHARS;
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

// ---- Prompts ---------------------------------------------------------------

const TASK_FIELDS_SPEC = `- "task": the cleaned-up task text (concise, imperative) — the same action as the bullet, just tidied.
- "original_bullet": the literal bullet line it came from, verbatim (including the "• " and the "– Owner: X" tail), for traceability.
- "owner": one of "Marc" | "Michiel" | "Hadi" | null. Read it from the "– Owner: X" marker on the bullet. If absent/unclear, use null.
- "domain": choose EXACTLY ONE of: Locations, Product development, Catering, Marketing, Systems, Finance, HR, Operations. Pick the best fit based on the task's content.
- "priority": one of "P1 (High)" | "P2 (Medium)" | "P3 (Low)". DEFAULT to "P2 (Medium)". Use "P1 (High)" ONLY when there is a hard/near deadline or explicit urgency. Use "P3 (Low)" only when explicitly optional/low/"someday".
- "deadline": an ISO date "YYYY-MM-DD" or null. Derive from explicit dates, or from relative language such as "by end of tomorrow", computed relative to the MEETING DATE provided.`;


// Route A (template): Claude-extractie op de "NEW TO-DO'S"-bullets van de AutoFlow-summary.
// De VALIDATIE hangt hier niet vanaf; de cadence geeft Claude alleen context.
export function buildSystemPrompt(type: MeetingType): string {
  return `You convert the action items of a ${type.cadence} team meeting into structured records.

STRICT 1-TO-1 MAPPING — THIS IS THE CORE RULE:
The "NEW TO-DO'S" section in the SUMMARY (its heading begins with "NEW TO-DO'S") contains one bullet line (starting with "•") per task. You MUST emit EXACTLY ONE output object for EACH such bullet line, in the same order. Do not skip any bullet. Do not summarise, group, or combine bullets. Do not decide which bullets are "worth" keeping — the task set IS the set of bullets, period. If there are N bullet lines, you return N objects (minus only literal duplicates, see below).

The ONLY permitted reduction: if two bullet lines are a WORD-FOR-WORD identical copy of each other (same action, same object, AND same owner — a literal duplicate Plaud emitted twice), output one object for them. If ANYTHING differs — different owner, different object, different wording, different scope, location or context — they are SEPARATE tasks and BOTH must be emitted. When in doubt, keep both. A duplicate the reviewer dismisses is acceptable; a lost task is not.

SCOPE: Use ONLY the bullets under the "NEW TO-DO'S" heading. That section ENDS at the next heading — typically "DECISIONS MADE ..." or "DOMAIN UPDATES". Bullets under "DECISIONS MADE ..." are past decisions, NOT action items — do NOT turn them into tasks. Likewise ignore "DOMAIN UPDATES", anything else in the summary, and the transcript. Use the TRANSCRIPT only as context to enrich each to-do bullet (domain, priority, deadline). Invent nothing.

YOUR JOB is to ENRICH each bullet, not to filter it. For every bullet, return an object with:
${TASK_FIELDS_SPEC}

OUTPUT: Respond with ONLY a JSON array of these objects. No prose, no explanation, no markdown code fences.`;
}

// Route B (transcript): geen bruikbare to-do-sectie in de summary (verkeerde AutoFlow-
// template, geen AutoFlow, of watchdog-aanlevering). Claude haalt de actiepunten dan
// rechtstreeks uit het transcript. Minder deterministisch dan route A; de taken landen
// als "Drafts for review", dus het menselijke reviewmoment blijft de vangrail.
export function buildTranscriptSystemPrompt(type: MeetingType): string {
  return `You extract the action items (to-do's) agreed in a ${type.cadence} management meeting of Mima (a fresh Mediterranean restaurant group in Amsterdam with locations Zuidas, De Pijp and West). The management team is Marc, Michiel and Hadi. The meeting is in English; the transcript has speaker labels and may contain transcription errors.

There is NO structured to-do list available for this meeting, so you must identify the action items yourself from the TRANSCRIPT (and, if present, an unstructured SUMMARY that may list "ACTION ITEMS" — use it as a checklist, but the transcript is authoritative).

WHAT COUNTS AS AN ACTION ITEM: a concrete thing that a person commits to do, is asked to do, or that the group agrees must be done, after this meeting. Include items even when the owner is unclear (owner = null). Include follow-ups such as "look into X", "share Y with Z", "decide on W next meeting".
WHAT DOES NOT COUNT: status updates about work already done, opinions, general observations, decisions that require no further action, and things explicitly dropped or postponed indefinitely.

COMPLETENESS OVER PRECISION: a missed task is worse than an extra one — a reviewer will dismiss extras. Do not merge distinct tasks; if two items differ in owner, object, location or scope they are separate tasks. Do not invent tasks that were not discussed.

For every action item, return an object with:
${TASK_FIELDS_SPEC.replace(
    '"original_bullet": the literal bullet line it came from, verbatim (including the "• " and the "– Owner: X" tail), for traceability.',
    '"original_bullet": a short verbatim quote (max 200 characters) from the transcript where this action item was agreed, prefixed with the speaker label, for traceability.'
  ).replace(
    'Read it from the "– Owner: X" marker on the bullet. If absent/unclear, use null.',
    "Use the person who committed to it or was asked to do it. Map speaker labels to names using the conversation (e.g. someone addressed as Hadi). If unclear, use null."
  )}

OUTPUT: Respond with ONLY a JSON array of these objects, in the order the items came up in the meeting. No prose, no explanation, no markdown code fences. If there are genuinely no action items, return [].`;
}


// Classificatie-fallback: de regexes vonden niets, maar de opname is meeting-formaat.
// Kleine, goedkope call op de opening van het transcript.
export function buildClassifierPrompt(): string {
  return `You classify a voice recording made by Marc, co-owner of Mima (restaurant group, Amsterdam). Decide whether it is one of Mima's recurring MANAGEMENT MEETINGS between Marc, Michiel and Hadi, and if so which one:
- "MMMM": the weekly Mima Monday Morning Meeting — operational, short horizon (this week / this month), domain updates per person, to-do's.
- "MMM": the monthly Mima Monthly Meeting — tactical review of numbers per location, staffing, marketing, pricing; horizon 1-6 months.
- "QMM": the quarterly Quarterly Mima Meeting — strategic, 6+ months, governance.
Anything else (supplier calls, handovers with other staff, interviews, personal memos, customer conversations) is NOT a management meeting.

You get the recording TITLE, DURATION and the OPENING of the transcript. Respond with ONLY a JSON object:
{"management_meeting": true|false, "type": "MMMM"|"MMM"|"QMM"|null, "confidence": "high"|"medium"|"low", "reason": "<one sentence>"}
If it is a management meeting but you cannot tell which type, set management_meeting true and type null.`;
}
