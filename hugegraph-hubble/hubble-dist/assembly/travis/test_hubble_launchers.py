#!/usr/bin/env python3
#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
"""Exercise packaged launcher identity guards using only owned child processes."""

import os
import pathlib
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest


SCRIPTS = pathlib.Path(__file__).resolve().parent.parent / "static/bin"
PROC_AVAILABLE = pathlib.Path("/proc/self/stat").exists()
STAMP = "Sun Jan  3 10:00:00 2021"
PADDED_STAMP = "  " + STAMP + "    "


class HubbleLauncherTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="hubble launcher-")
        self.root = pathlib.Path(self.directory.name)
        for name in ("bin", "conf", "lib", "tools"):
            (self.root / name).mkdir()
        for name in ("start-hubble.sh", "stop-hubble.sh"):
            shutil.copy2(SCRIPTS / name, self.root / "bin" / name)
        (self.root / "bin/common_functions").write_text(
            "java_env_check() { :; }\nwait_for_startup() { :; }\n"
            "read_property() { printf 'unused'; }\n", encoding="utf-8")
        (self.root / "conf/hugegraph-hubble.properties").write_text("", encoding="utf-8")
        java = self.root / "tools/java"
        java.write_text(
            "#!/bin/bash\nprintf '%s\\n' \"$$\" > \"$LAUNCHER_TEST_CHILD\"\n"
            "printf 'fake java started\\n'\n"
            "printf '%s\\n' \"$@\" > \"$LAUNCHER_TEST_ARGS\"\n"
            "[[ $LAUNCHER_TEST_EXIT == true ]] && exit 0\n"
            "trap 'exit 0' TERM INT\nwhile :; do sleep 0.1; done\n", encoding="utf-8")
        java.chmod(0o755)
        ps = self.root / "tools/ps"
        ps.write_text(
            "#!/bin/bash\nif [[ \" $* \" == *' lstart= '* ]]; then\n"
            "  [[ $LAUNCHER_TEST_PS_MODE == lstart-fail ]] && exit 1\n"
            "  [[ $LAUNCHER_TEST_PS_MODE == lstart-empty ]] && exit 0\n"
            "  printf '%s\\n' \"$LAUNCHER_TEST_STAMP\"\n"
            "else\n"
            "  [[ $LAUNCHER_TEST_PS_MODE == args-fail ]] && exit 1\n"
            "  [[ $LAUNCHER_TEST_PS_MODE == args-empty ]] && { printf '   '; exit 0; }\n"
            "  exec /bin/ps \"$@\"\nfi\n", encoding="utf-8")
        ps.chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.root / "tools") + os.pathsep + os.environ["PATH"],
                        LAUNCHER_TEST_CHILD=str(self.root / "fake-java.pid"),
                        LAUNCHER_TEST_ARGS=str(self.root / "fake-java.args"), LAUNCHER_TEST_EXIT="false",
                        LAUNCHER_TEST_STAMP=PADDED_STAMP, LAUNCHER_TEST_PS_MODE="normal", STOP_TIMEOUT="2")
        self.children = []
        self.owned_pids = set()

    def tearDown(self):
        marker = self.root / "fake-java.pid"
        if marker.exists():
            self.owned_pids.add(int(marker.read_text()))
        for child in self.children:
            if child.poll() is None:
                child.terminate()
            child.wait(timeout=5)
        for pid in self.owned_pids:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        self.directory.cleanup()

    def child(self, hubble=False, home=None, main="org.apache.hugegraph.HugeGraphHubble"):
        args = [sys.executable, "-c", "import time; time.sleep(300)"]
        if hubble:
            args.extend([f"-Dhubble.home.path={home or self.root}", main])
        child = subprocess.Popen(args,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.children.append(child)
        # Reap a terminated child while the shell polls kill -0; a zombie still has a PID.
        threading.Thread(target=child.wait, daemon=True).start()
        return child

    def run_script(self, name, *args):
        result = subprocess.run(["bash", str(self.root / "bin" / name), *args], env=self.env,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                timeout=10)
        marker = self.root / "fake-java.pid"
        if marker.exists():
            self.owned_pids.add(int(marker.read_text()))
        return result

    def assert_launch_arguments(self):
        arguments = self.root / "fake-java.args"
        for attempt in range(100):
            if arguments.exists() and arguments.read_text().endswith(".properties\n"):
                break
            time.sleep(0.01)
        self.assertEqual([
            "-server", "-Xms512m", "-Dfile.encoding=UTF-8",
            "--add-opens=java.base/java.net=ALL-UNNAMED", f"-Dhubble.home.path={self.root}",
            "-cp", f".:{self.root / 'lib/hubble test.jar'}",
            "org.apache.hugegraph.HugeGraphHubble", str(self.root / "conf/hugegraph-hubble.properties")
        ], arguments.read_text().splitlines())

    def test_foreground_preserves_paths_with_spaces(self):
        (self.root / "lib/hubble test.jar").touch()
        self.env["LAUNCHER_TEST_EXIT"] = "true"
        result = self.run_script("start-hubble.sh", "--foreground")
        self.assertEqual(0, result.returncode, result.stdout)
        self.assert_launch_arguments()
        self.assertIn("fake java started", result.stdout)

    def test_daemon_preserves_paths_with_spaces(self):
        (self.root / "lib/hubble test.jar").touch()
        result = self.run_script("start-hubble.sh")
        self.assertEqual(0, result.returncode, result.stdout)
        self.assert_launch_arguments()
        self.assertIn("fake java started", (self.root / "logs/hugegraph-hubble.log").read_text())

    def stamp_pid(self, pid, stamp=PADDED_STAMP):
        (self.root / "bin/pid").write_text(f"{pid} {stamp}\n", encoding="utf-8")

    def native_stamp(self, pid):
        if PROC_AVAILABLE:
            return pathlib.Path(f"/proc/{pid}/stat").read_text().split()[21]
        return PADDED_STAMP

    @unittest.skipIf(PROC_AVAILABLE, "BSD ps fallback requires a platform without /proc")
    def test_bsd_capture_writes_normalized_start_stamp(self):
        result = self.run_script("start-hubble.sh")
        self.assertEqual(0, result.returncode, result.stdout)
        for attempt in range(50):
            if (self.root / "fake-java.pid").exists():
                break
            time.sleep(0.01)
        pid = int((self.root / "fake-java.pid").read_text())
        self.assertEqual(f"{pid} {STAMP}\n", (self.root / "bin/pid").read_text())

    @unittest.skipIf(PROC_AVAILABLE, "BSD ps fallback requires a platform without /proc")
    def test_bsd_active_stamp_prevents_duplicate_launch(self):
        child = self.child(hubble=True)
        self.stamp_pid(child.pid)
        result = self.run_script("start-hubble.sh")
        self.assertNotEqual(0, result.returncode, result.stdout)
        self.assertIn("running as process", result.stdout)
        self.assertIsNone(child.poll())
        self.assertFalse((self.root / "fake-java.pid").exists())

    @unittest.skipIf(PROC_AVAILABLE, "BSD ps fallback requires a platform without /proc")
    def test_bsd_matching_stamp_stops_only_owned_child(self):
        child = self.child(hubble=True)
        self.stamp_pid(child.pid)
        result = self.run_script("stop-hubble.sh")
        self.assertEqual(0, result.returncode, result.stdout)
        child.wait(timeout=5)
        self.assertFalse((self.root / "bin/pid").exists())

    @unittest.skipIf(PROC_AVAILABLE, "BSD ps fallback requires a platform without /proc")
    def test_bsd_matching_stamp_unrelated_child_does_not_block_launch(self):
        child = self.child()
        self.stamp_pid(child.pid)
        result = self.run_script("start-hubble.sh")
        self.assertEqual(0, result.returncode, result.stdout)
        self.assertIsNone(child.poll())
        self.assertNotEqual(child.pid, int((self.root / "bin/pid").read_text().split()[0]))

    def test_matching_stamp_unrelated_child_is_not_stopped(self):
        child = self.child()
        self.stamp_pid(child.pid, self.native_stamp(child.pid))
        result = self.run_script("stop-hubble.sh")
        self.assertNotEqual(0, result.returncode, result.stdout)
        self.assertIsNone(child.poll())
        self.assertTrue((self.root / "bin/pid").exists())

    def test_matching_stamp_different_home_is_not_stopped(self):
        child = self.child(hubble=True, home=str(self.root) + "-other")
        self.stamp_pid(child.pid, self.native_stamp(child.pid))
        result = self.run_script("stop-hubble.sh")
        self.assertNotEqual(0, result.returncode, result.stdout)
        self.assertIsNone(child.poll())

    def test_matching_stamp_different_main_is_not_stopped(self):
        child = self.child(hubble=True, main="org.apache.hugegraph.HugeGraphHubbleOther")
        self.stamp_pid(child.pid, self.native_stamp(child.pid))
        result = self.run_script("stop-hubble.sh")
        self.assertNotEqual(0, result.returncode, result.stdout)
        self.assertIsNone(child.poll())

    def assert_inspection_failure_refuses_launch(self, mode):
        child = self.child(hubble=True)
        self.stamp_pid(child.pid, self.native_stamp(child.pid))
        original_pid = (self.root / "bin/pid").read_bytes()
        self.env["LAUNCHER_TEST_PS_MODE"] = mode
        result = self.run_script("start-hubble.sh")
        self.assertNotEqual(0, result.returncode, result.stdout)
        self.assertIsNone(child.poll())
        self.assertEqual(original_pid, (self.root / "bin/pid").read_bytes())
        self.assertFalse((self.root / "fake-java.pid").exists())

    @unittest.skipIf(PROC_AVAILABLE, "BSD ps fallback requires a platform without /proc")
    def test_bsd_start_time_inspection_failure_refuses_launch(self):
        for mode in ("lstart-fail", "lstart-empty"):
            with self.subTest(mode=mode):
                self.assert_inspection_failure_refuses_launch(mode)

    def test_args_inspection_failure_refuses_launch(self):
        for mode in ("args-fail", "args-empty"):
            with self.subTest(mode=mode):
                self.assert_inspection_failure_refuses_launch(mode)

    def test_wrong_stamp_refuses_to_stop_live_child(self):
        child = self.child(hubble=True)
        self.stamp_pid(child.pid, "another-process-start")
        result = self.run_script("stop-hubble.sh")
        self.assertNotEqual(0, result.returncode, result.stdout)
        self.assertIsNone(child.poll())
        self.assertTrue((self.root / "bin/pid").exists())

    def test_unstamped_unrelated_child_is_not_stopped(self):
        child = self.child()
        (self.root / "bin/pid").write_text(f"{child.pid}\n", encoding="utf-8")
        result = self.run_script("stop-hubble.sh")
        self.assertNotEqual(0, result.returncode, result.stdout)
        self.assertIsNone(child.poll())

    def test_unstamped_hubble_child_retains_legacy_stop_behavior(self):
        child = self.child(hubble=True)
        (self.root / "bin/pid").write_text(f"{child.pid}\n", encoding="utf-8")
        result = self.run_script("stop-hubble.sh")
        self.assertEqual(0, result.returncode, result.stdout)
        child.wait(timeout=5)
        self.assertFalse((self.root / "bin/pid").exists())

    @unittest.skipUnless(PROC_AVAILABLE, "Linux /proc identity branch")
    def test_linux_proc_start_stamp_stops_owned_child(self):
        child = self.child(hubble=True)
        stamp = pathlib.Path(f"/proc/{child.pid}/stat").read_text().split()[21]
        self.stamp_pid(child.pid, stamp)
        result = self.run_script("stop-hubble.sh")
        self.assertEqual(0, result.returncode, result.stdout)
        child.wait(timeout=5)
        self.assertFalse((self.root / "bin/pid").exists())


if __name__ == "__main__":
    unittest.main()
