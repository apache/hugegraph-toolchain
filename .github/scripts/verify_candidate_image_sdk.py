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
"""Validate the locked SDK and the actual libraries in a candidate distribution."""

import argparse
import hashlib
import json
from pathlib import Path

REPOSITORY = "apache/hugegraph"
COMMIT = "d9abcd4317fb36128e7e4d209139ec7f3a28cdfc"
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


def validate_sdk(repository):
    try:
        return _validate_sdk(Path(repository))
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        raise RuntimeError("Invalid candidate SDK manifest or artifact metadata (" +
                           type(error).__name__ + ")") from None


def _validate_sdk(repository):
    repository = Path(repository)
    manifest = json.loads((repository / "candidate-sdk-manifest.json").read_text())
    if (manifest["repository"], manifest["commit"]) != (REPOSITORY, COMMIT):
        raise RuntimeError("SDK source does not match the locked candidate")
    if manifest["source_revision"] != "1.7.0" or int(manifest["java_version"]) < 17:
        raise RuntimeError("SDK revision or Java version does not match the candidate contract")
    modules = manifest["required_sdk_modules"]
    if len(modules) != len(REQUIRED_MODULES) or {m["source_pom"] for m in modules} != REQUIRED_MODULES:
        raise RuntimeError("Missing or duplicate required same-source SDK module")
    artifacts = {a["path"]: a for a in manifest["artifacts"]}
    if len(artifacts) != len(manifest["artifacts"]):
        raise RuntimeError("Duplicate SDK artifact paths")
    required_files = set()
    for module in modules:
        if module["group_id"] != "org.apache.hugegraph" or module["version"] != "1.7.0":
            raise RuntimeError("Unexpected required SDK coordinates")
        artifact = module["artifact_id"]
        source_pom = module["source_pom"]
        expected_artifact = Path(source_pom).parent.name if source_pom != "pom.xml" else "hugegraph"
        parent = source_pom in {"pom.xml", "hugegraph-commons/pom.xml", "hugegraph-server/pom.xml",
                                "hugegraph-pd/pom.xml", "hugegraph-store/pom.xml"}
        if artifact != expected_artifact or module["packaging"] != ("pom" if parent else "jar"):
            raise RuntimeError("Required SDK module does not match its source coordinates")
        extensions = {"pom", "jar"} if module["packaging"] == "jar" else {"pom"}
        expected = {f"org/apache/hugegraph/{artifact}/1.7.0/{artifact}-1.7.0.{ext}"
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
        # Server and Toolchain share the hugegraph-dist name at different revisions.
        if parts[3] in TOOLCHAIN_ARTIFACTS and (parts[3] != "hugegraph-dist" or
                                              parts[4] != manifest["source_revision"]):
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


def validate_distribution(repository, directory, module):
    manifest, expected = validate_sdk(repository)
    directory = Path(directory)
    try:
        packaged = json.loads((directory / "candidate-sdk-manifest.json").read_text())
    except (OSError, ValueError) as error:
        raise RuntimeError("Missing or invalid packaged SDK manifest (" +
                           type(error).__name__ + ")") from None
    if packaged != manifest:
        raise RuntimeError("Packaged SDK manifest differs from the build repository")
    required = {"hugegraph-common", "hg-pd-client", "hg-pd-grpc"}
    if module == "hubble":
        required.add("hugegraph-core")
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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repository", type=Path)
    parser.add_argument("--distribution", type=Path)
    parser.add_argument("--module", choices=("loader", "tools", "hubble"))
    args = parser.parse_args()
    if bool(args.distribution) != bool(args.module):
        parser.error("--distribution and --module must be used together")
    try:
        manifest, jars = validate_sdk(args.repository)
        if args.distribution:
            validate_distribution(args.repository, args.distribution, args.module)
    except RuntimeError as error:
        parser.exit(1, str(error) + "\n")
    print(f"Verified {manifest['repository']}@{manifest['commit']}: {len(jars)} candidate JARs")
