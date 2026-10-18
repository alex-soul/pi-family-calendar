# Optional appliance controls

Staged implementation; physical screen, broker and power acceptance belongs to deployment.
The calendar runs without this package. No service is installed by Compose.

Three Linux processes have separate permissions:

- `display.py` runs as the desktop user. It alone writes the selected backlight and calls `wlopm`/`swayidle`. Settings persist atomically; local idle/resume does not depend on MQTT. A lifetime socket lock prevents two controllers. A dead idle monitor causes fail-awake and service restart.
- `bridge.py` runs as root with a small Unix-socket protocol. It forwards permitted display actions, returns an allowlisted status snapshot, and can request only `systemctl --no-block reboot` or `poweroff`. No arbitrary commands, paths, service names or Docker API are exposed.
- `mqtt_adapter.py` runs as a dedicated unprivileged user with only the display credential. It discovers brightness, idle timeout, automatic blanking, Wake, Sleep and screen state. It cannot contact the power bridge.

Run `python3 -m unittest discover -s host -p 'test_*.py'` on Linux. Tests inject fake hardware/power actions. MQTT runtime alone requires `pip install -r host/requirements.txt` in a dedicated venv. Keep that venv outside this source directory.

## Manual provisioning contract

Stage the code under `/opt/pi-family-calendar-host` root-owned, not writable by service users. Create `calendar-app`, `calendar-display`, `calendar-status` groups and a non-login `calendar-mqtt` user. Detect the actual desktop UID, Wayland socket, output and backlight; grant write permission only on that device's brightness attribute to the display user/group. Do not grant the input or Docker group.

Render the display unit with `render_display_unit.py --user USER --uid UID --wayland wayland-0 --backlight /sys/class/backlight/DEVICE --output STAGING/pi-family-calendar-display.service`. The script only writes a new file. Stage the other `.service` files alongside it. Run `systemd-analyze verify STAGING/*.service` and inspect permissions before installation. Unit examples are system units, including the display service running as the desktop user; they are not user units.

Known lifecycle limitation: a boot before the Wayland socket exists can cause one service retry; compositor teardown can log a wake-monitor error. A proposed path unit ordered after the desktop user manager was rolled back after creating a boot dependency cycle. Keep the current service arrangement until a replacement is validated against the complete boot dependency graph and on hardware; an isolated path fixture or service restart is insufficient.

Generate two independent 32-byte random hex tokens in root-private `/etc/pi-family-calendar/secrets/bridge-token` and `display-token`. Units use systemd `LoadCredential`. Only the app receives the bridge token; only the controller, bridge and MQTT adapter receive the display token. Socket directories must retain the specified groups and traversal permission. Peer UID allowlists are required in addition to tokens, including the actual host-mapped container UID. No Docker socket or privilege escalation is needed by the app.

Root-owned configuration files in `/etc/pi-family-calendar`:

```json
{
	"socket": "/run/pi-family-calendar-bridge/bridge.sock",
	"tokenFile": "/run/credentials/pi-family-calendar-bridge.service/bridge-token",
	"allowedUids": [1000],
	"displaySocket": "/run/pi-family-calendar-display/display.sock",
	"displayTokenFile": "/run/credentials/pi-family-calendar-bridge.service/display-token",
	"stateFile": "/var/lib/pi-family-calendar-bridge/power.sqlite",
	"maintenanceLock": "/run/lock/pi-family-calendar-maintenance.lock",
	"maintenanceStatus": "/var/lib/pi-family-calendar-maintenance/status.json",
	"backupStatus": "/var/lib/pi-family-calendar-backup/status.json",
	"mqttStatus": "/var/lib/pi-family-calendar-mqtt/status.json",
	"powerEnabled": false
}
```

`allowedUids` is an example, not a detected identity. For `display.json`, set `socket`, `tokenFile`, `stateFile`, `allowedUids` (desktop user, MQTT user, root bridge), `output` and `backlight`. Use the display service's credential directory and state/runtime directories from its unit.

For `mqtt.json`, set `displaySocket`, `displayTokenFile`, `brokerCredentials`, `host`, `port`, `tls`, optional `caFile`, `identityFile`, `replayFile`, `statusFile`. Its token and broker file come from the MQTT service credential directory. Identity/replay/status files live in its StateDirectory. Broker credentials are private JSON with `username` and `password`; never environment variables. TLS certificate verification is on by default. An explicitly trusted plaintext LAN broker needs both `tls:false` and `allowPlaintextLan:true`.

Bind only `/run/pi-family-calendar-bridge` into the app (read-only directory mount; the Unix socket remains connectable). Set `APPLIANCE_SOCKET` to its container socket path and `APPLIANCE_TOKEN_FILE` to a separately provisioned read-only token file readable by the container UID only. Add the `calendar-app` numeric group to the container. Do not mount the display socket, host filesystem, MQTT secrets or Docker socket. Retain the unprivileged/read-only container settings. Keep `powerEnabled:false` until supervised acceptance.

## Power and maintenance

The web endpoint requires a PIN-enabled, unlocked admin session and the existing same-origin gate. A 30-second confirmation is tied to that session and action, consumed once, and recorded before executing. The bridge enforces a persistent five-minute cooldown even after an uncertain result. UI never retries an uncertain submission automatically.

All Calendar maintenance and backup writers must acquire an exclusive `flock` on `/run/lock/pi-family-calendar-maintenance.lock` for their entire operation. The bridge also locks the four existing APT/dpkg lock files with POSIX locks. Missing or busy lock files refuse power requests. Successful/ambiguous power requests hold these locks for up to five minutes or bridge termination; the cooldown survives service restart. Never unlink package locks. Root status/backup writers should use atomic JSON and `sampledAt`/timestamps in epoch **milliseconds**. Only these fields are exposed:

- Maintenance: `sampledAt`, `status` (`ok/failed/running/pending/unknown`), `lastSuccess`, `nextUpdate`, `nextReboot`, `pendingReboot` (boolean), `bootHealth` (same status vocabulary).
- Backup: `sampledAt`, `status`, `lastSuccess`.
- MQTT: `sampledAt`, `connected`; 20 seconds without an update is unavailable.

Absent reports are unknown, never healthy. Raw logs and credentials are never included. Maintenance/backup scheduling and consistent off-device recovery are separate provisioning work.

## MQTT contract

Requires MQTT 5. A generated UUID persists in `identityFile`; its own `pi-family-calendar/UUID` namespace and six Home Assistant discovery records are retained. Do not change identity on restarts or publish into another device's namespace. LWT reports offline. Fresh state/discovery return on reconnect and HA birth. Commands use QoS 0, clean sessions, no offline queue, retain-as-published and no retained delivery. Retained commands are rejected even while connected.

Every command carries `{"id":"unique-per-command","issued":EPOCH_SECONDS,"value":VALUE}`. It must be within 30 seconds old/5 seconds ahead and not previously accepted; IDs persist across adapter restarts. Rejection consumes no hardware action; accepted IDs are committed before applying, with no blind retry after a controller error. Home Assistant command templates provide the envelope. Broker authentication and topic ACLs are the trust boundary, not any payload identity. Restrict broker users to this device's command topics and required discovery/state/birth traffic. No MQTT reboot/shutdown is implemented.

References: [swayidle](https://github.com/swaywm/swayidle/blob/master/swayidle.1.scd), [Paho MQTT 5](https://eclipse.dev/paho/files/paho.mqtt.python/html/client.html), [Home Assistant buttons](https://www.home-assistant.io/integrations/button.mqtt/). This implementation is independent of other appliance projects.
