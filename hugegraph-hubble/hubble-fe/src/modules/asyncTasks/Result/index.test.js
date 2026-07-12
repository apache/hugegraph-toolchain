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

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import AsyncTaskResult from './index';
import * as api from '../../../api/index';

jest.mock('../../../api/index', () => ({
    analysis: {fetchAsyncTaskResult: jest.fn()},
}));
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useParams: () => ({graphspace: 'DEFAULT', graph: 'hugegraph', taskId: '9'}),
}));
jest.mock('react-json-view', () => ({src}) => <pre>{JSON.stringify(src)}</pre>);
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'analysis.async_task.result_load_failed': 'Could not load task result.',
        'analysis.async_task.retry_result': 'Retry result',
        'analysis.async_task.result_loading': 'Loading task result',
        'analysis.async_task.no_result': 'No task result is available.',
        'analysis.async_task.result_title': 'Task result',
        'analysis.async_task.result_back': 'Back to task management',
        'analysis.async_task.result_context': 'DEFAULT / hugegraph / Task 9',
    })[key] || key}),
}));

const renderResult = () => render(
    <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
        <AsyncTaskResult />
    </MemoryRouter>
);

it('keeps result failure visible and retries the same task', async () => {
    api.analysis.fetchAsyncTaskResult
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {task_result: '{"ok":true}'}});

    renderResult();

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not load task result.'
    );
    fireEvent.click(screen.getByRole('button', {name: 'Retry result'}));
    expect(await screen.findByText('{"ok":true}')).toBeInTheDocument();
    await waitFor(() => expect(api.analysis.fetchAsyncTaskResult).toHaveBeenCalledTimes(2));
});

it('renders a clear empty state instead of a literal null result', async () => {
    api.analysis.fetchAsyncTaskResult.mockResolvedValue({
        status: 200,
        data: {task_result: 'null'},
    });

    renderResult();

    expect(await screen.findByText('No task result is available.')).toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
});

it('keeps task context and a graph-scoped return entry visible', async () => {
    api.analysis.fetchAsyncTaskResult.mockResolvedValue({
        status: 200,
        data: {task_result: '{"ok":true}'},
    });

    renderResult();

    expect(screen.getByRole('heading', {name: 'Task result'})).toBeInTheDocument();
    expect(screen.getByText('DEFAULT / hugegraph / Task 9')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Back to task management'}))
        .toHaveAttribute('href', '/asyncTasks/DEFAULT/hugegraph');
    expect(await screen.findByText('{"ok":true}')).toBeInTheDocument();
});
