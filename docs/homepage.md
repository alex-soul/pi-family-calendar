# Pi Family Calendar

Pi Family Calendar is a self-hosted calendar and reminder display for a Raspberry Pi or another computer. It brings selected Google calendars and local reminders together in a glanceable interface designed for a small household screen.

Created by Alex Soul. The application is open source under the MIT licence.

## What it does

- Shows events in day, multi-day, week, month and schedule views.
- Keeps a local calendar cache so previously synchronized events remain available during temporary connection problems.
- Provides local to-do lists and notes, including repeating reminders.
- Offers a separate administration area for Google connections and installation settings.

## Why it requests Google Calendar access

With your consent, Pi Family Calendar reads your calendar list and events so you can choose which calendars to display. It requests the Google Calendar read-only permission, `https://www.googleapis.com/auth/calendar.readonly`.

The application reads and synchronizes calendar information; it does not create, change or delete Google events through the Calendar API. Optional QR shortcuts open Google's own calendar interface, where you control any edits.

Your installation stores its calendar cache and credentials on the computer running it. There is no central Pi Family Calendar account or hosted calendar service. Each installation operator supplies their own Google OAuth configuration and controls access to the display and administration pages. Selected calendar information is visible to people who can access that installation.

## Privacy and support

Read the [Pi Family Calendar Privacy Policy](privacy-policy.md) for details of data access, storage, sharing and removal.

For questions about a particular installation or its Google connection, contact its operator using the support email shown on the Google consent screen. For general software questions, use the [project's GitHub issues](https://github.com/alex-soul/pi-family-calendar/issues). Do not post private events, credentials or tokens in public issues.

- [Source code, screenshots and setup instructions](https://github.com/alex-soul/pi-family-calendar)
- [Google Calendar connection guide](google-calendar.md)
- [Privacy Policy](privacy-policy.md)
