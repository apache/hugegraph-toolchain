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
from unittest.mock import patch
from pathlib import Path
import shutil
import subprocess
import tempfile
import textwrap
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
                       '<version>1.3.0</version><configuration><updatePomFile>true</updatePomFile>'
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
                    return subprocess.run([maven, "--settings", str(settings),
                                           "-Dmaven.repo.local=" + str(root / "m2"), "-B", "-ntp", *arguments],
                                          cwd=source, capture_output=True, text=True, timeout=240)

                goals = (["org.codehaus.mojo:flatten-maven-plugin:1.3.0:flatten", "install",
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

    @unittest.skipUnless(os.environ.get("CANDIDATE_SDK_MAVEN_TEST"),
                         "Set CANDIDATE_SDK_MAVEN_TEST for the consumer-version regression")
    def test_maven_consumers_resolve_the_selected_sdk_version(self):
        # A floating SDK changes coordinates; the consumer's fixed default must
        # not silently resolve a different release from another repository.
        import zipfile
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            group = "org.example.candidatesdk.g" + uuid.uuid4().hex
            repository = Path.home() / ".m2/repository" / group.replace(".", "/")
            self.addCleanup(shutil.rmtree, repository, True)
            artifact = repository / "sdk/1.8.0"
            artifact.mkdir(parents=True)
            header = '<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>'
            (artifact / "sdk-1.8.0.pom").write_text(
                header + '<groupId>' + group + '</groupId><artifactId>sdk</artifactId>'
                '<version>1.8.0</version></project>')
            with zipfile.ZipFile(artifact / "sdk-1.8.0.jar", "w") as jar:
                jar.writestr("sdk-source.txt", "selected upstream revision")
            (artifact / "_remote.repositories").write_text("sdk-1.8.0.pom>=\nsdk-1.8.0.jar>=\n")
            pom = root / "pom.xml"
            pom.write_text(header + '<groupId>org.example.consumer</groupId><artifactId>consumer</artifactId>'
                           '<version>1</version><properties><hugegraph.version>1.7.0</hugegraph.version>'
                           '</properties><dependencies><dependency><groupId>' + group + '</groupId>'
                           '<artifactId>sdk</artifactId><version>${hugegraph.version}</version></dependency>'
                           '</dependencies></project>')
            settings = root / "settings.xml"
            settings.write_text("<settings/>")
            command = [os.environ["CANDIDATE_SDK_MAVEN_TEST"], "-o", "-ntp", "--settings", str(settings),
                       "-f", str(pom), "org.apache.maven.plugins:maven-dependency-plugin:3.1.1:build-classpath",
                       "-Dmdep.outputFile=" + str(root / "classpath")]
            env = dict(os.environ, MAVEN_ARGS="-Dhugegraph.version=1.8.0")
            # Warm only Maven's public plugin dependencies when this opt-in
            # regression runs on a fresh machine; coordinate checks stay offline.
            prepared = subprocess.run([arg for arg in command if arg != "-o"], env=env,
                                      capture_output=True, text=True, timeout=90)
            self.assertEqual(0, prepared.returncode, prepared.stdout + prepared.stderr)
            (root / "classpath").unlink()
            env["MAVEN_ARGS"] = ""
            wrong = subprocess.run(command, env=env, capture_output=True, text=True, timeout=90)
            self.assertNotEqual(0, wrong.returncode, wrong.stdout + wrong.stderr)
            self.assertIn(group + ":sdk:jar:1.7.0", wrong.stdout + wrong.stderr)
            env["MAVEN_ARGS"] = "-Dhugegraph.version=1.8.0"
            selected = subprocess.run(command, env=env, capture_output=True, text=True, timeout=90)
            self.assertEqual(0, selected.returncode, selected.stdout + selected.stderr)
            self.assertEqual(str(artifact / "sdk-1.8.0.jar"), (root / "classpath").read_text().strip())


class CandidateDistributionTest(unittest.TestCase):
    def setUp(self):
        self.source_commit = sdk.COMMIT
        context = patch.dict(os.environ, {"CANDIDATE_SOURCE_COMMIT": self.source_commit})
        context.start()
        self.addCleanup(context.stop)

    def fixture(self, root, revision="1.7.0"):
        repository = root / "m2"
        artifacts, modules = [], []
        for source_pom in sorted(sdk.REQUIRED_MODULES):
            artifact = Path(source_pom).parent.name if source_pom != "pom.xml" else "hugegraph"
            packaging = "pom" if (source_pom.count("/") == 1 and artifact != "hugegraph-struct") or source_pom == "pom.xml" else "jar"
            files = []
            for extension in (["pom", "jar"] if packaging == "jar" else ["pom"]):
                filename = artifact + "-" + revision + "." + extension
                path = repository / "org/apache/hugegraph" / artifact / revision / filename
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(filename.encode())
                with (path.parent / "_remote.repositories").open("a") as origins:
                    origins.write(filename + ">=\n")
                relative = str(path.relative_to(repository))
                files.append(relative)
                artifacts.append({"path": relative, "sha256": sdk.digest(path), "source_reactor_install": True})
            modules.append({"group_id": "org.apache.hugegraph", "artifact_id": artifact,
                            "version": revision, "packaging": packaging,
                            "source_pom": source_pom, "files": files})
        manifest = {"repository": sdk.REPOSITORY, "commit": self.source_commit,
                    "source_revision": revision, "java_version": "17",
                    "required_sdk_modules": modules, "artifacts": artifacts}
        self.write_manifest(repository, manifest)
        return repository, manifest

    def test_floating_sdk_version_preserves_verified_coordinates_and_maven_arguments(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repository, manifest = self.fixture(root, "1.8.0")
            environment = root / "github-env"
            # Fixed-baseline validation must still reject the newer revision.
            with self.assertRaises(RuntimeError):
                sdk.validate_sdk(repository)
            original = "--settings settings.xml -Dmaven.repo.local=" + str(repository)
            with patch.dict(os.environ, {"MAVEN_ARGS": original}):
                sdk.configure_upstream(repository, environment)
            lines = dict(line.split("=", 1) for line in environment.read_text().splitlines())
            self.assertEqual("1.8.0", lines["CANDIDATE_SDK_VERSION"])
            self.assertEqual(original + " -Dhugegraph.version=1.8.0", lines["MAVEN_ARGS"])
            with patch.dict(os.environ, lines):
                sdk.validate_sdk(repository)
                distribution = self.distribution(root, repository, manifest)
                sdk.validate_distribution(repository, distribution, "loader")
                # Hash checks must remain enforced for the floating version.
                jar = repository / next(a["path"] for a in manifest["artifacts"]
                                        if a["path"].endswith(".jar"))
                jar.write_bytes(b"changed SDK")
                with self.assertRaises(RuntimeError):
                    sdk.validate_sdk(repository)
            with self.assertRaises(RuntimeError):
                sdk.configure_upstream(repository, root / "invalid-env")
            self.assertFalse((root / "invalid-env").exists())

    def test_configuration_and_distribution_cli_options_are_separate_steps(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repository, manifest = self.fixture(root, "1.8.0")
            distribution = self.distribution(root, repository, manifest)
            environment = root / "github-env"
            result = subprocess.run(["python3", sdk.__file__, str(repository),
                                     "--configure-upstream-env", str(environment),
                                     "--distribution", str(distribution), "--module", "loader"],
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(2, result.returncode)
            self.assertIn("cannot be combined", result.stderr)
            self.assertFalse(environment.exists())

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

    def test_source_context_preserves_full_identity_checks(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository, manifest = self.fixture(Path(temporary))
            manifest["commit"] = sdk.COMMIT[:6] + "b" * 34
            self.write_manifest(repository, manifest)
            with self.assertRaisesRegex(RuntimeError, "SDK source does not match"):
                sdk.validate_sdk(repository)
            with patch.dict(os.environ, {"CANDIDATE_SOURCE_COMMIT": sdk.COMMIT[:6]}):
                with self.assertRaisesRegex(RuntimeError, "Invalid candidate SDK manifest"):
                    sdk.validate_sdk(repository)

    def test_explicit_resolved_context_supports_latest_master_provenance(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository, manifest = self.fixture(Path(temporary))
            selected = "b" * 40
            manifest["commit"] = selected
            self.write_manifest(repository, manifest)
            with patch.dict(os.environ, {"CANDIDATE_SOURCE_COMMIT": selected}):
                sdk.validate_sdk(repository)
            with self.assertRaisesRegex(RuntimeError, "SDK source does not match"):
                sdk.validate_sdk(repository)

    def test_standalone_packaging_uses_the_local_lock(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository, _ = self.fixture(Path(temporary))
            with patch.dict(os.environ, {}, clear=True):
                sdk.validate_sdk(repository)

    def test_candidate_manifest_requires_the_supported_build_jdk(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository, manifest = self.fixture(Path(temporary))
            for version in ("11", "18", "21"):
                with self.subTest(version=version):
                    manifest["java_version"] = version
                    self.write_manifest(repository, manifest)
                    with self.assertRaisesRegex(RuntimeError, "Java version"):
                        sdk.validate_sdk(repository)
            for version in (17.9, 17, True, "17.0"):
                with self.subTest(version=version):
                    manifest["java_version"] = version
                    self.write_manifest(repository, manifest)
                    with self.assertRaisesRegex(RuntimeError, "Invalid candidate SDK manifest"):
                        sdk.validate_sdk(repository)
            manifest["java_version"] = "17"
            self.write_manifest(repository, manifest)
            sdk.validate_sdk(repository)

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


class ReleaseDistributionTest(unittest.TestCase):
    def fixture(self, root, version="1.8.0"):
        repository, directory = root / "m2", root / "distribution"
        library = directory / "lib"
        library.mkdir(parents=True)
        for artifact in ("hugegraph-common", "hg-pd-common", "hg-pd-client", "hg-pd-grpc", "hugegraph-core"):
            parent = repository / "org/apache/hugegraph" / artifact / version
            parent.mkdir(parents=True)
            pom = ('<project xmlns="http://maven.apache.org/POM/4.0.0"><parent>'
                   '<groupId>org.apache.hugegraph</groupId><artifactId>hugegraph</artifactId>'
                   '<version>' + version + '</version></parent><artifactId>' + artifact + '</artifactId></project>')
            (parent / (artifact + "-" + version + ".pom")).write_text(pom)
            jar = parent / (artifact + "-" + version + ".jar")
            jar.write_bytes(artifact.encode())
            shutil.copyfile(jar, library / jar.name)
        (library / "hugegraph-client-1.8.0.jar").write_bytes(b"Toolchain output")
        return repository, directory

    def test_release_uses_exact_maven_artifacts_without_a_candidate_manifest(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository, directory = self.fixture(Path(temporary))
            for module in ("loader", "tools", "hubble"):
                self.assertEqual(5, len(sdk.validate_release_sdk(repository, "1.8.0", directory, module)))
            command = ["python3", str(Path(sdk.__file__)), str(repository), "--mode", "release",
                       "--version", "1.8.0", "--distribution", str(directory), "--module", "hubble"]
            result = subprocess.run(command, capture_output=True, text=True, timeout=5)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertIn("release SDK 1.8.0", result.stdout)

    def test_release_rejects_missing_mixed_and_replaced_sdk_inputs(self):
        scenarios = ("missing_jar", "missing_pom", "missing_library", "mixed_version", "duplicate_version",
                     "replaced_library", "stale_repo_manifest", "stale_package_manifest", "wrong_pom_version",
                     "invalid_pom", "repository_symlink", "package_symlink", "library_directory_symlink")
        for scenario in scenarios:
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                repository, directory = self.fixture(root)
                common = repository / "org/apache/hugegraph/hugegraph-common/1.8.0/hugegraph-common-1.8.0.jar"
                packaged = directory / "lib" / common.name
                pom = common.with_suffix(".pom")
                if scenario == "missing_jar":
                    common.unlink()
                elif scenario == "missing_pom":
                    pom.unlink()
                elif scenario == "missing_library":
                    packaged.unlink()
                elif scenario in ("mixed_version", "duplicate_version"):
                    old = packaged.with_name("hugegraph-common-1.7.0.jar")
                    shutil.copyfile(packaged, old)
                    if scenario == "mixed_version":
                        packaged.unlink()
                elif scenario == "replaced_library":
                    packaged.write_bytes(b"Other repository's same GAV")
                elif scenario in ("stale_repo_manifest", "stale_package_manifest"):
                    target = repository if scenario == "stale_repo_manifest" else directory
                    (target / "candidate-sdk-manifest.json").write_text("{}")
                elif scenario == "wrong_pom_version":
                    pom.write_text(pom.read_text().replace("1.8.0", "1.7.0"))
                elif scenario == "invalid_pom":
                    pom.write_text("<project>")
                elif scenario == "repository_symlink":
                    common.unlink()
                    common.symlink_to(packaged)
                elif scenario == "library_directory_symlink":
                    external = root / "external-library"
                    (directory / "lib").rename(external)
                    (directory / "lib").symlink_to(external, target_is_directory=True)
                else:
                    packaged.unlink()
                    packaged.symlink_to(common)
                with self.assertRaises(RuntimeError):
                    sdk.validate_release_sdk(repository, "1.8.0", directory, "loader")

    def test_release_hubble_requires_core_but_loader_does_not(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository, directory = self.fixture(Path(temporary))
            (directory / "lib/hugegraph-core-1.8.0.jar").unlink()
            sdk.validate_release_sdk(repository, "1.8.0", directory, "loader")
            with self.assertRaisesRegex(RuntimeError, "hugegraph-core"):
                sdk.validate_release_sdk(repository, "1.8.0", directory, "hubble")

    def test_release_requires_transitive_pd_common_library(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository, directory = self.fixture(Path(temporary))
            (directory / "lib/hg-pd-common-1.8.0.jar").unlink()
            for module in ("loader", "tools", "hubble"):
                with self.subTest(module=module), self.assertRaisesRegex(RuntimeError, "hg-pd-common"):
                    sdk.validate_release_sdk(repository, "1.8.0", directory, module)

    def test_sdk_rejects_unresolved_and_unspecified_versions(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository, directory = self.fixture(Path(temporary))
            with self.assertRaisesRegex(RuntimeError, "concrete release or SNAPSHOT version"):
                sdk.validate_release_sdk(repository, "${revision}", directory, "loader")
            result = subprocess.run(["python3", str(Path(sdk.__file__)), str(repository), "--mode", "release"],
                                    capture_output=True, text=True, timeout=5)
            self.assertNotEqual(0, result.returncode)
            self.assertIn("--version is required", result.stderr)

    def test_explicit_source_snapshot_requires_matching_version_and_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            repository, directory = self.fixture(Path(temporary), "1.9.0-SNAPSHOT")
            self.assertEqual(5, len(sdk.validate_release_sdk(repository, "1.9.0-SNAPSHOT", directory,
                                                            "hubble")))
            with self.assertRaisesRegex(RuntimeError, "Missing or invalid"):
                sdk.validate_release_sdk(repository, "1.9.0", directory, "hubble")
            command = ["python3", str(Path(sdk.__file__)), str(repository), "--mode", "release",
                       "--version", "1.9.0-SNAPSHOT", "--distribution", str(directory), "--module", "hubble"]
            result = subprocess.run(command, capture_output=True, text=True, timeout=5)
            self.assertEqual(0, result.returncode, result.stderr)
            (directory / "lib/hugegraph-common-1.9.0-SNAPSHOT.jar").write_bytes(b"Replaced source SDK")
            with self.assertRaisesRegex(RuntimeError, "Changed packaged"):
                sdk.validate_release_sdk(repository, "1.9.0-SNAPSHOT", directory, "hubble")


class SDKActionTest(unittest.TestCase):
    def run_action(self, root, mode, revision, corrupt_candidate=False):
        fixture = root / "fixture"
        if revision == "1.7.0":
            candidate = CandidateDistributionTest()
            candidate.source_commit = sdk.COMMIT
            repository, manifest = candidate.fixture(fixture)
            if corrupt_candidate:
                manifest["commit"] = "0" * 40
                candidate.write_manifest(repository, manifest)
        else:
            repository, _ = ReleaseDistributionTest().fixture(fixture, revision)
            (repository / "candidate-sdk-manifest.json").write_text(json.dumps({"source_revision": revision}))
        workspace = root / "workspace"
        installer = workspace / "hugegraph-client/assembly/travis/install-candidate-sdk.sh"
        installer.parent.mkdir(parents=True)
        installer.write_text('#!/bin/bash\nset -euo pipefail\n'
                             'cp -R "$SDK_FIXTURE/." "$3/"\n'
                             'mkdir -p "$2/hugegraph-server"\n'
                             'printf archive > "$2/hugegraph-server/apache-hugegraph-fixture.tar.gz"\n')
        verifier = workspace / ".github/scripts/verify_candidate_image_sdk.py"
        verifier.parent.mkdir(parents=True)
        shutil.copyfile(sdk.__file__, verifier)
        runner = root / "runner"
        runner.mkdir()
        home = root / "home"
        home.mkdir()
        environment, output = root / "env", root / "output"
        action = (Path(__file__).resolve().parents[2] / ".github/actions/setup-candidate-sdk/action.yml").read_text()
        script = textwrap.dedent(action.split("      run: |\n", 1)[1].split("\n    - name:", 1)[0])
        env = dict(os.environ, HOME=str(home), RUNNER_TEMP=str(runner), GITHUB_WORKSPACE=str(workspace),
                   GITHUB_ENV=str(environment), GITHUB_OUTPUT=str(output), SDK_FIXTURE=str(repository),
                   SDK_VALIDATION_MODE=mode, SERVER_COMMIT=sdk.COMMIT, SERVER_REPOSITORY=sdk.REPOSITORY,
                   SERVER_FETCH_REF=sdk.COMMIT, MAVEN_OPTS="-Xmx1g", MAVEN_ARGS="-ntp --settings settings.xml")
        result = subprocess.run(["bash", "-c", script], env=env, capture_output=True, text=True, timeout=10)
        variables = dict(line.split("=", 1) for line in environment.read_text().splitlines()) if environment.exists() else {}
        outputs = dict(line.split("=", 1) for line in output.read_text().splitlines()) if output.exists() else {}
        return result, variables, outputs

    def test_action_selects_actual_version_and_retains_provenance(self):
        for mode, revision in (("candidate", "1.7.0"), ("release", "1.8.0"), ("release", "1.9.0-SNAPSHOT")):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as temporary:
                result, variables, outputs = self.run_action(Path(temporary), mode, revision)
                self.assertEqual(0, result.returncode, result.stdout + result.stderr)
                for key in ("MAVEN_ARGS", "MAVEN_OPTS"):
                    self.assertIn("-Dmaven.repo.local=" + outputs["maven-repo"], variables[key])
                    self.assertIn("-Dhugegraph.version=" + revision, variables[key])
                    self.assertIn("-Dsdk.validation.mode=" + mode, variables[key])
                manifest = Path(outputs["manifest"])
                self.assertTrue(manifest.is_file())
                self.assertEqual(revision, json.loads(manifest.read_text())["source_revision"])
                packaged_manifest = Path(outputs["maven-repo"]) / "candidate-sdk-manifest.json"
                self.assertEqual(mode == "candidate", packaged_manifest.exists())
                self.assertEqual(mode == "candidate", manifest.parent == Path(outputs["maven-repo"]))

    def test_action_rejects_wrong_mode_revision_and_source(self):
        for mode, revision, corrupt in (("invalid", "1.7.0", False), ("candidate", "1.8.0", False),
                                        ("release", "${revision}", False), ("candidate", "1.7.0-SNAPSHOT", False),
                                        ("candidate", "1.7.0", True)):
            with self.subTest(mode=mode, revision=revision, corrupt=corrupt), tempfile.TemporaryDirectory() as temporary:
                result, variables, _ = self.run_action(Path(temporary), mode, revision, corrupt)
                self.assertNotEqual(0, result.returncode)
                self.assertEqual({}, variables)


if __name__ == "__main__":
    unittest.main()
