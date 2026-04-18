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

# Upgrade stable version to 3.3.6
HADOOP_VERSION="3.3.6"
HADOOP_TARBALL="hadoop-${HADOOP_VERSION}.tar.gz"
HADOOP_HOME="/usr/local/hadoop"
HADOOP_TARBALL_PATH="${HOME}/${HADOOP_TARBALL}"

if [[ ! -d "${HADOOP_HOME}" ]]; then
    if [[ ! -f "${HADOOP_TARBALL_PATH}" ]]; then
        echo "Downloading Hadoop ${HADOOP_VERSION}..."
        wget -O "${HADOOP_TARBALL_PATH}" "https://archive.apache.org/dist/hadoop/common/hadoop-${HADOOP_VERSION}/${HADOOP_TARBALL}"
    else
        echo "Using cached Hadoop tarball at ${HADOOP_TARBALL_PATH}"
    fi
    echo "Extracting Hadoop to ${HADOOP_HOME}..."
    sudo tar -zxf "${HADOOP_TARBALL_PATH}" -C /usr/local
    cd /usr/local
    sudo mv "hadoop-${HADOOP_VERSION}" hadoop
    sudo chown -R "$(whoami):$(whoami)" "${HADOOP_HOME}"
else
    echo "Hadoop already installed at ${HADOOP_HOME}, skipping download and extraction."
fi

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

source ~/.bashrc

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
