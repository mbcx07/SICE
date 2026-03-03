/**
 * SICE Calendar Webhook (Google Apps Script)
 *
 * Deploy as Web App:
 *  - Execute as: Me
 *  - Who has access: Anyone (or Anyone with link)
 *
 * Store the secret in SICE settings and send it with each request.
 */

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = String(body.secret || '');

    var expected = PropertiesService.getScriptProperties().getProperty('SICE_WEBHOOK_SECRET') || '';
    if (!expected) {
      return jsonResponse({ ok: false, error: 'Missing SICE_WEBHOOK_SECRET in Script Properties.' }, 500);
    }
    if (!secret || secret !== expected) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
    }

    var action = String(body.action || '');
    var payload = body.payload || {};

    if (action === 'createAppointmentEvent') {
      return jsonResponse(createAppointmentEvent_(payload), 200);
    }
    if (action === 'createFollowUpEvent') {
      return jsonResponse(createFollowUpEvent_(payload), 200);
    }
    if (action === 'deleteEvent') {
      return jsonResponse(deleteEvent_(payload), 200);
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action }, 400);
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

function jsonResponse(obj, code) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function pickCalendar_() {
  // Uses the default calendar for the account.
  return CalendarApp.getDefaultCalendar();
}

function getOrCreateSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SICE_SHEET_ID') || '';
  if (sheetId) {
    try {
      return SpreadsheetApp.openById(sheetId);
    } catch (e) {
      // fall through to create
    }
  }
  var ss = SpreadsheetApp.create('SICE - Automation');
  props.setProperty('SICE_SHEET_ID', ss.getId());
  return ss;
}

function getOrCreateSheet_(name, headers) {
  var ss = getOrCreateSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getLastRow() === 0 && headers && headers.length) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function upsertRowByKey_(sheet, keyColIndex, key, rowValues) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.appendRow(rowValues);
    return;
  }
  var range = sheet.getRange(2, keyColIndex, lastRow - 1, 1);
  var values = range.getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(key)) {
      sheet.getRange(i + 2, 1, 1, rowValues.length).setValues([rowValues]);
      return;
    }
  }
  sheet.appendRow(rowValues);
}

function toDate_(iso) {
  // Accepts either full ISO or yyyy-mm-dd.
  if (!iso) return null;
  var s = String(iso);
  // Apps Script Date can parse ISO-ish strings reliably enough for our MVP.
  return new Date(s);
}

function setReminders_(event, minsArray) {
  try {
    event.removeAllReminders();
  } catch (e) {}
  (minsArray || []).forEach(function (m) {
    var n = Number(m);
    if (isFinite(n) && n >= 0) event.addPopupReminder(n);
  });
}

function maybeAddGuest_(event, email) {
  var e = String(email || '').trim();
  if (!e) return;
  try {
    event.addGuest(e);
  } catch (err) {
    // ignore invalid email
  }
}

function createAppointmentEvent_(p) {
  var cal = pickCalendar_();
  var title = String(p.title || 'Cita');
  var start = toDate_(p.start);
  var end = toDate_(p.end);
  if (!start || !end) return { ok: false, error: 'Missing start/end' };

  var desc = String(p.description || '');
  var event = cal.createEvent(title, start, end, { description: desc, location: String(p.location || '') });

  // Reminders: 1 day and 1 hour before.
  setReminders_(event, [1440, 60]);

  if (p.invitePatient === true) {
    maybeAddGuest_(event, p.patientEmail);
  }

  // Persist appointment for email automation
  try {
    var sh = getOrCreateSheet_('appointments', [
      'appointmentId',
      'patientName',
      'patientEmail',
      'patientPhone',
      'start',
      'end',
      'eventId',
      'emailSent1DayAt',
      'emailSent1HourAt',
      'createdAt'
    ]);
    var apptId = String(p.appointmentId || '');
    if (apptId) {
      upsertRowByKey_(sh, 1, apptId, [
        apptId,
        String(p.patientName || ''),
        String(p.patientEmail || ''),
        String(p.patientPhone || ''),
        String(p.start || ''),
        String(p.end || ''),
        event.getId(),
        '',
        '',
        new Date().toISOString()
      ]);
    }
  } catch (e) {
    // ignore
  }

  return { ok: true, eventId: event.getId(), htmlLink: event.getHtmlLink() };
}

function createFollowUpEvent_(p) {
  var cal = pickCalendar_();
  var when = toDate_(p.when);
  if (!when) return { ok: false, error: 'Missing when' };

  var title = String(p.title || 'Seguimiento / Renovación');
  var desc = String(p.description || '');

  // Use an all-day event at the follow-up date.
  var event = cal.createAllDayEvent(title, when, { description: desc });

  // Reminder for the owner: 1 day before + 1 hour before.
  setReminders_(event, [1440, 60]);

  // Persist follow-up for email automation
  try {
    var sh = getOrCreateSheet_('followups', [
      'saleId',
      'patientName',
      'patientEmail',
      'patientPhone',
      'deliveryEstimatedAt',
      'followUpAt',
      'eventId',
      'emailSentAt',
      'createdAt'
    ]);
    var saleId = String(p.saleId || '');
    if (saleId) {
      upsertRowByKey_(sh, 1, saleId, [
        saleId,
        String(p.patientName || ''),
        String(p.patientEmail || ''),
        String(p.patientPhone || ''),
        String(p.deliveryEstimatedAt || ''),
        String(p.when || ''),
        event.getId(),
        '',
        new Date().toISOString()
      ]);
    }
  } catch (e) {
    // ignore
  }

  return { ok: true, eventId: event.getId(), htmlLink: event.getHtmlLink() };
}

function deleteEvent_(p) {
  var cal = pickCalendar_();
  var eventId = String(p.eventId || '').trim();
  if (!eventId) return { ok: true };

  try {
    var ev = cal.getEventById(eventId);
    if (ev) ev.deleteEvent();
  } catch (err) {
    // ignore
  }
  return { ok: true };
}

// =========================
// EMAIL AUTOMATION
// =========================

function sendEmail_(to, subject, body) {
  var email = String(to || '').trim();
  if (!email) return { ok: false, error: 'Missing email' };
  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: body
  });
  return { ok: true };
}

function isoToDate_(s) {
  var d = new Date(String(s || ''));
  return isFinite(d.getTime()) ? d : null;
}

function sameDay_(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Trigger: run daily (e.g. 08:00) to send "1 day before" appointment emails and "followup today" emails.
function cronDaily_() {
  var now = new Date();
  var tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // appointments 1 day before
  var apptSheet = getOrCreateSheet_('appointments');
  var apptValues = apptSheet.getDataRange().getValues();
  for (var i = 1; i < apptValues.length; i++) {
    var row = apptValues[i];
    var appointmentId = row[0];
    var patientName = row[1];
    var patientEmail = row[2];
    var startIso = row[4];
    var sent1DayAt = row[7];

    var start = isoToDate_(startIso);
    if (!start) continue;
    if (!sameDay_(start, tomorrow)) continue;
    if (sent1DayAt) continue;

    var subject = 'Recordatorio de cita - Diagnostic Support del Noroeste';
    var body = 'Hola' + (patientName ? ' ' + patientName : '') + ',\n\n'
      + 'Te recordamos tu cita programada para: ' + start.toLocaleString() + '\n\n'
      + 'Si necesitas reagendar, responde a este correo o comunícate al +52 612 169 2544.\n\n'
      + 'Diagnostic Support del Noroeste';

    try {
      sendEmail_(patientEmail, subject, body);
      apptSheet.getRange(i + 1, 8).setValue(new Date().toISOString());
    } catch (e) {
      // ignore
    }
  }

  // followups (11 months) email on the day
  var fuSheet = getOrCreateSheet_('followups');
  var fuValues = fuSheet.getDataRange().getValues();
  for (var j = 1; j < fuValues.length; j++) {
    var r = fuValues[j];
    var saleId = r[0];
    var fuPatientName = r[1];
    var fuEmail = r[2];
    var followUpAtIso = r[5];
    var fuSentAt = r[7];

    var fuDate = isoToDate_(followUpAtIso);
    if (!fuDate) continue;
    if (!sameDay_(fuDate, now)) continue;
    if (fuSentAt) continue;

    var fuSubject = 'Renovación de plantillas - Diagnostic Support del Noroeste';
    var fuBody = 'Hola' + (fuPatientName ? ' ' + fuPatientName : '') + ',\n\n'
      + 'Ha pasado casi un año desde tus plantillas. Te recomendamos agendar una cita para revisar y renovar.\n\n'
      + 'Contacto: +52 612 169 2544\n\n'
      + 'Diagnostic Support del Noroeste';

    try {
      sendEmail_(fuEmail, fuSubject, fuBody);
      fuSheet.getRange(j + 1, 8).setValue(new Date().toISOString());
    } catch (e2) {
      // ignore
    }
  }
}

// Trigger: run every hour (or every 15 min) to send "1 hour before" appointment emails.
function cronHourly_() {
  var now = new Date();
  var in70 = new Date(now.getTime() + 70 * 60 * 1000);
  var in50 = new Date(now.getTime() + 50 * 60 * 1000);

  var apptSheet = getOrCreateSheet_('appointments');
  var values = apptSheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var patientName = row[1];
    var patientEmail = row[2];
    var startIso = row[4];
    var sent1HourAt = row[8];

    var start = isoToDate_(startIso);
    if (!start) continue;
    // window: between 50 and 70 minutes from now
    if (!(start >= in50 && start <= in70)) continue;
    if (sent1HourAt) continue;

    var subject = 'Recordatorio (1 hora) - Diagnostic Support del Noroeste';
    var body = 'Hola' + (patientName ? ' ' + patientName : '') + ',\n\n'
      + 'Te recordamos que tu cita es en aproximadamente 1 hora: ' + start.toLocaleString() + '\n\n'
      + 'Contacto: +52 612 169 2544\n\n'
      + 'Diagnostic Support del Noroeste';

    try {
      sendEmail_(patientEmail, subject, body);
      apptSheet.getRange(i + 1, 9).setValue(new Date().toISOString());
    } catch (e) {
      // ignore
    }
  }
}

// Run once manually to create triggers.
function setupTriggers_() {
  // Remove existing triggers created by this project
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'cronDaily_' || fn === 'cronHourly_') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('cronDaily_').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('cronHourly_').timeBased().everyHours(1).create();
}
