/**
 * Mima — Bidfood weekly assortment sync
 * ---------------------------------------------------------------------------
 * Runs in Marc's Gmail. Every Monday morning it finds the newest Bidfood
 * "assortiment" mail, and posts the .xlsx attachment to the ordering app's
 * edge function, which updates the Bidfood article mappings and prices.
 *
 * Install:
 *   1. script.google.com → New project → paste this file
 *   2. Run  testBidfoodAssortmentDryRun  once (authorise when Google asks)
 *   3. Run  installWeeklyTrigger  once → weekly Monday 07:00 run is live
 *
 * Functions you can run by hand:
 *   testBidfoodAssortmentDryRun  — parses the newest file, changes nothing
 *   syncBidfoodAssortment        — the real run (also what the trigger calls)
 *   installWeeklyTrigger         — (re)installs the Monday 07:00 trigger
 */

var ENDPOINT = 'https://olcqzhxirqhkfgzgjnnw.supabase.co/functions/v1/bidfood-gmail-sync';
// Plain token; its SHA-256 hash lives in integration_tokens.bidfood_gmail_sync
var API_TOKEN = 'REPLACE_WITH_TOKEN';
var SEARCH = 'from:bidfood.nl has:attachment filename:xlsx subject:assortiment newer_than:21d';
var LABEL_NAME = 'Bidfood-sync-done';

function syncBidfoodAssortment() {
  runBidfoodSync_(false);
}

function testBidfoodAssortmentDryRun() {
  runBidfoodSync_(true);
}

function installWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncBidfoodAssortment') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncBidfoodAssortment')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(7)
    .create();
  Logger.log('Weekly trigger installed: Monday around 07:00.');
}

function runBidfoodSync_(dryRun) {
  // A dry run may re-read an already processed mail; the real run never does.
  var query = SEARCH + (dryRun ? '' : ' -label:"' + LABEL_NAME + '"');
  var threads = GmailApp.search(query, 0, 5);
  if (!threads.length) {
    Logger.log('No unprocessed Bidfood assortment mail found.');
    return;
  }

  var thread = threads[0];
  var attachment = findXlsx_(thread);
  if (!attachment) {
    Logger.log('Bidfood mail found but no .xlsx attachment: ' + thread.getFirstMessageSubject());
    return;
  }

  var response = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-token': API_TOKEN },
    payload: JSON.stringify({
      file_name: attachment.getName(),
      xlsx_base64: Utilities.base64Encode(attachment.getBytes()),
      dry_run: dryRun
    }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();
  Logger.log('HTTP ' + code + ' — ' + body.slice(0, 4000));

  if (code !== 200) {
    // Throwing makes Apps Script mail the failure notice to the account owner.
    throw new Error('Bidfood sync failed (HTTP ' + code + '): ' + body.slice(0, 500));
  }
  if (!dryRun) {
    thread.addLabel(getOrCreateLabel_());
  }
}

function findXlsx_(thread) {
  var messages = thread.getMessages();
  for (var i = messages.length - 1; i >= 0; i--) {
    var attachments = messages[i].getAttachments();
    for (var j = 0; j < attachments.length; j++) {
      if (/\.xlsx$/i.test(attachments[j].getName())) return attachments[j];
    }
  }
  return null;
}

function getOrCreateLabel_() {
  return GmailApp.getUserLabelByName(LABEL_NAME) || GmailApp.createLabel(LABEL_NAME);
}
