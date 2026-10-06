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
set -e

HOME_PATH=$(dirname "$0")
HOME_PATH=$(cd "${HOME_PATH}"/.. && pwd)
cd "${HOME_PATH}"

BIN_PATH=${HOME_PATH}/bin
CONF_PATH=${HOME_PATH}/conf
LIB_PATH=${HOME_PATH}/lib
LOG_PATH=${HOME_PATH}/logs
PID_FILE=${BIN_PATH}/pid

process_start_time() {
    local process_pid=$1
    if [[ -r /proc/${process_pid}/stat ]]; then
        awk '{print $22}' "/proc/${process_pid}/stat"
    else
        local process_stamp
        process_stamp=$(LC_ALL=C ps -o lstart= -p "${process_pid}" 2>/dev/null) || return 1
        printf '%s\n' "${process_stamp}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
    fi
}

. "${BIN_PATH}"/common_functions

java_env_check

if [[ ! -d ${LOG_PATH} ]]; then
    mkdir "${LOG_PATH}"
fi

class_path="."
for jar in "${LIB_PATH}"/*.jar; do
    [[ -e "$jar" ]] || break
    class_path=${class_path}:${jar}
done

# Hive ORC interns URI strings through reflection on Java 17.
JAVA_OPTS="-Xms512m -Dfile.encoding=UTF-8 --add-opens=java.base/java.net=ALL-UNNAMED"
JAVA_DEBUG_OPTS=""
FOREGROUND="false"

while [[ $# -gt 0 ]]; do
    case "$1" in
        -f|--foreground)
            FOREGROUND="true"
            if [[ $# -gt 1 && ( "$2" == "true" || "$2" == "false" ) ]]; then
                FOREGROUND="$2"
                shift
            fi
            ;;
        "-f true"|"--foreground true")
            FOREGROUND="true"
            ;;
        "-f false"|"--foreground false")
            FOREGROUND="false"
            ;;
        -d|--debug)
            JAVA_DEBUG_OPTS=" -Xdebug -Xnoagent"
            JAVA_DEBUG_OPTS="${JAVA_DEBUG_OPTS} -Xrunjdwp:transport=dt_socket,address=8787"
            JAVA_DEBUG_OPTS="${JAVA_DEBUG_OPTS},server=y,suspend=n"
            ;;
        *)
            echo "USAGE: $0 [-f [true|false]] [-d] "
            exit 1
            ;;
    esac
    shift
done

MAIN_CLASS="org.apache.hugegraph.HugeGraphHubble"

if [[ -f ${PID_FILE} ]] ; then
    read -r PID PID_START < "${PID_FILE}"
    if [[ ! ${PID} =~ ^[0-9]+$ ]]; then
        echo "Invalid HugeGraphHubble PID file, removing it"
        rm "${PID_FILE}"
    elif kill -0 "${PID}" > /dev/null 2>&1; then
        if ! CURRENT_START=$(process_start_time "${PID}") || [[ -z ${CURRENT_START} ]]; then
            echo "Unable to verify process ${PID} start time; retaining PID file" >&2
            exit 1
        fi
        if ! PROCESS_ARGS=$(ps -p "${PID}" -o args= 2>/dev/null) ||
           [[ ! ${PROCESS_ARGS} =~ [^[:space:]] ]]; then
            echo "Unable to verify process ${PID} arguments; retaining PID file" >&2
            exit 1
        fi
        if [[ " ${PROCESS_ARGS} " == *" ${MAIN_CLASS} "* &&
              " ${PROCESS_ARGS} " == *" -Dhubble.home.path=${HOME_PATH} "* &&
              ( -z ${PID_START} || ${PID_START} == "${CURRENT_START}" ) ]]; then
            echo "HugeGraphHubble is running as process ${PID}, please stop it first!"
            exit 1
        fi
        echo "Stale HugeGraphHubble PID file, removing it"
        rm "${PID_FILE}"
    else
        rm "${PID_FILE}"
    fi
fi

ARGS=${CONF_PATH}/hugegraph-hubble.properties
LOG=${LOG_PATH}/hugegraph-hubble.log

if [[ $FOREGROUND == "false" ]]; then
    echo "Starting Hubble in daemon mode..."
    nohup nice -n 0 java -server ${JAVA_OPTS} ${JAVA_DEBUG_OPTS} -Dhubble.home.path="${HOME_PATH}" \
  -cp "${class_path}" "${MAIN_CLASS}" "${ARGS}" > "${LOG}" 2>&1 < /dev/null &
else
    echo "Starting Hubble in foreground mode..."
    exec nice -n 0 java -server ${JAVA_OPTS} ${JAVA_DEBUG_OPTS} -Dhubble.home.path="${HOME_PATH}" \
  -cp "${class_path}" "${MAIN_CLASS}" "${ARGS}"
fi

PID=$!
PID_START=$(process_start_time "${PID}") || PID_START=""
if ! kill -0 "${PID}" > /dev/null 2>&1; then
    wait "${PID}" || true
    cat "${LOG}" || true
    exit 1
fi
echo "${PID} ${PID_START}" > "${PID_FILE}"

# wait hubble start
TIMEOUT_S=30
SERVER_HOST=$(read_property "${CONF_PATH}"/hugegraph-hubble.properties server.host)
SERVER_PORT=$(read_property "${CONF_PATH}"/hugegraph-hubble.properties server.port)
SERVER_URL="http://${SERVER_HOST}:${SERVER_PORT}/about"

wait_for_startup "${SERVER_URL}" ${TIMEOUT_S} || {
    cat "${LOG}"
    exit 1
}
echo "logging to ${LOG}, please check it"
