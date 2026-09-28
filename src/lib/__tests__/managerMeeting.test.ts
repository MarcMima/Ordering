import { test } from "node:test";
import assert from "node:assert/strict";
import { detectManagerMeeting, checkinWeekFor, normalizeActions } from "../../app/api/plaud-webhook/managerMeeting.ts";

const MGMT = [/monday\s+morning\s+meeting/i, /mima[\s\S]{0,25}weekly[\s\S]{0,25}meeting/i, /operational\s+meeting/i];

test("spoken name in the opening routes to the manager meeting", () => {
  assert.equal(detectManagerMeeting("09-28 Operations Meeting: Staffing", "Speaker 1: Okay, welcome to the Mima Manager Meeting. Sergey, you first.", MGMT), "phrase");
  assert.equal(detectManagerMeeting("", "Hadi: This is our weekly operational meeting with the managers.", MGMT), "phrase");
  assert.equal(detectManagerMeeting("", "Hadi: Welcome to the Mima Manager Meeting, our weekly operational meeting.", MGMT), "phrase");
  assert.equal(detectManagerMeeting("", "Hadi: Good morning all, this is the Mima managers meeting for this week.", MGMT), "phrase");
});

test("an MMMM that mentions the manager meeting stays an MMMM", () => {
  assert.equal(detectManagerMeeting("", "Marc: Welcome to the Mima Monday Morning Meeting. Hadi, how was the manager meeting?", MGMT), null);
});

test("title only is a hint", () => {
  assert.equal(detectManagerMeeting("09-28 Manager Meeting: West, De Pijp", "Speaker 1: okay let's start", MGMT), "title");
  assert.equal(detectManagerMeeting("09-28 Weekly Meeting", "Speaker 1: okay let's start", MGMT), null);
});

test("check-in week is the Monday of the week before", () => {
  assert.equal(checkinWeekFor("2026-09-28"), "2026-09-21");
  assert.equal(checkinWeekFor("2026-09-30"), "2026-09-21");
  assert.equal(checkinWeekFor("2026-10-04"), "2026-09-21");
});

test("normalizeActions pins managers to their own location", () => {
  const out = normalizeActions([
    { action: "Fix the rota", person: "danny", location: "West", due: "null", quote: "Speaker 2: I'll fix it", speaker: "Speaker 2 (Danny)" },
    { action: "Call the cleaner", person: "Abdul Hadi", location: "Zuidas" },
    { action: "", person: "Sergey" },
    { action: "Send the numbers", person: "Marc", location: "nowhere" },
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual([out[0].person, out[0].location, out[0].role, out[0].due], ["Danny", "De Pijp", "manager", null]);
  assert.deepEqual([out[1].person, out[1].location, out[1].role], ["Hadi", "Zuidas", "hadi"]);
  assert.deepEqual([out[2].location, out[2].role], ["All", "other"]);
});
