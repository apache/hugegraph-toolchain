#!/usr/bin/env python3
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements. See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class LoaderLauncherTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="loader-java-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.tools = self.root / "tools"
        self.tools.mkdir()
        for name in ("dirname", "readlink", "find", "sort", "tr", "awk"):
            executable = shutil.which(name)
            self.assertIsNotNone(executable)
            (self.tools / name).symlink_to(executable)
        self.bash = shutil.which("bash")
        self.app = self.root / "loader"
        for name in ("bin", "lib", "conf"):
            (self.app / name).mkdir(parents=True)
        source = Path(__file__).resolve().parents[3] / "assembly/static/bin/hugegraph-loader.sh"
        self.launcher = self.app / "bin/hugegraph-loader.sh"
        shutil.copyfile(source, self.launcher)
        self.record = self.root / "java-arguments.txt"

    def run_launcher(self, java_home=None):
        env = dict(os.environ, PATH=str(self.tools), JAVA_RECORD=str(self.record))
        env.pop("JAVA_HOME", None)
        env.pop("JAVA", None)
        if java_home is not None:
            env["JAVA_HOME"] = str(java_home)
        return subprocess.run([self.bash, str(self.launcher), "--help"], env=env,
                              text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)

    def install_java(self, directory, major):
        directory.mkdir(parents=True, exist_ok=True)
        java = directory / "java"
        java.write_text("#!/bin/bash\n"
                        "if [[ $1 == -version ]]; then\n"
                        f"  printf 'openjdk version \"{major}.0.1\"\\n' >&2\n"
                        "  exit 0\n"
                        "fi\n"
                        "printf '%s\\n' \"$@\" > \"$JAVA_RECORD\"\n")
        java.chmod(0o755)

    def test_missing_java_on_path_has_actionable_diagnostic(self):
        result = self.run_launcher()
        self.assertEqual(1, result.returncode)
        self.assertIn("Unable to find java executable", result.stderr)
        self.assertIn("JAVA_HOME and PATH", result.stderr)
        self.assertFalse(self.record.exists())

    def test_invalid_java_home_has_actionable_diagnostic(self):
        result = self.run_launcher(self.root / "missing-jdk")
        self.assertEqual(1, result.returncode)
        self.assertIn("Unable to find java executable", result.stderr)
        self.assertFalse(self.record.exists())

    def test_path_java_11_preserves_launch_without_module_opening(self):
        self.install_java(self.tools, 11)
        result = self.run_launcher()
        self.assertEqual(0, result.returncode, result.stderr)
        arguments = self.record.read_text().splitlines()
        self.assertNotIn("--add-opens=java.base/java.net=ALL-UNNAMED", arguments)
        self.assertIn("org.apache.hugegraph.loader.HugeGraphLoader", arguments)

    def test_java_home_17_preserves_module_opening(self):
        home = self.root / "jdk"
        self.install_java(home / "bin", 17)
        result = self.run_launcher(home)
        self.assertEqual(0, result.returncode, result.stderr)
        arguments = self.record.read_text().splitlines()
        self.assertIn("--add-opens=java.base/java.net=ALL-UNNAMED", arguments)
        self.assertIn("org.apache.hugegraph.loader.HugeGraphLoader", arguments)


if __name__ == "__main__":
    unittest.main()
