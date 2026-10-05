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
"""Verify immutable CI fixture identity and archive bytes with the standard library."""
import hashlib
import json
import os
import pathlib
import re
import sys

if sys.argv[1] == "inputs":
    repo = pathlib.Path(__file__).resolve().parents[3]
    patterns = (
        '.github/actions/setup-hugegraph-server/action.yml',
        '.github/actions/setup-hugegraph-server/fixture.sh',
        '.github/actions/setup-hugegraph-server/manifest.py',
        '.github/actions/setup-java-env/action.yml', '.github/configs/settings.xml',
        'hugegraph-client/assembly/travis/checkout-server.sh',
        'hugegraph-client/assembly/travis/start-hugegraph-servers.sh',
        'hugegraph-*/assembly/travis/install-hugegraph-from-source.sh',
        'hugegraph-hubble/hubble-dist/assembly/travis/download-hugegraph.sh',
    )
    inputs = hashlib.sha256()
    files = sorted({p for pattern in patterns for p in repo.glob(pattern)})
    for path in files:
        inputs.update(str(path.relative_to(repo)).encode() + b"\0" + path.read_bytes())
    print(inputs.hexdigest())
    sys.exit(0)

root = pathlib.Path(os.environ["FIXTURE_DIR"])
identity = {key.lower(): os.environ["FIXTURE_" + key] for key in
            ("REPOSITORY", "COMMIT", "JAVA", "CONFIG")}
def digest():
    h = hashlib.sha256()
    with (root / "server.tar.gz").open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()
try:
    if sys.argv[1] == "create":
        data = dict(identity, archive_name=os.environ["FIXTURE_ARCHIVE_NAME"], sha256=digest())
        (root / "manifest.json").write_text(json.dumps(data, sort_keys=True) + "\n")
    else:
        if (root / "manifest.json").is_symlink() or (root / "server.tar.gz").is_symlink():
            raise ValueError("fixture must contain regular files")
        data = json.loads((root / "manifest.json").read_text())
        if any(data.get(key) != value for key, value in identity.items()):
            raise ValueError("fixture origin, commit, JDK or build configuration mismatch")
        if not re.fullmatch(r"apache-hugegraph-[A-Za-z0-9_.-]+\.tar\.gz", data.get("archive_name", "")):
            raise ValueError("invalid archive name")
        if data.get("sha256") != digest():
            raise ValueError("fixture checksum mismatch")
        if sys.argv[1] == "name":
            print(data["archive_name"])
except (OSError, ValueError, KeyError) as error:
    sys.exit(str(error))
