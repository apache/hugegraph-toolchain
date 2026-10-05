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

if [[ $# -ne 2 ]]; then
    echo "Usage: checkout-server.sh <commit SHA> <new checkout directory>" >&2
    exit 1
fi

COMMIT_ID=$1
CHECKOUT_DIR=$2
SERVER_REPOSITORY=${SERVER_REPOSITORY:-apache/hugegraph}
SERVER_FETCH_REF=${SERVER_FETCH_REF:-$COMMIT_ID}
if [[ ! "$COMMIT_ID" =~ ^[0-9a-fA-F]{40}$ ]] ||
   [[ ! "$SERVER_REPOSITORY" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*/[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
    echo "Expected a full commit SHA and GitHub owner/repository" >&2
    exit 1
fi

# Fetch a reachable ref, then verify it against the resolved SHA before building.
# A moving branch or PR must fail closed rather than silently changing the baseline.
[[ ! -e "$CHECKOUT_DIR" ]] || { echo "Checkout directory already exists" >&2; exit 1; }
git init "$CHECKOUT_DIR"
git -C "$CHECKOUT_DIR" remote add origin "https://github.com/${SERVER_REPOSITORY}.git"
git -C "$CHECKOUT_DIR" fetch --depth 1 -- origin "$SERVER_FETCH_REF"
git -C "$CHECKOUT_DIR" checkout --detach FETCH_HEAD
ACTUAL_COMMIT=$(git -C "$CHECKOUT_DIR" rev-parse HEAD)
if [[ "$ACTUAL_COMMIT" != "$(printf '%s' "$COMMIT_ID" | tr '[:upper:]' '[:lower:]')" ]]; then
    echo "Server checkout mismatch: expected $COMMIT_ID, got $ACTUAL_COMMIT" >&2
    exit 1
fi
printf 'Server source: %s@%s\n' "$SERVER_REPOSITORY" "$ACTUAL_COMMIT"
