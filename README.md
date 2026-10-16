# Pi Family Calendar

A small, glanceable calendar appliance for a seven-inch Raspberry Pi display.

**Early development — 0.1.0-dev.** This first build has a working display and persistent local reminders. Google Calendar read integration is available through [Google settings](docs/google-calendar.md); an account must be connected before real events appear. Sample-data status is shown in the main menu. It is a local development preview, not a ready-to-install household appliance.

## Try the build

With Docker Desktop or Docker Engine and Compose:

```sh
docker compose up --build -d
```

Open [the calendar](http://127.0.0.1:8775/) or [admin](http://127.0.0.1:8775/admin). The supplied Compose file binds to this computer only. Do not widen the binding: safe LAN access and the Pi OAuth callback are still to be implemented.

Set `APP_TIME_ZONE` in a local `.env` file to your IANA time zone, such as `Europe/London`. The default is UTC. `CALENDAR_SOURCE=demo` enables fictional events; an unset/other source in the Node application shows an unconnected state. Compose explicitly defaults to demo mode. No credentials are needed for demo mode. Saving Google OAuth settings switches this installation to Google, without mixing sample events into real calendars.

Reminders start empty and are saved in the `calendar-data` Docker volume. Stopping or recreating the container preserves them. Removing that volume deletes them.

## What works

- Day, two-day and three-day agendas, rolling 7 days, a dedicated Month grid and a chronological Schedule.
- Tap-open event detail, stacked overlapping events, three visible all-day rows with optional expansion, native scrolling through past events and independent idle delays for resetting scroll and returning to Today (blank disables each).
- A collapsible header with clock left, views centred and previous/today/next icons right; a pinned reminder panel in Day, 2 days and Schedule, with an overlay drawer in other views, plus searchable reminder management with completed history.
- Creation belongs on the management page; there are no Add buttons on the appliance display. Events are managed in Google Calendar; the appliance has no event-writing controls.
- An independent mobile-friendly `/admin` portal, with optional PIN protection for pages and administrative APIs. No link from the calendar display; enter the address manually. See [admin access](docs/admin.md).
- A header calendar picker saves visibility for each browser. Warm and Dark themes, with calendar visibility and preferred view saved per browser.
- Local To do and Note reminders, with optional details, editing and deletion. Todos support completion/undo; notes have no checkbox and stay visible for their date or indefinitely when undated. Searchable, grouped management on `/admin/reminders` with Active/Completed/All filters and responsive editors; touch completion on the display. Display details are read-only; only to-do completion is available there.
- One shared General list. Daily, weekday, weekly and monthly repeats support occurrence-specific completion and undo; notes can repeat too.
- SQLite persistence, reminder version checks, health endpoint and a single non-root application container.

V1 deliberately reads Google Calendar only. Two-way sync is not planned; a future change would need a separate decision. LAN access, backups and physical Pi validation remain future work. The initial hardware target is Pi 5 with 2 GB RAM; this has not been performance-qualified on that device.

## Development and project map

- [Google Calendar setup](docs/google-calendar.md)
- [Development and verification](docs/development.md)
- [Architecture and boundaries](docs/architecture.md)
- [Current build and validation](docs/current-state.md)
- [Next milestones](docs/roadmap.md)
- [Contributor guidance](CONTRIBUTING.md) and [agent orientation](AGENTS.md)

Product code and general documentation belong here. Deployment-specific identities, addresses, credentials and operational records belong in the operator's private documentation, outside this repository. Pi Family Calendar and Pi Rain Radar are independent products.

This repository is private during development. Public release and an open-source licence are planned decisions, not yet granted by this repository. Third-party packages retain their respective licences.
