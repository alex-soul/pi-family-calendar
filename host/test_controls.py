import contextlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from common import LocalServer, Rejected, atomic_json, call
from display import Display
from bridge import Power, maintenance_lock, report, POWER
from mqtt_adapter import Commands, discovery, device_id, apply


class FakeHardware:
    def __init__(self):
        self.awake = True
        self.level = 70
        self.generation = 0
        self.fail = False
        self.monitor = True

    def brightness(self, value):
        if self.fail and value == 50:
            raise OSError()
        self.level = value

    def watch(self, _): self.generation += 1
    def power(self, awake): self.awake = awake
    def read(self): return {"awake": self.awake, "brightness": self.level}
    def healthy(self): return self.monitor
    def force_idle(self):
        if not self.monitor:
            raise Rejected("Local wake monitor unavailable.")


class DisplayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "display.json"
        self.hardware = FakeHardware()
        self.display = Display(self.path, self.hardware)
        self.display.start()

    def tearDown(self): self.tmp.cleanup()

    def test_settings_survive_restart_and_report_actual_state(self):
        self.display.handle({"action": "settings", "settings": {"brightness": 80, "autoBlank": False, "idleMinutes": 12}})
        restarted = Display(self.path, self.hardware)
        self.assertEqual(restarted.settings["brightness"], 80)
        self.assertFalse(restarted.settings["autoBlank"])
        self.hardware.level = 79
        self.assertEqual(restarted.status()["actualBrightness"], 79)

    def test_touch_wake_has_no_mqtt_dependency(self):
        self.display.handle({"action": "sleep"})
        self.assertFalse(self.hardware.awake)
        self.display.handle({"action": "callback", "event": "wake", "generation": self.hardware.generation})
        self.assertTrue(self.hardware.awake)

    def test_old_watcher_cannot_blank_after_wake(self):
        generation = self.hardware.generation
        self.display.handle({"action": "wake"})
        self.display.handle({"action": "callback", "event": "idle", "generation": generation})
        self.assertTrue(self.hardware.awake)

    def test_disabled_blanking_but_manual_sleep_still_works(self):
        self.display.handle({"action": "settings", "settings": {"brightness": 70, "autoBlank": False, "idleMinutes": 10}})
        self.display.handle({"action": "callback", "event": "idle", "generation": self.hardware.generation})
        self.assertTrue(self.hardware.awake)
        self.display.handle({"action": "sleep"})
        self.assertFalse(self.hardware.awake)

    def test_no_sleep_without_wake_monitor(self):
        self.hardware.monitor = False
        with self.assertRaises(Rejected): self.display.handle({"action": "sleep"})
        self.assertTrue(self.hardware.awake)

    def test_hardware_failure_restores_persisted_policy(self):
        self.hardware.fail = True
        with self.assertRaises(Rejected):
            self.display.handle({"action": "settings", "settings": {"brightness": 50, "autoBlank": True, "idleMinutes": 10}})
        self.assertEqual(json.loads(self.path.read_text())["brightness"], 70)
        self.assertEqual(self.hardware.level, 70)

    def test_persistence_failure_does_not_apply_hardware(self):
        with patch("display.atomic_json", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                self.display.handle({"action": "settings", "settings": {"brightness": 90, "autoBlank": True, "idleMinutes": 10}})
        self.assertEqual(self.hardware.level, 70)

    def test_bounds_and_unknown_actions(self):
        for value in [0, 101, True, "50", 55.5]:
            with self.assertRaises(Rejected):
                Display.validate({"brightness": value, "autoBlank": True, "idleMinutes": 10})
        for request in [{"action": "reboot"}, {"action": "wake", "command": "anything"}]:
            with self.assertRaises(Rejected): self.display.handle(request)


class PowerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "power.sqlite"
        self.now = 1000
        self.executed = []
        self.owner = "a" * 64
        self.power = Power(self.path, contextlib.nullcontext, self.executed.append, lambda: self.now)

    def tearDown(self):
        self.power.close()
        self.tmp.cleanup()

    def prepare(self, action="reboot"):
        return self.power.handle({"operation": "prepare", "action": action, "owner": self.owner})["confirmation"]

    def confirm(self, token, action="reboot", owner=None):
        return self.power.handle({"operation": "confirm", "action": action, "owner": owner or self.owner, "confirmation": token})

    def test_prepare_does_not_execute_and_confirmation_is_single_use(self):
        token = self.prepare()
        self.assertEqual(self.executed, [])
        self.assertTrue(self.confirm(token)["accepted"])
        with self.assertRaises(Rejected): self.confirm(token)
        self.assertEqual(self.executed, ["reboot"])

    def test_expiry_action_and_owner_binding(self):
        token = self.prepare()
        with self.assertRaises(Rejected): self.confirm(token, "shutdown")
        with self.assertRaises(Rejected): self.confirm(token, owner="b" * 64)
        self.now += 31
        with self.assertRaises(Rejected): self.confirm(token)
        self.assertEqual(self.executed, [])

    def test_restart_preserves_cooldown_and_used_token(self):
        token = self.prepare()
        self.confirm(token)
        self.power.close()
        self.power = Power(self.path, contextlib.nullcontext, self.executed.append, lambda: self.now)
        with self.assertRaises(Rejected): self.prepare()
        self.now += 301
        with self.assertRaises(Rejected): self.confirm(token)

    def test_ambiguous_runner_result_is_not_retried(self):
        def fail(action): raise TimeoutError()
        self.power.runner = fail
        token = self.prepare()
        with self.assertRaisesRegex(Rejected, "Check the device"): self.confirm(token)
        with self.assertRaises(Rejected): self.prepare()

    def test_busy_lock_refuses_and_consumes_confirmation(self):
        @contextlib.contextmanager
        def locked():
            raise Rejected("busy")
            yield
        self.power.lock = locked
        token = self.prepare()
        with self.assertRaisesRegex(Rejected, "busy"): self.confirm(token)
        self.power.lock = contextlib.nullcontext
        with self.assertRaises(Rejected): self.confirm(token)
        self.assertEqual(self.executed, [])

    def test_only_fixed_actions_without_arguments(self):
        for action in ["shutdown now", "reboot;echo bad", "sleep", "shell"]:
            with self.assertRaises(Rejected): self.prepare(action)
        self.assertEqual(set(POWER), {"reboot", "shutdown"})
        self.assertTrue(all(command[:2] == ["/usr/bin/systemctl", "--no-block"] for command in POWER.values()))


class ProtocolTests(unittest.TestCase):
    def test_socket_auth_peer_and_single_owner(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bridge.sock"
            server = LocalServer(path, "a" * 64, [os.getuid()], lambda request: {"accepted": True})
            try:
                with self.assertRaises(BlockingIOError): LocalServer(path, "a" * 64, [os.getuid()], lambda _: {})
                for token, succeeds in [("wrong", False), ("a" * 64, True)]:
                    thread = threading.Thread(target=server.once)
                    thread.start()
                    try:
                        if succeeds: self.assertTrue(call(path, token, {})["accepted"])
                        else:
                            with self.assertRaises(Rejected): call(path, token, {})
                    finally: thread.join(4)
                server.allowed_uids = {999999}
                thread = threading.Thread(target=server.once)
                thread.start()
                with self.assertRaises((Rejected, ConnectionResetError)): call(path, "a" * 64, {})
                thread.join(4)
            finally: server.close()

    def test_actual_package_lock_and_shared_maintenance_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory) / "dpkg.lock"
            package.touch()
            own = Path(directory) / "maintenance.lock"
            child = subprocess.Popen([sys.executable, "-c",
                "import fcntl,sys;f=open(sys.argv[1],'r+');fcntl.lockf(f,fcntl.LOCK_EX);print('locked',flush=True);sys.stdin.readline()", str(package)],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
            try:
                self.assertEqual(child.stdout.readline().strip(), "locked")
                with self.assertRaises(Rejected):
                    with maintenance_lock(own, [package]): pass
            finally:
                child.communicate("done\n", timeout=5)
            with maintenance_lock(own, [package]):
                with self.assertRaises(Rejected):
                    with maintenance_lock(own, []): pass

    def test_status_is_allowlisted_and_missing_is_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.json"
            self.assertIsNone(report(path, ["status"]))
            atomic_json(path, {"status": "secret error payload", "password": "private", "lastSuccess": 1000})
            self.assertEqual(report(path, ["status", "lastSuccess"]), {"status": "unknown", "lastSuccess": 1000})


class MqttTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "replay.sqlite"
        self.commands = Commands(self.path, lambda: 1000)
    def tearDown(self):
        self.commands.db.close()
        self.tmp.cleanup()
    def payload(self, **changes): return json.dumps({"id": "unique", "issued": 1000, "value": 70, **changes}).encode()

    def test_retained_expired_future_and_replay_rejected(self):
        for payload, retain in [(self.payload(), True), (self.payload(issued=969), False), (self.payload(issued=1006), False)]:
            with self.assertRaises(Rejected): self.commands.accept("brightness", payload, retain)
        self.assertEqual(self.commands.accept("brightness", self.payload()), 70)
        self.commands.db.close()
        self.commands = Commands(self.path, lambda: 1001)
        with self.assertRaises(Rejected): self.commands.accept("brightness", self.payload())

    def test_bounds_malformed_and_no_power_capability(self):
        for action, payload in [("reboot", self.payload()), ("brightness", self.payload(value=1)), ("idleMinutes", self.payload(value=121)), ("autoBlank", self.payload(value=True)), ("wake", self.payload(value="ON"))]:
            with self.assertRaises(Rejected): self.commands.accept(action, payload)
        for issued in [float('nan'), float('inf'), True]:
            with self.assertRaises(Rejected): self.commands.accept("brightness", self.payload(issued=issued))

    def test_theme_options_freshness_and_confirmed_discovery(self):
        for payload, retained in [(self.payload(value="Light"), False), (self.payload(value="Dark"), True), (self.payload(value="Warm", issued=969), False)]:
            with self.assertRaises(Rejected): self.commands.accept("theme", payload, retained)
        self.assertEqual(self.commands.accept("theme", self.payload(value="Warm")), "Warm")
        with self.assertRaises(Rejected): self.commands.accept("theme", self.payload(value="Dark"))
        config = next(c for _, c in discovery("fixture") if c["name"] == "Theme")
        self.assertEqual(config["options"], ["Warm", "Dark"])
        self.assertFalse(config["optimistic"])
        self.assertEqual(config["availability_mode"], "all")

    def test_identity_survives_restart_and_discovery_has_exactly_seven_controls(self):
        path = Path(self.tmp.name) / "identity.json"
        first = device_id(path)
        self.assertEqual(device_id(path), first)
        configs = list(discovery(first))
        self.assertEqual(len(configs), 7)
        self.assertEqual(len({entry[1]["unique_id"] for entry in configs}), 7)
        self.assertNotIn("reboot", json.dumps(configs))
        for _, config in configs:
            self.assertEqual(config["device"]["identifiers"], [f"pi-family-calendar-{first}"])
            if "command_topic" in config:
                self.assertFalse(config["retain"])
                self.assertIn('"issued"', config["command_template"])

    def test_mqtt_uses_the_same_controller(self):
        hardware = FakeHardware()
        display = Display(Path(self.tmp.name) / "display.json", hardware)
        display.start()
        apply("brightness", 85, display.handle)
        self.assertEqual(display.status()["brightness"], 85)
        apply("sleep", "PRESS", display.handle)
        self.assertFalse(display.status()["awake"])


if __name__ == "__main__": unittest.main()
