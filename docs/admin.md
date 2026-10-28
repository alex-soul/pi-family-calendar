# Admin access

Enter `/admin` after the installation address, for example http://127.0.0.1:8775/admin in the local preview. There is deliberately no admin link on the calendar display. Legacy `/manage` URLs redirect to admin.

- **Overview:** shortcuts and installation counts.
- **Reminders:** add, update or delete to-dos/notes; configure recurrence; browse completed items and undo completion.
- **Google Calendar:** accounts, selected calendars, sync and credentials, with links to the maintained [Google setup guide](google-calendar.md). Event editing stays in Google.
- **Access:** optional PIN.
- **System:** synchronization status, event/request counts, per-calendar coverage/history, last/next checks, configurable sync interval, database size, app memory and uptime. Time zone remains installation configuration.

The display can browse, show details, complete to-dos and save its own theme/idle/calendar visibility preferences. These preferences do not configure another screen.

## Optional PIN

Protection is off until the owner enables it. Without a PIN, anyone who can reach the installation and knows the address can administer it. Hiding the link is a UI boundary, not authentication.

In Access choose a PIN of 6�12 digits and confirm it. An unlocked browser session lasts 12 hours; use **Lock** when finished. Changing or disabling a PIN requires the current PIN. Changing it revokes other admin sessions. Five attempts per minute are allowed across the installation; restart does not clear the limit.

The server protects admin pages, their data loads, Google settings and reminder editing APIs. Calendar/reminder reads and the narrow to-do completion endpoint remain available without unlocking. A PIN does not hide calendar data or prevent someone ticking off a task. No default PIN is shipped.

PINs use salted [Node scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback) hashes in a separate `admin.sqlite` store. Session tokens are random, stored hashed on the server and sent in HttpOnly, SameSite=Lax cookies; Secure is added for HTTPS. Keep the data volume private. This preview remains loopback-only; the PIN does not enable LAN access or make public HTTP exposure appropriate.

## Forgotten PIN: installation owner only

If you forget the PIN, disable protection from the installation host, then choose a new PIN in Admin. This does not recover the old PIN or assign a temporary one. You need the owner's SSH access and permission to administer the existing Docker installation.

1. From a trusted computer, connect to the Pi, substituting your SSH user and host:

   ```sh
   ssh YOUR_USER@YOUR_PI_HOST
   ```

2. Change to the directory containing your installation's Compose file and confirm the running Calendar service:

   ```sh
   cd /path/to/your/calendar-installation
   docker compose ps calendar
   ```

   Use the same Compose file, project and Docker permissions as your installation. For example, if it uses `-f compose.appliance.yaml`, include that option in both Compose commands; use `sudo` if your normal Docker commands require it.

3. Disable the PIN and revoke existing admin sessions:

   ```sh
   docker compose exec calendar node scripts/reset-admin.mjs --confirm
   ```

   Despite its filename, this command **disables** the PIN. It uses the running service's existing data mount and `DATA_DIR`. It refuses to create a missing database. If it fails, check that you selected the correct running installation; do not delete a database or create a replacement volume. No restart is required.

4. Open `http://YOUR_PI_HOST:8775/admin/access`, or your installation's configured address, and immediately set and confirm a new six-digit PIN. Until you do, anyone who can reach the admin interface can administer it. Perform recovery on a trusted network.

5. Lock Admin, sign in with the new PIN, and check your reminders and settings.

Recovery leaves reminders, calendars, Google credentials, QR settings and the data volume intact. There is no browser recovery endpoint. Existing longer PINs remain usable through **Use a longer PIN** at login or when entering the current PIN; new PINs use six digits.

For a **direct Node installation**, run the following from the application directory as the usual application filesystem owner, pointing at its existing data directory:

```sh
DATA_DIR=/path/to/existing/data node scripts/reset-admin.mjs --confirm
```

Then follow steps 4 and 5. Do not use this variant to guess or override a Docker volume path.

Google Calendar also contains Calendar appearance: friendly names and colours for enabled calendars, shared by all displays. Calendar visibility remains a per-browser choice in the calendar display menu.

On a phone, open the three-line button at the top right for navigation. Accounts & calendars and Calendar appearance are collapsed by default on the Google Calendar page. Dated to-dos can be completed on their scheduled day or later (using the installation time zone); future items remain locked. Anytime tasks can be completed on any day. Repeating tasks retain one overdue item per series. Completion records one action against the latest outstanding scheduled occurrence and clears missed occurrences through today; the fixed future schedule stays unchanged. Undo in completed history also restores that action�s cleared backlog. Notes never become overdue.

## QR reminders

Access also contains the optional **QR reminders** toggle, off by default. It allows display users to scan scoped Add/Edit links without unlocking admin. It never reveals the PIN or Google credentials. Disable it to revoke all outstanding QR access. See [phone setup and behaviour](qr-reminders.md).

## Calendar event QR shortcuts

In Access, expand QR calendar events. Choose the Default calendar, then turn on Add events via QR codes. Only enabled editable calendars appear. Each date's Plus opens a QR for a Google draft on that date; Google handles the phone's account and editing rights. Turning it off hides Add and rejects new creation-code requests; existing-event view/edit QR remains available. This setting is separate from QR reminders and never grants admin access.
