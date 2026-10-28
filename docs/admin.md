# Admin access

Enter `/admin` after the installation address, for example http://127.0.0.1:8775/admin in the local preview. There is deliberately no admin link on the calendar display. Legacy `/manage` URLs redirect to admin.

- **Overview:** shortcuts and installation counts.
- **Reminders:** manage saved ToDos/Notes and repeating templates; browse completed ToDos and past Notes.
- **Note categories:** choose Note colours and icons; General stays available.
- **Screen:** brightness, sleep and automatic blanking when host controls are connected.
- **About:** installed version, channel and build identity.
- **Google Calendar:** accounts, selected calendars, sync and credentials, with links to the maintained [Google setup guide](google-calendar.md). Event editing stays in Google.
- **Access:** optional PIN, reminder QR access and the default calendar for event QR drafts.
- **System:** synchronization status, event/request counts, per-calendar coverage/history, last/next checks, configurable sync interval, database size, app memory and uptime. Time zone remains installation configuration.

The display can browse, show details, complete to-dos and save its own theme/idle/calendar visibility preferences. These preferences do not configure another screen.

## Optional PIN

Protection is off until the owner enables it. Without a PIN, anyone who can reach the installation and knows the address can administer it. Hiding the link is a UI boundary, not authentication.

In Access choose a six-digit PIN and confirm it. The six boxes advance as you type; Enter submits when complete. Leading zeros are retained. Existing 6–12 digit PINs still work through **Use a longer PIN**. An unlocked browser session lasts 12 hours; use **Lock** when finished. Changing or disabling a PIN requires the current PIN. Changing it revokes other admin sessions. Five attempts per minute are allowed across the installation; restart does not clear the limit.

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

On a phone, open the three-line button at the top right for navigation. Google setup, connection guidance and calendar sections start collapsed. Detailed setup instructions live in the linked repository guide.

## Reminder lists and history

Choose ToDos or Notes first. ToDos offer **Active / Completed / Templates**; Notes offer **Active / Past / Templates**. Switching types maps Completed to Past and back. Active excludes templates. Notes cannot be completed: Past means a saved dated Note before today in the installation time zone. A Note whose time window ended today remains Active until the next day. Undated Notes stay Active.

Search is opened with the magnifying glass. Notes can also be filtered by category, with All categories as the default. Search and category selection combine and apply to the whole matching list before pagination. Active and Templates use ascending order; Completed is newest completion first, and Past is newest date/time first.

**Delete all completed** and **Delete all past** require confirmation and cover the entire applicable history, including items hidden by search/category filters or pagination. The confirmation checks for intervening changes. Deleting past Notes leaves templates, current/future items and generation receipts intact.

Repeating templates create independent saved items at midnight, with one retry at 01:00 in the installation time zone. Startup does not catch up missed generation. Future calendar previews are not saved items. Editing or deleting a template changes future previews/generation; existing saved items keep their own content and completion state. Editing a generated item changes only that item.

Dated ToDos can be completed on their scheduled day or later; undated ToDos can be completed on any day. Future previews cannot be completed. Undo completion is available from completed-item details and admin. Each saved ToDo has its own completion; completing one does not clear other missed days. Notes never become overdue.

Note categories style cards with a left colour band and the configured icon. General uses the default Note icon. Removing a custom category preserves its Notes and returns them to General.

## QR reminders

Access also contains the optional **QR reminders** toggle, off by default. It allows display users to scan scoped Add/Edit links without unlocking admin. It never reveals the PIN or Google credentials. Disable it to revoke all outstanding QR access. See [phone setup and behaviour](qr-reminders.md).

## Calendar event QR shortcuts

In Access, expand QR calendar events. Choose the Default calendar, then turn on Add events via QR codes. Only enabled editable calendars appear. Each date's Plus opens a QR for a Google draft on that date; Google handles the phone's account and editing rights. Turning it off hides Add and rejects new creation-code requests; existing-event view/edit QR remains available. This setting is separate from QR reminders and never grants admin access.
