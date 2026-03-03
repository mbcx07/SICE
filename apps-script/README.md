# SICE – Google Calendar + Email automation (Apps Script)

This folder contains a **Google Apps Script webhook** used by SICE to:
- Create **Google Calendar** events (owner reminders)
- Send **automatic emails to the patient**
  - **1 day before** appointment
  - **1 hour before** appointment
  - **11 months after** estimated delivery (renewal)

It stays **free** for your low volume.

## Setup (run using the dedicated account)
Login with: `dgnstcspprtdlnrst@gmail.com`

### 1) Create Apps Script project
- https://script.google.com/
- New project → paste `Code.gs`

### 2) Script Properties
Project Settings → Script properties:
- `SICE_WEBHOOK_SECRET` = (strong random string)

Optional (auto-created if missing):
- `SICE_SHEET_ID` = Spreadsheet id used to store appointments/followups and email-sent flags.

### 3) Deploy as Web App
Deploy → New deployment → Web app
- Execute as: **Me**
- Who has access: **Anyone** (or Anyone with link)
Copy the Web App URL.

### 4) Create triggers (IMPORTANT)
Open Apps Script → Run function: `setupTriggers_`
Authorize permissions.

This creates:
- `cronDaily_` (daily 08:00) → sends “1 day before” + “followup today” emails
- `cronHourly_` (every hour) → sends “1 hour before” emails

### 5) Configure SICE
In SICE → Settings:
- Paste `Webhook URL`
- Paste `Secret`
- Toggle `Invitar al paciente` as desired

## Actions
Webhook JSON:
```json
{ "secret": "...", "action": "createAppointmentEvent", "payload": { ... } }
```

Supported actions:
- `createAppointmentEvent` → creates Calendar event + stores appointment
- `createFollowUpEvent` → creates Calendar all-day event + stores follow-up
- `deleteEvent`
