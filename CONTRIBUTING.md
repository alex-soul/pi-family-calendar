# Contributing

Start with [development](docs/development.md), [architecture](docs/architecture.md) and [current validation](docs/current-state.md).

Keep changes focused on a glanceable, touch-friendly calendar. Google owns event editing; the application reads and caches events. Reminder editing belongs in the phone/admin flows. Never add household configuration, calendar data, credentials or private deployment instructions to this repository.

Use fictional fixtures for tests. Keep any separate DEV instance disconnected from household Google sync. Run `npm run check`, `npm test`, `npm run lint` and `npm run build`; exercise relevant browser flows for UI changes and host tests for host integration changes. Laptop tests do not establish Pi performance or physical touch acceptance.

Follow [the release sequence](docs/releasing.md): local acceptance, identifiable source/version, tested published images, deliberate deployment and physical acceptance, then documentation reconciliation. No automatic application updates or unapproved live rollback. Preserve data volumes and the matching encryption key.

Contributions use the [MIT licence](LICENSE). Dependencies retain their own licences and notices. Optional hardware setup and private appliance policy belong to the operator, not a guided installer in this repository.
