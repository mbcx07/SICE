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

  // Reminder for the owner: 1 day before + 1 hour before morning.
  setReminders_(event, [1440, 60]);

  if (p.invitePatient === true) {
    maybeAddGuest_(event, p.patientEmail);
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
