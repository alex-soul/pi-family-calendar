# Development

Use Node 24 and npm, or Docker with Compose. No external accounts or services are required for demo mode or automated tests. Real events require the [Google setup](google-calendar.md).

## Run with hot reload

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and set `APP_TIME_ZONE` to an IANA zone. Example: `Europe/London`. Keep `CALENDAR_SOURCE=demo` for fictional events.
3. Run `npm run dev`.
4. Open http://127.0.0.1:5173/ and http://127.0.0.1:5173/manage.

On PowerShell, the copy command is `Copy-Item .env.example .env`; on Unix shells use `cp .env.example .env`. Environment changes require a server restart. Reminders are stored in ignored `data/calendar.sqlite`, independently from the Docker volume.

`npm run build` followed by `npm start` runs the compiled Node application on http://127.0.0.1:3000/. Keep production dependencies installed alongside the compiled build (`npm ci --omit=dev --ignore-scripts` when copying it to a clean machine). Docker installs these automatically. `npm start` reads `.env`. SvelteKit 3 configures the trusted origin at build time: the direct build defaults to `http://127.0.0.1:3000`, and Docker's `APP_ORIGIN` build argument defaults to `http://127.0.0.1:8775`. If changing a local port, rebuild with the matching `APP_ORIGIN` and update the listener/published port together. The old adapter-node `ORIGIN` runtime variable is not supported in this version.

## Docker preview

```sh
docker compose up --build -d
docker compose ps
docker compose logs --tail 50
```

Open http://127.0.0.1:8775/. The container runs as the unprivileged `node` user, with a read-only root filesystem and a writable named data volume. Its health check reads SQLite through `/healthz`. Logs rotate. Compose does not install a kiosk, change the host, publish an image or configure remote access.

Use `docker compose stop` to stop it. `docker compose up -d` starts it again. Do not remove the volume if you want to keep reminders or Google connections. The volume contains sensitive calendar data and the key needed to decrypt saved credentials. Backup/restore tooling and update/rollback procedures are pending; use disposable data for now.

The base image supports ARM64, but this first build's local Docker verification is amd64. Building/running on a Pi, full-appliance RAM and physical touch/readability validation are separate work. The container recipe is not proof of those results.

## Checks

```sh
npm run check
npm test
npm run lint
npm run build
```

Tests cover date boundaries/DST, simultaneous events, provider states, reminder validation, disk persistence and stale-write protection, plus OAuth state/PKCE, encrypted credential storage, calendar selection/deduplication, pagination, cache freshness, cancellations and permission loss. No test contacts Google. `npm run format` applies repository formatting.

With a disposable preview running, `node scripts/smoke.mjs http://127.0.0.1:8775` checks health, validation, origin rejection and reminder create/edit/complete/undo/delete over HTTP. It creates uniquely named todo/note items and deletes only those items in cleanup. Note checks cover completion rejection and kind preservation.

For UI changes, inspect Day/2 days/3 days/7 days/Month/Schedule at 1280 × 720, both themes, long content and overflowing lists. Check details, three-row all-day tap/drag expansion and idle collapse, shared menu timeout, scrolling to past events and timed idle return (including pause/Off), pinned Day/2-day panels and overlay access elsewhere, Month in-place expansion/collapse and round today marker, rolling seven-day dates and day-specific completion/undo, date navigation and calendar filtering. Inspect management at 390px and desktop widths, including real phone keyboard behaviour when LAN access is available. Check To do/Note selection, dated/undated note placement, no note checkbox, counts excluding notes and existing-data migration. Use synthetic content. A browser screenshot does not validate seven-inch viewing at one metre.

## Source map

- `src/lib/domain.ts`, `dates.ts`: normalized data and date rules.
- `src/lib/server/`: provider and reminder persistence boundaries; no browser imports.
- `src/routes/api/`: validated HTTP operations.
- `src/routes/+page.svelte`, `src/lib/components/`: appliance display.
- `src/routes/manage/`: responsive reminder forms.
- `src/hooks.server.ts`: local preview access/origin controls.
- `test/`: synthetic domain/persistence tests.
