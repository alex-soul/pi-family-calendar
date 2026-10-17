# Current build

Version: **0.1.0-dev**, 17 October 2026. Local development preview; not yet a deployed household appliance.

## Calendar display

Day, 2 days, 3 days, rolling 7 days, Month and Schedule are implemented. Day/2 days/Schedule pin reminders; other views use the overlay dock. The collapsible header has clock, icon view selection and date navigation. Warm/Dark themes, visible calendars and independent idle timers are saved per browser. Reset scroll defaults to 15 seconds, Return to Today to 60; blank disables either. Menu hiding and all-day collapse remain 15 seconds. Dialogs pause idle navigation.

Timed multi-day events appear with all-day banners in Day/2/3 and the shared 7-day strip. Three lanes show initially; the divider grip expands/collapses. Month spans events across columns and expands overflow in place. Schedule splits multi-day entries by occupied date with start/All day/Until labels and Day n/total. End dates are exclusive, local midnight/DST are handled, overlapping events stay separate, and rich descriptions are safely rendered as plain text. Empty timed agendas, including the end of today's agenda, show no placeholder text. Past events remain scrollable.

## Menu and reminders

The Pi menu contains only display preferences. Calendar visibility checkboxes live in the display menu; selections stay in this browser. No admin links or direct reminder editors appear on the display. Optional QR management adds phone handoff controls. To-do completion remains available through a dedicated completion-only endpoint.

The full-page `/admin` portal is reached by manually entering its address. Overview links to Reminders, Google Calendar, Access and System, with persistent responsive navigation. Old `/manage` addresses redirect into protected admin routes. PIN protection is optional and starts disabled. When enabled it gates administrative pages, page data and APIs; sessions last 12 hours and can be locked explicitly. PIN changes revoke older sessions. Failed attempts are rate-limited, and host-only recovery preserves reminder/Google data. See [admin access](admin.md).

All reminders use one shared **General** list. Admin offers search, Active/Completed/All, grouped dates and completed history. The shared editor uses consistent Add reminder, Update reminder and Delete reminder actions for both types. Failed saves retain input and offer explicit reload after conflicts; deletion requires confirmation. Google events remain read-only and are managed natively in Google Calendar.

To-dos have a checkbox; notes are outlined cards without completion. Dated items appear on their assigned date and undated items remain visible. Empty groups, unnecessary labels and panel footer controls are omitted. Past single-use notes remain available in management and on their original date. Older unfinished single-use tasks appear separately. Completion counters include only to-dos for the displayed date.

Both types can repeat daily, weekdays, weekly or monthly, with intervals and an optional inclusive end date. Repeating cards show a small repeat icon. Completion/undo affects one occurrence. Missed repeats do not accumulate as overdue tasks; management shows the next incomplete occurrence and completed history. Monthly schedules clamp to shorter months, then return to the original date. Series edits/deletes apply to the whole series; changing the schedule clears completion history with an explicit warning. Exceptions and individual-occurrence edits are not implemented.

SQLite schema v4 adds repeat rules and occurrence completion records. Migration preserves existing rows, details, versions and completion states, while normalising list labels to General. Older binaries cannot open v4. Version checks protect against concurrent overwrites; tokens and Google settings live separately. No automatic data reset is shipped.

## Google and access boundaries

Read-only Google OAuth, multiple accounts, selected calendars, deduplication, expanded recurring instances, persistent central storage, incremental synchronization, historical retention and on-demand range expansion are implemented. Background polling is silent; stale/error conditions remain visible. OAuth secrets/tokens are encrypted server-side; event cache and key material make the entire volume sensitive. The shipped setup guide includes direct Google Console links and 24/7 guidance about Testing-mode expiry and operator-owned OAuth clients. No Google Cloud publishing settings are changed by the app.

The preview remains loopback-only. Responsive forms do not imply LAN access. Safe LAN/transport access, phone-to-Pi OAuth callback, backup/export/recovery and hardware validation precede deployment. Google write support is not a planned milestone.

## Verification

- 68 automated tests pass: calendar date/span/display rules, provider behavior, OAuth/cache boundaries, reminder validation/persistence/concurrency, recurrence calculations, schema v1/v2/v3 migrations, PIN/session lifecycle, persisted throttling and route authorization.
- Svelte type/accessibility checks report no errors or warnings. Formatting and Docker production compilation pass.
- Isolated HTTP smoke verifies CRUD, completion/undo, notes, invalid input, Origin rejection and stale-version conflicts.
- Browser checks at 320px/390px and 1280 x 720 cover admin navigation, PIN unlock/lock, admin-only reminder creation/editing, consistent action labels, display details without editing, completion while locked, calendar filtering persistence and display-only settings. Warm and Dark layouts inspected.
- Isolated admin HTTP tests verify page/data/encoded-route protection, Google API/callback gating, reminder write rejection, the strict completion exception, Origin enforcement, session rotation/revocation, PIN disable and legacy redirects. These checks also run in CI.
- Existing connected-calendar display remains available after upgrade. Test fixtures use a separate disposable installation.

Not yet verified: real phone keyboard, LAN pairing/callback, live mutation of Google recurring exceptions/cancellations, long-running token renewal, backup recovery, ARM64/Pi deployment, physical touch/readability or sustained OS+kiosk+server memory. A previous short amd64 container-only sample around 22 MiB is not a Pi sizing result.

Calendar appearance: /admin/google offers friendly names and colour pickers for enabled calendars, with a live preview and Use Google defaults. Changes apply to all screens on their next calendar refresh; visibility remains per browser in Display settings. Verified persistence, shared-calendar identity, provider refresh, offline cache, reset and input validation with fictional tests; browser save/reset/reload and phone layout checked on isolated fixture data. Existing operator metadata remains unchanged until edited.

Reminder completion now accepts only today's dated items/occurrences and undated Anytime tasks, enforced in the shared repository and disabled in both UIs for other dates. Historical undo remains available. Verified London midnight boundaries, recurrence advancement, rejected-write atomicity, both HTTP completion routes, and display/admin flows with fictional reminders. Admin now uses a top-right hamburger on mobile; reminder-page decorative copy is removed and Google Accounts & calendars / Calendar appearance start collapsed. Browser checks covered 320/390px mobile navigation, collapsed sections and retained desktop sidebar.

Admin copy is intentionally compact: overview starts directly with its destination cards, without the introduction or screen-ownership explainer. The shared admin footer and About reminders block are removed. Google Calendar retains its title and controls, without the eyebrow or introductory tagline. Detailed setup and connection guidance remains in its existing collapsible sections.

Display settings contains only calendar visibility, appearance and idle controls. The browser-preference introduction, idle hint and saved/time-zone footer are removed; automatic saving and blank-to-disable behaviour are unchanged.

Reminder editor omits the type and recurrence helper paragraphs. Form controls, validation and edit-history warnings remain unchanged.

Access starts with its title only. Admin PIN and System detail panels are collapsed by default, with the PIN status visible in the summary. Verified mobile expansion and reload defaults; PIN configuration is unchanged.

Fresh browsers default to Dark across admin, PIN login and calendar. The admin header and PIN screen offer an accessible sun/moon toggle for Dark/Warm (light). The shared browser preference loads before first paint; toggling preserves other display preferences and existing saved theme choices. Verified fresh-origin default, both directions, reload/navigation persistence, mobile widths down to 320px and the locked login screen.

Schedule automatically loads the next six weeks near the bottom while scrolling, keeping earlier rows and the current position. A small load/retry control handles empty windows and failures. Visible appended windows refresh without dropping the later dates during normal calendar polling. Verified repeated forward loads beyond November in both fictional and connected data, recurring instances and multi-day boundaries, DST/midnight, cancellation replacement, offline append/retry, and 57 tests with clean production check/build. No Google event writes were made.

## Central calendar hub and System

The server now owns calendar synchronization independently of browser activity. SQLite retains past events indefinitely; the worker keeps at least twelve future months ready, imports older recurrence history gradually and persists additional browsed ranges. Two-minute incremental checks use jitter, backoff, atomic cursor commits and expired-token recovery. Ordinary covered view changes only query SQLite. Google remains authoritative, including historical edits/deletions.

Access and System are separate navigation destinations. System provides sync health/activity, stored events, enabled calendars, Google HTTP requests today (UTC), reminders, per-calendar last/next check and retained coverage/history, adjustable sync interval, database storage, process RSS, uptime and version. Details start collapsed. App memory is not total appliance RAM.

Central-hub verification: 68 tests pass, including recurrence changes, cursor expiry/failure recovery, boundary retention, restart/local reads, concurrent extensions, backoff, browser-independent startup and legacy-cache migration. Isolated HTTP smoke covers System authorization. Mobile navigation and interval persistence were checked; connected calendars synchronized after the backed-up preview upgrade. Historical import continues in the background.

## QR phone management and LAN preview — 17 October

Implemented: optional Access toggle; display Plus and edit-detail QR; local QR rendering; focused mobile forms reusing the existing editor; Add-another and Done; fifteen-minute scoped sessions; one successful Edit per grant; five-minute scan expiry; immediate revocation; version checks and atomic retry protection. No admin PIN required for a valid QR grant, and grants cannot authorize admin/Google APIs. QR management remains off by default. Explicit LAN origins and a phone-reachable base URL are configured by an opt-in Compose override; localhost Google consent remains intact.

Verified: 72 unit tests, Svelte check, build and the ordinary/admin/new QR HTTP smoke suites against an isolated installation. Actual generated QR images were decoded in the HTTP tests. Chrome phone-size UI checks cover the form and Add-another flow. Physical phone scanning and LAN reachability from a second device remain to be confirmed; Windows firewall configuration can require operator elevation. Pi deployment and the planned OAuth SSH helper are not delivered by this change.

### QR refinements

Reminder details now open without a QR image; Scan QR to edit expands it and only then generates a code. QR phone editing offers confirmed Delete reminder for notes only, with a Note deleted confirmation and Done. To-dos keep completion instead; full admin deletion remains available. No Hidden state or restore filter was introduced. A successful deletion consumes its scoped grant and is retry-safe; server checks reject Add grants, to-dos, mismatched IDs, unconfirmed requests and stale versions. The QR HTTP suite covers these cases; mobile UI checks cover the disclosure and delete confirmation. Alex reports the QR flow works well.
