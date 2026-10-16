# Current build

Version: **0.1.0-dev**, first development foundation with drawer, Month and Schedule navigation, 16 October 2026.

Implemented: SvelteKit display views, tap-open details, three-row all-day strip with expansion and scrollable past events, calendar filtering, two themes, local reminder management/completion/undo, SQLite persistence/version checks, loopback development access, Docker packaging and automated checks. Source was built fresh; the standalone mock is not reused.

Calendar data is fictional when demo mode is selected. No Google account, event cache or write integration exists yet. Do not interpret an empty day as actual availability. The local reminders are real database entries, initially empty.

## Notes and reminder groups

To do and Note are distinct persistent reminder types, created/edited through the responsive management form. Notes are outlined text cards with no checkbox; each date group orders todos before notes without a type divider. Today (or the browsed date) is labelled only when active dated items exist. Undated items have no heading; a line separates them only from a preceding active group. Empty placeholders and inline completed disclosures are hidden. Completed items remain in All reminders, whose footer menu sits beside Add at the right edge. Only todos count toward completed/total. Dated notes appear on their date; undated notes remain visible, and past notes stay accessible in the full list and original date. The API rejects completion/undo for notes. Existing reminder detail text remains separate from the new Note type (labelled Details in forms).

SQLite schema v3 adds kind, migrating existing rows to todo without changing their text, versions or completion state. Pre-v3 binaries cannot open this schema. Seventeen tests pass, including v1/v2 migrations, note persistence, conversion, completion rejection, legacy edits and ordering/counts. Packaged HTTP smoke includes note create/edit/delete and completion rejection. Browser checks covered dated create, mobile-width edit, future-date visibility, no checkbox and Anytime ordering. The temporary UI-check note was removed; existing operator entries were preserved. All-day grip background is reduced to fit within the separator gap.

Latest cleanup: empty date groups show no label or placeholder; undated items have no label or leading separator when alone. Completed items are only in All reminders. The footer menu and Add are grouped at the right edge. Verified the note-only widget and completed/undo access in the browser without changing reminder data; 17 tests and Docker check/build passed.

## Current UI pass

Day and 2 days have a solid, permanently visible reminder panel next to their agendas. Other views retain the heading-free overlay dock. The handle shows completed/total for the relevant day's due items; undated, future and overdue reminders do not inflate it. Unfinished older and undated items are still accessible. The full list and editor handoff remain.

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
- No Google sync or editing, provider credentials, backup/export tooling, installer, kiosk setup, release image publishing or public licence yet.
- The Docker volume persists data and the v1/v2-to-v3 migrations are tested. Backup/restore tooling and recovery validation are still required before irreplaceable data is used.
- Full-appliance memory, recovery and sustained operation on Pi 5 / 2 GB are outstanding. A container-only sample is not a Pi sizing result.

The next work is a bounded first-build review followed by device access and Google read integration, as described in the [roadmap](roadmap.md).

Latest layout refinement: agenda headings use weekdays, and Today navigation is highlighted/pressed when its starting date is today. The 2-day view now pins reminders in a third column. Footer actions are grouped right without the former extra inset. Verified at 1280 x 720, including Today highlight changing with navigation; 17 tests and Docker check/build passed.

Header simplification: shared previous/today/next icon controls now sit beside a time-only clock, aligned with view controls. Month, 7 days and Schedule use the same navigation. All event/reminder Add entry points were removed from the display; management forms remain. Reminder footer contains only the list-menu button, without date/completion text. Verified header navigation, Today state and absence of Add controls across the display; 17 tests and Docker check/build pass.
