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
set -ev

SERVER_CONFIG_DIR=$(dirname "$0")
source "$(cd "$SERVER_CONFIG_DIR/../../../../.." && pwd)/.github/actions/setup-hugegraph-server/service-wait.sh"
SERVER_PARENT_DIR="hugegraph-server1"

mkdir ${SERVER_PARENT_DIR}
TAR=$(echo apache-hugegraph-*.tar.gz)
tar -zxvf "$TAR" -C "${SERVER_PARENT_DIR}" >/dev/null 2>&1

HUGEGRAPH_NAME=${TAR%%.tar*}
SERVER_DIR="${SERVER_PARENT_DIR}"/$HUGEGRAPH_NAME
echo $SERVER_DIR

cp "${SERVER_CONFIG_DIR}"/gremlin-server.yaml "${SERVER_DIR}"/conf
cp "${SERVER_CONFIG_DIR}"/rest-server.properties "${SERVER_DIR}"/conf
cp "${SERVER_CONFIG_DIR}"/graphs/hugegraph1.properties "${SERVER_DIR}"/conf/graphs/
cp "${SERVER_CONFIG_DIR}"/graphs/hugegraph2.properties "${SERVER_DIR}"/conf/graphs/

cd "${SERVER_DIR}" && pwd

echo -e "pa" | bin/init-store.sh || exit 1
bin/start-hugegraph.sh || exit 1

fixture_wait http://127.0.0.1:8080
