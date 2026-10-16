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

Timed events carry offset-bearing instants. All-day events carry calendar dates and an exclusive end date; converting them to UTC midnight would be incorrect. The configured display zone governs day membership. Overlapping events remain separate, vertically stacked cards. All timed events stay in the agenda, including past events. The current/next event is the initial and idle scroll destination for today; browsing older dates retains their events from the start.

Month is a dedicated, close-inspection grid with small event titles and calendar colours. Day numbers open a Day; overflow expands that date within the Month grid, with Less to collapse. Event rows open details. Schedule is a bounded chronological list with date groups, time ranges and descriptions. It does not establish real availability while using sample data. 7 days is a close-inspection view with smaller cards, starting today on entry (with seven-day paging). The internal saved view key remains week for compatibility. Detailed Day/2-day/3-day views remain the principal appliance layouts.

The browser indexes a bounded event snapshot once per data/filter change. Date formatters are reused. There are no animation loops, external fonts, embedded dashboards or continuous third-party browser calls. Reminder refresh is every 30 seconds while visible, and completion is confirmed by the server before the UI removes an item. The time-only header clock ticks once per second independently of the 30-second refresh. The agenda clock advances while idle. One inactivity setting defaults to 15 seconds: it hides the menu button, collapses expanded all-day strips, and returns Day/2-day/3-day timelines and Schedule to their current/next event; settings offer 30 seconds, 1 minute or Off. Wheel, touch, pointer and keyboard input reset the timer. A held pointer, hidden document, open overlay reminder drawer or detail/settings dialog pauses following and all-day collapse. The permanent Day panel does not pause them. Off disables automatic hide/collapse/follow. Native scroll positions change only on explicit navigation, filtering/data reload, resizing or an idle follow request. After 60 seconds idle, the selected date returns to Today (current month in Month) while retaining the chosen view. The same interaction/dialog guards apply; Off also disables this date return.

## Local data

The schema contains reminder ID, title, list, kind (todo/note), optional details and date, completion timestamp and integer version. Updates/deletes use a version precondition; conflicts return HTTP 409. Completion is a state change on a single item, not a recurrence model. List names currently organise visible content and provide no privacy separation.

SQLite runs in WAL mode with a busy timeout. Schema version 3 is recorded using `user_version`; a transactional v1-to-v2 migration adds notes with an empty default, preserving existing rows and versions. The v2-to-v3 transaction adds kind with todo as its default; existing completion states and detail text are preserved. Newer schemas are rejected rather than silently downgraded. Older clients that omit notes or kind on an update preserve those fields. Notes cannot be completed through the API. Converting a completed todo into a note clears its completion state. Rolling back to a pre-v3 application requires a compatible pre-migration backup; no automatic downgrade is provided. Container data lives in a named volume. Backup/export and tested migrations are required before using irreplaceable household data. A future repeating-reminder model must preserve occurrence-specific completion and undo.

## Development access boundary

This build is intentionally loopback-only. The Node launcher binds to 127.0.0.1. The server rejects non-loopback clients unless `LOOPBACK_PROXY=1` is set, which the supplied Compose file uses behind its explicitly loopback-only published port. Do not use that exception with a LAN/public binding or an untrusted reverse proxy.

Mutating requests require an exact same-origin Origin header. Responses disable caching of application data and prevent embedding. These controls are not a substitute for authentication. Device pairing, management authorization, secret storage and safe LAN access are a prerequisite to deployment.

## Google integration: next boundary, not implemented

Google is the intended source of truth, with a local last-good event cache. Start with read sync, including recurring instances, exceptions, cancellations, permission changes, time zones and all-day ranges. Show freshness truthfully. Two-way edits follow only after writable-calendar selection, scopes, event version checks, retry behaviour and attendee notification rules are defined and tested. The application must not claim a save succeeded until Google confirms it. No offline write queue is planned for the first version.

The current provider interface is deliberately read-only. Do not turn it into a generic integration framework in anticipation of unknown providers.

## Framework references

The scaffold follows the current [SvelteKit 3 configuration model](https://svelte.dev/docs/kit/migrating-to-sveltekit-3) and [Node adapter](https://svelte.dev/docs/kit/adapter-node). Persistence uses [Node SQLite](https://nodejs.org/api/sqlite.html). Dependency resolutions are captured in package-lock.json.

## Compact display and action placement

Views, shared previous/today/next icons and live time share one header row. The full date is omitted from the header; agenda headings retain weekday/date. The calendar-shaped Today icon highlights the current day (current month in Month). Arrows navigate dates, seven-day blocks or months according to the view; Schedule focuses the chosen date. All-day rows align with timed cards, without a visible label: three rows initially, an unlabelled grip on the separating line for overflow. Tap toggles expansion; drag down expands and drag up collapses. The grip has a narrow background confined to the separator gap; its larger transparent hit area does not obscure the last event. No extra row is allocated to the grip. The strip stays above the timed scroller. Past events remain swipe-accessible; there is no Earlier disclosure. These compact targets require physical touch validation.

Day and 2 days have a solid, titleless reminder panel beside their agendas; other views retain an overlay dock opened by a side handle; it has no overall heading; active dated items start under Today (or the browsed date) only when present. Undated items have no label and use a separator only when another active group precedes them. Empty-state text and inline completed items are omitted; completed items and undo remain in All reminders. The reminder panel has no footer or controls row. All reminders, including completed items, is reached through the main menu. Each group shows todos first, then outlined note cards, with no divider between types. Its count is completed/total for todos whose due date exactly matches the dock date, not the lifetime list size. Day/2-day/3-day use the selected start date; 7 days/Month/Schedule use today. Undated and unfinished older items remain accessible separately but do not inflate the day count. Notes show only on their assigned date or indefinitely if undated; they are never overdue tasks. Past dated notes remain in the full list under Past notes and in their original date view. Future and completed items remain in the full list. Checkboxes complete/undo; text opens detail and the management editor link.

Dark replaces Slate with a deeper background and subtle gradients/highlights. Old saved Slate preferences migrate to Dark. No continuous effects or per-card backdrop blurring are used. Preferences, including the idle timeout, remain per-browser.

Month uses four to six rows. At the reference size, five-week months show up to three event lines per day; six-week months show two, keeping the overflow control reachable. Expanding a date grows its row to reveal all event titles, with native Month scrolling when needed. The today marker is a fixed circular highlight with a subtle glossy treatment. Multi-day events repeat in each applicable date cell; continuous spanning bars are not implemented. Schedule uses compact 36px rows with thin date separators and covers the provider's bounded snapshot, not an infinite history or a claim of complete Google availability.

No event/reminder Add entry points are exposed on the display, including its full reminder list. Management retains creation forms; future responsive creation placement is deferred. Event edit/delete positions still explain that Google is pending and perform no writes. Reminder recurrence is a recorded requirement, with a clearly disabled Repeat field in management; it does not save repeating rules. The next functional step must model completion/undo per occurrence before enabling that field. Text-entry forms stay on `/manage`.
