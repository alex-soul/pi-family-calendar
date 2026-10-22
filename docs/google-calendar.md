# Connect Google Calendar

Pi Family Calendar reads real calendars. Event creation, editing and deletion stay in Google Calendar. Two-way sync is not a promised future feature. No API key is needed: private calendars use OAuth sign-in.

## Set up your installation

Open `/admin/google` in a normal browser, or choose **Google Calendar** from the admin sidebar. There is no admin link in the calendar display. Expand **Setup & credentials**; it starts collapsed. Embedded browsers may be rejected by Google sign-in.

When connecting to a Pi from a Windows laptop, start the [connection helper](appliance-tools.md#windows-google-connection-helper) first and use the page it opens. This makes the displayed callback match the laptop tunnel. The helper normally uses port `18775`; a local installation using the supplied Compose file uses `8775`. Always register the exact callback displayed in the browser where you will start consent, including its scheme, hostname, port and path.

The fictional DEV environments described in [Development](development.md) deliberately disable Google synchronization and sign-in. Connect the intended installation, not the isolated UI preview, and keep development or restored copies from synchronizing the live household account.

1. Open [Google Cloud Console](https://console.cloud.google.com/). Check the project selector for a suitable existing project, or create a dedicated project.
2. Under APIs & Services → Library, enable **Google Calendar API**.
3. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview). Supply the app name and contact details in Branding. For personal Google accounts, choose External audience. While the app is in Testing, add each account you intend to connect as a test user.
4. Under Clients, create an OAuth client with application type **Web application**. Add the exact authorised redirect URI shown in the app. For a local installation on port 8775 it is `http://127.0.0.1:8775/api/google/callback`; the default laptop-to-Pi helper uses `http://127.0.0.1:18775/api/google/callback`. Keep any existing callbacks that are still used.
5. Enter its client ID and client secret in the local settings page and save. The secret is not returned by the settings API. Do not put it in chat, source control or screenshots.
6. Expand **Accounts & calendars**, choose **Connect Google account** and complete Google's sign-in/consent screen. Grant calendar read access. A successful callback returns to settings.
7. Expand **Accounts & calendars** again, review calendars, save selection and choose **Sync now**, then return to Calendar. Initially all readable calendars on that account's calendar list are selected. New calendars discovered later require selection. For regular use, complete the [personal Production setup](#tested-household-setup-using-the-project-pages) below; Testing grants are short-lived.

Use one account with access to shared calendars, or connect multiple accounts separately. The app does not grant sharing rights: calendars must already be accessible in Google. A calendar selected through multiple accounts appears once. All selected information is visible to users of this installation; personal calendar labels are not privacy controls.

## Keep a personal installation connected

An External OAuth app left in **Testing** receives refresh tokens that expire after seven days for Calendar scopes. Running continuously does not extend that lifetime. The app cannot inspect your Cloud project's publishing status; check it in [Google Auth Platform → Audience](https://console.cloud.google.com/auth/audience).

For regular personal use, move the OAuth app to **In production**, following the requirements shown in Google Cloud. Google's [personal-use exception](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification#exceptions) covers you and a small number of people you personally know; verification may not be required, but an unverified-app warning and user cap can still apply. Google recommends separate projects for development and production. Workspace policies can impose additional restrictions.

### Tested household setup using the project pages

The following setup was used successfully for a personal Pi installation: Google accepted the project's public GitHub pages, the OAuth app was switched to **In production**, and fresh consent, synchronization and token refresh were verified. This is a personal-use setup, not a Google-verified app or a shared OAuth client.

1. Select **your own project** in [Google Auth Platform](https://console.cloud.google.com/auth/overview), then open **Branding**.
2. Set the app name to **Pi Family Calendar**. Select **your own support email** and supply your own developer contact email.
3. Under **App domain**, enter these full URLs:

   | Field                           | Value                                                                              |
   | ------------------------------- | ---------------------------------------------------------------------------------- |
   | Application home page           | `https://github.com/alex-soul/pi-family-calendar/blob/main/docs/homepage.md`       |
   | Application privacy policy link | `https://github.com/alex-soul/pi-family-calendar/blob/main/docs/privacy-policy.md` |

   The **Application Terms of Service link** was left empty in the tested setup; the project does not currently supply a separate Terms of Service page.

4. Under **Authorised domains**, add `github.com` and save the branding settings. This entry allows the GitHub page URLs in the configuration; it does not verify ownership of GitHub or register an OAuth callback.
5. Open **Audience**, keep the user type **External**, and use **Publish app** to switch the publishing status to **In production**. Confirm that the page shows that status.
6. Under **Clients**, open your **Web application** client and check its authorised redirect URIs. Copy the exact callback shown in the app. With the shipped Windows SSH helper's default laptop port, it is `http://127.0.0.1:18775/api/google/callback`; the local Docker preview uses port `8775` instead. Follow the [helper instructions](appliance-tools.md#windows-google-connection-helper) when connecting to a Pi from a laptop, and start and finish consent through that same tunnel.
7. In the Pi's `/admin/google` page, choose **Connect Google account** again and complete consent. For the same client, you do not need to disconnect first. After returning to settings, check the calendar selection, choose **Sync now**, and confirm a recent successful sync and the expected events on the display.

You may reuse these homepage and privacy-policy links for a standard personal installation whose data handling matches the published policy. Each operator remains responsible for their own credentials, contact details and installation. Google explicitly exempts personal-use apps from verification; **In production** publishing status does not mean that branding or scopes have been verified. The tested setup remained unverified. See [Google's verification exceptions](https://support.google.com/cloud/answer/13464323/).

Hosting the pages on a domain you control and completing Google's verification may be a better long-term option for an independent setup. That process is outside this guide; these shared GitHub links do not establish ownership of `github.com` for verification.

### Reconnect and maintain access

After changing publishing status or setting up the production client, authorize the accounts again to obtain fresh grants. For the same client, use **Connect Google account** again without disconnecting; accessible calendar selections are retained. A different OAuth client requires the existing connections to be removed before replacing credentials. Do not rely on a token issued during Testing becoming permanent automatically.

The server refreshes short-lived access tokens automatically. Production removes the Testing-specific seven-day limit, but does not guarantee perpetual access: revocation, token limits, unused refresh tokens, time-limited grants and account policies can require reconnection. See [Google token expiry](https://developers.google.com/identity/protocols/oauth2#expiration).

Publishing the OAuth app is separate from publishing calendar data, opening network access or making this repository public. The self-hosted product ships integration code and guidance, **not a shared OAuth client**. Each operator creates and owns their Google project, client credentials and consent configuration. Offering a centrally managed client to unrelated users would be a separate distribution model with its own Google verification obligations.

## Refresh and reliability

- Requests use only `calendar.readonly`. No Google event mutation endpoints exist in this build.
- The Pi keeps events in SQLite and checks Google for changes about every two minutes, even without a browser open. System lets you change this interval. Screens read the Pi, refreshing about once a minute while visible; changes normally reach a screen within roughly two to three minutes, with jitter and network delays.
- One month back and at least twelve months ahead stay prepared. Older history imports gradually, and past events do not expire. Browsing further ahead downloads missing dates through the Pi once and keeps them for later views.
- Recurring instances are expanded by Google. Incremental changes include edits and cancellations; expired sync cursors trigger an automatic full rebuild. Partial failed requests never replace a complete calendar snapshot.
- Temporary network/quota failures retain saved events with a stale warning and retry with backoff. Dates not yet imported remain explicitly incomplete. System shows progress, per-calendar coverage, last success, next check, errors and request counts.
- Removing a calendar or losing permission removes its locally served data. Historical retention follows Google's current records, including deletions; it is not a backup of deleted events.
- Disconnect removes the local account and data no longer selected by another account. It does not delete Google events or revoke Google's grant. To revoke the grant, use [Google account connections](https://myaccount.google.com/connections).

## Storage and deployment limits

The server uses Google's maintained OAuth library, single-use expiring state bound to an HttpOnly browser cookie, PKCE, and offline token refresh. Client secrets and account tokens are AES-256-GCM encrypted in `google.sqlite`; the key is `google.key` alongside it in the private data volume. The event cache is not encrypted. Protect the whole directory: encryption does not defend against access to both key and database. Backups must preserve the key and databases together; key loss is not silently repaired.

The supplied Docker volume also contains existing reminders; configuration and sync do not replace them. No credentials are stored in browser preferences or Git. Host/origin checks retain the loopback-only boundary.

Google does not permit a plain LAN IP as a normal web-client callback. For an operator-managed Pi, the shipped [Windows SSH helper](appliance-tools.md#windows-google-connection-helper) opens localhost on the laptop and forwards the callback to the Pi. It requires existing verified SSH key/agent access; start and finish consent in the same tunneled browser. Ordinary phone administration uses the explicitly configured LAN origin and existing PIN. Do not expose the appliance to the Internet as a shortcut. See [current validation](current-state.md) for tested and pending flows.

## Troubleshooting

- **Redirect URI mismatch:** copy the URI shown in settings exactly into the Google Web client. `localhost` and `127.0.0.1`, or ports `8775` and `18775`, are different callbacks. A different hostname/port also needs to be allowed by the installation's origin configuration; changing the helper port must match `OAUTH_LOOPBACK_PORT`. Start a fresh connection attempt from the same tunneled page after correcting the client.
- **Access blocked/test user:** check the selected Cloud project, audience and test-user list. Workspace administrator restrictions may also apply.
- **No calendars:** grant calendar read access and confirm calendars are in the signed-in account's Google calendar list. Busy-only calendars do not expose event details and are not imported.
- **Sign-in failed:** restart from settings; links expire after ten minutes, are single-use and are tied to the initiating browser. Also check API enablement and client credentials. Raw provider errors/codes/tokens are deliberately not displayed.
- **Expired connection:** reconnect the same account. Calendar choices are retained where still accessible.

Implementation references: [CalendarList pagination and permissions](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list), [event expansion and time filtering](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).

This document is the maintained Google setup and troubleshooting guide. The admin page links here and keeps only controls, essential messages, the installation's exact callback and its Windows helper download/command. Maintain detailed Cloud, Branding and Production instructions here; maintain the SSH helper procedure in [appliance tools](appliance-tools.md#windows-google-connection-helper). Do not copy those procedures into the UI. The links open in a separate tab and need internet access; connecting to Google also requires internet access.

## Names and colours

Under /admin/google, Calendar appearance lets you give each enabled calendar a friendly name and colour. Save appearance applies across all screens on their next refresh (normally within a minute while idle). Google itself is unchanged. Leave the name blank to follow its Google name, or choose Use Google defaults to reset both fields. These choices survive syncs and reconnections. Choose which enabled calendars each screen displays in its own Display settings menu.

## Google event QR handoff

**Kiosk/link clarification:** the dedicated kiosk URL includes `?kiosk=1` and hides clickable QR links. Ordinary laptop/phone browsers show a small Direct link below each QR. The display remains free of administrative navigation.

Event details have a pencil handle on the right edge. Tap it to slide a locally rendered QR over the details; tap again to hide it. The dialog reserves enough height to avoid resizing when the code opens. The dedicated kiosk hides external links; ordinary browsers offer Direct link below the QR. Google handles sign-in, calendar permissions and editing; this does not grant admin access or change the appliance's read-only OAuth scope. It is independent of the reminder QR management toggle. In Admin > Access > QR calendar events, choose an enabled editable default calendar, then enable Add events via QR codes. This is off by default. Matching circular Plus buttons beside dates open an add-event QR with that exact date and the selected calendar. Month uses empty-cell tapping instead; drag across visible date cells to select a range. In 7 days, use empty space around date labels and all-day banners above the divider. Both views create all-day events including every selected day, with no Plus clutter. Schedule has no event Add shortcut. Date numbers still open the day and event cards still open details. In Day, 2 days and 3 days, the draft starts as a timed event at 12:00 to 12:00 on the selected date; choose the actual times in Google. Google still requires the scanning account to have editing access.

Links come from Google's event htmlLink, including the selected recurring occurrence. Newly synchronized records retain the link. Older cached records reuse their source link where available; otherwise expanding the QR makes one server-side, read-only lookup for that known event and persists its link. Normal view changes continue to use the Pi mirror. No account number or email is imposed on the phone. Google may open event details before its edit control; app/browser routing and multiple-account behaviour must be checked on each phone.

The creation URL uses Google's event template plus the target-calendar src parameter. Date and target calendar were verified in Google's desktop draft editor; src is not part of the formally documented template fields and may behave differently in a phone app or another account. Verify before saving on each phone. Disabling the shortcut prevents new codes; it cannot revoke an already scanned ordinary Google URL.
