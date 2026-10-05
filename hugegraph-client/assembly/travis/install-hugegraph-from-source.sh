#!/bin/bash
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
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 || ( $# -eq 2 && "$2" != "--build-only" ) ]]; then
    echo "Usage: install-hugegraph-from-source.sh <commit SHA> [--build-only]" >&2
    exit 1
fi

if [[ "${FIXTURE_MODE:-standalone}" == start ]]; then
    FIXTURE_COMMIT=$1
    ROOT_DIR=$(cd "$(dirname "$0")/../../.." && pwd)
    source "$ROOT_DIR/.github/actions/setup-hugegraph-server/fixture.sh"
    ARCHIVE=$(python3 "$ROOT_DIR/.github/actions/setup-hugegraph-server/manifest.py" name)
    exec bash "$ROOT_DIR/hugegraph-client/assembly/travis/start-hugegraph-servers.sh" "$ARCHIVE"
fi
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
bash "$SCRIPT_DIR/checkout-server.sh" "$1" hugegraph
# Build the server distribution without replacing published client dependencies
# in the caller's Maven repository. --build-only skips server startup.
(cd hugegraph && mvn package -DskipTests -Dmaven.javadoc.skip=true -ntp)
if [[ "${2:-}" != "--build-only" ]]; then
    ARCHIVES=(hugegraph/hugegraph-server/apache-hugegraph-*.tar.gz)
    if [[ ${#ARCHIVES[@]} -ne 1 || ! -f "${ARCHIVES[0]}" ]]; then
        printf 'Expected exactly one server archive, found: %s\n' "${ARCHIVES[*]}" >&2
        exit 1
    fi
    bash "$SCRIPT_DIR/start-hugegraph-servers.sh" "${ARCHIVES[0]}"
fi
