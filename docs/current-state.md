# Current validation — 0.2.0 pre-release

The 0.2.0 application promotes the household-accepted RC3 behaviour without further application changes. See the [release notes](release-0.2.0.md) and [published release](https://github.com/alex-soul/pi-family-calendar/releases/tag/v0.2.0).

## Evidence

- Source verification: 125 tests pass, Svelte check reports no errors or warnings, formatting passes and the production build succeeds. CI additionally runs host/MQTT and packaged HTTP/admin/QR checks.
- Image publication requires separate AMD64 and ARM64 startup, restart, PIN and persistence checks with fictional data and no network. The release assets record immutable digests, source revision and archive checksums. Consult the workflow result before using an image.
- RC1, RC2 and RC3 received household use and acceptance on the reference Raspberry Pi 5 / 2 GB appliance. RC3 was accepted before 0.2.0 publication. The published ARM64 deployment and final physical handover are recorded separately below.
- The reference installation has exercised Google Production consent through the SSH loopback helper, live synchronization, phone QR workflows, native touch, host screen/power controls and MQTT theme selection. Operator-specific evidence and credentials remain private.

## Release handover

[Source CI](https://github.com/alex-soul/pi-family-calendar/actions/runs/40711561414) and [published-image CI](https://github.com/alex-soul/pi-family-calendar/actions/runs/40712034717) passed on 28 October 2026. Both architectures passed all required image checks. The exact published ARM64 platform digest was then deployed to the reference Pi, preserving application data, PIN, Google configuration, browser profile and host settings. Matching-version isolated restore, upgrade/restart, database integrity, frontend/API and host-control checks passed. All selected calendars completed natural successful synchronization after cutover; the kiosk heartbeat and sync indicator are healthy.

Final physical review of the exact published image remains required before project closure. Candidate acceptance is retained and does not need a full repeat. Deployment-specific identities and checkpoints remain in private operator documentation.

## Boundaries and follow-ups

- The first upgrade from the old reminder schema deliberately resets legacy reminders with operator approval. **RC1/RC2/RC3 upgrades preserve the current schema and must not repeat that reset.** See [upgrade instructions](release-0.2.0.md#upgrade-boundary).
- Repeating templates generate only at local midnight or the single 01:00 retry. Startup, browsing and template creation do not backfill missed dates. Past Notes and completed ToDos remain stored until explicitly deleted.
- The latest dependency review found no production dependency vulnerabilities and four low-severity development-tool findings. Dependency upgrades remain a separate follow-up.
- Local recovery checkpoints and isolated restores are verified. Off-device disaster recovery, SD failure and sudden power loss are not established by those tests. Live household crash injection is an accepted gap, not a task to retry.
- Broader hardware compatibility, second-user Google permissions and extended provider edge cases remain bounded follow-ups in the [roadmap](roadmap.md).
- No automatic application-image updates, notification delivery, Google API writes or guided hardware installer are included.

## Historical evidence

The former running development record is preserved byte-for-byte in [development history before 0.2.0](development-history-before-0.2.0.md). It describes earlier builds and superseded designs; use this page and [architecture](architecture.md) for current behaviour. The [0.1.0 release notes](release-0.1.0.md) remain historical.
