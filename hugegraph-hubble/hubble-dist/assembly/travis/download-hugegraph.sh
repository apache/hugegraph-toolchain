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
export LANG=zh_CN.UTF-8
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
    echo "Usage: $0 <commit-id> [fetch-ref]" >&2
    exit 1
fi

COMMIT_ID=$1
COMMIT_REF=${2:-}
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../../../.." && pwd)
GIT_DIR=hugegraph
SERVER_REPOSITORY=${SERVER_REPOSITORY:-apache/hugegraph}
if [[ ! "$COMMIT_ID" =~ ^[0-9a-fA-F]{40}$ ]] ||
   [[ ! "$SERVER_REPOSITORY" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*/[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
    echo "Expected a full server commit SHA and GitHub owner/repository" >&2
    exit 1
fi

# The SDK action can supply its exact same-source server archive. Bind it to
# that action's verified commit and content hash before using it as a fixture.
if [[ -n "${SERVER_ARCHIVE:-}" ]]; then
    if [[ "${SERVER_ARCHIVE_COMMIT:-}" != "$COMMIT_ID" ||
          ! "${SERVER_ARCHIVE_SHA256:-}" =~ ^[0-9a-f]{64}$ || ! -f "$SERVER_ARCHIVE" ]]; then
        echo "Server archive requires its verified commit and SHA-256" >&2
        exit 1
    fi
    ACTUAL_SHA256=$(shasum -a 256 "$SERVER_ARCHIVE" | awk '{print $1}')
    [[ "$ACTUAL_SHA256" == "$SERVER_ARCHIVE_SHA256" ]] || {
        echo "Server archive SHA-256 mismatch" >&2; exit 1;
    }
    cp "$SERVER_ARCHIVE" ./
    exit 0
fi

FIXTURE_COMMIT=$COMMIT_ID
FIXTURE_REF=${COMMIT_REF:-$COMMIT_ID}
FIXTURE_REPOSITORY=$SERVER_REPOSITORY
FIXTURE_JAVA=${FIXTURE_JAVA:-17}
if [[ -n "${SERVER_MAVEN_REPO:-}" ]]; then
    export MAVEN_ARGS="${MAVEN_ARGS:-} -Dmaven.repo.local=$SERVER_MAVEN_REPO"
fi
source "$REPO_ROOT/.github/actions/setup-hugegraph-server/fixture.sh"
