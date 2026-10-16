# Current build

Version: **0.1.0-dev**, first development foundation, 16 October 2026.

Implemented: SvelteKit display views, tap-open details, all-day/earlier disclosures, calendar filtering, two themes, local reminder management/completion/undo, SQLite persistence/version checks, loopback development access, Docker packaging and automated checks. Source was built fresh; the standalone mock is not reused.

Calendar data is fictional when demo mode is selected. No Google account, event cache or write integration exists yet. Do not interpret an empty day as actual availability. The local reminders are real database entries, initially empty.

## Verification

- `npm run check`: zero errors and zero warnings. Ten synthetic tests pass, including date/DST rules, indexed event ordering, disk persistence and stale mutations. Formatting and production compilation pass.
- HTTP smoke passes against both the development server and the Docker build: health, invalid input, cross-origin rejection, reminder create/read/edit/complete/undo/delete, missing items and stale-write conflicts.
- Container restart persistence passed with a dedicated test reminder, subsequently removed. The named volume preserves data. The container is healthy and runs without root privileges.
- Browser checks at 1280 × 720 covered Day, 2/3 days, Week, event details, all-day and Earlier disclosures, native scrolling, Month navigation into another month, calendar filtering, Warm/Slate, and completion/undo. Responsive reminder creation/editing was exercised at 390 × 844. The final Docker-served display's completion/undo was also verified.
- Physical touch, viewing distance, a real phone keyboard, ARM64 and Pi hardware remain unverified. The reference pixel layout does not establish physical readability.
- A brief amd64 Docker Desktop idle sample after restart/API checks reported about 22 MiB container memory and 0% CPU. This excludes Chromium, Docker's VM and the host OS; it is not a Pi sizing result or a sustained measurement.

The packaged smoke test initially caught valid writes being rejected because SvelteKit 3 moved origin configuration from the adapter's runtime `ORIGIN` variable to `paths.origin` at build time. Configuration was corrected, the container rebuilt, and HTTP/browser writes passed. CI includes a packaged HTTP smoke step to catch this regression. During development, a temporary hot-reload module fetch failed across a rebuild; the final packaged browser session did not show that failure. See the [development guide](development.md) to repeat checks.

## Limits that matter

- Local computer preview only. LAN pairing/authorization comes before household deployment or phone access over the network.
- Shared/personal lists are fixed organisational labels, not access-controlled personal accounts. No repeat rules or occurrence model yet.
- No Google sync or editing, provider credentials, backup/export tooling, installer, kiosk setup, release image publishing or public licence yet.
- The Docker volume persists data, but backup/restore and schema migrations need validation before irreplaceable data is used.
- Full-appliance memory, recovery and sustained operation on Pi 5 / 2 GB are outstanding. A container-only sample is not a Pi sizing result.

The next work is a bounded first-build review followed by device access and Google read integration, as described in the [roadmap](roadmap.md).
