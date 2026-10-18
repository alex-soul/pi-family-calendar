"""Optional MQTT 5 adapter. Six display controls; no power-operation capability."""
import json
import math
from pathlib import Path
import re
import signal
import sqlite3
import sys
import time
import uuid
from common import Rejected, atomic_json, call, credential, integer, private_file

COMMANDS = {"brightness", "idleMinutes", "autoBlank", "wake", "sleep"}


class Commands:
    def __init__(self, path, now=time.time):
        self.db = sqlite3.connect(path)
        self.db.execute("CREATE TABLE IF NOT EXISTS seen(id TEXT PRIMARY KEY, expires REAL NOT NULL)")
        self.now = now

    def accept(self, action, payload, retained=False):
        if retained or action not in COMMANDS or len(payload) > 1024:
            raise Rejected("Rejected MQTT command.")
        value = json.loads(payload)
        if not isinstance(value, dict) or set(value) != {"id", "issued", "value"}:
            raise Rejected("Invalid MQTT envelope.")
        issued = value["issued"]
        now = self.now()
        if (type(issued) not in (float, int) or not math.isfinite(issued)
                or issued < now - 30 or issued > now + 5):
            raise Rejected("Expired MQTT command.")
        identifier = value["id"]
        if not isinstance(identifier, str) or not re.fullmatch(r"[A-Za-z0-9:.+_-]{1,100}", identifier):
            raise Rejected("Invalid MQTT identifier.")
        setting = value["value"]
        if action == "brightness":
            integer(setting, 10, 100)
        elif action == "idleMinutes":
            integer(setting, 1, 120)
        elif action == "autoBlank" and setting not in ("ON", "OFF"):
            raise Rejected("Invalid MQTT switch value.")
        elif action in ("wake", "sleep") and setting != "PRESS":
            raise Rejected("Invalid MQTT button value.")
        with self.db:
            self.db.execute("DELETE FROM seen WHERE expires<?", (now,))
            if self.db.execute("SELECT COUNT(*) FROM seen").fetchone()[0] >= 2048:
                raise Rejected("MQTT command rate exceeded.")
            try:
                self.db.execute("INSERT INTO seen VALUES(?,?)", (identifier, issued + 60))
            except sqlite3.IntegrityError:
                raise Rejected("Duplicate MQTT command.")
        return setting


def device_id(path):
    file = Path(path)
    if file.exists():
        value = json.loads(file.read_text())["id"]
        return str(uuid.UUID(value))
    value = str(uuid.uuid4())
    atomic_json(file, {"id": value})
    return value


def discovery(identifier):
    root = f"pi-family-calendar/{identifier}"
    device = {"identifiers": [f"pi-family-calendar-{identifier}"], "name": "Pi Family Calendar",
              "manufacturer": "Pi Family Calendar", "model": "Calendar display"}
    for action, platform, name in [("brightness", "number", "Brightness"),
            ("idleMinutes", "number", "Idle timeout"), ("autoBlank", "switch", "Automatic blanking"),
            ("wake", "button", "Wake"), ("sleep", "button", "Sleep"), ("screen", "sensor", "Screen")]:
        value = "{{ value | int }}" if platform == "number" else "{{ value | to_json }}"
        config = {"name": name, "unique_id": f"calendar-{identifier}-{action}", "device": device,
                  "availability_topic": root + "/available"}
        if platform != "sensor":
            config.update(command_topic=f"{root}/command/{action}", retain=False, qos=0,
                command_template='{"id":"{{ now().isoformat() }}-{{ range(10000) | random }}",'
                                 '"issued":{{ as_timestamp(now()) }},"value":' + value + '}',
                message_expiry_interval={"seconds": 30})
        if platform != "button":
            config["state_topic"] = root + "/state"
            config["value_template"] = "{{ value_json." + action + " }}"
        if platform == "number":
            config.update(min=10 if action == "brightness" else 1,
                          max=100 if action == "brightness" else 120, step=1,
                          unit_of_measurement="%" if action == "brightness" else "min", mode="slider")
        if platform == "button":
            config["payload_press"] = "PRESS"
        yield f"homeassistant/{platform}/calendar_{identifier}/{action}/config", config


def apply(action, value, display):
    if action in ("sleep", "wake"):
        return display({"action": action})
    return display({"action": "setting", "name": action,
                    "value": value == "ON" if action == "autoBlank" else value})


def main():
    # Import only at runtime so protocol tests need no broker or third-party package.
    import paho.mqtt.client as mqtt
    from paho.mqtt.subscribeoptions import SubscribeOptions
    from paho.mqtt.properties import Properties
    from paho.mqtt.packettypes import PacketTypes
    config = json.loads(Path(sys.argv[1]).read_text())
    import fcntl
    instance_lock = open(config["identityFile"] + ".lock", "a")
    fcntl.flock(instance_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    secret_file = private_file(config["brokerCredentials"])
    auth = json.loads(secret_file.read_text())
    token = credential(config["displayTokenFile"])
    identifier = device_id(config["identityFile"])
    root = f"pi-family-calendar/{identifier}"
    commands = Commands(config["replayFile"])
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"calendar-{identifier}", protocol=mqtt.MQTTv5)
    client.connect_timeout = 5
    client.username_pw_set(auth["username"], auth["password"])
    if config.get("tls", True):
        client.tls_set(ca_certs=config.get("caFile"))
    elif not config.get("allowPlaintextLan", False):
        raise Rejected("Plaintext broker transport requires explicit LAN configuration.")
    client.will_set(root + "/available", "offline", qos=1, retain=True)
    connected = False
    stop = False
    def display(request):
        return call(config["displaySocket"], token, request)
    def announce():
        for topic, message in discovery(identifier):
            client.publish(topic, json.dumps(message), qos=1, retain=True)
    def on_connect(client, userdata, flags, reason_code, properties):
        nonlocal connected
        connected = not reason_code.is_failure
        if connected:
            # Never replay stored broker commands, including a retained publish made while online.
            client.subscribe(root + "/command/+", options=SubscribeOptions(
                qos=0, retainAsPublished=True, retainHandling=2))
            client.subscribe("homeassistant/status", options=SubscribeOptions(qos=0))
            announce()
    def on_disconnect(*_):
        nonlocal connected
        connected = False
    def on_message(client, userdata, message):
        if message.topic == "homeassistant/status":
            if message.payload == b"online":
                announce()
            return
        prefix = root + "/command/"
        if not message.topic.startswith(prefix):
            return
        action = message.topic[len(prefix):]
        try:
            value = commands.accept(action, message.payload, message.retain)
            apply(action, value, display)
        except Exception:
            # No payloads, broker credentials or raw exception messages in logs.
            return
    def stopping(*_):
        nonlocal stop
        stop = True
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    signal.signal(signal.SIGTERM, stopping)
    signal.signal(signal.SIGINT, stopping)
    delay = 1
    next_connect = 0
    next_sample = 0
    try:
        while not stop:
            if not connected and time.monotonic() >= next_connect:
                try:
                    properties = Properties(PacketTypes.CONNECT)
                    properties.SessionExpiryInterval = 0
                    client.connect(config["host"], config.get("port", 8883), 30,
                                   clean_start=True, properties=properties)
                except (OSError, ValueError):
                    pass
                next_connect = time.monotonic() + delay
                delay = min(60, delay * 2)
            client.loop(timeout=0.5)
            if connected:
                delay = 1
            if time.monotonic() >= next_sample:
                next_sample = time.monotonic() + 5
                atomic_json(config["statusFile"], {"sampledAt": int(time.time() * 1000), "connected": connected}, 0o640)
                if connected:
                    try:
                        state = display({"action": "status"})
                        if not state["wakeMonitor"]:
                            raise Rejected("Display unavailable.")
                        state["screen"] = "On" if state["awake"] else "Off"
                        state["autoBlank"] = "ON" if state["autoBlank"] else "OFF"
                        client.publish(root + "/state", json.dumps(state), qos=1, retain=True)
                        client.publish(root + "/available", "online", qos=1, retain=True)
                    except Exception:
                        client.publish(root + "/available", "offline", qos=1, retain=True)
            if not connected:
                time.sleep(0.25)
    finally:
        if connected:
            client.publish(root + "/available", "offline", qos=1, retain=True).wait_for_publish(timeout=2)
        client.disconnect()
        atomic_json(config["statusFile"], {"sampledAt": int(time.time() * 1000), "connected": False}, 0o640)
        commands.db.close()
        instance_lock.close()


if __name__ == "__main__":
    main()
