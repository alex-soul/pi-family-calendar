# Contributing

Start with [development](docs/development.md), [architecture](docs/architecture.md) and [current state](docs/current-state.md).

Keep changes focused on a tiny, readable calendar appliance. Use a small number of meaningful components and clear domain boundaries. Forms belong on the management route; the display must work without a keyboard. Do not copy the disposable mock into production code.

Run type/accessibility checks, the relevant tests and a production build. Check affected UI at the target display size and mobile management widths. Keep test data fictional and avoid live provider writes. Describe what changed, why, the checks performed and the limits of the evidence.

Keep product documentation suitable for a general audience. Household setup, addresses, calendar identifiers, credentials and operational history must stay in private operator records. The initial repository is private; licence and contribution terms will be settled before public release.
