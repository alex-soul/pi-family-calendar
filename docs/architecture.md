# Architecture

The first build uses SvelteKit 3, Svelte 5, TypeScript and Node.js 24. The supported runtime is one Node process, packaged in one Docker container. SQLite uses Node's built-in `node:sqlite` API; there is no separate database service, ORM or native addon to compile. The kiosk browser will run on the host when the appliance is deployed.

## Ownership and boundaries

| Area         | Current owner and behaviour                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Events       | `CalendarProvider` returns a bounded, normalized snapshot. Only explicit demo and unconnected providers exist today. Google will own real events.                  |
| Reminders    | `ReminderRepository` is implemented by SQLite. Both interfaces use the same HTTP API and stored rows. This small boundary can later support a real cloud provider. |
| Display      | `/` owns date navigation, readable details and reminder completion. No text-entry forms.                                                                           |
| Management   | `/manage` owns reminder forms. It adapts to phone and desktop widths; real phone/LAN access is deferred until pairing.                                             |
| Preferences  | Theme, hidden calendar IDs and preferred main view are per-browser local storage. No data or provider credentials are stored there.                                |
| Installation | Environment configuration sets the source, time zone and data directory. Future Google configuration belongs on the server.                                        |

The disposable mock established concepts only. This code was built independently from a clean SvelteKit scaffold. Layouts, typography and colour treatments remain open to refinement in this application.

## Dates and display behaviour

Timed events carry offset-bearing instants. All-day events carry calendar dates and an exclusive end date; converting them to UTC midnight would be incorrect. The configured display zone governs day membership. Overlapping events remain separate, vertically stacked cards. An ongoing event stays in the agenda until its end; only the current day's finished events collapse under Earlier. Explicitly browsing old dates retains their events.

The month view is temporary navigation, with calendar-coloured activity dots. It does not establish real availability while using sample data. Week is a close-inspection view with smaller cards. Detailed Day/2-day/3-day views remain the principal appliance layouts.

The browser indexes a bounded event snapshot once per data/filter change. Date formatters are reused. There are no animation loops, external fonts, embedded dashboards or continuous third-party browser calls. Reminder refresh is every 30 seconds while visible, and completion is confirmed by the server before the UI removes an item. The agenda clock advances while idle, avoiding immediate reordering during interaction. Background selection does not force a browsed date back to today.

## Local data

The initial schema contains reminder ID, title, list, optional due date, completion timestamp and integer version. Updates/deletes use a version precondition; conflicts return HTTP 409. Completion is a state change on a single item, not a recurrence model. List names currently organise visible content and provide no privacy separation.

SQLite runs in WAL mode with a busy timeout. Schema version 1 is recorded using `user_version`; newer schemas are rejected rather than silently downgraded. Container data lives in a named volume. Backup/export and tested migrations are required before using irreplaceable household data. A future repeating-reminder model must preserve occurrence-specific completion and undo.

## Development access boundary

This build is intentionally loopback-only. The Node launcher binds to 127.0.0.1. The server rejects non-loopback clients unless `LOOPBACK_PROXY=1` is set, which the supplied Compose file uses behind its explicitly loopback-only published port. Do not use that exception with a LAN/public binding or an untrusted reverse proxy.

Mutating requests require an exact same-origin Origin header. Responses disable caching of application data and prevent embedding. These controls are not a substitute for authentication. Device pairing, management authorization, secret storage and safe LAN access are a prerequisite to deployment.

## Google integration: next boundary, not implemented

Google is the intended source of truth, with a local last-good event cache. Start with read sync, including recurring instances, exceptions, cancellations, permission changes, time zones and all-day ranges. Show freshness truthfully. Two-way edits follow only after writable-calendar selection, scopes, event version checks, retry behaviour and attendee notification rules are defined and tested. The application must not claim a save succeeded until Google confirms it. No offline write queue is planned for the first version.

The current provider interface is deliberately read-only. Do not turn it into a generic integration framework in anticipation of unknown providers.

## Framework references

The scaffold follows the current [SvelteKit 3 configuration model](https://svelte.dev/docs/kit/migrating-to-sveltekit-3) and [Node adapter](https://svelte.dev/docs/kit/adapter-node). Persistence uses [Node SQLite](https://nodejs.org/api/sqlite.html). Dependency resolutions are captured in package-lock.json.
