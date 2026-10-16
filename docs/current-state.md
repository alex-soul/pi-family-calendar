# Current build

Version: **0.1.0-dev**, first development foundation with drawer, Month and Schedule navigation, 16 October 2026.

Implemented: SvelteKit display views, tap-open details, three-row all-day strip with expansion and scrollable past events, calendar filtering, two themes, local reminder management/completion/undo, SQLite persistence/version checks, loopback development access, Docker packaging and automated checks. Source was built fresh; the standalone mock is not reused.

Calendar data is fictional until Google is configured. Google read integration and cache are implemented; no live account has been authorized during development, and event writes remain unavailable. Do not interpret an empty day as actual availability. The local reminders are real database entries, initially empty.

## Notes and reminder groups

To do and Note are distinct persistent reminder types, created/edited through the responsive management form. Notes are outlined text cards with no checkbox; each date group orders todos before notes without a type divider. Today (or the browsed date) is labelled only when active dated items exist. Undated items have no heading; a line separates them only from a preceding active group. Empty placeholders and inline completed disclosures are hidden. Completed items remain in All reminders, accessed through the main menu. Only todos count toward completed/total. Dated notes appear on their date; undated notes remain visible, and past notes stay accessible in the full list and original date. The API rejects completion/undo for notes. Existing reminder detail text remains separate from the new Note type (labelled Details in forms).

SQLite schema v3 adds kind, migrating existing rows to todo without changing their text, versions or completion state. Pre-v3 binaries cannot open this schema. Seventeen tests pass, including v1/v2 migrations, note persistence, conversion, completion rejection, legacy edits and ordering/counts. Packaged HTTP smoke includes note create/edit/delete and completion rejection. Browser checks covered dated create, mobile-width edit, future-date visibility, no checkbox and Anytime ordering. The temporary UI-check note was removed; existing operator entries were preserved. All-day grip background is reduced to fit within the separator gap.

Latest cleanup: empty date groups show no label or placeholder; undated items have no label or leading separator when alone. Completed items are only in All reminders. The panel footer is removed; the main menu provides All reminders access. Verified the note-only widget and completed/undo access in the browser without changing reminder data; 17 tests and Docker check/build passed.

## Current UI pass

Day, 2 days and Schedule have a solid, permanently visible reminder panel next to their events. Other views retain the heading-free overlay dock. The handle shows completed/total for the relevant day's due items; undated, future and overdue reminders do not inflate it. Unfinished older and undated items are still accessible. The full list and editor handoff remain.

All-day rows align left with timed cards and have no visible label. Initially show three, with an unlabelled tap/drag grip on the separator, without an extra control row. Inactivity collapses expanded strips. Past timed events stay in the scrollable timeline, initially positioned at the current/next event. Day/2-day/3-day and Schedule return after 15 seconds idle by default, with 30/60 seconds and Off in settings. The same inactivity setting hides the three-line menu button; Off disables all automatic hide/collapse/follow. Interaction and open overlays pause scrolling/collapse; the pinned Day panel does not.

Month is now a dedicated four-to-six-week grid with compact event text and in-place date expansion/collapse. A fixed round, glossy marker highlights today. 7 days replaces Week and starts today on entry, retaining seven-day paging. Schedule is a chronological, bounded list with compact 36px rows. Dark replaces Slate, with deeper colours and restrained glass-like highlights; saved Slate preferences migrate. Header date/time is larger and top padding reduced.

Recurrence is required future functionality, visibly reserved as a disabled Repeat field. No repeating rule is currently stored or executed; occurrence-specific completion/undo must precede enabling it. Google integration remains pending.

Verification for this pass: 14 tests, zero-error/warning checks, formatting, production/Docker builds and packaged HTTP smoke. Browser inspection covered the pinned Day panel, overlay in 7 days, rolling today-to-six-days-ahead range, compact Schedule, five/six-week Month expansion and collapse, neighbouring overflow containment and a 22 x 22px today marker. Timed checks at 9 and 16.5 seconds confirmed menu and expanded all-day rows share the 15-second timeout. Tap and keyboard expansion passed; pointer drag is implemented but physical touchscreen drag/readability remain unverified. Existing reminders were preserved. Earlier checks established completion/undo, drawer pause and Off; actual mobile keyboard, Pi performance and live Google remain unverified.

## Verification

- `npm run check`: zero errors and zero warnings. Seventeen synthetic tests pass, including date/DST rules, indexed event ordering, disk persistence, stale mutations and preservation of v1 data during the notes migration. Formatting and production compilation pass.
- HTTP smoke passes against both the development server and the Docker build: health, invalid input, cross-origin rejection, reminder create/read/edit/complete/undo/delete, missing items and stale-write conflicts.
- Container restart persistence passed with a dedicated test reminder, subsequently removed. The named volume preserves data. The container is healthy and runs without root privileges.
- Browser checks at 1280 × 720 covered Day, 2/3 days, Week, event details, all-day and Earlier disclosures, native scrolling, Month navigation into another month, calendar filtering, Warm/Slate, and completion/undo. Responsive reminder creation/editing was exercised at 390 × 844. The final Docker-served display's completion/undo was also verified.
- Physical touch, viewing distance, a real phone keyboard, ARM64 and Pi hardware remain unverified. The reference pixel layout does not establish physical readability.
- A brief amd64 Docker Desktop idle sample after restart/API checks reported about 22 MiB container memory and 0% CPU. This excludes Chromium, Docker's VM and the host OS; it is not a Pi sizing result or a sustained measurement.

The packaged smoke test initially caught valid writes being rejected because SvelteKit 3 moved origin configuration from the adapter's runtime `ORIGIN` variable to `paths.origin` at build time. Configuration was corrected, the container rebuilt, and HTTP/browser writes passed. CI includes a packaged HTTP smoke step to catch this regression. During development, a temporary hot-reload module fetch failed across a rebuild; the final packaged browser session did not show that failure. See the [development guide](development.md) to repeat checks.

## Limits that matter

- Local computer preview only. LAN pairing/authorization comes before household deployment or phone access over the network.
- Shared/personal lists are fixed organisational labels, not access-controlled personal accounts. No repeat rules or occurrence model yet.
- Google setup requires operator OAuth credentials and consent; live authorization remains unverified. No event editing, backup/export tooling, installer, kiosk setup, release image publishing or public licence yet.
- The Docker volume persists data and the v1/v2-to-v3 migrations are tested. Backup/restore tooling and recovery validation are still required before irreplaceable data is used.
- Full-appliance memory, recovery and sustained operation on Pi 5 / 2 GB are outstanding. A container-only sample is not a Pi sizing result.

The next work is a bounded first-build review followed by device access and Google read integration, as described in the [roadmap](roadmap.md).

Latest layout refinement: agenda headings use weekdays, and Today navigation is highlighted/pressed when its starting date is today. The 2-day view now pins reminders in a third column. Footer actions are grouped right without the former extra inset. Verified at 1280 x 720, including Today highlight changing with navigation; 17 tests and Docker check/build passed.

Header simplification: shared previous/today/next icon controls now sit beside a time-only clock, aligned with view controls. Month, 7 days and Schedule use the same navigation. All event/reminder Add entry points were removed from the display; management forms remain. Reminder footer is now removed; the main menu provides full-list access. Verified header navigation, Today state and absence of Add controls across the display; 17 tests and Docker check/build pass.

Latest inactivity refinement: the reminder panel has no footer, leaving its full height for items. Main menu > All reminders retains full-list and completed/undo access. After 60 seconds idle, browsed dates return to Today without changing the view; Month returns to the current month. The existing 15-second scroll/collapse/menu timeout remains. Open dialogs/drawers, held pointers and hidden documents suppress date return; input restarts the delay, and Off disables it.

Verification: 17 tests passed; Docker check/build completed with zero diagnostics. Browser confirmed full-list/completed access through the main menu and the footer-free panel at 1280 x 720. A browsed day remained selected at 23 seconds and had returned at 62 seconds; an open Menu kept the browsed date selected after 62 seconds. Existing reminder records were not changed.

## Independent timers and collapsible header

Main menu now has Reset scroll and Return to Today fields in whole seconds (defaults 15/60). Blank disables each independently and remains blank after reload; legacy Off migrates to two disabled fields. Menu hide/all-day collapse remain at 15 seconds. Dialog/interaction guards and view-preserving date return remain. The clock is left, view controls centred, date controls right. The divider handle hides/restores the full header, with per-browser persistence and a reachable restore handle; narrow layouts wrap views below clock/navigation.

Verified: 20 tests, zero check warnings/errors, formatting and Docker production build. Browser checks at 1280 x 720 and 390 x 844 confirmed centred controls, divider alignment and header hide/restore; collapsed state survives reload. Custom short delays work independently; both blank settings survive reload and retain manual scroll beyond the 30-second refresh. Defaults restored to 15/60 after checks. No reminder records changed.

View selector: six matching SVG icons now share one outline. Numbered calendar icons represent 1/2/3/7 days; a calendar grid represents Month and stacked rows represent Schedule. Buttons retain full accessible names, hover titles and pressed state, with 48 x 44px targets. Verified all six view switches, 1280 x 720 appearance and 390px fit; 20 tests and Docker check/build pass. No external icon package or font is required.

Header styling: view and date controls now share translucent surfaces, equal 48 x 44px targets and matching icon scale. Both selected states use a muted tinted gradient, fine highlight edge and small underline rather than a bright solid fill. Clock weight increased to 650. Verified Dark/Warm rendering and date-selected state, with 20 tests, formatting and Docker check/build passing. No data or navigation behaviour changed.

## Google read integration

Implemented settings at `/manage/google`, linked from the main menu and management: first-time setup guide, write-only client secret input, account connection/disconnection, calendar selection and Sync now. OAuth uses the official Google auth library, offline read-only scope, PKCE, one-time state and a browser-bound cookie. Multiple accounts and duplicate shared calendars are supported. Saving configuration switches away from sample events.

The server persists encrypted credentials and twelve bounded event windows separately from reminders. Full paginated polling expands recurrence and replaces each window only after success. Display refresh is every minute; server TTL is two minutes. Temporary/quota errors retain last-good data and original sync time, with visible warnings. Revoked access clears cached windows. Browser code receives no saved tokens/secrets. Added a local Host allowlist alongside existing Origin/loopback checks.

Validation: 29 synthetic tests cover OAuth parameters/state/replay/cancellation, credential encryption/restart, token merging, recurrence/date normalization, cancellations/deletions, selection/deduplication, permission changes, stale cache, pagination and quota classification. Check has zero errors/warnings; production Docker build and existing reminder HTTP smoke pass. Packaged API tests confirm unconfigured status, invalid configuration rejection, invalid callback redirect, cross-origin POST rejection and foreign Host rejection (raw HTTP test). **Live Google sign-in and real events are not verified: operator credentials/consent are still required.** Pi/ARM64, LAN/phone authorization and production access controls remain deferred.

Additional packaged verification: isolated disposable container accepted fictional OAuth configuration, returned redacted status, generated the read-only PKCE authorization URL with an HttpOnly/SameSite=Lax cookie, and handled an explicit Google access-denied callback. No Google network request was made. The fixture container was removed. Google setup was inspected at desktop and 390px widths; existing preview configuration/reminders were preserved.

## First operator connection feedback

The operator reports that setup went smoothly and two calendars are connected. This is user-reported live connection success, not yet an independent audit of event accuracy, refresh-token renewal, recurrence or offline recovery. Added a direct Google Auth Platform link in the in-app guide and setup documentation. The guide is a retained part of the shipping product.

## Real-event display review and Month spans

Reviewed the connected provider across Day, 2 days, 3 days, rolling 7 days, Month and Schedule. Month now renders all-day and timed multi-day events as continuous bars, split at week boundaries with continuation marks. Separate lanes prevent overlapping bars colliding; More expands the week row in place, including all entries, with Less to collapse. Calendar colours remain on left edges. Recurring occurrences remain individual entries, not a merged series bar.

Fixed day cards repeating the original time range on every day of a timed multi-day event. Day/2/3/7 and Schedule now show start/continues/until labels appropriate to each date. Now highlights only today's card. All-day end dates stay exclusive internally and display an inclusive final date. Google rich descriptions no longer show raw markup; display-only text extraction preserves text and link destinations without executing HTML.

Validation: 34 tests passed, zero check errors/warnings, formatting and Docker production build. Added regression coverage for cross-week spans, overlapping lanes, overflow membership, exclusive ends, midnight, DST, separate recurring instances and text extraction. Browser checks covered all six live views, a live two-day all-day event present on its two dates and absent on the following date, its detail end date, recurring local times across the October offset change, and timed multi-day start/middle/end labels. A separate disposable demo container verified busy-month expansion/collapse and six-week containment. No Google writes or reminder changes. Live moved/cancelled recurrence experiments and long-running token renewal remain untested; cancellation/cache handling has synthetic coverage. Physical Pi readability remains pending.

## All-day placement for multi-day events

Following operator screenshot feedback, Day/2/3-day agendas now place timed multi-day events in the all-day banner area, including the first and final partial days. Banners retain start time on the first day, Until time on the last and continuation marks; the detail dialog retains original timestamps. They no longer duplicate in timed lists. The rolling 7-day view shares continuous banners across columns for all-day and timed multi-day events; its timed cards align beneath the common strip. Both banner layouts retain three-lane collapse and tap/drag expansion. Month is unchanged.

Schedule shows a separate date entry with Day n/total for multi-day events, using start time, All day for interior dates and Until time on the final date. Day counts use local calendar dates, including DST and exclusive/midnight boundaries. Validation: 36 tests, zero check diagnostics, formatting and Docker build. Live browser checks confirm Day/2/3 placement, one continuous 7-day bar without timed duplicates, and correct three-day Schedule labels. No Google writes or reminder changes.

Overflow check in an isolated fictional calendar: Day expands from three to five banners; the shared 7-day strip expands from three to five occupied lanes across two busy dates, while timed cards remain aligned below. Test container removed after verification.

## Schedule and calendar polish

Schedule now pins the same reminder panel as Day, with no Schedule heading or overlay handle. Date labels use a comma after the month; today has a 34 x 34px round highlight using the header selection palette. Month retains its 22 x 22px circle with that same palette. Seven-day headings use one row (day number then abbreviated weekday). Banner left-edge rounding stays consistent across start/middle/final dates; continuation chevrons remain.

Normal minute-by-minute calendar polling is silent; foreground date loads retain their indicator, and genuine stale/error warnings remain visible. Switching views closes the overlay drawer so it cannot invisibly pause polling or idle behaviour.

Validation: 36 tests passed, zero Svelte diagnostics, formatting and Docker production build passed. Browser checks at 1280 x 720 confirmed the pinned Schedule panel, absent heading/dock handle, comma labels, exact circular dimensions and matching gradients, compact seven-day headings and consistent banner borders. Existing calendar connections and reminders were preserved. Physical Pi testing remains outstanding.

Small display cleanup: agendas with no timed events leave the area blank, including days containing only banners. The 7-day number and weekday now share a text baseline.
`npm run check`, all 36 tests, formatting and Docker build passed. Browser verification confirmed a banner-only agenda has no placeholder text and 7-day headers use baseline alignment.
