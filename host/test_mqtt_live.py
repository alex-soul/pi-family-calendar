"""Disposable loopback broker + fake screen. No system or household MQTT endpoints."""
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import queue
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from common import LocalServer, atomic_json, call
from display import Display
from mqtt_adapter import device_id
from test_controls import FakeHardware


def fake_controller(directory):
    hardware = FakeHardware()
    display = Display(Path(directory) / "display.json", hardware)
    display.start()
    def handle(request):
        if request == {"action": "fixture-touch"}:
            return display.handle({"action": "callback", "event": "wake", "generation": hardware.generation})
        return display.handle(request)
    server = LocalServer(Path(directory) / "display.sock", "a" * 64, [os.getuid()], handle)
    while True: server.once()


def until(check, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            value = check()
            if value: return value
        except (OSError, ValueError, KeyError): pass
        time.sleep(0.1)
    raise AssertionError("Timed out waiting for disposable MQTT fixture")


@unittest.skipUnless(shutil.which("mosquitto") and importlib.util.find_spec("paho"), "Requires disposable host test image")
class LiveMqttTests(unittest.TestCase):
    def test_broker_freshness_restart_birth_and_offline_local_wake(self):
        import paho.mqtt.client as mqtt
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            root.chmod(0o755)
            with socket.socket() as port_socket:
                port_socket.bind(("127.0.0.1", 0))
                port = port_socket.getsockname()[1]
            broker_config = root / "broker.conf"
            broker_config.write_text(f"listener {port} 127.0.0.1\nallow_anonymous true\npersistence false\n")
            def broker_start():
                return subprocess.Popen(["mosquitto", "-c", str(broker_config)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            broker = broker_start()
            controller = multiprocessing.Process(target=fake_controller, args=(directory,))
            controller.start()
            adapter = None
            client = None
            try:
                until(lambda: (root / "display.sock").exists())
                identifier = device_id(root / "identity.json")
                topic = f"pi-family-calendar/{identifier}"
                token = root / "display-token"
                token.write_text("a" * 64); token.chmod(0o600)
                atomic_json(root / "credentials.json", {"username": "fixture", "password": "fixture-only"})
                config = {"displaySocket": str(root / "display.sock"), "displayTokenFile": str(token),
                    "brokerCredentials": str(root / "credentials.json"), "host": "127.0.0.1", "port": port,
                    "tls": False, "allowPlaintextLan": True, "identityFile": str(root / "identity.json"),
                    "replayFile": str(root / "replay.sqlite"), "statusFile": str(root / "status.json")}
                atomic_json(root / "mqtt.json", config)
                messages = queue.Queue()
                client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv5)
                client.on_message = lambda c, u, msg: messages.put((msg.topic, msg.payload))
                def connect():
                    try:
                        client.connect("127.0.0.1", port, 10)
                        return True
                    except OSError: return False
                until(connect)
                client.loop_start()
                client.subscribe("homeassistant/#")
                client.subscribe(topic + "/#")
                def publish(action, value, identifier=None, issued=None, retained=False):
                    payload = {"id": identifier or str(time.time_ns()), "issued": issued or time.time(), "value": value}
                    client.publish(f"{topic}/command/{action}", json.dumps(payload), qos=1, retain=retained).wait_for_publish(timeout=3)
                def display(): return call(root / "display.sock", "a" * 64, {"action": "status"})
                def start_adapter():
                    return subprocess.Popen([sys.executable, str(Path(__file__).parent / "mqtt_adapter.py"), str(root / "mqtt.json")], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                # A retained command existing before subscription must not run.
                publish("brightness", 99, retained=True)
                adapter = start_adapter()
                until(lambda: json.loads((root / "status.json").read_text())["connected"])
                until(lambda: messages.qsize() >= 7)
                self.assertEqual(display()["brightness"], 70)
                publish("brightness", 95, retained=True)
                publish("brightness", 85, identifier="stable-id")
                until(lambda: display()["brightness"] == 85)
                publish("brightness", 40, identifier="stable-id")
                publish("brightness", 0)
                publish("brightness", 30, issued=time.time() - 60)
                publish("brightness", 20, issued=time.time() + 60)
                time.sleep(0.5)
                self.assertEqual(display()["brightness"], 85)
                # Restart preserves the replay cache and the same seven discovery IDs.
                adapter.terminate(); adapter.wait(timeout=10)
                self.assertEqual(adapter.returncode, 0, adapter.stderr.read().decode())
                adapter.stderr.close()
                adapter = start_adapter()
                until(lambda: json.loads((root / "status.json").read_text())["connected"])
                publish("brightness", 35, identifier="stable-id")
                time.sleep(0.5)
                self.assertEqual(display()["brightness"], 85)
                while not messages.empty(): messages.get_nowait()
                client.publish("homeassistant/status", "online", qos=1).wait_for_publish(timeout=3)
                configs = set()
                def discovered():
                    while not messages.empty():
                        name, payload = messages.get_nowait()
                        if name.endswith("/config"):
                            configs.add(json.loads(payload)["unique_id"])
                    return len(configs) == 7
                until(discovered)
                publish("sleep", "PRESS")
                until(lambda: not display()["awake"])
                broker.terminate(); broker.wait(timeout=5)
                until(lambda: not json.loads((root / "status.json").read_text())["connected"])
                call(root / "display.sock", "a" * 64, {"action": "fixture-touch"})
                self.assertTrue(display()["awake"])
                broker = broker_start()
                until(lambda: json.loads((root / "status.json").read_text())["connected"], timeout=20)
                self.assertIsNone(adapter.poll())
            finally:
                if adapter and adapter.poll() is None:
                    adapter.terminate(); adapter.wait(timeout=10)
                if adapter and adapter.stderr: adapter.stderr.close()
                if client:
                    client.disconnect(); client.loop_stop()
                controller.terminate(); controller.join(timeout=5)
                if broker.poll() is None:
                    broker.terminate(); broker.wait(timeout=5)


if __name__ == "__main__": unittest.main()
