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

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import AsyncTaskResult, {AsyncTaskResultContent} from './index';
import * as api from '../../../api/index';
import {isCypherEnabled} from '../../../utils/config';

jest.mock('../../../api/index', () => ({
    analysis: {fetchAsyncTaskResult: jest.fn(), fetchVermeerTaskValues: jest.fn()},
}));
jest.mock('../../../utils/config', () => ({isCypherEnabled: jest.fn(() => true)}));
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useParams: () => ({graphspace: 'DEFAULT', graph: 'hugegraph', taskId: '9'}),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: (key, values) => ({
        'analysis.async_task.result_load_failed': 'Could not load task result.',
        'analysis.async_task.retry_result': 'Retry result',
        'analysis.async_task.result_loading': 'Loading task result',
        'analysis.async_task.no_result': 'No task result is available.',
        'analysis.async_task.result_title': 'Task result',
        'analysis.async_task.result_back': 'Back to task management',
        'analysis.async_task.result_context': 'DEFAULT / hugegraph / Task 9',
        'analysis.async_task.result_failure_title': 'Task failed',
        'analysis.async_task.vermeer_failure_unknown_title': 'The upstream service returned no specific reason',
        'analysis.async_task.vermeer_failure_unknown_description': 'Checks, not a confirmed diagnosis',
        'analysis.async_task.vermeer_failure_logs_hint': 'Check Worker and Store logs',
        'analysis.async_task.vermeer_failure_connection_hint': 'Verify service addresses and authentication',
        'analysis.async_task.vermeer_failure_namespace_hint': 'Verify Store pd.cluster matches Server',
        'analysis.async_task.vermeer_failure_up_hint': 'UP does not confirm computation success',
        'analysis.async_task.raw_error': 'Original error',
        'analysis.async_task.vermeer_result_unavailable_title': 'Task succeeded, but its values are unavailable',
        'analysis.async_task.vermeer_result_unavailable_description': 'Check upstream retention before recomputing',
        'analysis.async_task.result_open_algorithms': 'Open graph algorithms',
        'analysis.async_task.result_size_limit_title': 'Task result exceeds the server limit',
        'analysis.async_task.result_size_limit_description': `Result ${values?.size} MiB exceeds ${values?.limit} MiB`,
        'analysis.async_task.refine_query': 'Refine query',
    })[key] || key}),
}));

const renderResult = () => render(
    <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
        <AsyncTaskResult />
    </MemoryRouter>
);

beforeEach(() => isCypherEnabled.mockReturnValue(true));

it('keeps result failure visible and retries the same task', async () => {
    api.analysis.fetchAsyncTaskResult
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {task_result: '{"ok":true}'}});

    renderResult();

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not load task result.'
    );
    fireEvent.click(screen.getByRole('button', {name: 'Retry result'}));
    expect(await screen.findByText('true')).toBeInTheDocument();
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
    expect(await screen.findByText('true')).toBeInTheDocument();
});


it('pages direct Vermeer values and resets the cursor after a graph change', async () => {
    api.analysis.fetchAsyncTaskResult.mockResolvedValue({status: 200, data: {
        task_result: JSON.stringify({vertices: [{ID: 'first'}], cursor: 1000, has_more: true}),
    }});
    api.analysis.fetchVermeerTaskValues.mockResolvedValue({status: 200, data: {
        vertices: [{ID: 'next'}], cursor: 1001, has_more: false,
    }});
    const view = render(<AsyncTaskResultContent graphspace='DEFAULT' graph='one' taskId={-9} />);
    fireEvent.click(await screen.findByRole('button', {name: 'analysis.async_task.result_next'}));
    expect(await screen.findByText('"next"')).toBeInTheDocument();
    expect(api.analysis.fetchVermeerTaskValues).toHaveBeenCalledWith('DEFAULT', 'one', -9, 1000);
    expect(screen.queryByRole('button', {name: 'analysis.async_task.result_next'})).not.toBeInTheDocument();
    view.rerender(<AsyncTaskResultContent graphspace='DEFAULT' graph='two' taskId={-9} />);
    await waitFor(() => expect(api.analysis.fetchAsyncTaskResult).toHaveBeenLastCalledWith('DEFAULT', 'two', -9));
    expect(await screen.findByText('"first"')).toBeInTheDocument();
});

it.each(['gremlin', 'cypher'])('explains an oversized %s result and links its query language', async taskType => {
    const failure = 'org.apache.hugegraph.exception.LimitExceedException: '
        + 'Task result size 77849617 exceeded limit 16777216 bytes';
    api.analysis.fetchAsyncTaskResult.mockResolvedValue({status: 200, data: {
        task_status: 'failed', task_type: taskType, task_result: failure,
    }});
    renderResult();
    expect(await screen.findByRole('alert')).toHaveTextContent('Task result exceeds the server limit');
    expect(screen.getByRole('alert')).toHaveTextContent('Result 74.24 MiB exceeds 16.00 MiB');
    expect(screen.getByText(failure)).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Refine query'}))
        .toHaveAttribute('href', `/gremlin/DEFAULT/hugegraph?language=${taskType}`);
});

it.each(['algorithm', undefined])('does not suggest a query editor for task type %s', async taskType => {
    api.analysis.fetchAsyncTaskResult.mockResolvedValue({status: 200, data: {
        task_status: 'failed', task_type: taskType,
        task_result: 'Task result size 77849617 exceeded limit 16777216 bytes',
    }});
    renderResult();
    expect(await screen.findByRole('alert')).toHaveTextContent('Task result exceeds the server limit');
    expect(screen.queryByRole('link', {name: 'Refine query'})).not.toBeInTheDocument();
});

it.each(['gremlin', 'cypher'])('respects disabled Cypher when recovering a %s task', async taskType => {
    isCypherEnabled.mockReturnValue(false);
    api.analysis.fetchAsyncTaskResult.mockResolvedValue({status: 200, data: {
        task_status: 'failed', task_type: taskType,
        task_result: 'Task result size 77849617 exceeded limit 16777216 bytes',
    }});
    renderResult();

    expect(await screen.findByRole('alert')).toHaveTextContent('Task result exceeds the server limit');
    const link = screen.queryByRole('link', {name: 'Refine query'});
    if (taskType === 'gremlin') {
        expect(link).toHaveAttribute('href', '/gremlin/DEFAULT/hugegraph?language=gremlin');
    }
    else {
        expect(link).not.toBeInTheDocument();
    }
});

it('does not classify unrelated task failures as a result size limit', async () => {
    api.analysis.fetchAsyncTaskResult.mockResolvedValue({status: 200, data: {
        task_status: 'failed', task_result: 'Query timed out',
    }});
    renderResult();
    expect(await screen.findByRole('alert')).toHaveTextContent('Task failed');
    expect(screen.getByText('Query timed out')).toBeInTheDocument();
    expect(screen.queryByText('Task result exceeds the server limit')).not.toBeInTheDocument();
});

const opaqueRpcFailure = 'read vertex error: rpc error: code = Unknown desc = \n\t';

it.each(['vermeer-task:load', 'vermeer-task:compute'])(
    'provides actionable checks for an empty upstream reason on %s', async taskType => {
        api.analysis.fetchAsyncTaskResult.mockResolvedValue({status: 200, data: {
            task_status: 'failed', task_type: taskType, task_result: opaqueRpcFailure,
        }});
        renderResult();

        const failure = await screen.findByRole('alert');
        expect(failure).toHaveTextContent('The upstream service returned no specific reason');
        expect(failure).toHaveTextContent('Checks, not a confirmed diagnosis');
        expect(failure).toHaveTextContent('Check Worker and Store logs');
        expect(failure).toHaveTextContent('Verify service addresses and authentication');
        expect(failure).toHaveTextContent('Verify Store pd.cluster matches Server');
        expect(failure).toHaveTextContent('UP does not confirm computation success');
        expect(screen.getByText(opaqueRpcFailure.trim())).toBeInTheDocument();
        expect(screen.queryByRole('link', {name: 'Refine query'})).not.toBeInTheDocument();
    }
);

it('copies the unchanged original upstream error including its trailing whitespace', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText}});
    api.analysis.fetchAsyncTaskResult.mockResolvedValue({status: 200, data: {
        task_status: 'failed', task_type: 'vermeer-task:load', task_result: opaqueRpcFailure,
    }});
    renderResult();

    await screen.findByText('Original error');
    await userEvent.click(screen.getByRole('button', {name: /copy/i}));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(opaqueRpcFailure));
});

it.each([
    ['gremlin', 'failed', opaqueRpcFailure],
    [undefined, 'failed', opaqueRpcFailure],
    ['vermeer-task:other', 'failed', opaqueRpcFailure],
    ['vermeer-task:load', 'success', opaqueRpcFailure],
    ['vermeer-task:compute', 'running', opaqueRpcFailure],
    ['vermeer-task:load', 'failed', 'rpc error: code = Unknown desc = permission denied'],
    ['vermeer-task:load', 'failed', 'rpc error: code = Unavailable desc = '],
    ['vermeer-task:load', 'failed', 'Unknown failure'],
    ['vermeer-task:load', 'failed', 'rpc error: code = Unknown desc = \nuseful detail'],
])('does not invent a diagnosis for type=%s status=%s result=%s', async (taskType, status, result) => {
    api.analysis.fetchAsyncTaskResult.mockResolvedValue({status: 200, data: {
        task_status: status, task_type: taskType, task_result: result,
    }});
    renderResult();

    await screen.findByText(result.replace(/\s+/g, ' ').trim());
    expect(screen.queryByText('The upstream service returned no specific reason')).not.toBeInTheDocument();
    expect(screen.queryByText('Original error')).not.toBeInTheDocument();
});

it.each([null, 'null', ' \nnull\t'])(
    'explains an explicitly unavailable successful Vermeer compute result: %s', async result => {
        api.analysis.fetchAsyncTaskResult.mockResolvedValue({status: 200, data: {
            task_status: 'success', task_type: 'vermeer-task:compute', task_result: result,
        }});
        renderResult();

        expect(await screen.findByText('Task succeeded, but its values are unavailable')).toBeInTheDocument();
        expect(screen.getByText('Check upstream retention before recomputing')).toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'Open graph algorithms'}))
            .toHaveAttribute('href', '/algorithms/DEFAULT/hugegraph');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
);

it.each(['[]', '{"vertices":[],"cursor":0,"has_more":false}'])(
    'preserves a valid empty Vermeer result %s', async result => {
        api.analysis.fetchAsyncTaskResult.mockResolvedValue({status: 200, data: {
            task_status: 'success', task_type: 'vermeer-task:compute', task_result: result,
        }});
        renderResult();

        expect(await screen.findByText(']')).toBeInTheDocument();
        expect(screen.queryByText('Task succeeded, but its values are unavailable')).not.toBeInTheDocument();
    }
);

it.each([
    ['gremlin', 'success', null],
    ['cypher', 'success', 'null'],
    ['vermeer-task:load', 'success', null],
    ['vermeer-task:compute', 'success', undefined],
    ['vermeer-task:compute', 'failed', null],
])('does not infer result availability for type=%s status=%s result=%s', async (taskType, status, result) => {
    api.analysis.fetchAsyncTaskResult.mockResolvedValue({status: 200, data: {
        task_status: status, task_type: taskType, task_result: result,
    }});
    renderResult();

    if (status === 'failed') {
        expect(await screen.findByRole('alert')).toHaveTextContent('Task failed');
    }
    else {
        expect(await screen.findByText('No task result is available.')).toBeInTheDocument();
    }
    expect(screen.queryByText('Task succeeded, but its values are unavailable')).not.toBeInTheDocument();
});


const firstComputePage = {status: 200, data: {
    task_status: 'success', task_type: 'vermeer-task:compute',
    task_result: JSON.stringify({vertices: [{ID: 'first'}], cursor: 1000, has_more: true}),
}};
const unavailableTask = result => ({status: 200, data: {
    task_status: 'success', task_type: 'vermeer-task:compute', task_result: result,
}});

it.each([null, 'null', ' \nnull\t'])(
    'confirms unavailable paged values with task metadata before replacing Retry: %s', async result => {
        api.analysis.fetchAsyncTaskResult.mockReset()
            .mockResolvedValueOnce(firstComputePage).mockResolvedValueOnce(unavailableTask(result));
        api.analysis.fetchVermeerTaskValues.mockReset().mockResolvedValue({status: 400, message: 'opaque'});
        render(<AsyncTaskResultContent graphspace='DEFAULT' graph='one' taskId={-9} />);
        fireEvent.click(await screen.findByRole('button', {name: 'analysis.async_task.result_next'}));

        expect(await screen.findByText('Task succeeded, but its values are unavailable')).toBeInTheDocument();
        expect(api.analysis.fetchAsyncTaskResult).toHaveBeenCalledTimes(2);
        expect(api.analysis.fetchAsyncTaskResult).toHaveBeenLastCalledWith('DEFAULT', 'one', -9);
        expect(api.analysis.fetchVermeerTaskValues).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', {name: 'Retry result'})).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'Open graph algorithms'}))
            .toHaveAttribute('href', '/algorithms/DEFAULT/one');
    }
);

it.each([
    unavailableTask(undefined), unavailableTask('[]'),
    unavailableTask('{"vertices":[],"has_more":false}'),
    {status: 200, data: {task_status: 'failed', task_type: 'vermeer-task:compute', task_result: null}},
    {status: 200, data: {task_status: 'running', task_type: 'vermeer-task:compute', task_result: null}},
    {status: 200, data: {task_status: 'success', task_type: 'vermeer-task:load', task_result: null}},
    {status: 200, data: {task_status: 'success', task_type: 'gremlin', task_result: null}},
    {status: 400}, {status: 403}, {status: 503},
])('retains generic recovery when metadata does not confirm unavailable compute values: %j', async metadata => {
    api.analysis.fetchAsyncTaskResult.mockReset()
        .mockResolvedValueOnce(firstComputePage).mockResolvedValueOnce(metadata);
    api.analysis.fetchVermeerTaskValues.mockReset().mockResolvedValueOnce({status: 400});
    render(<AsyncTaskResultContent graphspace='DEFAULT' graph='one' taskId={-9} />);
    fireEvent.click(await screen.findByRole('button', {name: 'analysis.async_task.result_next'}));

    expect(await screen.findByRole('button', {name: 'Retry result'})).toBeInTheDocument();
    expect(screen.queryByText('Task succeeded, but its values are unavailable')).not.toBeInTheDocument();
    api.analysis.fetchVermeerTaskValues.mockResolvedValueOnce({status: 200, data: {
        vertices: [{ID: 'recovered'}], cursor: 1001, has_more: false,
    }});
    fireEvent.click(screen.getByRole('button', {name: 'Retry result'}));
    expect(await screen.findByText('"recovered"')).toBeInTheDocument();
    expect(api.analysis.fetchVermeerTaskValues).toHaveBeenLastCalledWith('DEFAULT', 'one', -9, 1000);
});

it('does not relabel a metadata network failure as unavailable values', async () => {
    api.analysis.fetchAsyncTaskResult.mockReset()
        .mockResolvedValueOnce(firstComputePage).mockRejectedValueOnce(new Error('offline'));
    api.analysis.fetchVermeerTaskValues.mockReset().mockResolvedValueOnce({status: 400});
    render(<AsyncTaskResultContent graphspace='DEFAULT' graph='one' taskId={-9} />);
    fireEvent.click(await screen.findByRole('button', {name: 'analysis.async_task.result_next'}));
    expect(await screen.findByRole('button', {name: 'Retry result'})).toBeInTheDocument();
    expect(screen.queryByText('Task succeeded, but its values are unavailable')).not.toBeInTheDocument();
});

it.each([401, 403, 429, 503])('does not recheck task metadata for a paged status %s', async status => {
    api.analysis.fetchAsyncTaskResult.mockReset().mockResolvedValueOnce(firstComputePage);
    api.analysis.fetchVermeerTaskValues.mockReset().mockResolvedValueOnce({status});
    render(<AsyncTaskResultContent graphspace='DEFAULT' graph='one' taskId={-9} />);
    fireEvent.click(await screen.findByRole('button', {name: 'analysis.async_task.result_next'}));
    expect(await screen.findByRole('button', {name: 'Retry result'})).toBeInTheDocument();
    expect(api.analysis.fetchAsyncTaskResult).toHaveBeenCalledTimes(1);
});

it('does not recheck task metadata for a paged network failure', async () => {
    api.analysis.fetchAsyncTaskResult.mockReset().mockResolvedValueOnce(firstComputePage);
    api.analysis.fetchVermeerTaskValues.mockReset().mockRejectedValueOnce(new Error('offline'));
    render(<AsyncTaskResultContent graphspace='DEFAULT' graph='one' taskId={-9} />);
    fireEvent.click(await screen.findByRole('button', {name: 'analysis.async_task.result_next'}));
    expect(await screen.findByRole('button', {name: 'Retry result'})).toBeInTheDocument();
    expect(api.analysis.fetchAsyncTaskResult).toHaveBeenCalledTimes(1);
});

it('does not recheck task metadata for a first-page business error', async () => {
    api.analysis.fetchAsyncTaskResult.mockReset().mockResolvedValueOnce({status: 400});
    api.analysis.fetchVermeerTaskValues.mockReset();
    render(<AsyncTaskResultContent graphspace='DEFAULT' graph='one' taskId={-9} />);
    expect(await screen.findByRole('button', {name: 'Retry result'})).toBeInTheDocument();
    expect(api.analysis.fetchAsyncTaskResult).toHaveBeenCalledTimes(1);
    expect(api.analysis.fetchVermeerTaskValues).not.toHaveBeenCalled();
});

const pendingResponse = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return {promise, resolve};
};

it('ignores a previous graph page failure before requesting confirmation', async () => {
    const pending = pendingResponse();
    api.analysis.fetchAsyncTaskResult.mockReset().mockResolvedValueOnce(firstComputePage)
        .mockResolvedValueOnce({status: 200, data: {task_result: '{"graph":"new"}'}});
    api.analysis.fetchVermeerTaskValues.mockReset().mockReturnValueOnce(pending.promise);
    const view = render(<AsyncTaskResultContent graphspace='DEFAULT' graph='one' taskId={-9} />);
    fireEvent.click(await screen.findByRole('button', {name: 'analysis.async_task.result_next'}));
    view.rerender(<AsyncTaskResultContent graphspace='DEFAULT' graph='two' taskId={-9} />);
    expect(await screen.findByText('"new"')).toBeInTheDocument();
    await act(async () => { pending.resolve({status: 400}); });
    expect(screen.getByText('"new"')).toBeInTheDocument();
    expect(api.analysis.fetchAsyncTaskResult).toHaveBeenCalledTimes(2);
});

it('ignores an unavailable-values confirmation after switching tasks', async () => {
    const pending = pendingResponse();
    api.analysis.fetchAsyncTaskResult.mockReset().mockResolvedValueOnce(firstComputePage)
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce({status: 200, data: {task_result: '{"task":"new"}'}});
    api.analysis.fetchVermeerTaskValues.mockReset().mockResolvedValueOnce({status: 400});
    const view = render(<AsyncTaskResultContent graphspace='DEFAULT' graph='one' taskId={-9} />);
    fireEvent.click(await screen.findByRole('button', {name: 'analysis.async_task.result_next'}));
    await waitFor(() => expect(api.analysis.fetchAsyncTaskResult).toHaveBeenCalledTimes(2));
    view.rerender(<AsyncTaskResultContent graphspace='DEFAULT' graph='one' taskId={-10} />);
    expect(await screen.findByText('"new"')).toBeInTheDocument();
    await act(async () => { pending.resolve(unavailableTask(null)); });
    expect(screen.getByText('"new"')).toBeInTheDocument();
    expect(screen.queryByText('Task succeeded, but its values are unavailable')).not.toBeInTheDocument();
});
