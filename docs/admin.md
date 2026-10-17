# Admin access

Enter `/admin` after the installation address, for example http://127.0.0.1:8775/admin in the local preview. There is deliberately no admin link on the calendar display. Legacy `/manage` URLs redirect to admin.

- **Overview:** shortcuts and installation counts.
- **Reminders:** add, update or delete to-dos/notes; configure recurrence; browse completed items and undo completion.
- **Google Calendar:** accounts, selected calendars, sync and the shipped setup guide. Event editing stays in Google.
- **Access:** optional PIN.
- **System:** synchronization status, event/request counts, per-calendar coverage/history, last/next checks, configurable sync interval, database size, app memory and uptime. Time zone remains installation configuration.

The display can browse, show details, complete to-dos and save its own theme/idle/calendar visibility preferences. These preferences do not configure another screen.

## Optional PIN

Protection is off until the owner enables it. Without a PIN, anyone who can reach the installation and knows the address can administer it. Hiding the link is a UI boundary, not authentication.

In Access choose a PIN of 6�12 digits and confirm it. An unlocked browser session lasts 12 hours; use **Lock** when finished. Changing or disabling a PIN requires the current PIN. Changing it revokes other admin sessions. Five attempts per minute are allowed across the installation; restart does not clear the limit.

The server protects admin pages, their data loads, Google settings and reminder editing APIs. Calendar/reminder reads and the narrow to-do completion endpoint remain available without unlocking. A PIN does not hide calendar data or prevent someone ticking off a task. No default PIN is shipped.

PINs use salted [Node scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback) hashes in a separate `admin.sqlite` store. Session tokens are random, stored hashed on the server and sent in HttpOnly, SameSite=Lax cookies; Secure is added for HTTPS. Keep the data volume private. This preview remains loopback-only; the PIN does not enable LAN access or make public HTTP exposure appropriate.

## Forgotten PIN: installation owner only

From the host, run:

```sh
docker compose exec calendar node scripts/reset-admin.mjs --confirm
```

This disables the PIN and revokes admin sessions. It does not delete reminders, calendars, Google credentials or the data volume. Open `/admin/access` immediately to set a new PIN. There is no browser recovery endpoint. For a direct Node installation, run `node scripts/reset-admin.mjs --confirm` with `DATA_DIR` pointing at the installation's existing data directory. The script refuses to create a missing database.

Google Calendar also contains Calendar appearance: friendly names and colours for enabled calendars, shared by all displays. Calendar visibility remains a per-browser choice in the calendar display menu.

On a phone, open the three-line button at the top right for navigation. Accounts & calendars and Calendar appearance are collapsed by default on the Google Calendar page. Dated to-dos can be completed only on their scheduled day (using the installation time zone); Anytime tasks can be completed on any day. Recurring items follow the same rule per occurrence. Undo remains available in completed history.

## QR reminders

Access also contains the optional **QR reminders** toggle, off by default. It allows display users to scan scoped Add/Edit links without unlocking admin. It never reveals the PIN or Google credentials. Disable it to revoke all outstanding QR access. See [phone setup and behaviour](qr-reminders.md).

## Calendar event QR shortcuts

In Access, expand QR calendar events. Choose the Default calendar, then turn on Add events via QR codes. Only enabled editable calendars appear. Each date's Plus opens a QR for a Google draft on that date; Google handles the phone's account and editing rights. Turning it off hides Add and rejects new creation-code requests; existing-event view/edit QR remains available. This setting is separate from QR reminders and never grants admin access.
