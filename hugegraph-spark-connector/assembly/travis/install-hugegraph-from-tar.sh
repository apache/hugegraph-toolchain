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
set -ev

if [[ $# -ne 1 ]]; then
    echo "Must input an existing commit id of hugegraph server" && exit 1
fi

VERSION=$1
HUGEGRAPH_LINK="https://downloads.apache.org/hugegraph/${VERSION}/apache-hugegraph-${VERSION}.tar.gz"

wget "${HUGEGRAPH_LINK}" -q --show-progress || exit 1
tar zxvf apache-hugegraph-${VERSION}.tar.gz
cd apache-hugegraph-${VERSION}

## start HugeGraphServer with http protocol
bin/init-store.sh
bin/start-hugegraph.sh

cd ../
