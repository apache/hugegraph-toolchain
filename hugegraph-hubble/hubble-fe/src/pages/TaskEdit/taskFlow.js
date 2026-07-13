/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

class TaskFlowError extends Error {
    constructor(reason, message) {
        super(message || reason);
        this.reason = reason;
    }
}

const loadTaskBaseContext = async (manage, values) => {
    const {datasource_id, ingestion_option} = values;
    let datasourceResponse;
    let graphspaceResponse;
    try {
        [datasourceResponse, graphspaceResponse] = await Promise.all([
            manage.getDatasource(datasource_id.toString()),
            manage.getGraphSpace(ingestion_option.graphspace),
        ]);
    }
    catch (error) {
        throw new TaskFlowError('request', error.message);
    }

    if (!datasourceResponse || datasourceResponse.status !== 200
        || !datasourceResponse.data) {
        throw new TaskFlowError('datasource');
    }
    if (!graphspaceResponse || graphspaceResponse.status !== 200
        || !graphspaceResponse.data) {
        throw new TaskFlowError('graphspace');
    }

    return {
        datasource: datasourceResponse.data,
        graphspace: graphspaceResponse.data,
    };
};

const createTask = async (manage, payload) => {
    const response = await manage.addTask(payload);
    if (response.status !== 200) {
        throw new TaskFlowError('business', response.message);
    }
    return response.data;
};

const createTaskOnce = async (manage, payload, pendingRef) => {
    if (pendingRef.current) {
        return {skipped: true};
    }
    pendingRef.current = true;
    try {
        return await createTask(manage, payload);
    }
    finally {
        pendingRef.current = false;
    }
};

const getTaskSubmissionError = error => {
    if (!error || typeof error.message !== 'string') {
        return '';
    }
    const detail = error.message.trim();
    return detail === error.reason ? '' : detail;
};

export {
    TaskFlowError,
    createTask,
    createTaskOnce,
    getTaskSubmissionError,
    loadTaskBaseContext,
};
