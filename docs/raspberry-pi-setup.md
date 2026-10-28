# Manual Raspberry Pi setup

This is the installation sequence for an operator-managed Calendar appliance, from a fresh OS to a tested kiosk. It is a guide, not an installer. Run commands deliberately, review existing configuration before replacing it, and finish each check before proceeding. Existing installations should use [release upgrades](releasing.md), not repeat fresh provisioning.

The tested reference is a Raspberry Pi 5 with 2 GB RAM, Raspberry Pi OS Desktop 64-bit (Debian Trixie), labwc/Wayland and a seven-inch touchscreen in 1280 Ã— 720 landscape. Other displays need their own connector, rotation, touch mapping and backlight checks. Keep a working SSH connection and recovery access while configuring the desktop.

## 1. OS, access and power

Install Raspberry Pi OS **Desktop 64-bit**, configure your own hostname, administrator, network and SSH access, and reserve the address in your router. Enable desktop autologin for the dedicated display user using Raspberry Pi Configuration or `sudo raspi-config`. A console-only login will not start the Wayland kiosk.

Use a suitable power supply/cable and cooling. Establish SSH with your own key; verify the host fingerprint before accepting it. Test a second login before retiring another account or authentication method. The application does not require membership in the Docker group or passwordless sudo.

Record the target before installing:

```sh
whoami
id
hostname -I
cat /etc/os-release
uname -m
timedatectl
df -h / /boot/firmware
vcgencmd get_throttled
systemctl --failed --no-pager
sudo dpkg --audit
apt-mark showhold
```

Choose the host time zone, enable time synchronization, and use the same IANA time zone in the application. Review APT sources and keep them on the selected OS release; do not change distribution or firmware channels as part of setup. For a populated device, arrange recovery first. A fresh disposable installation can instead use an explicitly chosen reflash route.

```sh
sudo apt-get update
sudo apt-get -s dist-upgrade
# Inspect the proposed packages, removals and holds before proceeding.
sudo apt-get --no-remove dist-upgrade
sudo dpkg --audit
```

Reboot after the reviewed upgrade, reconnect, and repeat the package, clock, failed-service and power checks. Resolve undervoltage before treating runtime observations as valid. Do not use `rpi-update` or force a major OS upgrade for this application.

## 2. Landscape and native touch

In the actual desktop session, inspect `wlr-randr` and the current display configuration. Install `kanshi`/`wlr-randr` if absent. Use the desktop's existing configuration owner rather than running two competing layout managers. The reference uses kanshi; a landscape profile is:

```text
profile {
    output DSI-1 transform 90 scale 1
}
```

Merge the appropriate connector/transform into `~/.config/kanshi/config`, preserving the previous file. Reload the existing kanshi process (SIGHUP is supported), or log out/in. Confirm that the chosen direction is correct and taps hit all four corners, then confirm it again after reboot. Do not assume every display needs transform 90. See [Raspberry Pi display documentation](https://www.raspberrypi.com/documentation/accessories/display.html).

For labwc, inspect the existing `~/.config/labwc/rc.xml`. In its `labwc_config` element, preserve or add the device-specific touch mapping, substituting the actual device name and connector:

```xml
<touch deviceName="YOUR TOUCH DEVICE" mapToOutput="DSI-1" mouseEmulation="no" />
```

Native touch is important: mouse emulation can turn a swipe into text selection. Do not replace the whole XML file or change unrelated input mappings. Validate the XML, then run `labwc --reconfigure` from the desktop session. From SSH, the command needs the actual desktop user's `XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY` and `LABWC_PID`; find that user's compositor process rather than guessing a PID. See the [labwc configuration reference](https://github.com/labwc/labwc/blob/master/docs/labwc-config.5.scd).

Check both touch scrolling and corner accuracy after the change. Screen rotation alone does not prove touch mapping or native gesture delivery.

## 3. Docker and resource limits

Install Docker Engine and the Compose plugin using the [official Debian repository instructions](https://docs.docker.com/engine/install/debian/), selecting the correct architecture and codename. Review conflicting packages instead of removing them blindly. Use `sudo docker` if the operator is not in the Docker group.

```sh
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
cat /sys/fs/cgroup/cgroup.controllers
```

The `memory` controller must be available before relying on container memory limits. On the reference Pi it required adding `cgroup_enable=memory` to the existing **single line** in `/boot/firmware/cmdline.txt`, followed by reboot. Only do this if memory accounting is absent and this boot configuration applies; preserve a copy and every existing boot argument. Verify the controller after reboot and the actual container limit after startup.

Do not expose the Docker API or mount its socket into the app. Keep logs bounded; the Compose example below handles app logs. OS updates may update Docker packages, but must not implicitly pull new application images.

## 4. Install the published application

Get the chosen [release](https://github.com/alex-soul/pi-family-calendar/releases), its `release-image.json` and checksums. Select the ARM64 platform digest for a 64-bit Pi. Pull that immutable reference as described in [releasing](releasing.md); no registry login is needed. A first install does not require a local image build.

Create a private installation directory, for example `~/apps/pi-family-calendar`. Save the following as `compose.yaml` there. This is a **standalone production definition**, not an override of the repository's development Compose file:

```yaml
name: pi-family-calendar
services:
  calendar:
    image: ${CALENDAR_IMAGE:?Set the published platform digest}
    pull_policy: never
    restart: unless-stopped
    init: true
    stop_grace_period: 40s
    ports:
      - '127.0.0.1:8775:3000'
      - '${LAN_ADDRESS:?Set this Pi LAN address}:8775:3000'
    environment:
      CALENDAR_SOURCE: google
      APP_TIME_ZONE: ${APP_TIME_ZONE:?Set the IANA time zone}
      GOOGLE_SYNC_ENABLED: 'true'
      OAUTH_LOOPBACK_PORT: '18775'
      LAN_ORIGIN: 'http://${LAN_ADDRESS}:8775'
      PUBLIC_BASE_URL: 'http://${LAN_ADDRESS}:8775'
    volumes:
      - calendar-data:/app/data
    read_only: true
    tmpfs:
      - /tmp:size=32m,mode=1777
    mem_limit: 512m
    pids_limit: 128
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    logging:
      driver: local
      options:
        max-size: 10m
        max-file: '3'
volumes:
  calendar-data:
```

Set `.env` to your own values, with restrictive file permissions. The image value must contain the actual digest, not the placeholder:

```dotenv
CALENDAR_IMAGE=ghcr.io/alex-soul/pi-family-calendar@sha256:ARM64_DIGEST_FROM_MANIFEST
LAN_ADDRESS=YOUR_PI_LAN_IPV4
APP_TIME_ZONE=YOUR_IANA_TIME_ZONE
```

```sh
chmod 600 .env
sudo docker compose config --quiet
sudo docker compose up -d --no-build --pull never
sudo docker compose ps
curl -fsS http://127.0.0.1:8775/healthz
sudo docker compose exec calendar cat /sys/fs/cgroup/memory.max
```

The 512 MiB limit should read `536870912`, not `max`. Inspect the image architecture/source/build labels against the release manifest. Docker stores can report different local image IDs; the published platform digest is the portable identity. The first Google-backed installation is empty until connected. Keep the data volume; `down -v` deletes it.

This example exposes HTTP only on loopback and your chosen LAN address. Do not forward its port from the internet. Use explicitly allowed origins, a trusted network and an appropriate HTTPS arrangement if required by your network's trust model. A PIN does not encrypt HTTP traffic.

## 5. Admin, Google and phone access

Open `http://YOUR_PI_LAN_IPV4:8775/admin` manually from a phone/laptop. Set the [admin PIN](admin.md), then configure calendars, friendly names/colours and reminders. The kiosk intentionally has no admin link.

Follow [Google Calendar setup](google-calendar.md), including your own OAuth project/client. For headless consent, download the Windows PowerShell helper from Admin â†’ Google Calendar â†’ Setup & credentials. It uses existing SSH key access to carry a laptop-local callback to the Pi; a keyboard on the Pi is not needed. Exact command and redirect URI are in [the helper instructions](appliance-tools.md#windows-google-connection-helper). Test new consent, not just an already migrated token.

Enable QR features deliberately in Access and select the default calendar for event creation. Check that the QR destination is the phone-reachable Pi address, not localhost. Test PIN login and a temporary Note's QR add/edit/delete from a phone. [QR access](qr-reminders.md) explains its scope and expiry. Enable only one live Google synchronization owner; development/restored copies use `GOOGLE_SYNC_ENABLED=false`.

For regular household use, follow the [tested personal Production setup](google-calendar.md#tested-household-setup-using-the-project-pages), which includes the project's reusable homepage/privacy-policy URLs and reconnection steps. Google Production publishing is an operator console task; it does not require a new application image. Production status does not guarantee permanent access. Keep account-specific decisions outside the product repo.

## 6. Dedicated kiosk

Obtain the host files from the **same release source** as the image, not an arbitrary newer checkout. Install the required desktop packages (`chromium`, `python3`, `python3-venv`, `wlopm`, `swayidle`; plus your layout tools). Copy the release's `host/` files to root-owned `/opt/pi-family-calendar-host`, readable but not writable by the display user. The Python kiosk launcher has no pip dependencies.

As the desktop user, create `~/.config/systemd/user/pi-family-calendar-kiosk.service` with the following. Replace `DESKTOP_UID`, `DESKTOP_HOME` and the Wayland socket name with detected values:

```ini
[Unit]
Description=Pi Family Calendar kiosk
StartLimitIntervalSec=0

[Service]
Type=simple
Environment=XDG_RUNTIME_DIR=/run/user/DESKTOP_UID
Environment=WAYLAND_DISPLAY=wayland-0
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/DESKTOP_UID/bus
ExecStart=/usr/bin/python3 /opt/pi-family-calendar-host/kiosk.py --url http://127.0.0.1:8775/?kiosk=1 --profile DESKTOP_HOME/.local/share/pi-family-calendar/chromium
Restart=on-failure
RestartSec=5
TimeoutStopSec=10
KillMode=control-group
UMask=0077
```

Create `~/.config/autostart/pi-family-calendar.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Pi Family Calendar
Exec=/usr/bin/systemctl --user start pi-family-calendar-kiosk.service
Terminal=false
X-GNOME-Autostart-enabled=true
```

Run `systemctl --user daemon-reload` and `systemctl --user start pi-family-calendar-kiosk.service` in that desktop user's session. Desktop autologin/autostart starts it on subsequent boots. Do not start it as root or add `--no-sandbox`. The launcher waits for local readiness and relaunches its dedicated browser; do not sign into admin or Google in that browser profile. `?kiosk=1` suppresses outbound QR links and display scrollbars. Ordinary laptop browsers retain them.

Confirm fullscreen, clock, corner taps, vertical native scrolling and horizontal date dragging on empty background. Reboot and confirm the desktop, kiosk and touch return without a keyboard. The launcher cannot compensate for a missing desktop session.

## 7. Optional screen, power and MQTT controls

The calendar works without these. Admin screen actions need the host integration; they are not simulated by a normal app container. Use the [host provisioning reference](../host/README.md#manual-provisioning-contract) for the complete configuration fields, units and security contract.

Provision in this order:

1. Detect the desktop UID, Wayland socket, display connector and `/sys/class/backlight` device. Record maximum brightness. HDMI displays without a controllable backlight are not equivalent to the tested panel.
2. Create system groups `calendar-app`, `calendar-display`, `calendar-status` and a non-login `calendar-mqtt` user in the last two groups. Stage root-owned host source. Install `host/requirements.txt` into `/opt/pi-family-calendar-host/venv` only if MQTT is needed.
3. Create root-private `/etc/pi-family-calendar/secrets` and two independent random 32-byte hex tokens: `bridge-token` and `display-token`. Never print or commit them. Give the app a separate read-only copy of the bridge token owned/readable by its mapped host UID (normally 1000, verify rootless/user-namespace mappings). Do not give it the display token or broker credentials.
4. Write `display.json`, `bridge.json` and optionally `mqtt.json` as defined in the host reference. Display peer allowlist includes root bridge, desktop user and MQTT user; bridge allowlist includes only the mapped app UID. Keep `powerEnabled:false` initially. Paths must match the units' credentials/state/runtime directories.
5. Grant `calendar-display` write access only to the selected brightness attribute. A device-specific udev rule can reapply `chgrp calendar-display` and `chmod 0660` to `/sys%p/brightness` on that backlight's add/change event. Match its exact kernel name; do not grant access to all input devices or recursively relax `/sys` permissions. Reload/trigger only that backlight and verify its group/mode.
6. Render the display unit with `host/render_display_unit.py` into an empty staging path using the real desktop identity/socket/backlight. Stage the bridge and optional MQTT units from `host/units`. Run `systemd-analyze verify` on the rendered units; install into `/etc/systemd/system`, reload systemd, then enable/start display and bridge. These are **system** units, unlike the kiosk user unit.
7. Add the app bridge connection below to your production Compose file. Create the app-readable token before mounting it; use a read-only file bind. Start the bridge before creating the container so its runtime directory exists. Recreate only the app with no build/pull and preserve its data volume.

```yaml
# Merge under services.calendar; retain the existing volume and settings.
group_add:
  - '${CALENDAR_APP_GID:?Set numeric host calendar-app GID}'
environment:
  APPLIANCE_SOCKET: /run/calendar-bridge/bridge.sock
  APPLIANCE_TOKEN_FILE: /run/calendar-credentials/bridge-token
volumes:
  - /run/pi-family-calendar-bridge:/run/calendar-bridge:ro
  - /etc/pi-family-calendar/secrets/app-bridge-token:/run/calendar-credentials/bridge-token:ro
```

Never mount the Docker socket, display socket, host root or broker credentials into the app. The bridge runtime directory must survive service restarts; the shipped unit sets `RuntimeDirectoryPreserve=yes`.

Test Admin â†’ Screen brightness, Sleep and Wake, then tap the sleeping screen. Verify local idle/wake with MQTT stopped too. Once this works, enable power in root-owned bridge configuration, restart the bridge, unlock PIN-protected admin and test Reboot. Verify the return to kiosk/touch. Separately test Shutdown and a manual power-on. An uncertain request has a persistent five-minute cooldown; it is not queued for later or safe to blindly retry.

For MQTT, configure your own MQTT5 broker, dedicated credentials and per-device ACL. Use TLS with certificate verification, or explicitly accept a trusted plaintext LAN through both `tls:false` and `allowPlaintextLan:true`. Provision the private broker credential consumed by `LoadCredential` (or an encrypted systemd credential with a matching unit override). Start MQTT only once its configuration/credentials exist. Preserve its generated UUID and replay state; do not copy another appliance's identity. Test Home Assistant brightness, Sleep/Wake and reverse state reflection from admin. MQTT does not expose reboot/shutdown. Details: [MQTT contract](../host/README.md#mqtt-contract).

The original display unit may retry while Wayland starts. Do not add an improvised path unit ordered after the user manager: an earlier variant caused a boot dependency cycle. Validate complete boot behavior after any service-dependency changes; a successful restart alone is insufficient.

## 8. Host maintenance and bounded logs

Choose and document one owner for unattended OS updates. This product does **not** ship an autonomous OS-update controller or install timers. Its optional bridge understands maintenance status and coordinates power with package/maintenance locks; operator automation must honor that contract. The reference household uses a separate private controller, not a public installation dependency.

A complete operator policy should define signed/codename-pinned sources, package holds, free-space/clock checks, reviewed non-removing upgrades, an update window followed by a conditional reboot window, post-boot health, bounded records and failure handling. Avoid catch-up reboots, overlapping package schedulers, killing active package transactions, deleting APT locks or rebooting a failed transaction. Do not change firmware channels or automatically update application images. Schedule values belong to the operator; the product supplies no default OS-maintenance timetable.

Use your distribution's maintained update tooling or a separately reviewed controller. Do not disable stock APT/PackageKit scheduling until its replacement is ready and validated. An `apt upgrade` cron line followed by unconditional reboot is not the reference maintenance behavior. Publish only the sanitized timestamped maintenance fields defined by the [bridge contract](../host/README.md#power-and-maintenance); without a reporter, admin correctly shows unknown status. Off-device backups are separate and must not be implied by a healthy maintenance report.

Bound journald and container logs for the SD card. For example, a reviewed `/etc/systemd/journald.conf.d/90-calendar.conf` can set `Storage=persistent`, `SystemMaxUse=100M`, `SystemKeepFree=1G` and `MaxRetentionSec=30day` under `[Journal]`. Inspect existing policy before applying. Preserve standard log rotation/trim and the OS's memory/swap policy unless measurements justify changes.

## 9. Acceptance, recovery and ongoing work

Record image/source, OS/kernel, screen identity/rotation, unit/config paths, app volume, credentials references (not values), maintenance ownership and recovery procedure in private operational notes.

- Confirm health and About identity, actual memory limit, no failed units or power warnings, and recent successful Google synchronization.
- Check phone PIN/QR, every affected screen control, touch scrolling, date navigation, sleeping/tap wake and MQTT state reflection.
- Test reboot and separate shutdown/power-on with a person present. Confirm kiosk recovery, orientation/touch, unchanged data and enabled maintenance policy afterward.
- Observe ordinary use over several days; a short smoke test is not a soak or a fresh Google-consent test. Check a second household user's permissions separately.
- Arrange [consistent data backup and isolated restore](appliance-tools.md), retaining the matching Google encryption key. Local SD snapshots are release recovery aids, not disaster recovery. Keep the host configuration and quiesced browser profile separately. Never automatically overwrite newer data during recovery.

Troubleshoot in dependency order: SSH/OS and power â†’ desktop/Wayland/rotation â†’ app health â†’ kiosk â†’ display/bridge â†’ MQTT. Read bounded logs for the affected unit. A text console after boot is a desktop/startup failure, not evidence that the Calendar image needs rebuilding. If swipe selects text, recheck native touch mapping; if admin screen controls are unavailable, inspect host sockets, credentials and UID/group permissions before changing the app.

Future application changes use the [release workflow](releasing.md). [What's next](roadmap.md) records qualification and notification design work. No setup command in this guide has been applied automatically to your device by reading it.

## Optional kiosk theme selector

For the 0.2.0 Warm/Dark MQTT selector, complete [kiosk theme setup](../host/theme-setup.md) after the app, kiosk and MQTT adapter are healthy. Provision the separate token and read-only app mount; do not reuse a broker password. Ordinary browsers keep independent themes. Preserve the existing volume and browser origin when upgrading. See [the legacy reminder upgrade boundary](release-0.2.0.md#upgrade-boundary) before updating an older installation.
