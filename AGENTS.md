# Working on Pi Family Calendar

Read README.md, docs/architecture.md and docs/development.md before changing the application. The first public prerelease is deployed; docs/current-state.md owns the verified status and docs/releasing.md owns release delivery.

- The governing constraint is a beautiful, glanceable seven-inch display. The provisional reference is 1280 × 720 landscape. Keep events legible and stack simultaneous events vertically.
- Display routes allow browsing, details, per-browser preferences and to-do completion only. Google connections and installation settings belong to the manually accessed /admin portal. The optional QR flow is a narrow exception for phone creation/editing and confirmed note deletion: use scoped, expiring grants, never an admin session. Never link admin from the display. PIN protection gates administrative APIs as well as pages; keep the completion endpoint narrowly scoped.
- This repository and its images are public. Never include household identities, deployment addresses, calendar identifiers, credentials or private operational notes.
- Google event QR handoffs are display shortcuts to Google's own editor, not Calendar API writes. Creation is separately enabled in admin with a default calendar. Never render an outbound Google anchor on the kiosk display.
- The disposable design mock is a conceptual reference, never an implementation source. Use this repository's own architecture, setup and release documentation.
- Prefer one small backend and purposeful dependencies. Do not introduce a general dashboard, plugin framework or extra service without a concrete need.
- Preserve unrelated work. Run npm run check, npm test and npm run build for implementation changes; exercise relevant browser flows for UI changes. Laptop/container verification does not establish Pi performance or physical readability.
- Use fictional fixtures for tests. No live Google writes, production deployment, public release or package publishing as a side effect of development.
- Keep docs/current-state.md accurate about what works, what was verified and what remains. Record architectural decisions in docs/architecture.md and deferred product work in docs/roadmap.md.
