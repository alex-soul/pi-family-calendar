# v0.1.0 — first prerelease

The first versioned Pi Family Calendar prerelease brings together the calendar display, phone administration and optional Raspberry Pi controls. Repository and image are public under MIT. Image verification is currently held before ARM64 runtime testing; this prerelease has not yet been cleared for installation or deployed to the appliance. See [current state](current-state.md).

## Included

- Seven calendar views, central Google Calendar caching and read-only event access.
- Shared notes and to-dos, recurrence, overdue items and completion history.
- Mobile admin with optional PIN protection and scoped QR reminder management.
- Google event QR handoffs, calendar names/colours and per-screen display preferences.
- Touch date dragging, the split-flap clock, compact controls and kiosk presentation.
- Optional host screen/power controls and MQTT/Home Assistant integration.
- About metadata, health reporting, manual backup/restore tools and operator deployment guidance.

I tested the display and touch controls on my Raspberry Pi 5 with 2 GB RAM. Phone reminder workflows, screen controls, MQTT controls, reboot/shutdown and browser recovery have been checked. Automatic application restart and data persistence were tested separately with fictional data and no network access; the live household application was not deliberately crashed.

## Known limits

- Longer-use observation, a second household user's phone/shared-calendar acceptance and fresh Google consent through the SSH helper remain follow-ups.
- Google OAuth Production setup and off-device backups are separate work. Local snapshots do not protect against SD-card loss.
- The original display controller can make a brief socket retry during desktop startup and log a compositor error during teardown. A replacement startup mechanism was reverted after a boot dependency cycle; the accepted original service is retained.
- No guided hardware installer, broad hardware qualification, two-way Calendar API writes or automatic application updates.

Use the exact version/digest in [release and upgrade instructions](releasing.md). Keep the existing data volume, encryption key and private host configuration. No data-schema migration is introduced by the version metadata change from the accepted development build.
