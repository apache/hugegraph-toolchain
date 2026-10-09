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
"""Validate SDK libraries against a locked candidate or the release Maven repository."""

import argparse
import hashlib
import json
import os
import re
import shlex
import xml.etree.ElementTree as ET
from pathlib import Path

REPOSITORY = "apache/hugegraph"
COMMIT = "68855199031d5801edb4fe41b2bacbacffe8fe68"
REQUIRED_MODULES = {
    "pom.xml", "hugegraph-commons/pom.xml", "hugegraph-server/pom.xml",
    "hugegraph-pd/pom.xml", "hugegraph-store/pom.xml",
    "hugegraph-commons/hugegraph-common/pom.xml",
    "hugegraph-server/hugegraph-core/pom.xml", "hugegraph-struct/pom.xml",
    "hugegraph-pd/hg-pd-common/pom.xml", "hugegraph-pd/hg-pd-client/pom.xml",
    "hugegraph-pd/hg-pd-grpc/pom.xml", "hugegraph-store/hg-store-common/pom.xml",
    "hugegraph-store/hg-store-client/pom.xml", "hugegraph-store/hg-store-grpc/pom.xml",
}


# These artifacts are outputs of this repository, not inputs from the locked Server SDK.
# Older retained manifests may include them because they described a shared Maven cache.
TOOLCHAIN_ARTIFACTS = {
    "hugegraph-toolchain", "hugegraph-client", "hugegraph-loader", "hugegraph-tools",
    "hugegraph-spark-connector", "hugegraph-hubble", "hugegraph-dist", "hubble-be", "hubble-fe", "hubble-dist",
}


def digest(path):
    checksum = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def source_commit():
    # The SDK action exports the full identity already verified by the source resolver.
    expected = os.environ.get("CANDIDATE_SOURCE_COMMIT", COMMIT)
    if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{40}", expected):
        raise ValueError("Invalid resolved Server source identity")
    return expected


def validate_sdk(repository, expected_revision=None):
    try:
        return _validate_sdk(Path(repository), expected_revision)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        raise RuntimeError("Invalid candidate SDK manifest or artifact metadata (" +
                           type(error).__name__ + ")") from None


def _validate_sdk(repository, expected_revision=None):
    repository = Path(repository)
    manifest = json.loads((repository / "candidate-sdk-manifest.json").read_text())
    if (manifest["repository"], manifest["commit"]) != (REPOSITORY, source_commit()):
        raise RuntimeError("SDK source does not match the locked candidate")
    java_version = manifest["java_version"]
    if not isinstance(java_version, str) or not java_version.isdecimal():
        raise ValueError("Invalid Java version format")
    revision = expected_revision or os.environ.get("CANDIDATE_SDK_VERSION", "1.8.0")
    if not isinstance(revision, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.+-]*", revision):
        raise ValueError("Invalid candidate SDK version")
    if manifest["source_revision"] != revision or java_version != "17":
        raise RuntimeError("SDK revision or Java version does not match the candidate contract")
    modules = manifest["required_sdk_modules"]
    if len(modules) != len(REQUIRED_MODULES) or {m["source_pom"] for m in modules} != REQUIRED_MODULES:
        raise RuntimeError("Missing or duplicate required same-source SDK module")
    artifacts = {a["path"]: a for a in manifest["artifacts"]}
    if len(artifacts) != len(manifest["artifacts"]):
        raise RuntimeError("Duplicate SDK artifact paths")
    required_files = set()
    for module in modules:
        if module["group_id"] != "org.apache.hugegraph" or module["version"] != revision:
            raise RuntimeError("Unexpected required SDK coordinates")
        artifact = module["artifact_id"]
        source_pom = module["source_pom"]
        expected_artifact = Path(source_pom).parent.name if source_pom != "pom.xml" else "hugegraph"
        parent = source_pom in {"pom.xml", "hugegraph-commons/pom.xml", "hugegraph-server/pom.xml",
                                "hugegraph-pd/pom.xml", "hugegraph-store/pom.xml"}
        if artifact != expected_artifact or module["packaging"] != ("pom" if parent else "jar"):
            raise RuntimeError("Required SDK module does not match its source coordinates")
        extensions = {"pom", "jar"} if module["packaging"] == "jar" else {"pom"}
        expected = {f"org/apache/hugegraph/{artifact}/{revision}/{artifact}-{revision}.{ext}"
                    for ext in extensions}
        if set(module["files"]) != expected:
            raise RuntimeError("Required SDK module has missing or unexpected files")
        required_files.update(expected)
    jars = {}
    for relative, item in artifacts.items():
        parts = Path(relative).parts
        if (Path(relative).is_absolute() or ".." in parts or len(parts) != 6 or
                parts[:3] != ("org", "apache", "hugegraph")):
            raise RuntimeError(f"Invalid SDK artifact path: {relative}")
        # Server and Toolchain also share hugegraph-dist at the same 1.8.0 coordinates.
        # None of these reactor outputs is a required consumer SDK input.
        if parts[3] in TOOLCHAIN_ARTIFACTS:
            continue
        path = repository / relative
        if not path.is_file() or not path.resolve().is_relative_to(repository.resolve()):
            raise RuntimeError(f"Invalid SDK artifact path: {relative}")
        if digest(path) != item["sha256"]:
            raise RuntimeError(f"SDK artifact hash mismatch: {relative}")
        origins = path.parent / "_remote.repositories"
        installed = origins.is_file() and f"{path.name}>=" in origins.read_text().splitlines()
        if relative in required_files and (item["source_reactor_install"] is not True or not installed):
            raise RuntimeError(f"Required SDK artifact was not installed from source: {relative}")
        if path.suffix == ".jar" and item["source_reactor_install"] is True:
            if path.name in jars:
                raise RuntimeError(f"Duplicate candidate JAR name: {path.name}")
            jars[path.name] = item["sha256"]
    if not required_files.issubset(artifacts):
        raise RuntimeError("Required SDK artifact is absent from the manifest")
    return manifest, jars


def validate_distribution(repository, directory, module, expected_revision=None):
    manifest, expected = validate_sdk(repository, expected_revision)
    directory = Path(directory)
    try:
        packaged = json.loads((directory / "candidate-sdk-manifest.json").read_text())
    except (OSError, ValueError) as error:
        raise RuntimeError("Missing or invalid packaged SDK manifest (" +
                           type(error).__name__ + ")") from None
    if packaged != manifest:
        raise RuntimeError("Packaged SDK manifest differs from the build repository")
    required = required_libraries(module)
    actual = {}
    # Check only distribution libraries, never runtime data or user plugins.
    for path in (directory / "lib").glob("*.jar"):
        if path.name.startswith(("hugegraph-client-", "hugegraph-loader-", "hugegraph-tools-")):
            continue
        if not path.name.startswith(("hugegraph-", "hg-")):
            continue
        if path.is_symlink() or path.name not in expected or digest(path) != expected[path.name]:
            raise RuntimeError("Unexpected or changed packaged SDK library: " + path.name)
        actual[path.name] = expected[path.name]
    for artifact in required:
        matches = [name for name in actual if name.startswith(artifact + "-")]
        if len(matches) != 1:
            raise RuntimeError("Missing or ambiguous packaged SDK library: " + artifact)
    return actual


def configure_upstream(repository, environment):
    """Select consumer coordinates only after verifying this run's SDK artifacts."""
    repository = Path(repository)
    try:
        revision = json.loads((repository / "candidate-sdk-manifest.json").read_text())["source_revision"]
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise RuntimeError("Invalid candidate SDK manifest (" + type(error).__name__ + ")") from None
    manifest, jars = validate_sdk(repository, revision)
    with Path(environment).open("a") as stream:
        stream.write(f"CANDIDATE_SOURCE_COMMIT={manifest['commit']}\n")
        stream.write(f"CANDIDATE_SDK_VERSION={revision}\n")
        for variable in ("MAVEN_OPTS", "MAVEN_ARGS"):
            arguments = shlex.split(os.environ.get(variable, ""))
            properties = ("-Dmaven.repo.local=", "-Dhugegraph.version=", "-Dsdk.validation.mode=")
            arguments = [argument for argument in arguments if not argument.startswith(properties)]
            arguments.extend((f"-Dmaven.repo.local={repository.absolute()}",
                              f"-Dhugegraph.version={revision}", "-Dsdk.validation.mode=candidate"))
            stream.write(f"{variable}={shlex.join(arguments)}\n")
    return manifest, jars


def required_libraries(module):
    required = {"hugegraph-common", "hg-pd-common", "hg-pd-client", "hg-pd-grpc"}
    if module == "hubble":
        required.add("hugegraph-core")
    return required


def release_artifact(repository, artifact, version):
    directory = repository / "org/apache/hugegraph" / artifact / version
    paths = [directory / f"{artifact}-{version}.{extension}" for extension in ("pom", "jar")]
    for path in paths:
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(repository.resolve()):
            raise RuntimeError("Missing or invalid release SDK artifact: " + path.name)
    try:
        pom = ET.parse(paths[0]).getroot()
        namespace = "{http://maven.apache.org/POM/4.0.0}"
        group = pom.findtext(namespace + "groupId") or pom.findtext(namespace + "parent/" + namespace + "groupId")
        revision = pom.findtext(namespace + "version") or pom.findtext(namespace + "parent/" + namespace + "version")
        if (group, pom.findtext(namespace + "artifactId"), revision) != ("org.apache.hugegraph", artifact, version):
            raise RuntimeError("Unexpected release SDK POM coordinates: " + paths[0].name)
    except (OSError, ET.ParseError):
        raise RuntimeError("Invalid release SDK POM: " + paths[0].name) from None
    return digest(paths[1])


def validate_release_sdk(repository, version, directory=None, module=None):
    """Check the explicitly selected SDK version and bytes, without approving a release."""
    repository = Path(repository)
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        raise RuntimeError("Release SDK validation requires a concrete non-SNAPSHOT version")
    if (repository / "candidate-sdk-manifest.json").exists():
        raise RuntimeError("Candidate SDK manifest is not allowed in a release repository")
    required = required_libraries(module)
    expected = {f"{artifact}-{version}.jar": release_artifact(repository, artifact, version)
                for artifact in required}
    if directory is None:
        return expected
    directory = Path(directory)
    if (directory / "candidate-sdk-manifest.json").exists():
        raise RuntimeError("Candidate SDK manifest is not allowed in a release distribution")
    library = directory / "lib"
    if library.is_symlink() or not library.is_dir():
        raise RuntimeError("Missing or invalid release SDK library directory")
    actual = {}
    for path in library.glob("*.jar"):
        if path.name.startswith(("hugegraph-client-", "hugegraph-loader-", "hugegraph-tools-")):
            continue
        if not path.name.startswith(("hugegraph-", "hg-")):
            continue
        if (path.is_symlink() or not path.resolve().is_relative_to(directory.resolve()) or
                not path.name.endswith(f"-{version}.jar")):
            raise RuntimeError("Unexpected release SDK library version: " + path.name)
        artifact = path.name[:-len(f"-{version}.jar")]
        expected_hash = release_artifact(repository, artifact, version)
        if digest(path) != expected_hash:
            raise RuntimeError("Changed packaged release SDK library: " + path.name)
        actual[path.name] = expected_hash
    for name in expected:
        if name not in actual:
            raise RuntimeError("Missing packaged release SDK library: " + name)
    return actual


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repository", type=Path)
    parser.add_argument("--distribution", type=Path)
    parser.add_argument("--configure-upstream-env", type=Path)
    parser.add_argument("--module", choices=("loader", "tools", "hubble"))
    parser.add_argument("--mode", choices=("candidate", "release"), default="candidate")
    parser.add_argument("--version", help="Expected release SDK version (required in release mode)")
    args = parser.parse_args()
    if bool(args.distribution) != bool(args.module):
        parser.error("--distribution and --module must be used together")
    if args.configure_upstream_env and args.distribution:
        parser.error("--configure-upstream-env cannot be combined with --distribution")
    if args.configure_upstream_env and args.mode != "candidate":
        parser.error("--configure-upstream-env requires candidate mode")
    if args.mode == "release" and not args.version:
        parser.error("--version is required in release mode")
    try:
        if args.mode == "release":
            jars = validate_release_sdk(args.repository, args.version, args.distribution, args.module)
            identity = "release SDK " + args.version
        else:
            if args.configure_upstream_env:
                manifest, jars = configure_upstream(args.repository, args.configure_upstream_env)
            else:
                manifest, jars = validate_sdk(args.repository, args.version)
            if args.distribution:
                validate_distribution(args.repository, args.distribution, args.module, args.version)
            identity = f"{manifest['repository']}@{manifest['commit'][:6]}"
    except RuntimeError as error:
        parser.exit(1, str(error) + "\n")
    print(f"Verified {identity}: {len(jars)} SDK JARs")
