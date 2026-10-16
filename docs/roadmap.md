# Next milestones

The overall interaction concepts are established. Avoid another round of disposable mock polishing; refine the real application in bounded steps.

1. **First-build review.** Evaluate Day/2/3-day timelines, Week cards, Month and Schedule, the reminder dock, idle following and detail readability. Tune visual hierarchy in the development build. Verify the actual display dimensions and viewing distance.
2. **Device access.** Add simple device pairing and management authorization before enabling LAN access. Protect both event information and edits; keep text entry on phone/desktop. Verify a real mobile keyboard workflow.
3. **Google read sync validation.** OAuth settings, multiple accounts, selected calendars, bounded polling and stale cache are implemented. Complete live account authorization and verify real recurring exceptions, cancellations, private visibility, time zones and account permissions. Current automated tests use fictional Google responses. Tune from real events before considering incremental sync.
4. **Google writes.** Define minimal fields, permissions, recurrence edit scope, optimistic concurrency, ambiguous retries and attendee notification behaviour. Keep Google authoritative and saves online-only. The UI already reserves add/edit/delete positions; these currently explain the read-only boundary and must not be mistaken for working event writes.
5. **Local reminder POC.** Implement recurring reminders with occurrence-specific completion/undo before enabling the reserved Repeat field. Refine names/shared/personal semantics, visibility and overdue presentation. Add backup/export and restore tests before relying on it. A cloud reminder provider remains optional future work.
6. **Pi appliance validation.** ARM64 build, Pi 5 with 2 GB, host kiosk, restart/recovery, idle/active/sync RAM including Chromium and the OS, sustained operation and touch/readability tests. Upgrade hardware only on measured evidence.
7. **Release preparation.** Reproducible versioned images, update/rollback/storage compatibility, installation guidance, chosen open-source licence, third-party notices and public-repository review. No public exposure or automatic image publishing yet.

These are follow-ups, not claims that the initial build provides them. Pi Family Calendar remains an independent product with deployment-specific operations kept outside the product repository.
