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

import {
    TaskFlowError,
    createTask,
    createTaskOnce,
    getTaskSubmissionError,
    loadTaskBaseContext,
} from './taskFlow';

const values = {
    datasource_id: 9,
    ingestion_option: {graphspace: 'DEFAULT', graph: 'hugegraph'},
};

it('does not advance until both datasource and graph-space context are valid', async () => {
    const manage = {
        getDatasource: jest.fn().mockResolvedValue({status: 200, data: {datasource_id: 9}}),
        getGraphSpace: jest.fn().mockResolvedValue({
            status: 200,
            data: {storage_percent: 0.3},
        }),
    };

    await expect(loadTaskBaseContext(manage, values)).resolves.toEqual({
        datasource: {datasource_id: 9},
        graphspace: {storage_percent: 0.3},
    });
    manage.getDatasource.mockResolvedValueOnce({status: 500});
    await expect(loadTaskBaseContext(manage, values)).rejects.toMatchObject({
        reason: 'datasource',
    });
    manage.getDatasource.mockResolvedValueOnce(undefined);
    await expect(loadTaskBaseContext(manage, values)).rejects.toMatchObject({
        reason: 'datasource',
    });
    manage.getGraphSpace.mockResolvedValueOnce(null);
    await expect(loadTaskBaseContext(manage, values)).rejects.toMatchObject({
        reason: 'graphspace',
    });
    manage.getGraphSpace.mockRejectedValueOnce(new Error('offline'));
    await expect(loadTaskBaseContext(manage, values)).rejects.toMatchObject({
        reason: 'request',
    });
});

it('treats task creation rejection and non-200 responses as failures', async () => {
    const manage = {addTask: jest.fn()};
    manage.addTask.mockResolvedValueOnce({status: 500, message: 'rejected'});
    await expect(createTask(manage, '{}')).rejects.toMatchObject({
        reason: 'business',
        message: 'rejected',
    });
    manage.addTask.mockRejectedValueOnce(new Error('offline'));
    await expect(createTask(manage, '{}')).rejects.toThrow('offline');
    manage.addTask.mockResolvedValueOnce({status: 200, data: {task_id: 7}});
    await expect(createTask(manage, '{}')).resolves.toEqual({task_id: 7});
});

it('atomically prevents duplicate task creation and releases after failure', async () => {
    let resolveFirst;
    const manage = {
        addTask: jest.fn().mockImplementationOnce(() => new Promise(resolve => {
            resolveFirst = resolve;
        })),
    };
    const pending = {current: false};

    const first = createTaskOnce(manage, '{}', pending);
    await expect(createTaskOnce(manage, '{}', pending)).resolves.toEqual({skipped: true});
    expect(manage.addTask).toHaveBeenCalledTimes(1);
    resolveFirst({status: 500, message: 'failed'});
    await expect(first).rejects.toMatchObject({reason: 'business'});
    expect(pending.current).toBe(false);

    manage.addTask.mockResolvedValueOnce({status: 200, data: {task_id: 8}});
    await expect(createTaskOnce(manage, '{}', pending)).resolves.toEqual({task_id: 8});
    expect(manage.addTask).toHaveBeenCalledTimes(2);
});

it('exposes actionable backend details without displaying internal reason tokens', () => {
    expect(getTaskSubmissionError(new TaskFlowError('business', 'invalid graph_id')))
        .toBe('invalid graph_id');
    expect(getTaskSubmissionError(new TaskFlowError('business'))).toBe('');
    expect(getTaskSubmissionError(null)).toBe('');
});
