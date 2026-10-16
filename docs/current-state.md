# Current build

Version: **0.1.0-dev**, 16 October 2026. Local development preview; not yet a deployed household appliance.

## Calendar display

Day, 2 days, 3 days, rolling 7 days, Month and Schedule are implemented. Day/2 days/Schedule pin reminders; other views use the overlay dock. The collapsible header has clock, icon view selection and date navigation. Warm/Dark themes, visible calendars and independent idle timers are saved per browser. Reset scroll defaults to 15 seconds, Return to Today to 60; blank disables either. Menu hiding and all-day collapse remain 15 seconds. Dialogs pause idle navigation.

Timed multi-day events appear with all-day banners in Day/2/3 and the shared 7-day strip. Three lanes show initially; the divider grip expands/collapses. Month spans events across columns and expands overflow in place. Schedule splits multi-day entries by occupied date with start/All day/Until labels and Day n/total. End dates are exclusive, local midnight/DST are handled, overlapping events stay separate, and rich descriptions are safely rendered as plain text. Empty timed agendas, including the end of today's agenda, show no placeholder text. Past events remain scrollable.

## Menu and reminders

The menu uses three consistent rows: Reminders & events, Display & behaviour, Visible calendars. Reminders & events opens dedicated management with Reminders/Google Calendar tabs and explicit Menu and Calendar links. The separate Google root-menu entry and Browse all popup are removed. Phone-width menu access stays visible.

All reminders use one shared **General** list. No list selector or personal-list labels. Management offers search, Active/Completed/All, grouped dates and completed history. Creation is on management. Reminder text opens calendar details with an Edit button; the shared popup closes back to the same calendar view/date, or to management when opened there. Failed saves retain input and offer explicit reload after conflicts. Delete requires confirmation. Google events remain read-only and are managed natively in Google Calendar.

To-dos have a checkbox; notes are outlined cards without completion. Dated items appear on their assigned date and undated items remain visible. Empty groups, unnecessary labels and panel footer controls are omitted. Past single-use notes remain available in management and on their original date. Older unfinished single-use tasks appear separately. Completion counters include only to-dos for the displayed date.

Both types can repeat daily, weekdays, weekly or monthly, with intervals and an optional inclusive end date. Repeating cards show a small repeat icon. Completion/undo affects one occurrence. Missed repeats do not accumulate as overdue tasks; management shows the next incomplete occurrence and completed history. Monthly schedules clamp to shorter months, then return to the original date. Series edits/deletes apply to the whole series; changing the schedule clears completion history with an explicit warning. Exceptions and individual-occurrence edits are not implemented.

SQLite schema v4 adds repeat rules and occurrence completion records. Migration preserves existing rows, details, versions and completion states, while normalising list labels to General. Older binaries cannot open v4. Version checks protect against concurrent overwrites; tokens and Google settings live separately. No automatic data reset is shipped.

## Google and access boundaries

Read-only Google OAuth, multiple accounts, selected calendars, deduplication, expanded recurring instances, paginated bounded snapshots and last-good caching are implemented. Background polling is silent; stale/error conditions remain visible. OAuth secrets/tokens are encrypted server-side; event cache and key material make the entire volume sensitive. The shipped setup guide includes direct Google Console links and 24/7 guidance about Testing-mode expiry and operator-owned OAuth clients. No Google Cloud publishing settings are changed by the app.

The preview remains loopback-only. Responsive forms do not imply LAN access. Pairing, management authorization, phone-to-Pi OAuth callback, backup/export/recovery and hardware validation precede deployment. Google write support is not a planned milestone.

## Verification

- 46 automated tests pass: calendar date/span/display rules, provider behavior, OAuth/cache boundaries, reminder validation/persistence/concurrency, recurrence calculations and migrations from schema v1/v2/v3.
- Svelte type/accessibility checks report no errors or warnings. Formatting and Docker production compilation pass.
- Isolated HTTP smoke verifies CRUD, completion/undo, notes, invalid input, Origin rejection and stale-version conflicts.
- Browser checks at 320px/390px phone widths and 1280 x 720 verify uniform menu rows, management-to-menu return, recurring to-do/note creation and editing, calendar popup save retaining the selected date, repeat indicators and occurrence-only completion. Warm and Dark layouts inspected. No Google writes used for testing.
- Existing connected-calendar display remains available after upgrade. Test fixtures use a separate disposable installation.

Not yet verified: real phone keyboard, LAN pairing/callback, live mutation of Google recurring exceptions/cancellations, long-running token renewal, backup recovery, ARM64/Pi deployment, physical touch/readability or sustained OS+kiosk+server memory. A previous short amd64 container-only sample around 22 MiB is not a Pi sizing result.
