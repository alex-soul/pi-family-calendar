# Follow-ups after v0.1.0

The first deployed prerelease is delivered. Both architecture image checks and the Pi handover passed; see [current state](current-state.md). Continue in focused release sessions rather than reopening the initial build or repeating accepted checks.

## Validation to extend

- Longer everyday operation and resource observation. Short health checks and an interrupted early observation period do not establish a clean multi-day soak.
- A second household user's phone/shared-calendar permissions, fresh OAuth consent through the shipped SSH helper and sustained token refresh. Migrated credentials working do not prove a fresh onboarding journey.
- Live recurring exceptions/cancellations, permission changes, private-event visibility and time-zone boundaries beyond existing fictional-provider tests.
- Other hardware/OS combinations. Pi5 with2GB is the validated appliance; new display/host routes need affected physical boot/touch checks.

## Operator follow-ups

- Complete Google OAuth Production branding/configuration where appropriate; retain the shipped setup guidance and reauthorize when necessary. Repository publication does not change Google consent status or guarantee indefinite authorization.
- Arrange encrypted off-device backups, retention and independent key recovery; validate a restore. Local snapshots do not protect against SD-card loss. No off-device service or backup timer is delivered.

## Possible focused enhancements

- Google event notification icon/details, resolving calendar defaults and event overrides for the connected account. These may differ between shared-calendar users. Verify reminder-only refresh behaviour; do not assume the event updated timestamp changes. No Pi notifications or Google writes are implied.
- Additional reminder lists, optional cloud reminder hosting, Postpone/Hidden workflows or recurrence exceptions only when real usage justifies them. One General list and edit-based rescheduling remain intentional.
- Further UI refinements through the existing development workflow. No elaborate hardware assembly guide or guided installer is planned.

## Accepted limits

- Deliberate live household app-crash injection was not performed and is an accepted validation gap, **not a task to retry**. Isolated startup/restart/persistence checks do not prove sudden-power-loss or SD-failure recovery.
- The original display service can briefly retry its Wayland socket at startup and log a compositor teardown error. A failed path-activation alternative was reverted; do not reapply it without a new dependency-graph review and physical boot validation.
- Application image updates are explicit, not part of OS maintenance. Stop on failed release validation; live rollback requires operator approval and must preserve subsequent household writes.

Deployment-specific identities, credentials, cleanup and operational evidence belong in the operator's private documentation. Product and Pi Rain Radar remain independently scoped.
