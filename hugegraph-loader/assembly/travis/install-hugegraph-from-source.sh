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

if [[ $# -ne 1 ]]; then
    echo "Must input an existing commit id of hugegraph server" && exit 1
fi

if [[ "${FIXTURE_MODE:-standalone}" == start ]]; then
    FIXTURE_COMMIT=$1
    ROOT_DIR=$(cd "$(dirname "$0")/../../.." && pwd)
    source "$ROOT_DIR/.github/actions/setup-hugegraph-server/fixture.sh"
    ARCHIVE=$(python3 "$ROOT_DIR/.github/actions/setup-hugegraph-server/manifest.py" name)
    exec bash "$ROOT_DIR/hugegraph-client/assembly/travis/start-hugegraph-servers.sh" "$ARCHIVE"
fi
COMMIT_ID=$1
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SHARED_DIR="$SCRIPT_DIR/../../../hugegraph-client/assembly/travis"
[[ "$COMMIT_ID" =~ ^[0-9a-fA-F]{40}$ ]] || { echo "Expected a full commit SHA" >&2; exit 1; }
CACHE_DIR=${SERVER_CACHE_DIR:-"${HOME}/hugegraph-cache-${COMMIT_ID}"}
COMMIT_ID=$(printf '%s' "$COMMIT_ID" | tr '[:upper:]' '[:lower:]')
SERVER_REPOSITORY=${SERVER_REPOSITORY:-apache/hugegraph}
[[ "$SERVER_REPOSITORY" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*/[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || {
    echo "Expected a GitHub owner/repository" >&2
    exit 1
}
PROVENANCE_FILE="${CACHE_DIR}/server-provenance"

cache_error() {
    printf 'Cannot reuse server cache %s: %s. Use a fresh or separate SERVER_CACHE_DIR.\n' "$CACHE_DIR" "$1" >&2
    exit 1
}

archive_hash() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1"
    else
        shasum -a 256 "$1"
    fi
}

mkdir -p "${CACHE_DIR}"
shopt -s nullglob dotglob
CACHE_ENTRIES=("${CACHE_DIR}"/*)
shopt -u dotglob
CACHED_ARCHIVES=("${CACHE_DIR}"/apache-hugegraph-*.tar.gz)

if [[ ${#CACHE_ENTRIES[@]} -ne 0 ]]; then
    # Legacy archives have no verified source identity, even in SHA-specific directories.
    [[ -f "$PROVENANCE_FILE" && ! -L "$PROVENANCE_FILE" ]] || cache_error "missing provenance"
    [[ ${#CACHED_ARCHIVES[@]} -eq 1 && -f "${CACHED_ARCHIVES[0]}" && ! -L "${CACHED_ARCHIVES[0]}" ]] ||
        cache_error "expected exactly one regular server archive"
    CACHED_ARCHIVE=${CACHED_ARCHIVES[0]##*/}
    [[ "$CACHED_ARCHIVE" =~ ^apache-hugegraph-[a-zA-Z0-9_.-]+\.tar\.gz$ ]] || cache_error "invalid archive name"
    ACTUAL_HASH=$(archive_hash "${CACHED_ARCHIVES[0]}")
    # Compare exact bytes to canonical metadata; never execute or interpret the stamp.
    printf '%s\n' "$SERVER_REPOSITORY" "$COMMIT_ID" "$CACHED_ARCHIVE" "${ACTUAL_HASH%% *}" |
        cmp -s "$PROVENANCE_FILE" - || cache_error "source or archive provenance mismatch"
    echo "Found cached HugeGraph server tarball, skipping build."
    cp "${CACHED_ARCHIVES[0]}" ./
else
    echo "Building HugeGraph server from source (commit ${COMMIT_ID})..."
    bash "$SHARED_DIR/checkout-server.sh" "$COMMIT_ID" hugegraph
    cd hugegraph
    mvn package -DskipTests -Dmaven.javadoc.skip=true -ntp
    cd ../
    BUILD_ARCHIVES=(hugegraph/hugegraph-server/apache-hugegraph-*.tar.gz)
    if [[ ${#BUILD_ARCHIVES[@]} -ne 1 || ! -f "${BUILD_ARCHIVES[0]}" ]]; then
        printf 'Expected exactly one built server archive, found: %s\n' "${BUILD_ARCHIVES[*]}" >&2
        exit 1
    fi
    mv "${BUILD_ARCHIVES[0]}" ./
    rm -rf hugegraph
fi

ARCHIVES=(apache-hugegraph-*.tar.gz)
if [[ ${#ARCHIVES[@]} -ne 1 || ! -f "${ARCHIVES[0]}" ]]; then
    printf 'Expected exactly one server archive, found: %s\n' "${ARCHIVES[*]}" >&2
    exit 1
fi
if [[ ${#CACHE_ENTRIES[@]} -eq 0 ]]; then
    [[ "${ARCHIVES[0]}" =~ ^apache-hugegraph-[a-zA-Z0-9_.-]+\.tar\.gz$ ]] ||
        cache_error "invalid archive name"
    ACTUAL_HASH=$(archive_hash "${ARCHIVES[0]}")
    cp "${ARCHIVES[0]}" "${CACHE_DIR}"/
    # Publish provenance only after the verified checkout and unique archive succeed.
    STAMP_TEMP=$(mktemp "${CACHE_DIR}/.server-provenance.XXXXXX")
    trap 'rm -f "$STAMP_TEMP"' EXIT
    printf '%s\n' "$SERVER_REPOSITORY" "$COMMIT_ID" "${ARCHIVES[0]}" "${ACTUAL_HASH%% *}" > "$STAMP_TEMP"
    mv "$STAMP_TEMP" "$PROVENANCE_FILE"
    trap - EXIT
fi
exec bash "$SHARED_DIR/start-hugegraph-servers.sh" "${ARCHIVES[0]}"
