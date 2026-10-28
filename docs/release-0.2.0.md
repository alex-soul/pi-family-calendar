# 0.2.0 pre-release

This pre-release promotes the accepted RC3 behaviour without further application changes. It adds independent reminder items, Note categories and history, compact calendar controls, clearer synchronization status and PIN recovery guidance. Published AMD64 and ARM64 images passed CI verification; the release includes the image manifest, ARM64 archive and checksums.

## RC3

- Notes have Active, Past and Templates views, with searchable/category-filtered history and confirmed Delete all past. Switching reminder types maps Completed to Past and back. History is newest first, and filtering covers the full saved list before pagination.
- Reminder lists remove redundant headings and template labels and show Note category icons. Calendar ToDos place their time beside the title; overdue text is red without an extra label.
- The clock-header handle doubles as a sync-status tube: green for healthy, red for a failure, neutral while checking or unconfigured. It retains its show/hide action.
- Event hiding and its confirmation share the expandable Edit dock with the QR/link actions.
- Admin uses six-box PIN entry. New PINs have six digits; existing longer PINs remain usable. The [SSH recovery guide](admin.md#forgotten-pin-installation-owner-only) explains disabling a forgotten PIN and choosing a new one without deleting application data.
- RC2 data and settings are retained. No reset flag or database migration is required.

## RC2

- Notes hides the inapplicable Completed filter. Note templates can be filtered by category and searched within that category.
- Access uses clearer QR switches and numeric PIN inputs with validation shown only when needed. The Default calendar picker remains full width.
- Google full-sync recovery fetches expanded history in bounded yearly batches, preserving cached events and the sync cursor if any batch fails. Admin shows specific safe errors, individual calendar progress, last success, next retry and targeted retry results.
- Upgrading from RC1 preserves saved reminders, templates, categories and settings. Do not repeat the legacy reminder reset.

## Changes

- Repeating reminders are templates that generate independent saved items at midnight, with one retry at 01:00. Future occurrences are previews; saved items retain their own edits and completion state.
- To-dos support due times and undoing completion. Notes support a date, optional display window, and custom category colours and icons.
- Reminder management separates items, templates and completed to-dos, with compact filters and search. Completed to-dos can be deleted together after confirmation.
- Display views use consistent reminder ordering, compact timed-note indicators, clearer detail cards and larger touch targets. Events can be hidden for one day in one browser and restored from the eye menu.
- The optional MQTT adapter adds a kiosk-only Warm/Dark theme selector. Google setup links to the repository's shared instructions.

## Upgrade boundary

The reminder model deliberately does not migrate legacy reminders. The first upgrade requires an operator-approved, one-time reminder reset with `RESET_REMINDERS=true`. Back up with the old image's matching tools and rehearse recovery before enabling it. The reset clears legacy reminders and obsolete reminder grants/receipts, while retaining Google data, PIN and QR configuration. It does not erase reminders already stored in the new schema. Remove the reset flag after the initial upgrade.

The MQTT theme selector requires the matching adapter and credential setup described in [kiosk theme integration](../host/theme-setup.md). Preserve the installation's existing volume, browser profile, origin and host controls.

RC3 received household acceptance before publication. The exact published image has been installed and automatically verified on the reference Pi; final physical review is in progress. See [current validation](current-state.md), [release and upgrade procedure](releasing.md) and [PIN recovery](admin.md#forgotten-pin-installation-owner-only). Back up before upgrading; never repeat the legacy reminder reset on an installation already running RC1, RC2 or RC3.

## Known issue reported after publication

Schedule can initially scroll below an all-day event, repeat a date beside the focused reminder, and separate events from reminders within the same day. Scrolling up reveals the event. This presentation issue is explicitly deferred to the next release; see [scope and expected behaviour](roadmap.md#next-release-schedule-day-grouping-and-initial-scroll). The published tag and image are unchanged.
