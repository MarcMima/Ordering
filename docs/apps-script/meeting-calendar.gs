/**
 * Mima meeting calendar sync (Google Apps Script on marc@mimafood.nl).
 *
 * Sends the upcoming management meetings (MMMM / MMM / QMM) from this calendar to the Ordering app,
 * which makes them the schedule for the reminder mails, mima-meetings and the Plaud webhook
 * (see docs/meeting-calendar.md in MarcMima/Ordering).
 *
 * Runs on every change in the calendar and every 15 minutes as a safety net.
 * Auth: the script's own Google access token; the app checks it belongs to marc@mimafood.nl.
 *
 * Install once: paste this file into a new Apps Script project, run `setup` and click Allow.
 */
var ENDPOINT = 'https://ordering-alpha.vercel.app/api/meeting-calendar';
var TITLE_FILTER = /\bMMMM\b|\bMMM\b|\bQMM\b|operational|tactical|strateg|quarterly/i;
var DAYS_BACK = 2;
var DAYS_AHEAD = 120;

function syncMeetings() {
  var now = new Date();
  var windowStart = new Date(now.getTime() - DAYS_BACK * 86400000);
  var windowEnd = new Date(now.getTime() + DAYS_AHEAD * 86400000);
  var events = CalendarApp.getDefaultCalendar()
    .getEvents(windowStart, windowEnd)
    .filter(function (e) { return TITLE_FILTER.test(e.getTitle()); })
    .map(function (e) {
      return {
        id: e.getId() + '_' + e.getStartTime().toISOString(),
        title: e.getTitle(),
        start: e.getStartTime().toISOString(),
        end: e.getEndTime().toISOString()
      };
    });
  var res = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      events: events
    }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  console.log(code + ' ' + res.getContentText().slice(0, 500));
  if (code !== 200) throw new Error('Meeting calendar sync failed: ' + code + ' ' + res.getContentText().slice(0, 300));
}

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncMeetings') ScriptApp.deleteTrigger(t);
  });
  var me = Session.getActiveUser().getEmail(); // also grants the email scope the app checks
  ScriptApp.newTrigger('syncMeetings').forUserCalendar(me).onEventUpdated().create();
  ScriptApp.newTrigger('syncMeetings').timeBased().everyMinutes(15).create();
  syncMeetings();
}
