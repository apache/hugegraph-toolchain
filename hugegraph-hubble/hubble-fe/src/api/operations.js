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

import request from './request';

const QUIET = {
    suppressBusinessErrorToast: true,
    headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
    },
};

const unwrap = response => {
    if (response?.status !== 200) {
        const error = new Error(`operations_request_${response?.status ?? 'failed'}`);
        error.status = response?.status;
        throw error;
    }
    return response.data;
};

const requestOperation = async requestPromise => {
    try {
        return unwrap(await requestPromise);
    }
    catch (error) {
        error.status = error.data?.status
            ?? error.response?.data?.status
            ?? error.response?.status
            ?? error.status;
        throw error;
    }
};

const getCapabilities = async () => requestOperation(
    request.get('/operations/capabilities', QUIET)
);

const getOverview = async (refresh = false) => requestOperation(
    request.get('/operations/overview', {
        ...QUIET,
        params: {refresh},
    })
);

const getNodes = async params => requestOperation(
    request.get('/operations/nodes', {
        ...QUIET,
        params,
    })
);

const getNode = async (nodeId, refresh = false) => requestOperation(
    request.get(`/operations/nodes/${encodeURIComponent(nodeId)}`, {
        ...QUIET,
        params: {refresh},
    })
);

export {getCapabilities, getOverview, getNodes, getNode};
