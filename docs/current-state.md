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

## Google event QR — 17 October

Implemented collapsed event-detail QR, retaining the provider's occurrence URL. Google handles viewing/editing; the Pi remains read-only. Existing-cache links are recovered locally or with one targeted read on expansion, then cached. No admin/PIN bypass is added. The handoff does not depend on the reminder QR setting.

Verified: 75 unit tests; zero Svelte errors/warnings; Node and Docker production builds; connected read-only HTTP smoke decoding a generated QR and checking repeat access, invalid identity and cross-origin rejection. Browser checks cover collapsed/expanded details and a real recurring occurrence, with the provider event identifier matching the operator's supplied link. A disclosure binding timing issue found in UI verification was corrected. Phone-size 390px and 1280 x 720 layouts were inspected; expanded QR scrolls into view when loaded. Physical scan/account routing and a second person's shared-calendar permissions remain operator checks. No live Google events or reminders were edited.

## Add-event QR and side panels - 17 October

Phone follow-up: the initial `/calendar/r/eventedit` creation link opened Calendar without a draft on the operator's phone, despite passing the desktop check. Creation now uses `/calendar/render?action=TEMPLATE`, matching the operator's working route, with HTTPS, clicked-date bounds, time zone and default calendar retained. Regression and live QR decoding checks cover this route; the full updated handoff still needs a phone retest. Existing-event links are unchanged.

Admin Access has a separate QR calendar events switch and Default calendar dropdown. New installs start disabled. Enabled editable calendars are eligible; disconnecting/removing the chosen default suppresses the shortcut. Each date gets a compact Plus in all six views (Schedule dates with entries); its QR opens a one-day all-day Google draft on the clicked date with the default calendar. The phone can change time/calendar before saving. No Google API writes, account override or credentials in QR codes.

Event and reminder detail QR codes now expand on the right at appliance/desktop widths; they stack at phone widths. The display no longer contains an outbound Google anchor. Existing view/edit handoff remains independent of the creation switch and reminder QR permissions.

Verified 76 tests, zero Svelte diagnostics, formatting and Docker production build; HTTP QR decoding for existing and new events, configured date/calendar, origin checks and admin boundaries. Browser checks cover date-specific Add controls across six views, side panels for events/reminders at 1280 x 720, and responsive mobile layouts. Google's actual desktop editor selected the requested date and configured shared calendar; the draft was closed unsaved. The target-calendar src parameter is not in Google's formal template documentation, so physical phone/app routing and another account remain operator checks. No live event/reminder content was changed.

## Noon drafts and sliding QR details - 17 October

The operator confirmed the render-route creation link works on a phone. Creation now sends same-date 12:00 start/end values with explicit installation time zones, instead of all-day bounds. Google desktop verification shows All day unchecked, both fields at noon, and the selected date/default calendar. No draft was saved. This new timed variant still needs a physical phone check.

Event and reminder details now have a QR handle on the right edge. It slides an overlay in/out within a stable-height dialog, leaving details independently scrollable. Code generation stays lazy and the mounted code survives closing/reopening the dock; closed content is inert. Reduced motion disables animation. The open handle has an opaque base so detail text cannot show through it. Verified desktop event dialog bounds remain identical before/after expansion, and reminder QR fits at phone width. Add-only QR dialogs remain directly visible.

## Compact QR and Month range creation - 17 October

Removed reminder QR captions, including Add. The detail dock now uses a pencil icon and a 324px QR-sized minimum body (rather than a fixed 400px), growing with content up to the viewport limit and then scrolling details independently. Opening the dock still does not resize the dialog. Reminder Add is top-right; all displayed event/reminder Plus controls share a 40px circular outline and icon.

Month no longer shows Plus buttons. Its empty-cell targets open an all-day draft for one date, or an inclusive date range selected by pointer dragging in either direction across visible weeks. Selection highlights the range; cancellation/Escape/outside release dismiss it. Date numbers and event cards retain their own actions. Keyboard activation supports single-day creation. Server validation handles all-day range bounds and the exclusive Google end date; other views retain noon-to-noon drafts. No Google event is written by the appliance.

Verification: 76 tests, clean Svelte diagnostics/build/formatting, and live QR decode checks for timed and multi-day all-day bounds. Browser checks cover forward and reverse cross-week selection, keyboard single-date creation, date-number navigation, matching 40px controls, Add without caption, short dialogs remaining 610x401 before/after expansion, and long descriptions growing to the viewport limit with internal scrolling. A clipping defect found in the long-content check was corrected. Phone-width overlay has no horizontal overflow. Physical touch dragging and Google phone handoff for ranges remain operator checks; no live events or reminders were modified.

## Seven-day selection and uncluttered Add - 17 October

Add event now shows only its title and QR, matching Add reminder; date/range parameters are still encoded. Schedule event Plus controls are removed. The 7-day view has uniform date labels with no today highlight and no Plus buttons. Empty space across its date/all-day area above the divider supports single-day all-day creation and bidirectional range dragging; date labels, event cards and the expansion handle retain their own actions. The existing top-header Today indicator remains. Reminder Plus overlays its top-right corner without extra list padding.

Verified 76 tests, Svelte check/build/lint and existing live timed/all-day QR checks. Browser inspection at the seven-inch reference dimensions covers empty banner-space tapping, range dragging, event/date navigation, uniform heading styles, Schedule absence of event Add controls, caption-free Add dialog and the operator's long reminder title wrapping with zero reserved top padding. No reminder/event content was edited. Physical touch selection remains an operator check.

## Compact date context - 17 October

Removed the standalone Month title row and 7-day range row. Month shows its browsed month/year beside the clock (within the existing header height on narrow screens); first-of-month cells include a short month label so context survives header collapse. Today's date marker remains a 22px circle. Rolling 7 days adds a short month beside its first day and each month boundary, with no separate range row. Verified 1280x720 and 390px layouts, header collapse, month navigation, and 31 Oct / 1 Nov boundary labels. All 76 tests, Svelte check, lint and Docker build pass. No provider or reminder writes; DEV remains running.

## Shared Add chooser - 17 October

The Add popup now offers Event / Reminder when both QR features are enabled. Event entry points preserve their selected date as the reminder phone form default; reminder-panel Plus starts undated, with its panel date used if switching to Event. Multi-day selections remain Event only. Disabled modes are omitted. QR images load lazily and survive switching without layout movement or new grants on each toggle. No outbound kiosk links or Google API writes.

The optional reminder date is validated and persisted with the scoped QR grant, passed into redemption/session reload and reused by Add another. Users can change or clear it. Additive SQLite migration preserves existing grants/settings with a null default; edits remain unaffected.

Verified: 78 tests, zero Svelte diagnostics, formatting, Node and Docker builds, disposable HTTP QR smoke including date persistence/clearing and existing authorization/retry checks. Browser checks cover Day/Month/7-day entry points, reminder-first switching, single-date switching, multi-day Event-only selection, reminder-only configuration, stable 608x408 dialog, no outbound links, and 390px phone date prefill/save/Add another. Household event/reminder content was not changed; write checks used a disposable installation. Physical phone scan of this new chooser remains an operator check. DEV remains running with the LAN Compose override.

## Reminder history and overdue repeats - 17 October

Month now has a discreet reminder icon on dates with any reminders, including past/future, notes, completed and cleared tasks. It opens a read-only, scrollable popover. Schedule adds the same history after events and includes reminder-only dates, with six-week pagination working without a Google connection. Undated items remain in the action widget.

Overdue tasks precede Today in the widget. A repeating series contributes one item at its oldest missed date, with no duplicate Today item. Completing it records one actual completion at the latest outstanding scheduled occurrence, marks its remaining missed backlog Cleared through today, and retains fixed future dates. Undo restores its cleared backlog; actual historical completions are preserved. Schema v5 migration adds nullable coverage bounds without resetting existing history. Today, overdue and Anytime tasks can be completed; future items and notes cannot. No Postpone control was added.

Verified 82 automated tests covering long recurrence gaps, fixed schedules, completed/cleared distinction, ended repeats, undo/restart, conflicts, v4 migration, reminder-only dates and overlapping Schedule windows; clean Svelte/check/lint and production builds. Disposable HTTP smoke covers overdue/today/future completion on both endpoints and existing CRUD/origin checks. Browser checks at 1280x720 and 390px cover widget ordering/deduplication, completion, historical Month status, informational bubble controls/fit, Schedule placement and reminder-only pagination. No household reminder/event content writes; a private pre-migration SQLite snapshot was retained. Physical Pi/phone interaction remains an operator check.

## Reminder presentation refinements - 17 October

Schedule now labels reminder rows To do or Note and opens the existing read-only detail dialog on tap. Unfinished todos use reddish empty checkboxes; completed items retain checkmarks and cleared history its separate icon. Past notes are grey/muted. Month bubbles omit extra type/status captions. Rolling 7 days shares the same date reminder icon and read-only bubble, placed beside each date without an extra row.

Verified 82 tests, clean Svelte check/lint/build and browser checks at 1280x720/390px: shared bubble content, only Close actionable, phone fit, past-note styling and Schedule details. A viewport-resize positioning issue was addressed by dismissing open bubbles on resize. Synthetic reminders used for write checks; household data unchanged. DEV left running; physical Pi touch/readability remains an operator check.

## Date controls and future reminder colours - 17 October

Reminder icons now follow the date inline in Day, 2 days, 3 days and rolling 7 days, aligned to the text baseline with no added row. Each opens the existing informational bubble. Month retains its corner placement. Schedule dates have independent buttons that navigate to that Day; event/reminder content remains a separate details action. Future unfinished todos now retain normal text colour; reddish empty checkboxes apply only on/before today.

Verified 82 tests, zero Svelte diagnostics, lint and Node/Docker builds. Browser checks cover inline icons and bubbles across all four agenda views, Schedule date-to-Day navigation without opening a dialog, reminder detail action, normal future recurring task colour versus reddish due tasks, and 390px Schedule layout. DEV is healthy and running with both Compose files; no household data writes.

## Stable current reminders while browsing - 17 October

Day/2/3 browsing now prepends the selected date's active reminders above the permanent current-day groups: Overdue, Today, then undated. Selecting Today renders it once; empty groups and resolved items remain omitted. Past tasks already represented by an overdue series are not repeated in the selected-day group, while distinct future occurrences remain browsable. Dates are omitted beneath rows when already provided by their heading; overdue rows retain individual due dates.

Verified 84 tests (including stable current groups, empty dates, completed items, past duplication and recurring backlog/future occurrences), Svelte check, lint and Node/Docker builds. Browser verified 24 December with the selected date heading once, preserved current groups, and return to Today without duplication. No household reminder changes; DEV remains healthy with both Compose files.

## To-do completion in details - 17 October

Shared reminder details now use To do for task headings and expose Mark as done in a footer. Successful completion updates the calendar/widget and closes the popup. Existing completion rules apply: today/overdue/undated allowed, future/cleared blocked, completed history shows disabled Done, notes unchanged. Errors remain visible inside the dialog. The footer stays outside the QR overlay and long-detail scroll area.

Verified 84 tests, Svelte check, lint and production build. Disposable browser/HTTP checks confirm current-task completion from Day details, recurring overdue completion from Schedule with preserved clearance coverage, future disabled, completed Done disabled, notes without completion, and 1280x720/390px long-text/QR footer visibility. Undated completion also works with QR expanded. All writes used disposable data; household reminders unchanged. DEV left running.

## Header arrangement and compact completion - 17 October

Moved Mark as done beside To do in the detail header, reduced it to a 34px-high control, and removed the footer row. Completion/disabled behaviour and error reporting remain. Main header now centres date navigation with view selection on the right. Month/year sits beside navigation with its bottom edge aligned to the control outline; narrower screens place it on the left to avoid overlap. Three-day headings use full weekdays. Seven-day headings show weekday/day/month on every date with the weekday emphasized. Two/three-day paging now advances by two/three days in both directions. Schedule today tasks are normal text colour; only overdue unfinished tasks are red.

Verified 84 tests, check/lint and production builds; browser checks at 1280x720 and 390px for header geometry, Month label alignment/no overlap, full weekday labels, seven-day labels, forward/backward span navigation, Schedule past/today colours and successful completion via the compact phone header. All write checks used disposable reminders. DEV remains running with household data intact.
