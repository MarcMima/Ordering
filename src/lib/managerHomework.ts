// Thursday reminder for the restaurant managers: the three things they committed to in
// Monday's weekly check-in ("the week ahead"), so they get their homework done before the
// next check-in. Check-ins live in this Supabase project (tables manager_checkins and
// meeting_people, written by the mima-meetings app). Added 23-09-2026.
import { createAdminClient } from "@/lib/supabase/admin";
import { type Mail, renderEmail } from "@/lib/meetingEmails";

export const MEETINGS_URL = process.env.MEETINGS_URL ?? "https://mima-meetings.vercel.app";

type WeekAhead = { commitment: string; by: string };
type Row = { location: string; week_start: string; status: string; data: { weekAhead?: WeekAhead[] } | null };
type Person = { email: string; name: string; location: string };

/** Monday (Europe/Amsterdam) of the last complete week: the week Monday's check-in looked back on. */
export function lastCompleteWeek(now = new Date()): string {
  const ams = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(now);
  const d = new Date(ams + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow - 7);
  return d.toISOString().slice(0, 10);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function homeworkMail(p: Person, items: WeekAhead[], to: string[]): Mail {
  const list = items.filter((w) => w.commitment.trim());
  const subject = list.length ? `Your homework this week, ${p.name}` : `No homework saved this week, ${p.name}`;
  const paragraphs = list.length
    ? [
        `On Monday you committed to these for ${esc(p.location)}. Next Monday they open the check-in, so there is still time to get them done:`,
        `<ol style="margin:8px 0 0 18px;padding:0;">${list.map((w) => `<li style="margin:6px 0;">${esc(w.commitment)}${w.by.trim() ? ` <span style="color:#9a948c;">(by ${esc(w.by)})</span>` : ""}</li>`).join("")}</ol>`,
        "Stuck on one? Write it on the notepad in your check-in, so it comes up on Monday.",
      ]
    : [
        `There are no commitments saved in your check-in for ${esc(p.location)} this week.`,
        "Add the three things you are working on this week, so they come back on Monday.",
      ];
  const text = list.length
    ? `On Monday you committed to these for ${p.location}:\n\n${list.map((w, i) => `${i + 1}. ${w.commitment}${w.by.trim() ? ` (by ${w.by})` : ""}`).join("\n")}\n\nNext Monday they open the check-in.\n\nYour check-in: ${MEETINGS_URL}`
    : `There are no commitments saved in your check-in for ${p.location} this week. Add your three for this week.\n\nYour check-in: ${MEETINGS_URL}`;
  const html = renderEmail({
    eyebrow: `Weekly check-in · ${esc(p.location)}`,
    heading: list.length ? "Your homework this week" : "No homework saved yet",
    paragraphs,
    buttonLabel: "Open your check-in",
    buttonUrl: MEETINGS_URL,
    footer: "You're receiving this because you manage a Mima location. It's a weekly reminder from your Monday check-in with Hadi.",
  });
  return { to, subject, text, html };
}

/** One mail per active manager. testTo sends every mail to that address instead (for checks). */
export async function managerHomeworkMails(testTo?: string[]): Promise<{ mails: { name: string; mail: Mail }[]; error?: string }> {
  try {
    const db = createAdminClient();
    const week = lastCompleteWeek();
    const [people, checkins] = await Promise.all([
      db.from("meeting_people").select("email,name,location").eq("role", "manager").eq("active", true),
      db.from("manager_checkins").select("location,week_start,status,data").eq("week_start", week),
    ]);
    if (people.error) throw new Error(people.error.message);
    if (checkins.error) throw new Error(checkins.error.message);
    const rows = (checkins.data ?? []) as Row[];
    // Only managers who used the digital check-in this week get a mail. Without a check-in
    // row there is nothing to remind them of (and no mail before they have been introduced).
    const mails = ((people.data ?? []) as Person[]).flatMap((p) => {
      const row = rows.find((r) => r.location === p.location);
      if (!row) return [];
      return [{ name: `manager-homework-${p.location}`, mail: homeworkMail(p, row.data?.weekAhead ?? [], testTo ?? [p.email]) }];
    });
    return { mails };
  } catch (e: unknown) {
    return { mails: [], error: e instanceof Error ? e.message : String(e) };
  }
}

