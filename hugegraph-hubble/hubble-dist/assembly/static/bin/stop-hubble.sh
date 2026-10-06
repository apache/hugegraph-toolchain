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
HOME_PATH=$(dirname "$0")
HOME_PATH=$(cd "${HOME_PATH}"/.. && pwd)
BIN_PATH=${HOME_PATH}/bin
PID_FILE=${BIN_PATH}/pid
# Seconds to wait for a graceful shutdown before resorting to SIGKILL
STOP_TIMEOUT=${STOP_TIMEOUT:-30}

if [[ ! ${STOP_TIMEOUT} =~ ^[0-9]+$ ]]; then
    echo "STOP_TIMEOUT must be a non-negative integer" >&2
    exit 1
fi

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

if [[ -f ${PID_FILE} ]]; then
    read -r pid expected_start < "${PID_FILE}"
    if [[ ! ${pid} =~ ^[0-9]+$ ]]; then
        echo "Invalid HugeGraphHubble PID file; refusing to signal a process" >&2
        exit 1
    fi

    same_process() {
        if ! kill -0 "${pid}" > /dev/null 2>&1; then
            return 1
        fi
        if [[ -n ${expected_start} && $(process_start_time "${pid}") != "${expected_start}" ]]; then
            return 1
        fi
        # Verify this release's command signature even when a start stamp is present.
        # Older PID-only launchers retain the same command-signature fallback.
        process_args=$(ps -p "${pid}" -o args= 2>/dev/null) || return 1
        [[ " ${process_args} " == *" org.apache.hugegraph.HugeGraphHubble "* &&
           " ${process_args} " == *" -Dhubble.home.path=${HOME_PATH} "* ]]
    }

    if same_process; then
        # SIGTERM first so the Spring shutdown hooks run: they pause the
        # running load tasks and close the H2 database cleanly. Only escalate
        # to SIGKILL if the process is still alive after STOP_TIMEOUT.
        kill "${pid}" > /dev/null 2>&1
        waited=0
        while [ "${waited}" -lt "${STOP_TIMEOUT}" ]; do
            if ! same_process; then
                break
            fi
            sleep 1
            waited=$((waited + 1))
        done
        if same_process; then
            echo "HugeGraphHubble did not exit within ${STOP_TIMEOUT}s, killing it"
            kill -9 "${pid}" > /dev/null 2>&1
        fi
        for _ in 1 2 3 4 5; do
            if ! same_process; then
                break
            fi
            sleep 1
        done
        if same_process; then
            echo "HugeGraphHubble process ${pid} is still alive; retaining PID file" >&2
            exit 1
        fi
        echo "stopped HugeGraphHubble"
    else
        if kill -0 "${pid}" > /dev/null 2>&1; then
            echo "PID ${pid} belongs to a different process; retaining PID file" >&2
            exit 1
        fi
        echo "process ${pid} not exist"
    fi
    rm "${PID_FILE}"
else
    echo "HugeGraphHubble not running"
fi
