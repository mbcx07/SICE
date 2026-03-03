# SICE – Google Calendar automation (Apps Script)

This folder contains a **Google Apps Script webhook** used by SICE to create calendar events and follow-up reminders.

## Why Apps Script?
- Works with a regular **Gmail account**.
- No paid email provider required (your volume is low).
- Calendar handles reminders (1 day + 1 hour before appointments) and can email invitations.

## Setup
1) Log into the dedicated Google account:
   `dgnstcspprtdlnrst@gmail.com`

2) Create a new Apps Script project:
   - https://script.google.com/
   - New project → paste `Code.gs`

3) Set Script Property:
   - Project Settings → Script properties
   - Add: `SICE_WEBHOOK_SECRET` = (a strong random string)

4) Deploy as Web App:
   - Deploy → New deployment → Web app
   - Execute as: **Me**
   - Who has access: **Anyone** (or Anyone with link)
   - Copy the Web App URL

5) In SICE app → **Settings**:
   - Paste `calendarWebhookUrl`
   - Paste `calendarWebhookSecret`
   - Enable `calendarInvitePatient` if you want the patient to receive email invites.

## Actions
The app calls the webhook with JSON:

```json
{ "secret": "...", "action": "createAppointmentEvent", "payload": { ... } }
```

Supported actions:
- `createAppointmentEvent` → returns `{ eventId }`
- `createFollowUpEvent` → returns `{ eventId }`
- `deleteEvent`
