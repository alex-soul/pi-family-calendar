# Pi Family Calendar Privacy Policy

Effective date: 21 October 2026.

## About the application

Pi Family Calendar, created by Alex Soul, is open-source software for a self-hosted calendar and reminder display. This policy describes the standard application. The person operating an installation controls its device, access, Google OAuth configuration and backups. There is no central Pi Family Calendar service that receives everyone's calendars.

## Information accessed and stored

When you connect a Google account, the application requests the Google Calendar read-only permission (`calendar.readonly`). It reads calendar identifiers, names, colours and access information to let you select calendars. For synchronization and display it reads event information, including identifiers, titles, descriptions, locations, dates, times, recurrence information, status and Google event links, where available.

The application stores the connected-account label, calendar selections, synchronization state and cached event information on the computer running the installation. Account or calendar identifiers and labels may include email addresses. It also stores OAuth tokens and the installation's OAuth client settings so it can maintain the authorised connection.

Local reminders, notes and completion history are stored by the installation. Browser preferences, such as theme, preferred view and calendar visibility, are saved in that browser. Administrative and optional QR access use session information to enforce access controls.

## How information is used

Google data is used to discover accessible calendars, synchronize selected events, display calendar information and provide links to Google's own event interface. OAuth credentials are used to authorise and refresh this connection.

The application does not create, modify or delete Google events through the Calendar API. If you follow an optional QR shortcut, you use Google's own interface and permissions to make changes. Local reminders are separate from Google events.

The standard application does not sell calendar information, use it for advertising, send it to AI services or train AI models with it. It contains no application analytics or telemetry service that sends your calendars to the developer.

## Access and sharing

Selected calendars and reminders are visible to people who can access the installation's display. Calendar visibility preferences are display choices, not privacy boundaries between household users. Administration and optional phone access depend on the operator's configuration.

The installation communicates with Google for authorisation and calendar synchronization. It serves calendar information to browsers accessing that installation. The developer does not receive your calendar data merely because you use the software. Operators can access device storage and may make backups or configure additional services; they are responsible for those arrangements.

This documentation is hosted on GitHub. Visiting it is subject to [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). Google sign-in, APIs and calendar pages are subject to [Google's privacy policy](https://policies.google.com/privacy).

## Storage and protection

OAuth client secrets and account tokens are encrypted at rest in the installation's data directory. The encryption key is stored alongside the databases, so access to the entire directory can expose credentials. Calendar caches and local reminders are not encrypted by the application. Operators must protect the device, network access and backups.

## Retention, disconnection and deletion

Past synchronized events can remain in the local cache; the application does not automatically expire them solely because their dates have passed. Synchronization reflects changes and deletions in Google and is not a backup of deleted Google events.

You can disconnect an account in the installation's Google settings. This removes the saved connection and data no longer selected through another connected account. Disconnecting does not delete Google events or revoke the permission held by Google. You can separately revoke that permission through [Google account connections](https://myaccount.google.com/connections).

Contact the installation operator to remove local reminders, remaining installation data or backup copies. Backups have their own retention arrangements and are not automatically erased when an account is disconnected. Revoking access at Google alone does not erase data already cached on the installation.

## Contact and changes

For privacy questions or data-removal requests concerning your installation, use the support email displayed on its Google consent screen or contact the installation operator directly. General software questions can be raised in [GitHub issues](https://github.com/alex-soul/pi-family-calendar/issues); do not include private data or credentials in a public issue.

Changes to this policy will be published here with an updated effective date. Its revision history is available in Git. See the [application homepage](homepage.md) for an overview.
