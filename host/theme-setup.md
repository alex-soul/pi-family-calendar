# Kiosk theme integration

Implementation setup for the next release candidate. Provision this with the tested app and host adapter together; laptop DEV does not install these files on a Pi.

The MQTT adapter now exposes a seventh discovery entity: a Theme Select with `Warm` and `Dark`. It sends fresh commands to the loopback app endpoint and publishes confirmed kiosk state. Existing command freshness, retained-message rejection and replay protection also apply to theme commands. Availability requires both the adapter and a responsive kiosk; commands are not queued for later application.

Provision one new random private token at `/etc/pi-family-calendar/secrets/kiosk-theme-token`, root-owned and mode 0600. The supplied MQTT unit loads it as `kiosk-theme-token`. Add these non-secret settings to the existing `mqtt.json`:

```json
{
	"themeUrl": "http://127.0.0.1:8775/api/kiosk-theme",
	"themeTokenFile": "/run/credentials/pi-family-calendar-mqtt.service/kiosk-theme-token"
}
```

The application needs a separate read-only copy of the **same token**, owned/readable by its mapped container UID, with `KIOSK_THEME_TOKEN_FILE` set to that container file path. Do not mount MQTT broker credentials or the host secrets directory into the app. Preserve the existing read-only/unprivileged Compose settings, data volume, origin and kiosk profile. Include this new token's private copies and unit/config changes in the release checkpoint.

The existing local kiosk URL must include `?kiosk=1`. Only an explicitly marked loopback display claims the theme role. It polls the app, persists the change and acknowledges the applied value without reloading. Manual changes report back. A new kiosk session revokes the previous one. Confirmed state is retained in `calendar.sqlite`; pending commands are not replayed after restart. Kiosk appearance preferences use their own browser storage key, initially inheriting existing display preferences.

In RC validation, exercise HA selection in both directions, manual kiosk changes, browser/app restart, missing kiosk availability, and independence of a normal phone/laptop display. The isolated DEV console and deterministic tests cover transport/state rules; they do not establish physical Pi or HA acceptance.
