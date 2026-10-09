#!/usr/bin/env python3
#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements. See the NOTICE file distributed with this
# work for additional information regarding copyright ownership. The ASF
# licenses this file to You under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
# WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
# License for the specific language governing permissions and limitations
# under the License.
#
"""Small fixtures for provenance failures; actual Docker behavior is a CI gate."""

import copy
import contextlib
import io
import json
import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

import java17_image as images
import verify_candidate_image_sdk as sdk


class ServerArchiveExtractionTest(unittest.TestCase):
    def test_server_uses_shared_filtered_extraction_after_digest_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "server.tar.gz"
            archive.write_bytes(b"fixture")
            manifest = {"server_archive": str(archive),
                        "server_archive_sha256": images.digest(archive)}
            with patch.object(images.HTTP, "extract_archive",
                              side_effect=RuntimeError("extraction stopped")) as extract:
                with self.assertRaisesRegex(RuntimeError, "extraction stopped"):
                    images.start_server(manifest, root / "runtime", root)
                extract.assert_called_once_with(archive, root / "runtime")
                extract.reset_mock()
                archive.write_bytes(b"changed")
                with self.assertRaisesRegex(RuntimeError, "changed after candidate build"):
                    images.start_server(manifest, root / "runtime", root)
                extract.assert_not_called()


class ImageEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.source_commit = "d9abcd" + "1" * 34
        identity = patch.dict(os.environ, CANDIDATE_SOURCE_COMMIT=self.source_commit)
        identity.start()
        self.addCleanup(identity.stop)

    def fixture(self, root):
        repository = root / "m2"
        artifacts, modules = [], []
        for source_pom in sorted(sdk.REQUIRED_MODULES):
            artifact = Path(source_pom).parent.name if source_pom != "pom.xml" else "hugegraph"
            packaging = "pom" if (source_pom.count("/") == 1 and artifact != "hugegraph-struct") or source_pom == "pom.xml" else "jar"
            files = []
            for extension in (["pom", "jar"] if packaging == "jar" else ["pom"]):
                filename = artifact + "-1.8.0." + extension
                path = repository / "org/apache/hugegraph" / artifact / "1.8.0" / filename
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(filename.encode())
                with (path.parent / "_remote.repositories").open("a") as origins:
                    origins.write(filename + ">=\n")
                relative = str(path.relative_to(repository))
                files.append(relative)
                artifacts.append({"path": relative, "sha256": sdk.digest(path), "source_reactor_install": True})
            modules.append({"group_id": "org.apache.hugegraph", "artifact_id": artifact,
                            "version": "1.8.0", "packaging": packaging,
                            "source_pom": source_pom, "files": files})
        manifest = {"repository": sdk.REPOSITORY, "commit": self.source_commit,
                    "source_revision": "1.8.0", "java_version": "17",
                    "required_sdk_modules": modules, "artifacts": artifacts}
        self.write_manifest(repository, manifest)
        return repository, manifest

    def write_manifest(self, repository, manifest):
        (repository / "candidate-sdk-manifest.json").write_text(json.dumps(manifest))

    def test_sdk_manifest_requires_same_source_parents_and_jars(self):
        with tempfile.TemporaryDirectory() as directory:
            repository, manifest = self.fixture(Path(directory))
            _, expected = sdk.validate_sdk(repository)
            self.assertEqual(expected, images.verify_jars("hubble", expected, expected))
            wrong = repository / "org/apache/hugegraph/hugegraph-common/1.8.0/hugegraph-common-1.8.0.jar"
            wrong.write_bytes(b"central artifact with the same version")
            with self.assertRaisesRegex(RuntimeError, "hash mismatch"):
                sdk.validate_sdk(repository)

    def test_required_sdk_pom_and_install_origin_cannot_be_waived(self):
        with tempfile.TemporaryDirectory() as directory:
            repository, manifest = self.fixture(Path(directory))
            for change in ("missing_parent", "wrong_commit", "central_origin", "incomplete_manifest", "wrong_coordinates"):
                bad = copy.deepcopy(manifest)
                if change == "missing_parent":
                    bad["required_sdk_modules"].pop(0)
                elif change == "wrong_commit":
                    bad["commit"] = "59ad5374b4bf90ec3ee7aa133b830e66788b51ec"
                elif change == "central_origin":
                    bad["artifacts"][0]["source_reactor_install"] = False
                elif change == "incomplete_manifest":
                    bad["artifacts"].pop(0)
                else:
                    bad["required_sdk_modules"][0]["artifact_id"] = "not-the-source-module"
                self.write_manifest(repository, bad)
                with self.subTest(change=change), self.assertRaises(RuntimeError):
                    sdk.validate_sdk(repository)
            self.write_manifest(repository, manifest)
            pom = repository / "org/apache/hugegraph/hugegraph/1.8.0/hugegraph-1.8.0.pom"
            (pom.parent / "_remote.repositories").write_text(pom.name + ">central=\n")
            with self.assertRaisesRegex(RuntimeError, "not installed from source"):
                sdk.validate_sdk(repository)

    def test_server_archive_digest_is_bound_to_sdk_build_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repository, manifest = self.fixture(root)
            archive = root / "source-server.tar.gz"
            archive.write_bytes(b"same source archive output")
            expected = sdk.digest(archive)
            work, evidence = root / "work", root / "evidence"
            work.mkdir()
            evidence.mkdir()
            images.prepare("loader", self.source_commit, repository, archive, expected, work, evidence)
            output = json.loads((evidence / "manifest.json").read_text())
            self.assertEqual(expected, output["server_archive_sha256"])
            self.assertEqual(self.source_commit, output["server_commit"])
            with self.assertRaisesRegex(RuntimeError, "locked SDK commit"):
                images.prepare("loader", self.source_commit[:6], repository, archive, expected, work, evidence)
            archive.write_bytes(b"replacement archive")
            with self.assertRaisesRegex(RuntimeError, "changed same-source server archive"):
                images.prepare("loader", self.source_commit, repository, archive, expected, work, evidence)

    def test_runtime_hash_and_required_libraries_cannot_be_waived(self):
        expected = {artifact + "-1.8.0.jar": "candidate" for artifact in (*images.REQUIRED, "hugegraph-core")}
        for wrong in ({**expected, "hugegraph-common-1.8.0.jar": "central"},
                      {key: value for key, value in expected.items() if not key.startswith("hugegraph-core-")},
                      {**expected, "hugegraph-common-1.5.0.jar": "old"},
                      {**expected, "hg-store-client-1.5.0.jar": "old"}):
            with self.subTest(jars=list(wrong)), self.assertRaises(RuntimeError):
                images.verify_jars("hubble", expected, wrong)

    def test_java21_does_not_substitute_for_java17(self):
        images.require_java17('openjdk version "17.0.20"')
        for output in ('openjdk version "11.0.29"', 'openjdk version "21.0.9"', ""):
            with self.assertRaises(RuntimeError):
                images.require_java17(output)

    def test_fixture_configuration_removes_auth_without_touching_other_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "server.properties"
            path.write_text("# reference\nusePD=true\nauth.authenticator=fixture.Auth\ngraphs=./conf/graphs\n")
            images.configure(path, {"usePD": "false"}, ("auth.authenticator",))
            self.assertEqual("# reference\ngraphs=./conf/graphs\nusePD=false\n", path.read_text())

    def test_smoke_reports_failure_types_without_exposing_exception_details(self):
        with tempfile.TemporaryDirectory() as directory:
            evidence = Path(directory)
            manifest = {"module": "loader", "image": "fixture", "server_commit": self.source_commit,
                        "toolchain_commit": "fixture"}
            (evidence / "manifest.json").write_text(json.dumps(manifest))
            original_error = "https://user:password@example.invalid/?token=secret"
            cleanup_error = "Command ['docker', '--password=secret'] timed out"
            runtime = evidence / "fixture-runtime"
            logs = runtime / "apache-hugegraph-fixture/logs"
            logs.mkdir(parents=True)
            (logs / "fixture.log").write_text("fixture log")
            copy_error = "log copy failed: password=secret https://example.invalid/?token=secret"
            stderr = io.StringIO()
            with patch.object(images.tempfile, "TemporaryDirectory",
                              return_value=contextlib.nullcontext(str(runtime))), \
                    patch.object(images, "run", side_effect=[RuntimeError(original_error),
                                                             OSError(cleanup_error), "", ""]), \
                    patch.object(images.shutil, "copy2", side_effect=OSError(copy_error)) as copy_log, \
                    contextlib.redirect_stderr(stderr):
                self.assertFalse(images.smoke(evidence))
            report = json.loads((evidence / "report.json").read_text())
            self.assertEqual(report["error"], "smoke: RuntimeError")
            self.assertEqual(report["cleanup_errors"], ["cleanup: OSError", "cleanup: OSError"])
            copy_log.assert_called_once()
            self.assertEqual(report["status"], "failed")
            for secret in ("secret", "password", "https://", "Command"):
                self.assertNotIn(secret, json.dumps(report))
            output = stderr.getvalue()
            self.assertIn("smoke: RuntimeError", output)
            self.assertIn("cleanup: OSError", output)
            self.assertIn(str(evidence / "report.json"), output)
            self.assertNotIn("secret", output)
            self.assertNotIn("https://", output)
            self.assertNotIn("Command", output)
            self.assertLess(len(output.encode("utf-8")), 8192)

    def test_prepare_failure_reports_existing_log_and_preserves_exit_code(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary, evidence = root / "bin", root / "evidence"
            binary.mkdir()
            message = "fixture exception: password=secret"
            fake_python = binary / "python3"
            fake_python.write_text("#!/bin/bash\n"
                                   "case \"$1\" in\n"
                                   "  */verify_candidate_image_sdk.py) exit 0 ;;\n"
                                   f"  */java17_image.py) echo '{message}' >&2; exit 23 ;;\n"
                                   "  *) exit 99 ;;\n"
                                   "esac\n")
            fake_python.chmod(0o755)
            fake_docker = binary / "docker"
            fake_docker.write_text(f"#!/bin/bash\ntouch '{root / 'docker-called'}'\nexit 99\n")
            fake_docker.chmod(0o755)
            environment = dict(os.environ, PATH=str(binary) + os.pathsep + os.environ["PATH"],
                               RUNNER_TEMP=str(root))
            result = subprocess.run(["bash", str(images.ROOT / ".github/scripts/build-java17-image.sh"),
                                     "loader", self.source_commit, str(root / "repository"),
                                     str(root / "server.tar.gz"), "fixture-sha", str(evidence)],
                                    cwd=images.ROOT, env=environment, capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 23)
            self.assertIn("prepare candidate provenance (exit 23)", result.stderr)
            self.assertIn(str(evidence / "prepare.log"), result.stderr)
            self.assertNotIn("secret", result.stderr)
            self.assertEqual((evidence / "prepare.log").read_text(), message + "\n")
            self.assertFalse((evidence / "manifest.json").exists())
            self.assertFalse((root / "docker-called").exists())


if __name__ == "__main__":
    unittest.main()
