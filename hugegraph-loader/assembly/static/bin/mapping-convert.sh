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
set -e

HOME_PATH=$(dirname "$0")
HOME_PATH=$(cd "${HOME_PATH}"/.. && pwd)
cd "${HOME_PATH}"

BIN_PATH=${HOME_PATH}/bin
CONF_PATH=${HOME_PATH}/conf
LIB_PATH=${HOME_PATH}/lib
LOG_PATH=${HOME_PATH}/logs

if [[ -z "$1" ]]; then
    echo "usage: $0 file"
    echo "Convert old mapping file from old version to 2.0"
    exit 1
fi

if [[ ! -d ${LOG_PATH} ]]; then
    mkdir "${LOG_PATH}"
fi

class_path="."
for jar in "$LIB_PATH"/*.jar; do
    class_path=${class_path}:${jar}
done

JAVA=java
if [ -n "$JAVA_HOME" ]; then
    JAVA="$JAVA_HOME/bin/java"
fi

args=$1
main_class="org.apache.hugegraph.loader.MappingConverter"
exec "$JAVA" -Dlog4j.configurationFile="${CONF_PATH}"/log4j2.xml \
    -cp "${class_path}" ${main_class} "${args}"
