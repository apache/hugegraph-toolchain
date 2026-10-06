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
"""Require readable bundled JARs before a distribution audit can pass."""

import json
import os
import pathlib
import shutil
import subprocess
import tarfile
import tempfile
import unittest
import zipfile


CHECKER = pathlib.Path(__file__).with_name("check-hubble-dist.sh")
BASH = shutil.which("bash")


class HubbleDistributionAuditTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = pathlib.Path(self.temp.name)
        self.root = self.base / "apache-hugegraph-hubble-test"
        for directory in ("bin", "conf", "lib", "ui", "licenses/fe-licenses"):
            (self.root / directory).mkdir(parents=True, exist_ok=True)
        for filename in ("bin/start-hubble.sh", "bin/stop-hubble.sh",
                         "bin/common_functions", "conf/hugegraph-hubble.properties",
                         "ui/index.html", "README.md", "LICENSE", "NOTICE",
                         "licenses/dependency.txt", "licenses/fe-licenses/dependency.txt"):
            (self.root / filename).write_text("audit fixture\n", encoding="utf-8")
        self.jar = self.root / "lib/dependency.jar"
        self.archive = self.base / "hubble.tar.gz"
        self.report = self.base / "report.json"

    def run_audit(self, env=None):
        with tarfile.open(self.archive, "w:gz") as archive:
            archive.add(self.root, arcname=self.root.name)
        return subprocess.run(
            [BASH, str(CHECKER), str(self.archive), "--json-output", str(self.report)],
            env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            check=False,
        )

    def valid_jar(self):
        with zipfile.ZipFile(self.jar, "w") as jar:
            jar.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\n")
            jar.writestr("native/library.so", b"inventory fixture")
            for index in range(2048):
                jar.writestr(f"resources/entry-{index}.txt", "fixture")

    def test_missing_jar_tool_cannot_report_success(self):
        self.valid_jar()
        tools = self.base / "tools"
        tools.mkdir()
        for name in ("mktemp", "tar", "gzip", "grep", "awk", "sort", "wc",
                     "tr", "rm", "mkdir", "dirname", "sed"):
            executable = shutil.which(name)
            self.assertIsNotNone(executable, name)
            (tools / name).symlink_to(executable)
        env = os.environ.copy()
        env["PATH"] = str(tools)
        result = self.run_audit(env)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("jar is required", result.stderr)
        self.assertFalse(self.report.exists())

    @unittest.skipUnless(shutil.which("jar"), "JDK jar tool required")
    def test_corrupt_jar_cannot_report_success(self):
        self.jar.write_bytes(b"not a zip archive")
        result = self.run_audit()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("Unable to inspect packaged JAR", result.stderr)
        self.assertFalse(self.report.exists())

    @unittest.skipUnless(shutil.which("jar"), "JDK jar tool required")
    def test_readable_jar_records_native_entries(self):
        self.valid_jar()
        result = self.run_audit()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(self.report.read_text())
        self.assertEqual(report["native_jar_count"], 1)
        self.assertEqual(report["native_jars"], [self.root.name + "/lib/dependency.jar"])


if __name__ == "__main__":
    unittest.main()
