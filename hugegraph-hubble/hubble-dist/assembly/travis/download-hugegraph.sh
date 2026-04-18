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
set -ev

if [[ $# -ne 1 ]]; then
    echo "Must input an existing commit id of hugegraph server" && exit 1
fi

COMMIT_ID=$1
HUGEGRAPH_GIT_URL="https://github.com/apache/hugegraph.git"
GIT_DIR=hugegraph

# download code and compile
git clone --depth 150 $HUGEGRAPH_GIT_URL $GIT_DIR
cd "${GIT_DIR}"
git checkout "${COMMIT_ID}"
mvn package -DskipTests -Dmaven.javadoc.skip=true -ntp

cd hugegraph-server
TAR=$(echo apache-hugegraph-*.tar.gz)
cp apache-hugegraph-*.tar.gz ../../
cd ../../
rm -rf "${GIT_DIR}"
