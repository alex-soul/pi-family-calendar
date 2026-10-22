# Development

Use Node 24 and npm, or Docker with Compose. No external accounts or services are required for demo mode or automated tests. Real events require the [Google setup](google-calendar.md).

For versioning, public image publishing, exact-digest deployment and acceptance, use [the release workflow](releasing.md). Project code is [MIT licensed](../LICENSE); preserve dependency notices.

## Recreate a development environment

The repository is the source of truth. Containers, images, build caches, installed dependencies and fictional data are replaceable conveniences. No retained Docker volume, Google account, Pi access or private configuration is required to develop the UI.

On a new machine install Git and either **Node.js 24 with npm** for hot reload, or **Docker Desktop using Linux containers / Docker Engine with Compose v2 or later** for a packaged preview. Initial dependency installation and image builds require access to npm and the container registry.

```sh
git clone https://github.com/alex-soul/pi-family-calendar.git
cd pi-family-calendar
```

Choose the workflow below. They can run together because they use separate ports and data. Stop an old preview that already owns a required port; do not start a second copy against the same database.

| Purpose                                  | Command from the checkout                                                                    | Calendar URL             | Data                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------- |
| UI design and editing, with hot reload   | `npm ci`, then `node scripts/screenshot-preview.mjs`                                         | <http://127.0.0.1:5174/> | Fresh fictional reminders, templates and categories |
| Complete packaged DEV with isolated MQTT | `docker compose -p pi-family-calendar-dev -f compose.yaml -f compose.dev.yaml up --build -d` | <http://127.0.0.1:8775/> | Same fixtures, retained in a dedicated DEV volume   |

Append `/admin` for administration. Neither fresh environment has an admin PIN or Google credentials. Both explicitly disable Google synchronization. The fictional launcher also clears host-control connections. Do not connect a household Google account or attach a household volume to these disposable environments. An older container with copied household data is not needed to recreate either workflow.

### Everyday UI work

Use the fictional preview on 5174 as the main UI workspace. It runs the current checkout through Vite; source edits reload in the browser without rebuilding a Docker image. `npm ci` is needed initially or after dependency/lockfile changes, not before every launch. The launcher works without `.env` and overrides its relevant preview settings if one already exists.

Stop with Ctrl+C in its terminal. By default restarting creates fresh date-relative fixtures; edits made to the previous fictional reminder data do not carry forward. To reuse a particular directory printed by the launcher, set `DEV_DATA_DIR` to that directory before starting it. Save useful scenarios in the source fixtures rather than relying on a temporary database. Browser preferences can survive restarts in the same browser; clear this site's storage or use a fresh browser profile when a default-layout check is needed.

### Keep or recreate the Docker preview

The DEV override fixes demo mode and disables Google synchronization. The explicit Compose project name isolates its containers and volume from a normal installation. The default port is laptop loopback only; phone/LAN setup is optional and is not required for laptop UI work.

```sh
# Inspect the dedicated DEV service.
docker compose -p pi-family-calendar-dev -f compose.yaml -f compose.dev.yaml ps
# Stop and retain the container, image and fictional data.
docker compose -p pi-family-calendar-dev -f compose.yaml -f compose.dev.yaml stop
# Start/recreate using the retained image; build it first if it no longer exists.
docker compose -p pi-family-calendar-dev -f compose.yaml -f compose.dev.yaml up -d
# Rebuild after source changes, or if the image has been deleted.
docker compose -p pi-family-calendar-dev -f compose.yaml -f compose.dev.yaml up --build -d
```

Docker runs a compiled snapshot, so editing source does not hot reload this preview. Retaining its image and build cache saves work on later builds. Deleting the container or image is recoverable with the build command. Deleting its **DEV volume** loses local test reminders/settings, but the same command recreates the fictional events, reminders, templates and categories. No backup is needed for disposable fixtures. Restarts preserve edits; fixtures are seeded once. The DEV override permits the intentional reset of the old reminder schema, without repeatedly clearing the new schema.

For an intentional full reset of only this disposable project:

```sh
docker compose -p pi-family-calendar-dev -f compose.yaml -f compose.dev.yaml down --volumes
docker compose -p pi-family-calendar-dev -f compose.yaml -f compose.dev.yaml up --build -d
```

Never substitute a household project/volume or use a global Docker prune for this reset. In PowerShell, `Invoke-RestMethod http://127.0.0.1:8775/healthz` should report `status: ok`; check `docker compose ... ps` for healthy status and open the calendar/admin pages. In a fresh clone, `npm ci` and the fictional launcher regenerate the UI preview independently of Docker. Tests that write reminders must target these disposable previews, never the household Pi.

## Run with hot reload

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and set `APP_TIME_ZONE` to an IANA zone. Example: `Europe/London`. Keep `CALENDAR_SOURCE=demo` for fictional events.
3. Run `npm run dev`.
4. Open http://127.0.0.1:5173/ and http://127.0.0.1:5173/admin/reminders.

On PowerShell, the copy command is `Copy-Item .env.example .env`; on Unix shells use `cp .env.example .env`. Environment changes require a server restart. Reminders are stored in ignored `data/calendar.sqlite`, independently from the Docker volume.

`npm run build` followed by `npm start` runs the compiled Node application on http://127.0.0.1:3000/. Keep production dependencies installed alongside the compiled build (`npm ci --omit=dev --ignore-scripts` when copying it to a clean machine). Docker installs these automatically. `npm start` reads `.env`. The Node HTTP launcher derives the origin from the request Host, then the application checks it against explicit allowed origins. Localhost ports 3000, 5173 and 8775 are allowed; `LAN_ORIGIN` adds exact comma-separated origins. `PUBLIC_BASE_URL` must match one of those origins and supplies the phone QR destination. Do not use `node build/index.js` directly: `npm start` and Docker use `scripts/serve.mjs`, which sets its own HTTP protocol header. The old `APP_ORIGIN` build argument is no longer needed. See [LAN setup](qr-reminders.md).

## Fictional screenshot preview

Run `node scripts/screenshot-preview.mjs` with Node 24 from this checkout. Open <http://127.0.0.1:5174/> in a desktop browser. The launcher creates a temporary directory unless `DEV_DATA_DIR` is supplied. It seeds date-relative fictional reminders in Europe/London, enables reminder QR management and starts Vite on loopback only. It uses the demo provider's Family/School/Work/Personal calendars and the shared `scripts/dev-fixtures.mjs` scenarios: morning/evening tasks, timed lunchbox Notes, overdue and undated items, future templates, history, Birthdays and School categories. Fixtures simulate one midnight generation only when first seeding; normal app startup never catches up missed generation. No Google credentials, household database or host-control connection is used; Google sync is explicitly disabled. Admin has no PIN in this isolated preview.

Leave the launcher running while reviewing. Stop its process when finished; relaunching creates a fresh fixture rather than overwriting prior data. This is synthetic screenshot content, not a real Google connection or appliance-controls demonstration. The current-day birthday and date-relative reminders make the preview useful without freezing the clock. Use a full browser window for landscape screenshots.

## Complete DEV review and MQTT

Use the packaged app on 8775 for the combined review. Open `/admin/reminders` to manage saved items and templates, and `/admin/categories` to manage Note styles. General is fixed; deleting a custom category preserves its Notes. Today applies Note windows; other dates show their own dated items and window labels. New templates first generate at a future midnight (or the single 01:00 retry), so inspect future previews immediately and use the seeded saved items for today's checks. Event hiding is local to the browser and selected date; use the eye beside that date to restore it.

The DEV Compose project also runs an isolated Mosquitto broker and the actual MQTT adapter with fake display hardware. Open <http://127.0.0.1:18776/> for its small Warm/Dark test console. Open <http://127.0.0.1:8775/?kiosk=1> in a **separate visible browser window**, then send a theme from the console. The browser must remain visible to acknowledge it. State reports the applied theme, including manual display-menu changes; a closed/hidden kiosk becomes unavailable. Only one tab should claim the kiosk role. Ordinary calendar tabs have separate theme preferences. The MQTT console controls the packaged 8775 app, not hot reload on 5174.

The console, app and optional MQTT test port 18884 bind to laptop loopback only. Fresh DEV generates its own private app token; no broker credentials or household services are needed. Do not connect the demo broker to Home Assistant. Host-side checks run with `docker run --rm pi-family-calendar-host-tests:dev` after the Compose build. This exercises MQTT transport and the adapter; real Home Assistant discovery, Pi display behaviour and physical touch remain RC checks.

## Docker preview

```sh
docker compose up --build -d
docker compose ps
docker compose logs --tail 50
```

Open http://127.0.0.1:8775/. The container runs as the unprivileged `node` user, with a read-only root filesystem and a writable named data volume. Its health check reads SQLite through `/healthz`. Logs rotate. Compose does not install a kiosk, change the host, publish an image or configure remote access.

Use `docker compose stop` to stop it. `docker compose up -d` starts it again. Do not remove the volume if you want to keep reminders or Google connections. The volume contains sensitive calendar data and the key needed to decrypt saved credentials. See [manual backup, restore and deployment](appliance-tools.md). Use disposable data for write testing; restored DEV copies must have Google synchronization disabled when a live instance owns the connection.

ARM64 deployment, physical touch/screen controls and reboot recovery have now been verified on a Pi 5 with 2 GB RAM. Overnight/longer-use observation is in progress; see [current validation](current-state.md). This is not qualification of other hardware. The container recipe alone is not proof of appliance performance.

## Checks

```sh
npm run check
npm test
npm run lint
npm run build
```

Tests cover date boundaries/DST, simultaneous events, provider states, reminder validation, disk persistence and stale-write protection, plus OAuth state/PKCE, encrypted credential storage, calendar selection/deduplication, pagination, cache freshness, cancellations and permission loss. Month tests cover continuous weekly spans, lane collisions, overflow, midnight/exclusive ends and recurring local times across DST; description tests cover safe plain-text display. Recurrence tests cover DST, fortnightly intervals, monthly clamping, end dates, completed-history projection, restart persistence, stale writes, schedule edits and v3-to-v4 migration. No test contacts Google. `npm run format` applies repository formatting.

With a disposable preview running, `node scripts/smoke.mjs http://127.0.0.1:8775` checks health, validation, origin rejection and reminder create/edit/complete/undo/delete over HTTP. It creates uniquely named todo/note items and deletes only those items in cleanup. Note checks cover completion rejection and kind preservation.

For UI changes, inspect Day/2 days/3 days/7 days/Month/Schedule at 1280 × 720, both themes, long content and overflowing lists. Check details, three-row all-day tap/drag expansion and idle collapse, shared menu timeout, scrolling to past events and timed idle return (including pause/Off), pinned Day/2-day/Schedule panels and overlay access elsewhere, Month in-place expansion/collapse and round today marker, rolling seven-day dates and day-specific completion/undo, date navigation and calendar filtering. Inspect management at 390px and desktop widths, including real phone keyboard behaviour when LAN access is available. Check display-only settings, display-menu calendar filtering, admin navigation and PIN lock/unlock, theme persistence into management, search/status filters, empty results, To do/Note editing, dated/undated note placement, no note checkbox, completion/undo, stale edits and delete confirmation. Use a separate disposable installation for write testing; preserve the operator data volume. Use synthetic content. A browser screenshot does not validate seven-inch viewing at one metre.

## Source map

- `src/lib/domain.ts`, `dates.ts`: normalized data and date rules.
- `src/lib/server/`: provider and reminder persistence boundaries; no browser imports.
- `src/routes/api/`: validated HTTP operations.
- `src/routes/+page.svelte`, `src/lib/components/`: appliance display.
- `src/routes/admin/reminders/`: responsive reminder forms.
- `src/hooks.server.ts`: local preview access/origin controls.
- `test/`: synthetic domain/persistence tests.

`node scripts/admin-smoke.mjs http://127.0.0.1:8776 --disposable` temporarily configures and rotates PINs and exercises protected routes. Run it only against a separate empty installation without Google configuration; it rejects configured or nonempty stores. It disables its PIN and removes its own reminder on success. CI runs this after ordinary smoke tests. Never point it at an operator installation. See [admin access and recovery](admin.md).

Central calendar tests also cover persisted coverage, no provider calls for covered views after restart, one-off and recurring deltas, cancellations, cursor expiry and failed rebuild atomicity, boundary retention, historical import, on-demand extensions, concurrency and backoff. System reports local process memory, not whole-Pi memory. Its status refresh never invokes Google.

QR tests: see [phone access](qr-reminders.md). The development preview can now be exposed explicitly to a trusted LAN; this does not establish Pi or physical phone validation.

`node scripts/event-qr-smoke.mjs http://127.0.0.1:8775` checks the native Google event handoff against a connected installation with a cached event. It decodes the QR and checks identity/origin rejection without editing Google events or reminders; an older cached event may cause one read-only link lookup. It does not print event details or URLs.
