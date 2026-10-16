# Pi Family Calendar

A small, glanceable calendar appliance for a seven-inch Raspberry Pi display.

**Early development — 0.1.0-dev.** This first build has a working display and persistent local reminders. Google Calendar is not connected yet. Sample-data status is shown in Display settings and event-action notices. It is a local development preview, not a ready-to-install household appliance.

## Try the build

With Docker Desktop or Docker Engine and Compose:

```sh
docker compose up --build -d
```

Open [the calendar](http://127.0.0.1:8775/) or [reminder management](http://127.0.0.1:8775/manage). The supplied Compose file binds to this computer only. Do not widen the binding: LAN pairing and access protection are still to be implemented.

Set `APP_TIME_ZONE` in a local `.env` file to your IANA time zone, such as `Europe/London`. The default is UTC. `CALENDAR_SOURCE=demo` enables fictional events; an unset/other source in the Node application shows an unconnected state. Compose explicitly defaults to demo mode. No credentials are needed for this build.

Reminders start empty and are saved in the `calendar-data` Docker volume. Stopping or recreating the container preserves them. Removing that volume deletes them.

## What works

- Day, two-day and three-day agendas, rolling 7 days, a dedicated Month grid and a chronological Schedule.
- Tap-open event detail, stacked overlapping events, three visible all-day rows with optional expansion, native scrolling through past events and a configurable idle return to the current/next event.
- A single-row view selector and live date/time, with seconds; a pinned reminder panel in Day and an overlay drawer in other views, plus the full list grouped into Due, Upcoming, Past notes and Completed.
- Reserved event add/edit/delete controls explain the pending Google connection; they do not write events.
- Warm and Dark themes, with calendar visibility and preferred view saved per browser.
- Local To do and Note reminders, with optional details, editing and deletion. Todos support completion/undo; notes have no checkbox and stay visible for their date or indefinitely when undated. Responsive forms on `/manage`; touch completion on the display.
- Household and two personal list labels. These organise reminders; they do not create private access boundaries.
- SQLite persistence, reminder version checks, health endpoint and a single non-root application container.

Google sync/writes, recurring reminders, device pairing, LAN access, backups and physical Pi validation remain future work. The initial hardware target is Pi 5 with 2 GB RAM; this has not been performance-qualified on that device.

## Development and project map

- [Development and verification](docs/development.md)
- [Architecture and boundaries](docs/architecture.md)
- [Current build and validation](docs/current-state.md)
- [Next milestones](docs/roadmap.md)
- [Contributor guidance](CONTRIBUTING.md) and [agent orientation](AGENTS.md)

Product code and general documentation belong here. Deployment-specific identities, addresses, credentials and operational records belong in the operator's private documentation, outside this repository. Pi Family Calendar and Pi Rain Radar are independent products.

This repository is private during development. Public release and an open-source licence are planned decisions, not yet granted by this repository. Third-party packages retain their respective licences.
