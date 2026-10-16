# Working on Pi Family Calendar

Read README.md, docs/architecture.md and docs/development.md before changing the application. This is an early development build, not a released appliance.

- The governing constraint is a beautiful, glanceable seven-inch display. The provisional reference is 1280 × 720 landscape. Keep events legible and stack simultaneous events vertically.
- Display routes use touch for browsing, details and completing reminders. Text entry belongs on the responsive management route.
- Keep product code and documentation suitable for a future public repository. Never include household identities, deployment addresses, calendar identifiers, credentials or private operational notes.
- This is a separate product from Pi Rain Radar. Its disposable design mock is a conceptual reference, never an implementation source.
- Prefer one small backend and purposeful dependencies. Do not introduce a general dashboard, plugin framework or extra service without a concrete need.
- Preserve unrelated work. Run npm run check, npm test and npm run build for implementation changes; exercise relevant browser flows for UI changes. Laptop/container verification does not establish Pi performance or physical readability.
- Use fictional fixtures for tests. No live Google writes, production deployment, public release or package publishing as a side effect of development.
- Keep docs/current-state.md accurate about what works, what was verified and what remains. Record architectural decisions in docs/architecture.md and deferred product work in docs/roadmap.md.
