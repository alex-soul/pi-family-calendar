"""Small, bounded local protocol. No TCP listeners or caller-supplied commands."""
import hmac
import json
import os
from pathlib import Path
import socket
import stat
import struct
import tempfile

LIMIT = 16384


class Rejected(Exception):
    pass


def atomic_json(path, value, mode=0o600):
    path = Path(path)
    fd, name = tempfile.mkstemp(prefix=".calendar-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            os.fchmod(stream.fileno(), mode)
            json.dump(value, stream, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def private_file(path):
    path = Path(path)
    info = path.stat()
    directory = os.environ.get('CREDENTIALS_DIRECTORY')
    # systemd may expose root:root 0440 credentials with a service-user ACL.
    # Accept that exact layout only in this service's own credential directory.
    systemd_file = (directory and path.parent.resolve() == Path(directory).resolve()
                    and info.st_uid == 0 and info.st_gid == 0
                    and stat.S_IMODE(info.st_mode) == 0o440)
    if not stat.S_ISREG(info.st_mode) or (info.st_mode & 0o077 and not systemd_file):
        raise Rejected("Credential must be a private regular file.")
    return path


def credential(path):
    path = private_file(path)
    value = path.read_text().strip()
    if len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
        raise Rejected("Invalid local credential.")
    return value


def read_message(connection):
    result = bytearray()
    while b"\n" not in result:
        chunk = connection.recv(4096)
        if not chunk:
            raise Rejected("Incomplete request.")
        result.extend(chunk)
        if len(result) > LIMIT:
            raise Rejected("Request too large.")
    message = json.loads(result.split(b"\n", 1)[0])
    if not isinstance(message, dict):
        raise Rejected("Invalid request.")
    return message


def call(path, token, request):
    with socket.socket(socket.AF_UNIX) as client:
        client.settimeout(4)
        client.connect(str(path))
        client.sendall(json.dumps({**request, "token": token}).encode() + b"\n")
        result = read_message(client)
    if not result.get("ok"):
        raise Rejected(result.get("message", "Controller unavailable."))
    return result["data"]


class LocalServer:
    def __init__(self, path, token, allowed_uids, handler):
        self.path = Path(path)
        self.token = token
        self.allowed_uids = set(allowed_uids)
        self.handler = handler
        # A separate process lock, held for the lifetime, prevents split ownership.
        import fcntl
        self.lock = open(str(path) + ".lock", "a")
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except Exception:
            self.lock.close()
            raise
        self.path.unlink(missing_ok=True)
        self.socket = socket.socket(socket.AF_UNIX)
        self.socket.bind(str(path))
        os.chmod(path, 0o660)
        self.socket.listen(8)
        self.socket.settimeout(1)

    def once(self):
        try:
            connection, _ = self.socket.accept()
        except TimeoutError:
            return
        with connection:
            connection.settimeout(2)
            try:
                _, uid, _ = struct.unpack("3i", connection.getsockopt(
                    socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i")))
                if uid not in self.allowed_uids:
                    raise Rejected("Access denied.")
                request = read_message(connection)
                supplied = request.pop("token", None)
                if not isinstance(supplied, str) or not hmac.compare_digest(supplied, self.token):
                    raise Rejected("Access denied.")
                result = {"ok": True, "data": self.handler(request)}
            except Rejected as cause:
                result = {"ok": False, "message": str(cause)}
            except Exception:
                # Do not leak paths, credentials, subprocess output or request payloads.
                result = {"ok": False, "message": "Controller unavailable."}
            try:
                connection.sendall(json.dumps(result, allow_nan=False).encode() + b"\n")
            except OSError:
                pass

    def close(self):
        self.socket.close()
        self.path.unlink(missing_ok=True)
        self.lock.close()


def exact(request, keys):
    if set(request) != set(keys):
        raise Rejected("Invalid request fields.")


def integer(value, low, high):
    if type(value) is not int or not low <= value <= high:
        raise Rejected(f"Use a whole number from {low} to {high}.")
    return value
