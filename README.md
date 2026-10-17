# Pi Family Calendar

A small, glanceable calendar appliance for a seven-inch Raspberry Pi display.

**Early development — 0.1.0-dev.** This first build has a working display and persistent local reminders. Google Calendar read integration is available through [Google settings](docs/google-calendar.md); an account must be connected before real events appear. Sample-data status is shown in the main menu. It is a local development preview, not a ready-to-install household appliance.

## Try the build

With Docker Desktop or Docker Engine and Compose:

```sh
docker compose up --build -d
```

Open [the calendar](http://127.0.0.1:8775/) or [admin](http://127.0.0.1:8775/admin). The supplied Compose file binds to this computer only. For optional home-LAN access and QR reminder management, see [phone access](docs/qr-reminders.md). Google sign-in still uses localhost.

Set `APP_TIME_ZONE` in a local `.env` file to your IANA time zone, such as `Europe/London`. The default is UTC. `CALENDAR_SOURCE=demo` enables fictional events; an unset/other source in the Node application shows an unconnected state. Compose explicitly defaults to demo mode. No credentials are needed for demo mode. Saving Google OAuth settings switches this installation to Google, without mixing sample events into real calendars.

Reminders start empty and are saved in the `calendar-data` Docker volume. Stopping or recreating the container preserves them. Removing that volume deletes them.

## What works

- Day, two-day and three-day agendas, rolling 7 days, Monday–Sunday Week, a dedicated Month grid and a chronological Schedule.
- Tap-open event detail, stacked overlapping events, three visible all-day rows with optional expansion, native scrolling through past events and independent idle delays for resetting scroll and returning to Today (blank disables each).
- A collapsible header with date navigation left, a larger digital clock centred and views right; a pinned reminder panel in Day, 2 days and Schedule, with an overlay drawer in other views, plus searchable reminder management with completed history.
- Creation belongs on the management page or the optional QR phone flow; the display Add button only shows a QR code. Events are managed in Google Calendar; the appliance has no event editor or API writes. Optional date-specific Add QR codes hand off to a Google draft with an admin-selected default calendar.
- An independent mobile-friendly `/admin` portal, with optional PIN protection for pages and administrative APIs. No link from the calendar display; enter the address manually. See [admin access](docs/admin.md).
- The display menu saves calendar visibility for each browser. Enabled calendars can have installation-wide friendly names and colours set in admin. Warm and Dark themes, with calendar visibility and preferred view saved per browser.
- Local To do and Note reminders, with optional details, editing and deletion. Todos support completion/undo; notes have no checkbox and stay visible for their date or indefinitely when undated. Searchable, grouped management on `/admin/reminders` with Active/Completed/All filters and responsive editors; touch completion on the display. Display details allow to-do completion; content editing stays on the phone/admin. When enabled in Access, QR codes open scoped add/edit forms on a phone without the admin PIN.
- One shared General list. Daily, weekday, weekly and monthly repeats support occurrence-specific completion and undo; notes can repeat too.
- SQLite persistence, reminder version checks, health endpoint and a single non-root application container.

V1 deliberately reads Google Calendar only. Two-way sync is not planned; a future change would need a separate decision. Opt-in LAN access is available; backup/restore tooling and physical Pi validation remain future work. The initial hardware target is Pi 5 with 2 GB RAM; this has not been performance-qualified on that device.

## Development and project map

- [Google Calendar setup](docs/google-calendar.md)
- [Development and verification](docs/development.md)
- [Architecture and boundaries](docs/architecture.md)
- [Current build and validation](docs/current-state.md)
- [Next milestones](docs/roadmap.md)
- [Contributor guidance](CONTRIBUTING.md) and [agent orientation](AGENTS.md)

Product code and general documentation belong here. Deployment-specific identities, addresses, credentials and operational records belong in the operator's private documentation, outside this repository. Pi Family Calendar and Pi Rain Radar are independent products.

This repository is private during development. Public release and an open-source licence are planned decisions, not yet granted by this repository. Third-party packages retain their respective licences.

The Pi owns a persistent calendar mirror: incremental Google checks run independently of screens, past events stay stored, and at least twelve months ahead are prepared. `/admin/system` shows synchronization, coverage and runtime statistics; `/admin/access` manages the optional PIN.
