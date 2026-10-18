import unittest
from kiosk import browser_command


class KioskTests(unittest.TestCase):
    def test_local_marker_and_separate_profile_without_sandbox_bypass(self):
        command = browser_command('/usr/bin/chromium', '/home/example/calendar-profile',
                                  'http://127.0.0.1:8775/?kiosk=1')
        self.assertIn('--kiosk', command)
        self.assertIn('--user-data-dir=/home/example/calendar-profile', command)
        self.assertNotIn('--no-sandbox', command)
        self.assertNotIn('--disable-web-security', command)

    def test_rejects_admin_external_or_unmarked_launches(self):
        for url in ['http://127.0.0.1:8775/', 'http://example.com/?kiosk=1',
                    'http://127.0.0.1:8775/admin?kiosk=1', 'http://user@localhost/?kiosk=1',
                    'http://localhost/?kiosk=0', 'http://localhost/?kiosk=1&kiosk=0']:
            with self.assertRaises(ValueError):
                browser_command('/usr/bin/chromium', '/home/example/profile', url)
