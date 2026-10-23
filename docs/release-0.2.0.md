# 0.2.0 release candidate

This candidate is undergoing appliance testing. It is not a published release.

## Changes

- Repeating reminders are templates that generate independent saved items at midnight, with one retry at 01:00. Future occurrences are previews; saved items retain their own edits and completion state.
- To-dos support due times and undoing completion. Notes support a date, optional display window, and custom category colours and icons.
- Reminder management separates items, templates and completed to-dos, with compact filters and search. Completed to-dos can be deleted together after confirmation.
- Display views use consistent reminder ordering, compact timed-note indicators, clearer detail cards and larger touch targets. Events can be hidden for one day in one browser and restored from the eye menu.
- The optional MQTT adapter adds a kiosk-only Warm/Dark theme selector. Google setup links to the repository's shared instructions.

## Upgrade boundary

The reminder model deliberately does not migrate legacy reminders. The first upgrade requires an operator-approved, one-time reminder reset with `RESET_REMINDERS=true`. Back up with the old image's matching tools and rehearse recovery before enabling it. The reset clears legacy reminders and obsolete reminder grants/receipts, while retaining Google data, PIN and QR configuration. It does not erase reminders already stored in the new schema. Remove the reset flag after the initial upgrade.

The MQTT theme selector requires the matching adapter and credential setup described in [kiosk theme integration](../host/theme-setup.md). Preserve the installation's existing volume, browser profile, origin and host controls.

Physical screen, household workflow and real midnight generation acceptance remain part of the candidate trial. Follow the [release procedure](releasing.md) before publication.
