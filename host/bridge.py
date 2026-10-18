"""Optional host bridge. Fixed operations only; never accepts paths or shell commands."""
from contextlib import contextmanager, ExitStack
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
from common import LocalServer, Rejected, call, credential, exact

POWER = {"reboot": ["/usr/bin/systemctl", "--no-block", "reboot"],
         "shutdown": ["/usr/bin/systemctl", "--no-block", "poweroff"]}


def execute_power(action):
    subprocess.run(POWER[action], check=True, capture_output=True, timeout=3)


@contextmanager
def maintenance_lock(path, package_paths):
    """Maintenance/backup must take this same flock before starting work.

    POSIX dpkg/APT locks additionally protect against independently launched package work.
    Existing package lock files are never deleted or replaced.
    """
    with ExitStack() as stack:
        try:
            own = stack.enter_context(open(path, "a"))
            fcntl.flock(own, fcntl.LOCK_EX | fcntl.LOCK_NB)
            for package in package_paths:
                stream = stack.enter_context(open(package, "r+"))
                fcntl.lockf(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (OSError, BlockingIOError):
            raise Rejected("Updates or backup are busy, or their locks are unavailable.")
        yield


class Power:
    def __init__(self, path, lock, runner=execute_power, now=time.time):
        self.db = sqlite3.connect(path)
        self.db.executescript("""
          PRAGMA synchronous=FULL;
          CREATE TABLE IF NOT EXISTS challenges(token TEXT PRIMARY KEY, owner TEXT, action TEXT, expires REAL);
          CREATE TABLE IF NOT EXISTS power_state(id INTEGER PRIMARY KEY CHECK(id=1), last REAL NOT NULL);
          INSERT OR IGNORE INTO power_state VALUES(1,0);
        """)
        self.lock = lock
        self.runner = runner
        self.now = now
        self.held = None

    def release_expired(self):
        if self.held and self.now() >= self.last() + 300:
            self.held.__exit__(None, None, None)
            self.held = None

    def last(self):
        return self.db.execute("SELECT last FROM power_state").fetchone()[0]

    def handle(self, request):
        self.release_expired()
        action = request.get("action")
        operation = request.get("operation")
        owner = request.get("owner")
        if action not in POWER or not isinstance(owner, str) or not re.fullmatch("[a-f0-9]{64}", owner):
            raise Rejected("Invalid power request.")
        now = self.now()
        if now < self.last() + 300:
            raise Rejected("A power action was recently requested. Check the device before retrying.")
        if operation == "prepare":
            exact(request, ["operation", "action", "owner"])
            token = secrets.token_hex(32)
            with self.db:
                self.db.execute("DELETE FROM challenges WHERE expires<? OR owner=?", (now, owner))
                if self.db.execute("SELECT COUNT(*) FROM challenges").fetchone()[0] >= 64:
                    raise Rejected("Too many pending requests.")
                self.db.execute("INSERT INTO challenges VALUES(?,?,?,?)",
                                (hashlib.sha256(token.encode()).hexdigest(), owner, action, now + 30))
            return {"confirmation": token, "expiresAt": int((now + 30) * 1000)}
        if operation != "confirm":
            raise Rejected("Unknown power operation.")
        exact(request, ["operation", "action", "owner", "confirmation"])
        token = request["confirmation"]
        if not isinstance(token, str) or not re.fullmatch("[a-f0-9]{64}", token):
            raise Rejected("Confirmation expired. Start again.")
        with self.db:
            cursor = self.db.execute("DELETE FROM challenges WHERE token=? AND owner=? AND action=? AND expires>?",
                                     (hashlib.sha256(token.encode()).hexdigest(), owner, action, now))
            if cursor.rowcount != 1:
                raise Rejected("Confirmation expired or already used. Start again.")
        guard = self.lock()
        guard.__enter__()
        try:
            # Persist before invoking systemd. Ambiguous results never become automatic retries.
            with self.db:
                self.db.execute("UPDATE power_state SET last=?", (now,))
                self.db.execute("DELETE FROM challenges")
            self.held = guard
            self.runner(action)
        except Exception:
            if self.held is None:
                guard.__exit__(None, None, None)
            raise Rejected("Power request could not be confirmed. Check the device before retrying.")
        return {"accepted": True}

    def close(self):
        if self.held:
            self.held.__exit__(None, None, None)
        self.db.close()


def optional(reader):
    try:
        return reader()
    except Exception:
        return None


def bounded_number(value):
    return value if type(value) in (int, float) and math.isfinite(value) and 0 <= value < 1e16 else None


def report(path, keys):
    """Only public status fields cross the socket; no raw helper JSON or diagnostics."""
    def read():
        file = Path(path)
        if file.stat().st_size > 8192:
            return None
        value = json.loads(file.read_text())
        result = {}
        for key in keys:
            item = value.get(key)
            if key in ("status", "bootHealth"):
                result[key] = item if item in ("ok", "failed", "running", "pending", "unknown") else "unknown"
            elif key in ("connected", "pendingReboot"):
                result[key] = item if type(item) is bool else None
            else:
                result[key] = bounded_number(item)
        return result
    return optional(read)


def host_status(config):
    def memory():
        fields = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            name, number, *_ = line.split()
            fields[name.rstrip(":")] = int(number) * 1024
        return {"total": fields["MemTotal"], "available": fields["MemAvailable"],
                "swapTotal": fields["SwapTotal"], "swapUsed": fields["SwapTotal"] - fields["SwapFree"]}
    def disk():
        usage = shutil.disk_usage("/")
        return {"total": usage.total, "free": usage.free}
    def throttling():
        output = subprocess.run(["/usr/bin/vcgencmd", "get_throttled"], check=True,
                                capture_output=True, text=True, timeout=1).stdout.strip()
        match = re.fullmatch(r"throttled=(0x[0-9a-fA-F]+)", output)
        return int(match[1], 16) if match else None
    def failed_units():
        output = subprocess.run(["/usr/bin/systemctl", "--failed", "--no-legend", "--plain"],
                                check=True, capture_output=True, text=True, timeout=1).stdout
        return len(output.strip().splitlines()) if output.strip() else 0
    return {"sampledAt": int(time.time() * 1000),
            "uptimeSeconds": optional(lambda: int(float(Path("/proc/uptime").read_text().split()[0]))),
            "memory": optional(memory), "disk": optional(disk),
            "temperatureC": optional(lambda: int(Path("/sys/class/thermal/thermal_zone0/temp").read_text()) / 1000),
            "throttleFlags": optional(throttling), "failedUnits": optional(failed_units),
            "maintenance": report(config["maintenanceStatus"], ["sampledAt", "status", "lastSuccess", "nextUpdate", "nextReboot", "pendingReboot", "bootHealth"]),
            "backup": report(config["backupStatus"], ["sampledAt", "status", "lastSuccess"]),
            "mqtt": report(config["mqttStatus"], ["sampledAt", "connected"])}


class Bridge:
    def __init__(self, config, power):
        self.config = config
        self.power = power
        self.display_token = credential(config["displayTokenFile"])

    def display(self, request):
        return call(self.config["displaySocket"], self.display_token, request)

    def handle(self, request):
        kind = request.get("kind")
        if kind == "status":
            exact(request, ["kind"])
            return {"host": host_status(self.config),
                    "powerEnabled": self.config.get("powerEnabled", False) is True,
                    "display": optional(lambda: self.display({"action": "status"}))}
        if kind == "display":
            exact(request, ["kind", "request"])
            action = request["request"].get("action")
            if action not in ("status", "settings", "sleep", "wake"):
                raise Rejected("Unknown display action.")
            return self.display(request["request"])
        if kind == "power":
            exact(request, ["kind", "request"])
            if self.config.get("powerEnabled", False) is not True:
                raise Rejected("Power controls are not enabled on this device.")
            return self.power.handle(request["request"])
        raise Rejected("Unknown appliance operation.")


def main():
    config = json.loads(Path(sys.argv[1]).read_text())
    token = credential(config["tokenFile"])
    power = Power(config["stateFile"], lambda: maintenance_lock(config["maintenanceLock"],
        ["/var/lib/dpkg/lock-frontend", "/var/lib/dpkg/lock", "/var/cache/apt/archives/lock", "/var/lib/apt/lists/lock"]))
    bridge = Bridge(config, power)
    server = LocalServer(config["socket"], token, config["allowedUids"], bridge.handle)
    stop = False
    def stopping(*_):
        nonlocal stop
        stop = True
    signal.signal(signal.SIGTERM, stopping)
    signal.signal(signal.SIGINT, stopping)
    try:
        while not stop:
            server.once()
            power.release_expired()
    finally:
        server.close()
        power.close()


if __name__ == "__main__":
    main()
