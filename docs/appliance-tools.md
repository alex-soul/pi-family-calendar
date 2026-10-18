# Deployment tools

These tools support an operator-managed Linux appliance. They do not install a desktop, change display hardware, configure a router or publish an image.

## Build and start

Build the selected checkout for the target architecture on a machine with Docker Buildx:

```sh
docker buildx build --platform linux/arm64 --build-arg APP_REVISION="$(git describe --always --dirty)" --build-arg APP_BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" --load -t pi-family-calendar:local .
docker save -o calendar-image.tar pi-family-calendar:local
```

Transfer the image to the target through your existing SSH connection, then `docker load -i calendar-image.tar`. Use a private Compose override to select that image and your LAN address, time zone and resource limits. Check `docker compose config --quiet` before starting. The base service uses `restart: unless-stopped`, a 40-second stop grace period, bounded logs, an unprivileged user and a read-only root. The HTTP process drains requests and waits up to 30 seconds for background work when stopped. Google outages do not make `/healthz` fail or cause container restart loops.

Verify actual kernel cgroup memory support before relying on a memory limit. A requested Docker limit alone is not proof that the kernel enforces it. App images remain operator-controlled; an OS update does not update the app image.

Admin → About displays the installed package version, development/prerelease/release label, source revision and build time, with runtime details collapsed below. Version comes from `package.json`; `APP_REVISION`, `APP_BUILD_DATE` and `APP_RELEASE_CHANNEL` are baked into the Docker image. Release CI sets the channel to `prerelease`; local Docker builds default to `development`. Unrecorded dates display “Not recorded”; this is never presented as an installation date. Build a release from a clean, tagged checkout. About does not contact GitHub or claim the installed version is the latest published release. See [release and upgrade instructions](releasing.md).

## Application backup

The packaged `scripts/data-tool.mjs` uses SQLite's online backup API, so it includes committed WAL data without copying an active database file directly. All three databases and the matching `google.key` are required. Each database is a consistent snapshot; the bundle is not one simultaneous transaction across separate databases. Reminder changes and QR receipts share one database; Google credentials, cursors and events share another. The encryption key is checked for changes during capture.

Example inside the running application container:

```sh
docker compose exec calendar node scripts/data-tool.mjs backup /app/data /app/data-backups/snapshot-001 IMAGE_REFERENCE
docker compose exec calendar node scripts/data-tool.mjs verify /app/data-backups/snapshot-001
```

Mount `/app/data-backups` as a separate writable, private directory owned by the container user (normally UID 1000). It must be outside `/app/data`. The destination must not exist. Supply the immutable image ID/digest as `IMAGE_REFERENCE` and retain that image alongside the backup. Each bundle has checksums, schema versions, row counts, app version and revision. Validation checks SQLite integrity and credential decryptability without printing credentials or event details.

**Backup bundles contain private data and the decryption key.** Linux output directories/files use 0700/0600. On Windows, use a private NTFS directory with restricted ACLs. Encrypt off-device copies using your chosen backup system. Checksums detect corruption, not malicious replacement. Never commit bundles to Git or expose their directory through the web server.

Host definitions, display settings, SSH access and a quiesced browser profile are separate appliance recovery inputs. Keep those in your private operational process; this generic tool only handles application data. Do not copy a browser profile while Chromium is running.

## Restore and validate

Use the matching saved image. The tool rejects unsupported schemas and app versions; it never downgrades a database. Stop any writers to the destination. Restore into a **new directory or new volume subdirectory**, never over a running or existing installation:

```sh
node scripts/data-tool.mjs verify /backups/snapshot-001
node scripts/data-tool.mjs restore /backups/snapshot-001 /recovery/new-data
```

Run these commands from the saved image with the backup mounted read-only and a writable parent for the new destination. New files belong to the user running the tool; use the application's UID. Old admin sessions and QR grants/receipts are removed from the restored copy. The PIN and QR settings remain. Sign in again and issue new QR codes after recovery.

For a rehearsal, run the restored app with `GOOGLE_SYNC_ENABLED=false` and no MQTT or host helpers. This process-level switch stops Google workers, on-demand fetches and OAuth without changing saved credentials. Saved calendar events remain available with a paused-sync status. Use `--network none` for the strongest isolated container check and call its loopback health endpoint with `docker exec`. A separate loopback-only test listener can be used for browser/SSH checks. Do not run a restored copy against Google alongside the live installation.

Verify reminder/history counts, PIN enforcement, cached events, then stop and restart the disposable instance and verify again. Only after operator approval should you select the restored volume for live use and enable Google sync. Preserve both old and new datasets until acceptance; never automatically restore over newer household changes.

## Windows Google connection helper

Download `/setup/connect-google.ps1` from Admin → Google Calendar → Setup & credentials. The script needs Windows OpenSSH and working key/agent access to the Pi, including a verified known-host entry. It does not export keys or change Windows execution policy permanently.

From PowerShell, with the downloaded file in Downloads:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$HOME\Downloads\connect-google.ps1"
```

Enter the SSH alias or `user@address`. It opens `http://127.0.0.1:18775/admin/google` through an SSH tunnel to the Pi's loopback port 8775. Unlock admin in that browser if required. Add `http://127.0.0.1:18775/api/google/callback` to the Google **Web application** client's authorized redirect URIs. Keep existing DEV redirect URIs. Start and finish Google consent in the same tunneled browser session. Keep the PowerShell window open; press Enter there when finished. The helper closes only its own tunnel, including on handled errors or interruption. If forcibly terminated, check and close that helper's SSH process before retrying; a port conflict fails rather than reusing an unknown listener.

The helper requires an existing SSH key/agent; password-only SSH cannot prompt from its background tunnel. It never silently accepts a new host key. Connect manually first and verify the fingerprint if the host is unknown. A missing/busy local port, failed SSH authentication or unreachable calendar fails before opening the browser. `-CheckOnly` tests and closes the tunnel without opening a browser. Optional `-SshTarget`, `-RemotePort` and `-LocalPort` select an existing SSH target and ports. A different local port must also match the server's `OAUTH_LOOPBACK_PORT` and the exact Google redirect URI.

The listener binds only to laptop loopback; no LAN callback, public hostname or inbound router rule is needed. Google sends the callback to the laptop and SSH carries it to the Pi. Host/Origin checks, the admin PIN, one-time state, browser cookie binding and PKCE remain enforced.

See the shipped [Google guide](google-calendar.md) for the user's own OAuth project and the Testing/Production distinction. Production avoids the seven-day Testing restriction for Calendar grants, but revocation or account policy can still require reconnection.
