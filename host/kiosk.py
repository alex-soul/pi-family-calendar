"""Dedicated Chromium kiosk: local readiness, one profile owner, bounded retry delay."""
import argparse
import fcntl
import os
from pathlib import Path
import signal
import subprocess
import time
from urllib.parse import urlsplit, parse_qs
from urllib.request import urlopen


def browser_command(browser, profile, url):
    parsed = urlsplit(url)
    if (parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost')
            or parsed.username or parsed.password or parsed.fragment
            or parsed.path not in ('', '/') or parse_qs(parsed.query).get('kiosk') != ['1']):
        raise ValueError('Use the local calendar root with kiosk=1.')
    if not Path(profile).is_absolute() or not Path(browser).is_absolute():
        raise ValueError('Use absolute browser and dedicated profile paths.')
    return [browser, '--kiosk', '--no-first-run', '--no-default-browser-check',
            '--noerrdialogs', '--disable-session-crashed-bubble', '--ozone-platform=wayland',
            '--password-store=basic', '--user-data-dir=' + str(profile), url]


def ready(url):
    parsed = urlsplit(url)
    try:
        with urlopen(f'{parsed.scheme}://{parsed.netloc}/healthz', timeout=2) as response:
            return response.status == 200 and b'pi-family-calendar' in response.read(1024)
    except Exception:
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--profile', required=True)
    parser.add_argument('--browser', default='/usr/bin/chromium')
    args = parser.parse_args()
    profile = Path(args.profile)
    command = browser_command(args.browser, profile, args.url)
    profile.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = open(profile / 'calendar-launcher.lock', 'a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    stopping = False
    child = None

    def stop(*_):
        nonlocal stopping
        stopping = True
        if child and child.poll() is None:
            child.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    delay = 1
    try:
        while not stopping:
            if not ready(args.url):
                time.sleep(min(delay, 5))
                delay = min(60, delay * 2)
                continue
            start = time.monotonic()
            # Profile is exclusively for display: no account/admin sign-in or saved passwords.
            # Keep Chromium's sandbox; do not forward potentially private Chromium logs.
            child = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            while not stopping and child.poll() is None:
                time.sleep(0.5)
            if stopping:
                break
            delay = 1 if time.monotonic() - start >= 300 else min(60, delay * 2)
            deadline = time.monotonic() + delay
            while not stopping and time.monotonic() < deadline:
                time.sleep(0.5)
    finally:
        if child and child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        lock.close()


if __name__ == '__main__':
    main()
