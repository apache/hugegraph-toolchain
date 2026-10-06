#!/usr/bin/env python3
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements. See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Exercise shared Maven setup without altering the runner's global settings."""
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]


class MavenSetupTest(unittest.TestCase):
    def run_setup(self, version, arguments=""):
        action = (ROOT / ".github/actions/setup-java-env/action.yml").read_text()
        script = textwrap.dedent(action.split("      run: |\n", 1)[1])
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            executable = temporary / "mvn"
            executable.write_text("#!/bin/bash\nprintf '\\033[1mApache Maven " + version + "\\033[0m\\n'\n")
            executable.chmod(0o755)
            original_settings = temporary / ".m2/settings.xml"
            original_settings.parent.mkdir()
            original_settings.write_text("runner settings remain unchanged\n")
            env = dict(os.environ, HOME=directory, GITHUB_WORKSPACE=str(ROOT),
                       GITHUB_ENV=str(temporary / "env"), MAVEN_ARGS=arguments,
                       PATH=directory + os.pathsep + os.environ["PATH"])
            result = subprocess.run(["bash", "-c", script], env=env,
                                    capture_output=True, text=True)
            output = temporary / "env"
            self.assertEqual("runner settings remain unchanged\n", original_settings.read_text())
            return result, output.read_text() if output.exists() else ""

    def test_colored_maven_output_and_existing_cli_arguments(self):
        result, output = self.run_setup("3.9.9", "-Dtest.flag=true -Dmaven.repo.local=/tmp/sdk")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("MAVEN_ARGS=-Dtest.flag=true -Dmaven.repo.local=/tmp/sdk --settings " +
                         str(ROOT) + "/.github/configs/settings.xml\n", output)

    def test_default_arguments(self):
        result, output = self.run_setup("3.9.0")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("--settings " + str(ROOT), output)

    def test_old_maven_cannot_silently_ignore_shared_settings(self):
        result, output = self.run_setup("3.8.8")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("Maven 3.9 or newer", result.stderr)
        self.assertEqual("", output)

    def test_stage_is_release_dependency_fallback_only(self):
        settings = ET.parse(ROOT / ".github/configs/settings.xml")
        ns = {"m": "http://maven.apache.org/SETTINGS/1.0.0"}
        profile = settings.find("m:profiles/m:profile", ns)
        repositories = profile.findall("m:repositories/m:repository", ns)
        self.assertEqual(["central", "staged-releases"],
                         [item.findtext("m:id", namespaces=ns) for item in repositories])
        for repository in repositories:
            self.assertEqual("true", repository.findtext("m:releases/m:enabled", namespaces=ns))
            self.assertEqual("false", repository.findtext("m:snapshots/m:enabled", namespaces=ns))
        self.assertEqual("fail", repositories[1].findtext("m:releases/m:checksumPolicy", namespaces=ns))
        self.assertIsNone(profile.find("m:pluginRepositories", ns))


if __name__ == "__main__":
    unittest.main()
