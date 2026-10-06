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
"""Exercise the actual archive script without building Hubble or deleting data."""

import pathlib
import subprocess
import sys
import tarfile
import tempfile
import unittest


ARCHIVER = pathlib.Path(__file__).with_name("archive-hubble.sh")


class HubbleArchiveTest(unittest.TestCase):
    def test_runtime_data_is_preserved_and_excluded_from_image_input(self):
        with tempfile.TemporaryDirectory(prefix="hubble-archive-") as directory:
            root = pathlib.Path(directory)
            release = root / "apache-hugegraph-hubble-1.8.0"
            runtime_files = (
                "data/hubble-v2.mv.db", "data/hubble-v2.trace.db",
                "db.mv.db", "db.trace.db", "logs/application.log",
                "upload-files/private.csv", "hubble.pid", "bin/pid",
                "metadata.lock",
            )
            for relative in runtime_files:
                path = release / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(("preserve:" + relative).encode())
            sentinels = {relative: (release / relative).read_bytes()
                         for relative in runtime_files}
            (release / "lib").mkdir()
            (release / "lib/hubble.jar").write_bytes(b"application")
            sidecar = release / "lib/._hubble.jar"
            sidecar.write_bytes(b"existing AppleDouble metadata")
            (release / "ui").mkdir()
            (release / "ui/index.html").write_text("<html>Hubble</html>")
            archive = root / "target/hubble.tar.gz"

            for attempt in range(2):
                subprocess.run(["bash", str(ARCHIVER), str(release), str(archive)],
                               check=True)
                with tarfile.open(archive) as package:
                    names = package.getnames()
                    for relative in runtime_files:
                        self.assertNotIn(f"{release.name}/{relative}", names)
                    for runtime_dir in ("data", "logs", "upload-files"):
                        self.assertNotIn(f"{release.name}/{runtime_dir}", names)
                    self.assertIn(f"{release.name}/lib/hubble.jar", names)
                    self.assertIn(f"{release.name}/ui/index.html", names)
                    self.assertFalse(any(pathlib.PurePosixPath(name).name.startswith("._")
                                         for name in names))

                # Docker uses the archive in a fresh build-stage directory.
                image_input = root / f"fresh-image-{attempt}"
                image_input.mkdir()
                subprocess.run(["tar", "-xzf", str(archive),
                                "--strip-components=1", "-C", str(image_input)],
                               check=True)
                self.assertEqual(b"application",
                                 (image_input / "lib/hubble.jar").read_bytes())
                for relative, original in sentinels.items():
                    self.assertFalse((image_input / relative).exists())
                    self.assertEqual(original, (release / relative).read_bytes())
                self.assertEqual(b"existing AppleDouble metadata", sidecar.read_bytes())

    @unittest.skipUnless(sys.platform == "darwin", "requires macOS extended attributes")
    def test_extended_attributes_do_not_generate_appledouble_members(self):
        with tempfile.TemporaryDirectory(prefix="hubble-archive-xattr-") as directory:
            root = pathlib.Path(directory)
            release = root / "hubble"
            release.mkdir()
            payload = release / "application.jar"
            payload.write_bytes(b"application")
            attribute = "com.apple.metadata:hugegraph-archive-test"
            subprocess.run(["xattr", "-w", attribute, "preserve attribute", str(payload)],
                           check=True)
            archive = root / "hubble.tar.gz"
            subprocess.run(["bash", str(ARCHIVER), str(release), str(archive)], check=True)
            with tarfile.open(archive) as package:
                self.assertEqual(["hubble", "hubble/application.jar"], package.getnames())
                self.assertEqual(b"application",
                                 package.extractfile("hubble/application.jar").read())
            self.assertEqual(b"preserve attribute", subprocess.check_output(
                ["xattr", "-p", attribute, str(payload)]).strip())

    def test_missing_release_fails_without_creating_archive(self):
        with tempfile.TemporaryDirectory(prefix="hubble-archive-") as directory:
            root = pathlib.Path(directory)
            archive = root / "hubble.tar.gz"
            result = subprocess.run(["bash", str(ARCHIVER), str(root / "missing"),
                                     str(archive)], capture_output=True)
            self.assertNotEqual(0, result.returncode)
            self.assertFalse(archive.exists())


if __name__ == "__main__":
    unittest.main()
