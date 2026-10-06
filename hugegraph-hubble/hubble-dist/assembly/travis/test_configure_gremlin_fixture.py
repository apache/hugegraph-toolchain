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
"""Check native fixture selection and archive provenance without starting servers."""

import hashlib
import importlib.util
import os
import pathlib
import subprocess
import tempfile
import unittest
import zipfile


HERE = pathlib.Path(__file__).parent
SPEC = importlib.util.spec_from_file_location("fixture", HERE / "configure_gremlin_fixture.py")
FIXTURE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FIXTURE)


class GremlinFixtureTest(unittest.TestCase):
    def test_native_serializer_block_preserves_fixture_endpoints_and_plugins(self):
        for family in ("driver", "util"):
            with tempfile.TemporaryDirectory(prefix="hubble-fixture-") as temp:
                root = pathlib.Path(temp)
                (root / "conf").mkdir()
                (root / "lib").mkdir()
                serializer = f"org.apache.tinkerpop.gremlin.{family}.ser.GraphBinaryMessageSerializerV1"
                block = f"serializers:\n  - {{className: {serializer}}}\n"
                (root / "conf/gremlin-server.yaml").write_text("port: 8182\n" + block + "metrics: {}\n")
                with zipfile.ZipFile(root / "lib/native.jar", "w") as jar:
                    jar.writestr(serializer.replace(".", "/") + ".class", b"class")
                template = root / "fixture.yaml"
                before = "port: 8183\nauthentication: {authenticator: test.Auth}\nscriptEngines: {}\n"
                after = "metrics: {consoleReporter: {enabled: false}}\n"
                template.write_text(before + "serializers:\n  - {className: old.Missing}\n" + after)
                text, report = FIXTURE.configure(root, template)
                self.assertEqual(before + block + after, text)
                self.assertEqual([serializer], report["verified_classes"])
                self.assertIn("old.Missing", template.read_text())

    def test_missing_native_serializer_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="hubble-fixture-") as temp:
            root = pathlib.Path(temp)
            (root / "conf").mkdir()
            (root / "lib").mkdir()
            native = "serializers:\n  - {className: native.Missing}\n"
            (root / "conf/gremlin-server.yaml").write_text(native)
            template = root / "fixture.yaml"
            template.write_text(native)
            with self.assertRaisesRegex(ValueError, "native.Missing"):
                FIXTURE.configure(root, template)

    def test_archive_commit_and_hash_bind_the_supplied_payload(self):
        with tempfile.TemporaryDirectory(prefix="hubble-archive-input-") as temp:
            root = pathlib.Path(temp)
            source = root / "source"
            source.mkdir()
            archive = source / "apache-hugegraph-server-1.7.0.tar.gz"
            archive.write_bytes(b"verified action payload")
            output = root / "output"
            output.mkdir()
            commit = "1" * 40
            env = dict(os.environ, SERVER_ARCHIVE=str(archive), SERVER_ARCHIVE_COMMIT=commit,
                       SERVER_ARCHIVE_SHA256=hashlib.sha256(archive.read_bytes()).hexdigest(),
                       SERVER_REPOSITORY="apache/hugegraph")
            result = subprocess.run(["bash", str((HERE / "download-hugegraph.sh").resolve()), commit],
                                    cwd=output, env=env, capture_output=True)
            self.assertEqual(0, result.returncode, result.stderr.decode())
            self.assertEqual(archive.read_bytes(), (output / archive.name).read_bytes())
            for key, value in (("SERVER_ARCHIVE_COMMIT", "2" * 40),
                               ("SERVER_ARCHIVE_SHA256", "0" * 64)):
                failed = dict(env, **{key: value})
                result = subprocess.run(["bash", str((HERE / "download-hugegraph.sh").resolve()), commit],
                                        cwd=output, env=failed, capture_output=True)
                self.assertNotEqual(0, result.returncode)


if __name__ == "__main__":
    unittest.main()
