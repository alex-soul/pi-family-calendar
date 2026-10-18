"""One display owner, running in the desktop session; MQTT is not involved in idle/wake."""
import json
import os
from pathlib import Path
import shlex
import signal
import subprocess
import sys
import time
from common import LocalServer, Rejected, atomic_json, call, credential, exact, integer


class Hardware:
    def __init__(self, config, config_path):
        self.config = config
        self.config_path = config_path
        self.watcher = None
        self.retired = []
        self.generation = 0

    def brightness(self, percent):
        backlight = Path(self.config["backlight"])
        maximum = int((backlight / "max_brightness").read_text())
        (backlight / "brightness").write_text(str(max(1, round(maximum * percent / 100))))

    def power(self, awake):
        subprocess.run(["/usr/bin/wlopm", "--on" if awake else "--off", self.config["output"]],
                       check=True, capture_output=True, timeout=2)

    def read(self):
        output = subprocess.run(["/usr/bin/wlopm"], check=True, capture_output=True,
                                text=True, timeout=2).stdout
        state = dict(line.rsplit(" ", 1) for line in output.splitlines() if " " in line)
        power = state.get(self.config["output"])
        if power not in ("on", "off"):
            raise Rejected("Display state unavailable.")
        backlight = Path(self.config["backlight"])
        percent = round(100 * int((backlight / "brightness").read_text()) /
                        int((backlight / "max_brightness").read_text()))
        return {"awake": power == "on", "brightness": percent}

    def watch(self, settings):
        self.generation += 1
        if self.watcher:
            self.watcher.terminate()
            # Its pending resume callback needs this server: never wait here.
            self.retired.append(self.watcher)
        # Commands consist entirely of deployment-owned paths and this generation.
        # Ignore callbacks from a retired watcher after changing its policy.
        base = [sys.executable, str(Path(__file__).resolve()), self.config_path, "callback"]
        idle = shlex.join([*base, "idle", str(self.generation)])
        wake = shlex.join([*base, "wake", str(self.generation)])
        delay = settings["idleMinutes"] * 60 if settings["autoBlank"] else 86400
        self.watcher = subprocess.Popen(["/usr/bin/swayidle", "-C", "/dev/null", "-w",
                                        "timeout", str(delay), idle, "resume", wake],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def force_idle(self):
        if not self.watcher or self.watcher.poll() is not None:
            raise Rejected("Local wake monitor unavailable.")
        # swayidle arms an immediate idle notification; the next input runs resume.
        self.watcher.send_signal(signal.SIGUSR1)

    def healthy(self):
        self.retired = [child for child in self.retired if child.poll() is None]
        return self.watcher is not None and self.watcher.poll() is None

    def close(self):
        # Close the server first so shutdown resume callbacks cannot wait on it.
        # Bound cleanup of a swayidle process that remains stuck during shutdown.
        children = [child for child in [self.watcher, *self.retired]
                    if child is not None and child.poll() is None]
        for child in children:
            child.terminate()
        deadline = time.monotonic() + 2
        for child in children:
            try:
                child.wait(timeout=max(0, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=1)


class Display:
    def __init__(self, path, hardware):
        self.path = Path(path)
        self.hardware = hardware
        self.settings = {"brightness": 70, "autoBlank": True, "idleMinutes": 10}
        self.manual_sleep = False
        if self.path.exists():
            self.settings = self.validate(json.loads(self.path.read_text()))

    @staticmethod
    def validate(settings):
        exact(settings, ["brightness", "autoBlank", "idleMinutes"])
        integer(settings["brightness"], 10, 100)
        integer(settings["idleMinutes"], 1, 120)
        if type(settings["autoBlank"]) is not bool:
            raise Rejected("Choose automatic blanking on or off.")
        return dict(settings)

    def start(self):
        self.hardware.brightness(self.settings["brightness"])
        self.hardware.watch(self.settings)
        self.hardware.power(True)

    def status(self):
        actual = self.hardware.read()
        return {**self.settings, "actualBrightness": actual["brightness"],
                "awake": actual["awake"], "wakeMonitor": self.hardware.healthy(),
                "sampledAt": int(time.time() * 1000)}

    def handle(self, request):
        action = request.get("action")
        if action == "setting":
            exact(request, ["action", "name", "value"])
            if request["name"] not in self.settings:
                raise Rejected("Unknown display setting.")
            # One socket operation, avoiding a read/modify/write race with admin.
            return self.handle({"action": "settings", "settings": {
                **self.settings, request["name"]: request["value"]}})
        if action == "settings":
            exact(request, ["action", "settings"])
            new = self.validate(request["settings"])
            previous = self.settings
            # Durability failure prevents a success response or a hardware change.
            atomic_json(self.path, new)
            try:
                self.hardware.brightness(new["brightness"])
                self.hardware.watch(new)
                if not new["autoBlank"]:
                    self.hardware.power(True)
                    self.manual_sleep = False
                self.settings = new
            except Exception:
                atomic_json(self.path, previous)
                self.hardware.brightness(previous["brightness"])
                self.hardware.watch(previous)
                raise Rejected("Display setting could not be applied.")
        elif action == "callback":
            exact(request, ["action", "event", "generation"])
            if request["generation"] != self.hardware.generation:
                return {"ignored": True}
            if request["event"] == "wake":
                self.hardware.power(True)
                self.manual_sleep = False
            elif request["event"] == "idle":
                if self.settings["autoBlank"] or self.manual_sleep:
                    self.hardware.power(False)
            else:
                raise Rejected("Invalid display callback.")
        elif action in ("sleep", "wake", "status"):
            exact(request, ["action"])
            if action == "sleep":
                self.hardware.force_idle()
                self.manual_sleep = True
                self.hardware.power(False)
            elif action == "wake":
                self.manual_sleep = False
                self.hardware.watch(self.settings)
                self.hardware.power(True)
        else:
            raise Rejected("Unknown display action.")
        return self.status()


def main():
    config_path = str(Path(sys.argv[1]).resolve())
    config = json.loads(Path(config_path).read_text())
    token = credential(config["tokenFile"])
    if len(sys.argv) > 2:
        call(config["socket"], token, {"action": "callback", "event": sys.argv[3],
                                      "generation": int(sys.argv[4])})
        return
    hardware = Hardware(config, config_path)
    display = Display(config["stateFile"], hardware)
    server = LocalServer(config["socket"], token, config["allowedUids"], display.handle)
    stop = False
    def stopping(*_):
        nonlocal stop
        stop = True
    signal.signal(signal.SIGTERM, stopping)
    signal.signal(signal.SIGINT, stopping)
    try:
        display.start()
        while not stop:
            server.once()
            if not stop and not hardware.healthy():
                # Fail awake; systemd restarts the service and its local wake watcher.
                hardware.power(True)
                raise Rejected("Local wake monitor stopped.")
    finally:
        server.close()
        hardware.close()


if __name__ == "__main__":
    main()
