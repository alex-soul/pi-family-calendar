# Connect Google Calendar

This development integration reads real calendars. Add/edit/delete events in Google Calendar for now. No API key is needed: private calendars use OAuth sign-in.

## Set up this local preview

Open **Main menu → Google Calendar settings**, or `/manage/google`, in a normal browser on the computer running the preview. Embedded browsers may be rejected by Google sign-in.

1. Open [Google Cloud Console](https://console.cloud.google.com/). Check the project selector for a suitable existing project, or create a dedicated project.
2. Under APIs & Services → Library, enable **Google Calendar API**.
3. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview). Supply the app name and contact details in Branding. For personal Google accounts, choose External audience. While the app is in Testing, add each account you intend to connect as a test user.
4. Under Clients, create an OAuth client with application type **Web application**. Add the exact authorised redirect URI shown in the app. For the supplied Docker preview it is `http://127.0.0.1:8775/api/google/callback`. Host, port and path must match exactly.
5. Enter its client ID and client secret in the local settings page and save. The secret is not returned by the settings API. Do not put it in chat, source control or screenshots.
6. Choose **Connect Google account** and complete Google's sign-in/consent screen. Grant calendar read access. A successful callback returns to settings with the account and its calendars.
7. Review calendars, save selection and choose **Sync now**, then return to Calendar. Initially all readable calendars on that account's calendar list are selected. New calendars discovered later require selection.

Use one account with access to shared calendars, or connect multiple accounts separately. The app does not grant sharing rights: calendars must already be accessible in Google. A calendar selected through multiple accounts appears once. All selected information is visible to users of this installation; personal calendar labels are not privacy controls.

Google's External/Testing configuration issues refresh tokens that expire after seven days for these scopes. Expect reconnects while testing. Production publishing, any required verification and public distribution are separate decisions. See [Google token expiry](https://developers.google.com/identity/protocols/oauth2#expiration) and [web-server OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server).

## Refresh and reliability

- Requests use only `calendar.readonly`. No Google event mutation endpoints exist in this build.
- The visible display checks its selected date window each minute. The server reuses successful windows for two minutes; Sync now bypasses that cache for the current month window.
- Each window covers the requested month grid plus the following week. Recurring instances are expanded by Google; moved instances, cancellations, all-day exclusive ends and time-zone offsets are normalized. A complete refresh replaces the window only after all pages/calendars succeed. This is bounded polling, not instant push or an incremental sync-token pipeline.
- During temporary network/quota failures, a last-successful window remains visible with its original sync time and a warning. A date window never fetched successfully remains unavailable, not confirmed empty. The cache retains up to 12 windows.
- Confirmed revoked access or denied permissions clears the cached event windows. Reconnect or adjust calendar selection/permissions. Google rate-limit errors preserve the cache.
- Disconnect removes the local account and cached windows; it does not delete Google events or revoke Google's grant. To revoke the grant, use [Google account connections](https://myaccount.google.com/connections).

## Storage and deployment limits

The server uses Google's maintained OAuth library, single-use expiring state bound to an HttpOnly browser cookie, PKCE, and offline token refresh. Client secrets and account tokens are AES-256-GCM encrypted in `google.sqlite`; the key is `google.key` alongside it in the private data volume. The event cache is not encrypted. Protect the whole directory: encryption does not defend against access to both key and database. Backups must preserve the key and databases together; key loss is not silently repaired.

The supplied Docker volume also contains existing reminders; configuration and sync do not replace them. No credentials are stored in browser preferences or Git. Host/origin checks retain the loopback-only boundary.

This is currently a local-computer connection flow. Google does not permit a plain LAN IP as a normal web-client callback. Phone-to-Pi authorization, HTTPS/pairing, recovery/backup tooling and physical Pi validation need their own implementation before deployment. Do not expose the preview port to the LAN or Internet as a shortcut.

## Troubleshooting

- **Redirect URI mismatch:** copy the URI shown in settings exactly into the Google Web client. A different hostname/port needs its own authorised URI and matching build origin.
- **Access blocked/test user:** check the selected Cloud project, audience and test-user list. Workspace administrator restrictions may also apply.
- **No calendars:** grant calendar read access and confirm calendars are in the signed-in account's Google calendar list. Busy-only calendars do not expose event details and are not imported.
- **Sign-in failed:** restart from settings; links expire after ten minutes, are single-use and are tied to the initiating browser. Also check API enablement and client credentials. Raw provider errors/codes/tokens are deliberately not displayed.
- **Expired connection:** reconnect the same account. Calendar choices are retained where still accessible.

Implementation references: [CalendarList pagination and permissions](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list), [event expansion and time filtering](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).

The in-app first-time setup guide is part of the shipping product. Preserve it in packaged builds and keep it aligned with this document as setup evolves.
