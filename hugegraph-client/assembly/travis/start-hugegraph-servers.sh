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
source "$(cd "$(dirname "$0")/../../.." && pwd)/.github/actions/setup-hugegraph-server/service-wait.sh"

if [[ $# -ne 1 || ! -f "$1" ]]; then
    echo "Usage: start-hugegraph-servers.sh <server archive>" >&2
    exit 1
fi

# Both baselines use the same authenticated HTTP and HTTPS test configuration.
# JAVA_HOME belongs to the server process only; callers retain their client JVM.
SERVER_ROOT=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/hugegraph-servers.XXXXXX")
tar zxf "$1" -C "$SERVER_ROOT"
# macOS-built release archives include AppleDouble sidecars. GNU tar retains
# them, and graph discovery mistakes ._hugegraph.properties for a graph.
find "$SERVER_ROOT" -type f -name '._*' -delete
# Candidate archives contain the server directly; official aggregate releases
# put it one level below the distribution root, alongside PD and Store.
SERVER_DIRS=()
for dir in "$SERVER_ROOT"/apache-hugegraph-*/ "$SERVER_ROOT"/apache-hugegraph-*/*/; do
    if [[ -f "$dir/conf/graphs/hugegraph.properties" &&
          -f "$dir/conf/rest-server.properties" &&
          -f "$dir/conf/gremlin-server.yaml" &&
          -x "$dir/bin/init-store.sh" && -x "$dir/bin/start-hugegraph.sh" ]]; then
        SERVER_DIRS+=("$dir")
    fi
done
if [[ ${#SERVER_DIRS[@]} -ne 1 ]]; then
    printf 'Expected exactly one runnable server distribution, found %s\n' "${#SERVER_DIRS[@]}" >&2
    exit 1
fi
cp -r "${SERVER_DIRS[0]}" "$SERVER_ROOT/hugegraph_https"
printf 'Server directories: %s\n' "$SERVER_ROOT"

start_server() (
    cd "$1"
    sed -i.bak 's|gremlin.graph=org.apache.hugegraph.HugeFactory|gremlin.graph=org.apache.hugegraph.auth.HugeFactoryAuthProxy|' conf/graphs/hugegraph.properties
    sed -i.bak 's|#auth.authenticator=.*|auth.authenticator=org.apache.hugegraph.auth.StandardAuthenticator|' conf/rest-server.properties
    sed -i.bak 's|#auth.admin_pa=.*|auth.admin_pa=pa|' conf/rest-server.properties
    # Boundary tests submit 501 edges / 1000 vertices and expect rejection.
    # Pin their fixture limit instead of depending on changing server defaults.
    printf '\nbatch.max_vertices_per_batch=500\nbatch.max_edges_per_batch=500\n' >> conf/rest-server.properties
    printf 'pa\n' | bin/init-store.sh
    bin/start-hugegraph.sh
)

start_server "${SERVER_DIRS[0]}"
fixture_wait http://127.0.0.1:8080
HTTPS_DIR="$SERVER_ROOT/hugegraph_https"
sed -i.bak 's?http://127.0.0.1:8080?https://127.0.0.1:8443?g' "$HTTPS_DIR/conf/rest-server.properties"
sed -i.bak 's/rpc.server_port=8091/rpc.server_port=8092/g' "$HTTPS_DIR/conf/rest-server.properties"
sed -i.bak 's/#port: 8182/port: 8282/g' "$HTTPS_DIR/conf/gremlin-server.yaml"
printf '\ngremlinserver.url=http://127.0.0.1:8282\n' >> "$HTTPS_DIR/conf/rest-server.properties"
start_server "$HTTPS_DIR"

fixture_wait https://127.0.0.1:8443
