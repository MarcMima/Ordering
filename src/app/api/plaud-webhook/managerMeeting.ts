// Mima Manager Meeting: Hadi's weekly Monday meeting with the restaurant managers
// (Sergey West, Danny De Pijp, Adrian Zuidas). Added 28-09-2026.
//
// Not a management meeting: nothing goes to the Notion Tasks DB. The webhook extracts what
// everyone says they will do and writes it to Supabase (table manager_meeting_actions in this
// project), where mima-meetings shows it on /ops/meeting and on each manager's page, and the
// Thursday homework mail picks it up.
//
// Pure logic only (no Notion/Next/Anthropic imports), so it can be unit tested with node --test.

export const MANAGER_MEETING_NAME = "Mima Manager Meeting";
export const MANAGER_MEETING_LABEL = "Manager"; // Sync Log "Meeting type"

// The spoken name is searched in the opening. A bit wider than the management OPENING_WINDOW,
// because the managers drop in one by one and the recording often starts with small talk.
export const MANAGER_OPENING_WINDOW = 1500;

const SPOKEN: RegExp[] = [
  /mima[\s\S]{0,20}managers?'?s?\s*(?:meeting|check[\s-]?in)/i,
  /\bmanagers?'?s?\s+(?:meeting|check[\s-]?in)\b/i,
  /\bmeeting\s+with\s+(?:the\s+|all\s+)?(?:restaurant\s+|three\s+)?managers\b/i,
];
const TITLE = /\bmanagers?'?s?\s+(?:meeting|check[\s-]?in)\b/i;

function firstMatch(text: string, res: RegExp[]): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null;
  for (const re of res) {
    const m = text.match(re);
    if (m && m.index !== undefined && (!best || m.index < best.start)) best = { start: m.index, end: m.index + m[0].length };
  }
  return best;
}

/**
 * "phrase": the meeting name is said in the opening and before any management meeting name
 * (an MMMM that mentions "how was the manager meeting?" opens with its own name first).
 * "title": only the recording title says so; the classifier has to confirm.
 * null: not recognisable as a manager meeting.
 */
export function detectManagerMeeting(
  title: string,
  transcript: string,
  managementPhrases: RegExp[]
): "phrase" | "title" | null {
  const opening = (transcript ?? "").slice(0, MANAGER_OPENING_WINDOW);
  const at = firstMatch(opening, SPOKEN);
  if (at) {
    // Management name said completely BEFORE it (an MMMM that asks about the manager
    // meeting)? Then it is that meeting. Overlap ("our operational meeting with the
    // managers") counts as the manager meeting.
    const mgmt = firstMatch((transcript ?? "").slice(0, 4000), managementPhrases);
    if (!mgmt || mgmt.end > at.start) return "phrase";
    return null;
  }
  return TITLE.test(title ?? "") ? "title" : null;
}

/** Monday (YYYY-MM-DD) of the week before the meeting: the check-in week, as in mima-meetings. */
export function checkinWeekFor(meetingDate: string): string {
  const d = new Date(meetingDate + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow - 7);
  return d.toISOString().slice(0, 10);
}

export const MANAGER_LOCATIONS = ["West", "De Pijp", "Zuidas", "All"] as const;
export type ManagerLocation = (typeof MANAGER_LOCATIONS)[number];
export const MANAGERS: { name: string; location: Exclude<ManagerLocation, "All"> }[] = [
  { name: "Sergey", location: "West" },
  { name: "Danny", location: "De Pijp" },
  { name: "Adrian", location: "Zuidas" },
];

export type ManagerAction = {
  action: string;
  person: string;
  role: "manager" | "hadi" | "other";
  location: ManagerLocation;
  due: string | null;
  quote: string | null;
  speaker: string | null;
};

/** Clean up what Claude returned; drops anything without an action or a person. */
export function normalizeActions(raw: unknown): ManagerAction[] {
  if (!Array.isArray(raw)) return [];
  const out: ManagerAction[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const action = String(r?.action ?? "").trim();
    let person = String(r?.person ?? "").trim();
    if (!action || !person) continue;
    const mgr = MANAGERS.find((m) => m.name.toLowerCase() === person.toLowerCase());
    if (mgr) person = mgr.name;
    const isHadi = /^(abdul\s*)?hadi$/i.test(person);
    if (isHadi) person = "Hadi";
    let location = String(r?.location ?? "").trim() as ManagerLocation;
    if (!(MANAGER_LOCATIONS as readonly string[]).includes(location)) location = mgr?.location ?? "All";
    // A manager's commitment always belongs to their own restaurant.
    if (mgr) location = mgr.location;
    const role: ManagerAction["role"] = mgr ? "manager" : isHadi ? "hadi" : "other";
    const str = (v: unknown) => { const s = String(v ?? "").trim(); return s && s.toLowerCase() !== "null" ? s : null; };
    out.push({ action: action.slice(0, 500), person: person.slice(0, 80), role, location, due: str(r?.due)?.slice(0, 80) ?? null, quote: str(r?.quote)?.slice(0, 400) ?? null, speaker: str(r?.speaker)?.slice(0, 80) ?? null });
  }
  return out;
}

export function normalizeActionText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildManagerActionsPrompt(): string {
  return `You extract commitments from the recording of the ${MANAGER_MEETING_NAME}: the weekly Monday meeting of Hadi (Operations Manager of Mima, a fresh Mediterranean restaurant group in Amsterdam) with the three restaurant managers:
- Sergey, manager of West (Jan Pieter Heijestraat)
- Danny, manager of De Pijp (Ceintuurbaan)
- Adrian, manager of Zuidas
The meeting is in English, may contain some Dutch, and the transcript has speaker labels with transcription errors. Hadi chairs and goes through the locations one by one (the managers' weekly check-in: last week's commitments, the numbers, their people, decisions, the week ahead), then passes on decisions from the office and asks his own questions.

STEP 1: IDENTIFY THE SPEAKERS before extracting anything. Labels are "Speaker 1", "Speaker 2", ... or names for people with a voice profile. Hadi opens the meeting and asks the questions. A manager is the one answering while their location is being discussed, is addressed by name ("Danny, how did ..."), or talks about "my team" at that location. Never put a raw label such as "Speaker 2" in a result; use the name.

STEP 2: EXTRACT EVERY COMMITMENT. A commitment is something a person says they will do after this meeting, or is asked to do and does not refuse ("Adrian, can you fix the rota?" "Yes"). This includes the three things each manager commits to for the week ahead, and everything Hadi says he will do or arrange. Include small ones; a missed commitment is worse than an extra one. Do not include status updates, things already done, opinions, or ideas nobody takes on. Do not merge commitments of different people.

For each commitment return an object:
- "action": what they will do, short and imperative, in English (e.g. "Retrain the closing team on the FIFO labels").
- "person": the person who will do it: "Sergey", "Danny", "Adrian", "Hadi", or another first name if someone else present commits (e.g. "Marc").
- "location": "West", "De Pijp" or "Zuidas" when it concerns one restaurant, otherwise "All". A manager's commitment is always their own restaurant.
- "due": the deadline as said ("Wednesday", "before the weekend", "next Monday", or an ISO date) or null.
- "quote": a short verbatim quote (max 200 characters) of where it was said, prefixed with the speaker label as it appears in the transcript.
- "speaker": that speaker label, followed by the resolved name in parentheses when the label is not a name, e.g. "Speaker 2 (Danny)".

OUTPUT: ONLY a JSON array of these objects, in the order they came up. No prose, no markdown fences. If there are no commitments, return [].`;
}
