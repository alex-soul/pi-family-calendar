# Follow-ups after v0.2.0

The 0.2.0 release candidates received household acceptance. Published-image verification and final handover are tracked in [current state](current-state.md). Continue in focused release sessions rather than reopening the initial build or repeating accepted checks.

## Next release: Schedule day grouping and initial scroll

Reported during 0.2.0 review on 28 October 2026; explicitly deferred to the next release. No fix is included in 0.2.0 and no next version number is assigned.

On a day containing an all-day event and reminders, entering Schedule can focus the reminders and leave the all-day event above the viewport. Scrolling up reveals it, but the same date can appear both on the event and again on the focused reminder. Previous/Next navigation can remove the repeated date, while a separator still incorrectly divides events from reminders within that day. This report concerns presentation/scroll position, not missing stored events or the explicit Hide for this day setting.

Expected result: all events, Notes and ToDos for one date form one coherent day group, with one date heading and separators only between different dates. Initial focus/Today return must not make that day's all-day content appear absent. Manual scrolling and Previous/Next should show consistent grouping.

Source inspection identifies three relevant behaviours, without a browser reproduction or fix:

- `src/lib/display.ts`, `scheduleFocusIndex`: today's current/upcoming timed event takes priority, then a reminder, then a future date, and only then today's all-day event.
- `src/lib/styles.css`: the focused row's date is made visible even when it repeats the preceding row's date.
- `src/lib/components/ScheduleView.svelte` and `.schedule-reminder.reminder-divider`: an explicit same-day event-to-reminder divider is rendered.

Next-release validation should combine all-day/timed events, Notes, unfinished/completed ToDos and future template previews; exercise initial entry, idle/Today focus, manual scroll, Previous/Next and refresh/paging boundaries. Include event-only/reminder-only dates and hidden-event restoration. Confirm no duplicate date heading, no within-day type separator, no missing or duplicated rows, and an unchanged Today reminder side panel. Use fictional data and check both themes, narrow layouts and the Pi screen.

## Validation to extend

- Continue longer everyday operation and resource observation beyond the accepted candidate trial. Candidate experience is not evidence for untested hardware or every failure mode.
- A second household user's phone/shared-calendar permissions and extended token-refresh observation. Fresh consent through the shipped SSH helper and a personal Google Production configuration have been exercised on the reference appliance; each operator must configure their own client.
- Live recurring exceptions/cancellations, permission changes, private-event visibility and time-zone boundaries beyond existing fictional-provider tests.
- Other hardware/OS combinations. Pi 5 with 2 GB is the validated appliance; new display/host routes need affected physical boot/touch checks. See the [manual setup guide](raspberry-pi-setup.md).

## Operator follow-ups

- New installation owners must configure their own OAuth client using the [Google setup guide](google-calendar.md). The reference installation completed Production setup and fresh consent; this is not an unfinished product-release task. Repository publication does not change another operator's consent status or guarantee indefinite authorization.
- Arrange encrypted off-device backups, retention and independent key recovery; validate a restore. Local snapshots do not protect against SD-card loss. No off-device service or backup timer is delivered.

## Dependency maintenance

The 0.2.0 release audit found no production dependency vulnerabilities and four low-severity development-tool findings. Review compatible tooling updates in a later maintenance change and rerun the relevant checks; this documentation review does not upgrade dependencies.

## Possible focused enhancements

- Household notifications need a separate discovery/design session. Google notification icons/details alone may not fit: defaults and overrides belong to the connected account and may differ for other shared-calendar users. Explore local notification rules on the Pi, independently configured from Google's reminders, with optional Home Assistant or another delivery channel. A local component/plugin is a possibility, not a committed framework. Decide recipients, opt-in, quiet hours, recurrence/time zones, duplicate suppression, offline catch-up and delivery privacy before implementation. Distinguish displaying reminder metadata from actually sending notifications. If Google metadata is used, verify reminder-only refresh behaviour rather than assuming an event timestamp changes. No notification delivery or Google writes are currently implemented.
- Additional reminder lists, optional cloud reminder hosting, dedicated Postpone workflows or recurrence exceptions only when real usage justifies them. One General list and edit-based rescheduling remain intentional.
- Further UI refinements through the existing development workflow. No elaborate hardware assembly guide or guided installer is planned.

## Accepted limits

- Deliberate live household app-crash injection was not performed and is an accepted validation gap, **not a task to retry**. Isolated startup/restart/persistence checks do not prove sudden-power-loss or SD-failure recovery.
- The original display service can briefly retry its Wayland socket at startup and log a compositor teardown error. A failed path-activation alternative was reverted; do not reapply it without a new dependency-graph review and physical boot validation.
- Application image updates are explicit, not part of OS maintenance. Stop on failed release validation; live rollback requires operator approval and must preserve subsequent household writes.

Deployment-specific identities, credentials, cleanup and operational evidence belong in the operator's private documentation.
