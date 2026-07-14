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
import {getCapabilities, getNode, getOverview} from './operations';

jest.mock('./request');

test('unwraps the Hubble response envelope for operations pages', async () => {
    request.get.mockResolvedValueOnce({
        status: 200,
        data: {capabilities: ['operations_health_read']},
    }).mockResolvedValueOnce({
        status: 200,
        data: {status: 'UP', nodes: []},
    });

    await expect(getCapabilities()).resolves.toEqual({
        capabilities: ['operations_health_read'],
    });
    await expect(getOverview()).resolves.toEqual({status: 'UP', nodes: []});
});

test('rejects a failed operations business response', async () => {
    request.get.mockResolvedValue({status: 403, message: 'Forbidden'});

    await expect(getCapabilities()).rejects.toThrow('operations_request_403');
});

test('preserves the snake case metric status contract for node details', async () => {
    const metricStatuses = {
        system: {
            availability: 'UNAVAILABLE',
            observed_at: 1000,
            last_success_at: 900,
            fresh: false,
            stale: true,
            reason: 'refresh_failed',
        },
    };
    request.get.mockResolvedValue({
        status: 200,
        data: {node: {id: 'server-safe', metric_statuses: metricStatuses}},
    });

    await expect(getNode('server-safe')).resolves.toEqual({
        node: {id: 'server-safe', metric_statuses: metricStatuses},
    });
});
