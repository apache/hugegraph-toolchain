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
"""Keep fixture endpoints/plugins and use the selected server's native serializers."""

import argparse
import json
import pathlib
import re
import zipfile


def serializer_block(text):
    match = re.search(r"(?m)^serializers:[\s\S]*?(?=^[A-Za-z][\w-]*:|\Z)", text)
    if match is None:
        raise ValueError("Gremlin configuration has no serializers block")
    return match.group(0)


def configure(server, fixture):
    source = server / "conf/gremlin-server.yaml"
    block = serializer_block(source.read_text())
    declared = set(re.findall(r"(?:className|builder)\s*:\s*([\w.$]+)", block))
    for registries in re.findall(r"ioRegistries\s*:\s*\[([^]]*)\]", block):
        declared.update(re.findall(r"[\w.$]+", registries))
    if not declared:
        raise ValueError("Gremlin configuration declares no serializer classes")
    available = set()
    jars = sorted((server / "lib").glob("*.jar"))
    for jar in jars:
        with zipfile.ZipFile(jar) as archive:
            available.update(archive.namelist())
    missing = sorted(name for name in declared if name.replace(".", "/") + ".class" not in available)
    if missing:
        raise ValueError("Server configuration refers to unavailable classes: " + ", ".join(missing))
    configured = fixture.read_text().replace(serializer_block(fixture.read_text()), block, 1)
    return configured, {"server": str(server), "native_config": str(source),
                        "fixture": str(fixture), "jar_count": len(jars),
                        "verified_classes": sorted(declared)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("server", type=pathlib.Path)
    parser.add_argument("fixture", type=pathlib.Path)
    parser.add_argument("--json-output", type=pathlib.Path)
    args = parser.parse_args()
    text, report = configure(args.server, args.fixture)
    # Only the extracted fixture is changed. The checkout template stays untouched.
    (args.server / "conf/gremlin-server.yaml").write_text(text)
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(json.dumps(report, indent=2) + "\n")
    print("Verified native serializer classes: " + ", ".join(report["verified_classes"]))


if __name__ == "__main__":
    main()
