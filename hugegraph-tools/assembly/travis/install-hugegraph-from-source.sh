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

COMMIT_ID=$1
HUGEGRAPH_GIT_URL="https://github.com/apache/hugegraph.git"

git clone --depth 150 ${HUGEGRAPH_GIT_URL} hugegraph
cd hugegraph
git checkout "${COMMIT_ID}"
mvn package -DskipTests -Dmaven.javadoc.skip=true -ntp
cd hugegraph-server
mv apache-hugegraph-*.tar.gz ../../
cd ../../
rm -rf hugegraph
tar zxf apache-hugegraph-*.tar.gz

HTTPS_SERVER_DIR="hugegraph_https"
mkdir ${HTTPS_SERVER_DIR}
cp -r apache-hugegraph-*/. ${HTTPS_SERVER_DIR}
cd "$(find apache-hugegraph-* | head -1)"
# start HugeGraphServer with http protocol
sed -i 's|gremlin.graph=org.apache.hugegraph.HugeFactory|gremlin.graph=org.apache.hugegraph.auth.HugeFactoryAuthProxy|' conf/graphs/hugegraph.properties
sed -i 's|#auth.authenticator=.*|auth.authenticator=org.apache.hugegraph.auth.StandardAuthenticator|' conf/rest-server.properties
sed -i 's|#auth.admin_pa=.*|auth.admin_pa=pa|' conf/rest-server.properties
echo -e "pa" | bin/init-store.sh || exit 1
bin/start-hugegraph.sh || exit 1

cd ../${HTTPS_SERVER_DIR}
REST_SERVER_CONFIG="conf/rest-server.properties"
GREMLIN_SERVER_CONFIG="conf/gremlin-server.yaml"
sed -i "s?http://127.0.0.1:8080?https://127.0.0.1:8443?g" "$REST_SERVER_CONFIG"
sed -i "s/rpc.server_port=8091/rpc.server_port=8092/g" "$REST_SERVER_CONFIG"
sed -i "s/#port: 8182/port: 8282/g" "$GREMLIN_SERVER_CONFIG"
echo "gremlinserver.url=http://127.0.0.1:8282" >> ${REST_SERVER_CONFIG}

# start HugeGraphServer with https protocol
sed -i 's|gremlin.graph=org.apache.hugegraph.HugeFactory|gremlin.graph=org.apache.hugegraph.auth.HugeFactoryAuthProxy|' conf/graphs/hugegraph.properties
sed -i 's|#auth.authenticator=.*|auth.authenticator=org.apache.hugegraph.auth.StandardAuthenticator|' conf/rest-server.properties
sed -i 's|#auth.admin_pa=.*|auth.admin_pa=pa|' conf/rest-server.properties
echo -e "pa" | bin/init-store.sh || exit 1
bin/start-hugegraph.sh
cd ../
