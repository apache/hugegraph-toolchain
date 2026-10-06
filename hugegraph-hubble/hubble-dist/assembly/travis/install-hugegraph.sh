#!/bin/bash
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
export LANG=zh_CN.UTF-8
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
    echo "Usage: $0 <commit-id> [fetch-ref]" >&2
    exit 1
fi

COMMIT_ID=$1
COMMIT_REF=${2:-}
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
if [[ -n "${SERVER_JAVA_HOME:-}" ]]; then
    [[ -x "$SERVER_JAVA_HOME/bin/java" ]] || { echo "Server JDK is unavailable" >&2; exit 1; }
    export JAVA_HOME="$SERVER_JAVA_HOME"
    export PATH="$SERVER_JAVA_HOME/bin:$PATH"
fi

"$SCRIPT_DIR"/download-hugegraph.sh "$COMMIT_ID" "$COMMIT_REF"
"$SCRIPT_DIR"/hugegraph-server1/install-hugegraph.sh
"$SCRIPT_DIR"/hugegraph-server2/install-hugegraph.sh
