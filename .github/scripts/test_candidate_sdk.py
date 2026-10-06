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
"""SDK provenance fixtures and an opt-in real Maven parent-metadata regression."""

import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import uuid
import xml.etree.ElementTree as ET

import verify_candidate_image_sdk as sdk


class CandidateParentModelTest(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("CANDIDATE_SDK_MAVEN_TEST"),
                         "Set CANDIDATE_SDK_MAVEN_TEST to a Maven executable for the metadata regression")
    def test_license_metadata_can_rebuild_installed_root_parent(self):
        # Use the real metadata plugin and unique coordinates, never the user's SDK artifacts.
        maven = os.environ["CANDIDATE_SDK_MAVEN_TEST"]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            settings = root / "settings.xml"
            settings.write_text("<settings/>")
            header = '<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>'
            flatten = ('<plugin><groupId>org.codehaus.mojo</groupId><artifactId>flatten-maven-plugin</artifactId>'
                       '<version>1.2.7</version><configuration><updatePomFile>true</updatePomFile>'
                       '<flattenMode>resolveCiFriendliesOnly</flattenMode></configuration><executions>'
                       '<execution><phase>process-resources</phase><goals><goal>flatten</goal></goals>'
                       '</execution></executions></plugin>')
            for fixed in (False, True):
                group = "org.example.candidatesdk.g" + uuid.uuid4().hex
                source = root / group
                source.mkdir()
                root_pom = (header + '<parent><groupId>org.apache</groupId><artifactId>apache</artifactId>'
                            '<version>23</version></parent><groupId>' + group + '</groupId>'
                            '<artifactId>root</artifactId><version>${revision}</version><packaging>pom</packaging>'
                            '<properties><revision>1.7.0</revision></properties><modules><module>dependency</module>'
                            '<module>consumer</module></modules><build><plugins><plugin>'
                            '<artifactId>maven-remote-resources-plugin</artifactId><version>3.3.0</version>'
                            '</plugin></plugins></build></project>')
                (source / "pom.xml").write_text(root_pom)
                parent = ('<parent><groupId>' + group + '</groupId><artifactId>root</artifactId>'
                          '<version>${revision}</version></parent>')
                for module in ("dependency", "consumer"):
                    directory = source / module
                    directory.mkdir()
                    body = flatten if module == "dependency" else ""
                    dependency = (('<dependencies><dependency><groupId>' + group + '</groupId>'
                                   '<artifactId>dependency</artifactId><version>1.7.0</version>'
                                   '</dependency></dependencies>') if module == "consumer" else "")
                    (directory / "pom.xml").write_text(header + parent + '<artifactId>' + module + '</artifactId>'
                                                      + dependency + '<build><plugins>' + body
                                                      + '</plugins></build></project>')
                original_poms = {p: p.read_bytes() for p in source.rglob("pom.xml")}

                def run(*arguments):
                    return subprocess.run([maven, "--settings", str(settings), "-B", "-ntp", *arguments],
                                          cwd=source, capture_output=True, text=True, timeout=120)

                goals = (["org.codehaus.mojo:flatten-maven-plugin:1.2.7:flatten", "install",
                          "-Dflatten.mode=resolveCiFriendliesOnly", "-DupdatePomFile=true"]
                         if fixed else ["install"])
                literal_request = group + ":root:pom:${revision}"
                installed = run(*goals, "-DskipTests")
                if fixed or installed.returncode == 0:
                    self.assertEqual(0, installed.returncode, installed.stdout + installed.stderr)
                else:
                    # Newer resolvers fail here; older ones only warn on the leaf metadata goal.
                    self.assertIn(literal_request, installed.stdout + installed.stderr)
                metadata_goal = ("org.apache.maven.plugins:maven-remote-resources-plugin:3.3.0:"
                                 "process@process-resource-bundles")
                metadata = run(metadata_goal, "-f", "consumer/pom.xml", "-X")
                output = metadata.stdout + metadata.stderr
                if fixed:
                    self.assertEqual(0, metadata.returncode, output)
                    self.assertNotIn(literal_request, output)
                    self.assertNotIn("Failed to build parent project", output)
                    version = ET.parse(source / ".flattened-pom.xml").getroot().findtext(
                        "{http://maven.apache.org/POM/4.0.0}version")
                    self.assertEqual("1.7.0", version)
                else:
                    self.assertIn(literal_request, output)
                for path, original in original_poms.items():
                    self.assertEqual(original, path.read_bytes())


class CandidateDistributionTest(unittest.TestCase):
    def fixture(self, root):
        repository = root / "m2"
        artifacts, modules = [], []
        for source_pom in sorted(sdk.REQUIRED_MODULES):
            artifact = Path(source_pom).parent.name if source_pom != "pom.xml" else "hugegraph"
            packaging = "pom" if (source_pom.count("/") == 1 and artifact != "hugegraph-struct") or source_pom == "pom.xml" else "jar"
            files = []
            for extension in (["pom", "jar"] if packaging == "jar" else ["pom"]):
                filename = artifact + "-1.7.0." + extension
                path = repository / "org/apache/hugegraph" / artifact / "1.7.0" / filename
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(filename.encode())
                with (path.parent / "_remote.repositories").open("a") as origins:
                    origins.write(filename + ">=\n")
                relative = str(path.relative_to(repository))
                files.append(relative)
                artifacts.append({"path": relative, "sha256": sdk.digest(path), "source_reactor_install": True})
            modules.append({"group_id": "org.apache.hugegraph", "artifact_id": artifact,
                            "version": "1.7.0", "packaging": packaging,
                            "source_pom": source_pom, "files": files})
        manifest = {"repository": sdk.REPOSITORY, "commit": sdk.COMMIT,
                    "source_revision": "1.7.0", "java_version": "17",
                    "required_sdk_modules": modules, "artifacts": artifacts}
        self.write_manifest(repository, manifest)
        return repository, manifest

    def write_manifest(self, repository, manifest):
        (repository / "candidate-sdk-manifest.json").write_text(json.dumps(manifest))

    def distribution(self, root, repository, manifest):
        directory = root / "distribution"
        library = directory / "lib"
        library.mkdir(parents=True)
        self.write_manifest(directory, manifest)
        for item in manifest["artifacts"]:
            path = repository / item["path"]
            if path.suffix == ".jar":
                shutil.copyfile(path, library / path.name)
        (library / "hugegraph-client-1.8.0.jar").write_bytes(b"toolchain fixture")
        return directory

    def test_distribution_requires_original_manifest_and_exact_sdk_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repository, manifest = self.fixture(root)
            directory = self.distribution(root, repository, manifest)
            for module in ("loader", "tools", "hubble"):
                self.assertEqual(9, len(sdk.validate_distribution(repository, directory, module)))
            common = directory / "lib/hugegraph-common-1.7.0.jar"
            common.write_bytes(b"Central artifact with the same GAV")
            with self.assertRaisesRegex(RuntimeError, "changed packaged"):
                sdk.validate_distribution(repository, directory, "loader")

    def test_stale_missing_and_duplicate_libraries_fail_closed(self):
        for scenario in ("missing", "old_version", "duplicate", "wrong_manifest", "missing_manifest", "symlink"):
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                repository, manifest = self.fixture(root)
                directory = self.distribution(root, repository, manifest)
                common = directory / "lib/hugegraph-common-1.7.0.jar"
                if scenario == "missing":
                    common.unlink()
                elif scenario in ("old_version", "duplicate"):
                    old = common.with_name("hugegraph-common-1.5.0.jar")
                    if scenario == "old_version":
                        common.rename(old)
                    else:
                        shutil.copyfile(common, old)
                elif scenario == "wrong_manifest":
                    wrong = copy.deepcopy(manifest)
                    wrong["commit"] = "0" * 40
                    self.write_manifest(directory, wrong)
                elif scenario == "missing_manifest":
                    (directory / "candidate-sdk-manifest.json").unlink()
                else:
                    common.unlink()
                    common.symlink_to(repository / "org/apache/hugegraph/hugegraph-common/1.7.0/hugegraph-common-1.7.0.jar")
                with self.assertRaises(RuntimeError):
                    sdk.validate_distribution(repository, directory, "loader")

    def test_hubble_requires_core_and_other_modules_do_not(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repository, manifest = self.fixture(root)
            directory = self.distribution(root, repository, manifest)
            (directory / "lib/hugegraph-core-1.7.0.jar").unlink()
            sdk.validate_distribution(repository, directory, "tools")
            with self.assertRaisesRegex(RuntimeError, "hugegraph-core"):
                sdk.validate_distribution(repository, directory, "hubble")

    def test_repository_hashes_and_source_install_are_required(self):
        for scenario in ("wrong_source", "wrong_origin", "missing_parent", "changed_pom", "false_origin"):
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                repository, manifest = self.fixture(root)
                directory = self.distribution(root, repository, manifest)
                pom = repository / "org/apache/hugegraph/hugegraph/1.7.0/hugegraph-1.7.0.pom"
                if scenario == "wrong_source":
                    manifest["commit"] = "0" * 40
                elif scenario == "false_origin":
                    manifest["artifacts"][0]["source_reactor_install"] = "false"
                elif scenario == "wrong_origin":
                    (pom.parent / "_remote.repositories").write_text(pom.name + ">central=\n")
                elif scenario == "changed_pom":
                    pom.write_bytes(b"Central POM")
                else:
                    pom.unlink()
                self.write_manifest(repository, manifest)
                with self.assertRaises(RuntimeError):
                    sdk.validate_distribution(repository, directory, "hubble")

    def test_reactor_installs_do_not_change_the_locked_sdk_contract(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repository, manifest = self.fixture(root)
            outputs = []
            server_dist = repository / "org/apache/hugegraph/hugegraph-dist/1.7.0/hugegraph-dist-1.7.0.jar"
            server_dist.parent.mkdir(parents=True)
            server_dist.write_bytes(b"locked Server distribution")
            manifest["artifacts"].append({"path": str(server_dist.relative_to(repository)),
                                          "sha256": sdk.digest(server_dist), "source_reactor_install": True})
            for artifact, extension in (("hugegraph-toolchain", "pom"),
                                        ("hugegraph-dist", "jar"),
                                        ("hugegraph-client", "jar"),
                                        ("hugegraph-loader", "jar"),
                                        ("hubble-be", "jar")):
                path = repository / "org/apache/hugegraph" / artifact / "1.8.0" / (artifact + "-1.8.0." + extension)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"previous Toolchain output")
                manifest["artifacts"].append({"path": str(path.relative_to(repository)),
                                              "sha256": sdk.digest(path), "source_reactor_install": True})
                outputs.append(path)
            self.write_manifest(repository, manifest)
            directory = self.distribution(root, repository, manifest)
            # The aggregate Toolchain dist JAR is not a module runtime library.
            (directory / "lib/hugegraph-dist-1.8.0.jar").unlink()
            before = (repository / "candidate-sdk-manifest.json").read_bytes()
            for path in outputs:
                # Simulate parent/Client install, then Loader install, then Hubble install.
                path.write_bytes(b"new reactor output after compile")
                if path.suffix == ".jar" and path.name != "hugegraph-dist-1.8.0.jar":
                    shutil.copyfile(path, directory / "lib" / path.name)
                for module in ("loader", "tools", "hubble"):
                    sdk.validate_distribution(repository, directory, module)
            self.assertEqual(before, (repository / "candidate-sdk-manifest.json").read_bytes())
            server_dist.write_bytes(b"overwritten Server distribution")
            with self.assertRaisesRegex(RuntimeError, "SDK artifact hash mismatch"):
                sdk.validate_sdk(repository)
            server_dist.write_bytes(b"locked Server distribution")
            common = repository / "org/apache/hugegraph/hugegraph-common/1.7.0/hugegraph-common-1.7.0.jar"
            common.write_bytes(b"replaced Server SDK input")
            with self.assertRaisesRegex(RuntimeError, "SDK artifact hash mismatch"):
                sdk.validate_distribution(repository, directory, "hubble")

    def test_malformed_manifests_have_controlled_diagnostics(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository, manifest = self.fixture(Path(temporary))
            bad = copy.deepcopy(manifest)
            bad["java_version"] = "not an integer password=secret"
            malformed = ("{", "null", "[]", "{}", json.dumps(bad),
                         json.dumps({**manifest, "required_sdk_modules": None}),
                         json.dumps({**manifest, "artifacts": [None]}))
            for content in malformed:
                with self.subTest(content=content[:20]):
                    (repository / "candidate-sdk-manifest.json").write_text(content)
                    with self.assertRaisesRegex(RuntimeError, "Invalid candidate SDK manifest") as failure:
                        sdk.validate_sdk(repository)
                    self.assertNotIn("secret", str(failure.exception))
            result = subprocess.run(["python3", str(Path(sdk.__file__)), str(repository)],
                                    capture_output=True, text=True, timeout=5)
            self.assertEqual(1, result.returncode)
            self.assertNotIn("Traceback", result.stderr)
            self.assertNotIn("secret", result.stderr)


if __name__ == "__main__":
    unittest.main()
