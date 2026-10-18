"""Exercise bounded cleanup with a real child that ignores graceful shutdown."""
import subprocess
import sys
import unittest
from display import Hardware


class DisplayLifecycleTests(unittest.TestCase):
    def test_stuck_watcher_is_reaped_on_shutdown(self):
        child = subprocess.Popen([sys.executable, '-c',
            "import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); print('ready',flush=True); time.sleep(60)"],
            stdout=subprocess.PIPE, text=True)
        try:
            self.assertEqual(child.stdout.readline().strip(), 'ready')
            hardware = Hardware({}, '')
            hardware.watcher = child
            hardware.close()
            self.assertIsNotNone(child.poll())
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()
            child.stdout.close()


if __name__ == '__main__':
    unittest.main()
