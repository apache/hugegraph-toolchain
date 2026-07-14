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

const QUIET = {suppressBusinessErrorToast: true};

const unwrap = response => {
    if (response?.status !== 200) {
        throw new Error(`operations_request_${response?.status ?? 'failed'}`);
    }
    return response.data;
};

const getCapabilities = async () => unwrap(
    await request.get('/operations/capabilities', QUIET)
);

const getOverview = async (refresh = false) => unwrap(
    await request.get('/operations/overview', {
        ...QUIET,
        params: {refresh},
    })
);

const getNodes = async params => unwrap(
    await request.get('/operations/nodes', {
        ...QUIET,
        params,
    })
);

const getNode = async (nodeId, refresh = false) => unwrap(
    await request.get(`/operations/nodes/${encodeURIComponent(nodeId)}`, {
        ...QUIET,
        params: {refresh},
    })
);

export {getCapabilities, getOverview, getNodes, getNode};
