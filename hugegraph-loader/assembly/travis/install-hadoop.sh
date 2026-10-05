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

HADOOP_VERSION="3.3.6"
HADOOP_TARBALL="hadoop-${HADOOP_VERSION}.tar.gz"
HADOOP_HOME=${HADOOP_HOME:-/usr/local/hadoop}
HADOOP_TARBALL_PATH="${HOME}/${HADOOP_TARBALL}"
# Official archive.apache.org Hadoop 3.3.6 .sha512 release checksum.
HADOOP_SHA512=de3eaca2e0517e4b569a88b63c89fae19cb8ac6c01ff990f1ff8f0cc0f3128c8e8a23db01577ca562a0e0bb1b4a3889f8c74384e609cd55e537aada3dcaa9f8a
hadoop_verify() {
    [[ -f "$HADOOP_TARBALL_PATH" ]] &&
        [[ "$(shasum -a 512 "$HADOOP_TARBALL_PATH" | cut -d ' ' -f 1)" == "$HADOOP_SHA512" ]]
}
if ! hadoop_verify; then
    rm -f "$HADOOP_TARBALL_PATH"
    for attempt in 1 2; do
        echo "Downloading Hadoop ${HADOOP_VERSION} (attempt $attempt)..."
        if curl --fail --location --connect-timeout 30 --max-time 900 \
            --speed-time 60 --speed-limit 1024 \
            --output "$HADOOP_TARBALL_PATH" \
            "https://archive.apache.org/dist/hadoop/common/hadoop-${HADOOP_VERSION}/${HADOOP_TARBALL}" && hadoop_verify; then
            break
        fi
        rm -f "$HADOOP_TARBALL_PATH"
    done
fi
hadoop_verify || { echo 'Hadoop archive download/checksum failed' >&2; exit 1; }
# Extract a verified archive even on cache hits; no unverified installed directory reuse.
sudo mkdir -p "$HADOOP_HOME"
sudo tar -zxf "$HADOOP_TARBALL_PATH" --strip-components=1 -C "$HADOOP_HOME"
sudo chown -R "$(whoami):$(id -gn)" "$HADOOP_HOME"

cd "${HADOOP_HOME}"
pwd

# Export for GitHub Actions subsequent steps
if [[ -n "${GITHUB_ENV:-}" ]]; then
    echo "HADOOP_HOME=${HADOOP_HOME}" >> "${GITHUB_ENV}"
    echo "HADOOP_COMMON_LIB_NATIVE_DIR=${HADOOP_HOME}/lib/native" >> "${GITHUB_ENV}"
    echo "PATH=${PATH}:${HADOOP_HOME}/bin:${HADOOP_HOME}/sbin" >> "${GITHUB_ENV}"
fi

if ! grep -qxF "export HADOOP_HOME=${HADOOP_HOME}" ~/.bashrc; then
    echo "export HADOOP_HOME=${HADOOP_HOME}" >> ~/.bashrc
fi
if ! grep -qxF "export HADOOP_COMMON_LIB_NATIVE_DIR=${HADOOP_HOME}/lib/native" ~/.bashrc; then
    echo "export HADOOP_COMMON_LIB_NATIVE_DIR=${HADOOP_HOME}/lib/native" >> ~/.bashrc
fi
if ! grep -qxF "export PATH=\$PATH:${HADOOP_HOME}/bin:${HADOOP_HOME}/sbin" ~/.bashrc; then
    echo "export PATH=\$PATH:${HADOOP_HOME}/bin:${HADOOP_HOME}/sbin" >> ~/.bashrc
fi

export HADOOP_HOME
export HADOOP_COMMON_LIB_NATIVE_DIR="${HADOOP_HOME}/lib/native"
export PATH="${PATH}:${HADOOP_HOME}/bin:${HADOOP_HOME}/sbin"

if [[ ! -f etc/hadoop/core-site.xml ]] || ! grep -q "hdfs://localhost:8020" etc/hadoop/core-site.xml; then
    sudo tee etc/hadoop/core-site.xml > /dev/null <<EOF
<configuration>
    <property>
        <name>fs.defaultFS</name>
        <value>hdfs://localhost:8020</value>
    </property>
</configuration>
EOF
fi

if [[ ! -f etc/hadoop/hdfs-site.xml ]] || ! grep -q "/opt/hdfs/name" etc/hadoop/hdfs-site.xml; then
    sudo tee etc/hadoop/hdfs-site.xml > /dev/null <<EOF
<configuration>
    <property>
        <name>dfs.namenode.name.dir</name>
        <value>/opt/hdfs/name</value>
    </property>
    <property>
        <name>dfs.datanode.data.dir</name>
        <value>/opt/hdfs/data</value>
    </property>
    <property>
        <name>dfs.permissions.superusergroup</name>
        <value>hadoop</value>
    </property>
    <property>
        <name>dfs.support.append</name>
        <value>true</value>
    </property>
</configuration>
EOF
fi

bin/hdfs namenode -format
sbin/hadoop-daemon.sh start namenode
sbin/hadoop-daemon.sh start datanode
jps

# Check the NameNode API and live DataNode registration with a bounded deadline.
deadline=$((SECONDS + ${SERVICE_READY_TIMEOUT:-300}))
while (( SECONDS < deadline )); do
    if curl --fail --silent --connect-timeout 2 --max-time 5 \
        'http://localhost:9870/jmx?qry=Hadoop:service=NameNode,name=FSNamesystemState' |
        python3 -c 'import json,sys; sys.exit(not any(b.get("NumLiveDataNodes",0)>0 for b in json.load(sys.stdin)["beans"]))'; then
        exit 0
    fi
    sleep 2
done
echo 'Hadoop readiness timed out' >&2
exit 1
