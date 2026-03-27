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

sudo wget https://archive.apache.org/dist/hadoop/common/hadoop-2.8.5/hadoop-2.8.5.tar.gz

sudo tar -zxf hadoop-2.8.5.tar.gz -C /usr/local
cd /usr/local
sudo mv hadoop-2.8.5 hadoop
#sudo chown -R travis ./hadoop
cd hadoop
pwd

echo "export HADOOP_HOME=/usr/local/hadoop" >> ~/.bashrc
echo "export HADOOP_COMMON_LIB_NATIVE_DIR=$HADOOP_HOME/lib/native" >> ~/.bashrc
echo "export PATH=$PATH:$HADOOP_HOME/bin:$HADOOP_HOME/sbin" >> ~/.bashrc

source ~/.bashrc

tee etc/hadoop/core-site.xml <<EOF
<configuration>
    <property>
        <name>fs.defaultFS</name>
        <value>hdfs://localhost:8020</value>
    </property>
</configuration>
EOF

tee etc/hadoop/hdfs-site.xml <<EOF
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

bin/hdfs namenode -format
sbin/hadoop-daemon.sh start namenode
sbin/hadoop-daemon.sh start datanode
jps
