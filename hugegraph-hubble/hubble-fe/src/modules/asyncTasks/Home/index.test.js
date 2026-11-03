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
import AsyncTaskHome from './index';
import GraphAnalysisContext from '../../Context';
import * as api from '../../../api/index';
import enUS from '../../../i18n/resources/en-US/modules/analysis.json';
import zhCN from '../../../i18n/resources/zh-CN/modules/analysis.json';
import {useParams, useSearchParams} from 'react-router-dom';

jest.mock('../../../api/index', () => ({
    analysis: {fetchManageTaskList: jest.fn(), fetchManageTaskById: jest.fn()},
}));
jest.mock('react-router-dom', () => ({useParams: jest.fn(), useSearchParams: jest.fn()}));
jest.mock('../Detail', () => props => (
    <div>{props.loading ? 'loading tasks' : `tasks ${props.asyncManageTaskData.total || 0}`}</div>
));
jest.mock('react-i18next', () => ({
    Trans: () => <span>Track asynchronous work and results here. Refreshes every <strong>5 seconds</strong></span>,
    useTranslation: () => ({t: (key, values) => ({
        'analysis.async_task.search_placeholder': 'Search tasks',
        'analysis.async_task.help_title': 'About async tasks',
        'analysis.async_task.help_description': 'Track asynchronous work and results here.',
        'analysis.async_task.get_failed': 'Could not load tasks.',
        'analysis.async_task.retry_list': 'Retry tasks',
        'analysis.async_task.empty_title': 'No async tasks yet',
        'analysis.async_task.empty_description': 'Tasks are created from queries and algorithms.',
        'analysis.async_task.start_query': 'GQL query',
        'analysis.async_task.open_algorithms': 'Built-in algorithms',
        'analysis.async_task.no_matches_title': 'No matching tasks',
        'analysis.async_task.no_matches_description': 'Try another search.',
        'analysis.async_task.clear_filters': 'Clear filters',
        'analysis.async_task.submitted_pending': `Task ${values?.taskId} submitted; synchronizing status`,
        'analysis.async_task.submitted_discovering': 'Checking every second',
        'analysis.async_task.submitted_delayed': 'Discovery paused after 30 checks',
    })[key] || key}),
}));

it('emphasizes the refresh interval in both supported languages', () => {
    expect(enUS.analysis.async_task.help_description).toContain('<nowrap>every <strong>5 seconds</strong></nowrap>');
    expect(zhCN.analysis.async_task.help_description).toContain('<nowrap>列表每 <strong>5 秒</strong>自动刷新</nowrap>');
});

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

beforeEach(() => {
    useParams.mockReturnValue({});
    useSearchParams.mockReturnValue([new URLSearchParams()]);
});

afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
});

it('shows list failure instead of an empty success and retries', async () => {
    api.analysis.fetchManageTaskList
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {records: [], total: 0}});
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );

    expect(screen.getByText('5 seconds').tagName).toBe('STRONG');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load tasks.');
    fireEvent.click(screen.getByRole('button', {name: 'Retry tasks'}));
    await waitFor(() => expect(api.analysis.fetchManageTaskList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

it('does not overlap polling and stops automatic retries after failure', async () => {
    jest.useFakeTimers();
    let rejectList;
    api.analysis.fetchManageTaskList.mockImplementation(() => (
        new Promise((resolve, reject) => {
            rejectList = reject;
        })
    ));
    const {unmount} = render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );
    await act(async () => Promise.resolve());

    act(() => jest.advanceTimersByTime(10000));
    expect(api.analysis.fetchManageTaskList).toHaveBeenCalledTimes(1);
    await act(async () => {
        rejectList(new Error('offline'));
        await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(10000));
    expect(api.analysis.fetchManageTaskList).toHaveBeenCalledTimes(1);
    unmount();
});

it('keeps existing task data visible during background polling', async () => {
    jest.useFakeTimers();
    api.analysis.fetchManageTaskList
        .mockResolvedValueOnce({status: 200, data: {records: [{}], total: 1}})
        .mockImplementationOnce(() => new Promise(() => {}));
    const {unmount} = render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );

    await act(async () => Promise.resolve());
    expect(await screen.findByText('tasks 1')).toBeInTheDocument();
    expect(screen.getByRole('region', {name: 'About async tasks'}))
        .toHaveTextContent('Track asynchronous work and results here.');
    act(() => jest.advanceTimersByTime(5000));

    expect(screen.getByText('tasks 1')).toBeInTheDocument();
    expect(screen.queryByText('loading tasks')).not.toBeInTheDocument();
    unmount();
});

it('explains where async tasks come from when the list is empty', async () => {
    api.analysis.fetchManageTaskList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0},
    });

    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );

    expect(await screen.findByText('No async tasks yet')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'GQL query'}))
        .toHaveAttribute('href', '/gremlin/DEFAULT/hugegraph');
    expect(screen.getByRole('link', {name: 'Built-in algorithms'}))
        .toHaveAttribute('href', '/algorithms/DEFAULT/hugegraph');
});

it('uses concise destination names for empty-task actions in both locales', () => {
    expect(zhCN.analysis.async_task.start_query).toBe('GQL 查询');
    expect(zhCN.analysis.async_task.open_algorithms).toBe('内置图算法');
    expect(enUS.analysis.async_task.start_query).toBe('GQL query');
    expect(enUS.analysis.async_task.open_algorithms).toBe('Built-in algorithms');
});

it('distinguishes filtered no-results from the first-use empty journey', async () => {
    api.analysis.fetchManageTaskList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0},
    });
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );
    await screen.findByText('No async tasks yet');

    fireEvent.change(screen.getByPlaceholderText('Search tasks'), {
        target: {value: 'missing'},
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Search tasks'), {
        key: 'Enter', code: 'Enter', charCode: 13,
    });

    expect(await screen.findByText('No matching tasks')).toBeInTheDocument();
    expect(screen.queryByRole('link', {name: 'GQL query'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Clear filters'}));
    expect(await screen.findByText('No async tasks yet')).toBeInTheDocument();
});

it('shows source unavailability even when no Server tasks exist', async () => {
    api.analysis.fetchManageTaskList.mockResolvedValue({
        status: 200, data: {records: [], total: 0, vermeerUnavailable: true},
    });
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('analysis.async_task.vermeer_unavailable');
    expect(screen.getByRole('button', {name: 'common.action.retry'})).toBeInTheDocument();
});

it('filters the submitting graph by the task ID in a scoped URL and follows later task navigation', async () => {
    useSearchParams.mockReturnValue([new URLSearchParams('taskId=80001')]);
    api.analysis.fetchManageTaskList.mockResolvedValue({
        status: 200, data: {records: [{id: 80001}], total: 1},
    });
    const page = (
        <GraphAnalysisContext.Provider value={{graphSpace: 'memory', graph: 'soc_graph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );
    const view = render(page);
    expect(await screen.findByText('tasks 1')).toBeInTheDocument();
    expect(api.analysis.fetchManageTaskList).toHaveBeenLastCalledWith('memory', 'soc_graph',
        expect.objectContaining({content: 'Server #80001', page_no: 1}));
    expect(screen.getByPlaceholderText('Search tasks')).toHaveValue('Server #80001');

    useSearchParams.mockReturnValue([new URLSearchParams('taskId=90001')]);
    view.rerender(
        <GraphAnalysisContext.Provider value={{graphSpace: 'memory', graph: 'soc_graph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );
    await waitFor(() => expect(api.analysis.fetchManageTaskList).toHaveBeenLastCalledWith('memory', 'soc_graph',
        expect.objectContaining({content: 'Server #90001', page_no: 1})));
    expect(screen.getByPlaceholderText('Search tasks')).toHaveValue('Server #90001');
});

it('trims a pasted task ID and still supports legacy task links', async () => {
    useParams.mockReturnValue({taskId: '80001'});
    api.analysis.fetchManageTaskList.mockResolvedValue({status: 200, data: {records: [], total: 0}});
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );
    await screen.findByText('No matching tasks');
    expect(api.analysis.fetchManageTaskList).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph',
        expect.objectContaining({content: 'Server #80001'}));
    fireEvent.change(screen.getByPlaceholderText('Search tasks'), {target: {value: '  90001  '}});
    fireEvent.keyDown(screen.getByPlaceholderText('Search tasks'), {key: 'Enter', code: 'Enter', charCode: 13});
    await waitFor(() => expect(api.analysis.fetchManageTaskList).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph',
        expect.objectContaining({content: '90001'})));
});

it('shows the submitted ID immediately and discovers metadata without waiting for the list', async () => {
    jest.useFakeTimers();
    useSearchParams.mockReturnValue([new URLSearchParams('taskId=80001&submitted=1')]);
    api.analysis.fetchManageTaskById.mockResolvedValueOnce({status: 200, data: []})
        .mockResolvedValue({status: 200, data: [{id: 80001, task_status: 'failed'}]});
    const {unmount} = render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'memory', graph: 'soc_graph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Task Server #80001 submitted; synchronizing status');
    await act(async () => Promise.resolve());
    expect(screen.queryByText('No matching tasks')).not.toBeInTheDocument();
    expect(api.analysis.fetchManageTaskList).not.toHaveBeenCalled();
    expect(api.analysis.fetchManageTaskById).toHaveBeenCalledWith('memory', 'soc_graph', '80001');
    await act(async () => jest.advanceTimersByTime(1000));
    expect(screen.getByText('tasks 1')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => jest.advanceTimersByTime(4000));
    expect(api.analysis.fetchManageTaskById).toHaveBeenCalledTimes(2);
    await act(async () => jest.advanceTimersByTime(1000));
    expect(api.analysis.fetchManageTaskById).toHaveBeenCalledTimes(3);
    unmount();
});

it('bounds missing submitted-task polling and offers explicit retry without inventing a task status', async () => {
    jest.useFakeTimers();
    useSearchParams.mockReturnValue([new URLSearchParams('taskId=0&submitted=1')]);
    api.analysis.fetchManageTaskById.mockResolvedValue({status: 200, data: []});
    const {unmount} = render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'memory', graph: 'soc_graph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );
    await act(async () => Promise.resolve());
    for (let attempt = 1; attempt < 30; attempt++) {
        await act(async () => jest.advanceTimersByTime(1000));
    }
    expect(screen.getByRole('alert')).toHaveTextContent('Task Server #0 submitted; synchronizing status');
    expect(screen.getByRole('alert')).toHaveTextContent('Discovery paused after 30 checks');
    await act(async () => jest.advanceTimersByTime(10000));
    expect(api.analysis.fetchManageTaskById).toHaveBeenCalledTimes(30);
    expect(screen.queryByText('No matching tasks')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Retry tasks'}));
    await act(async () => Promise.resolve());
    expect(api.analysis.fetchManageTaskById).toHaveBeenCalledTimes(31);
    expect(screen.getByRole('alert')).toHaveTextContent('Checking every second');
    unmount();
});

it('ignores delayed submitted-task responses after changing graphs', async () => {
    useSearchParams.mockReturnValue([new URLSearchParams('taskId=80001&submitted=1')]);
    let finishOld;
    api.analysis.fetchManageTaskById.mockImplementationOnce(() => new Promise(resolve => {finishOld = resolve;}))
        .mockResolvedValue({status: 200, data: []});
    const view = render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'memory', graph: 'one'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );
    view.rerender(
        <GraphAnalysisContext.Provider value={{graphSpace: 'memory', graph: 'two'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );
    await act(async () => finishOld({status: 200, data: [{id: 80001}]}));
    expect(screen.getByRole('alert')).toHaveTextContent('Task Server #80001 submitted; synchronizing status');
    expect(screen.queryByText('tasks 1')).not.toBeInTheDocument();
    view.unmount();
});

it('supports negative Vermeer IDs and treats disappearance after discovery as a missing task', async () => {
    jest.useFakeTimers();
    useSearchParams.mockReturnValue([new URLSearchParams('taskId=-7&submitted=1')]);
    api.analysis.fetchManageTaskById.mockResolvedValueOnce({status: 200, data: [{id: -7}]})
        .mockResolvedValue({status: 200, data: []});
    const view = render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'memory', graph: 'soc_graph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );
    await act(async () => Promise.resolve());
    expect(screen.getByText('tasks 1')).toBeInTheDocument();
    expect(api.analysis.fetchManageTaskById).toHaveBeenCalledWith('memory', 'soc_graph', '-7');
    expect(screen.getByPlaceholderText('Search tasks')).toHaveValue('Vermeer #7');
    fireEvent.keyDown(screen.getByPlaceholderText('Search tasks'), {key: 'Enter', code: 'Enter', charCode: 13});
    expect(api.analysis.fetchManageTaskList).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(5000));
    expect(screen.getByText('No matching tasks')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    view.unmount();
});

it('keeps a linked Vermeer task source-qualified when submitting the untouched search', async () => {
    useSearchParams.mockReturnValue([new URLSearchParams('taskId=-7')]);
    api.analysis.fetchManageTaskList.mockResolvedValue({status: 200, data: {records: [], total: 0}});
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'memory', graph: 'soc_graph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );
    await screen.findByText('No matching tasks');
    const input = screen.getByPlaceholderText('Search tasks');
    expect(input).toHaveValue('Vermeer #7');
    expect(api.analysis.fetchManageTaskList).toHaveBeenLastCalledWith('memory', 'soc_graph',
        expect.objectContaining({content: 'Vermeer #7'}));
    fireEvent.keyDown(input, {key: 'Enter', code: 'Enter', charCode: 13});
    expect(api.analysis.fetchManageTaskList).toHaveBeenCalledTimes(1);
});

it.each([400, 403, 404, 503])('stops discovery on failure %s rather than treating it as a missing task', async status => {
    jest.useFakeTimers();
    useSearchParams.mockReturnValue([new URLSearchParams('taskId=80001&submitted=1')]);
    api.analysis.fetchManageTaskById.mockResolvedValue({status});
    const view = render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'memory', graph: 'soc_graph'}}>
            <AsyncTaskHome />
        </GraphAnalysisContext.Provider>
    );
    await act(async () => Promise.resolve());
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load tasks.');
    await act(async () => jest.advanceTimersByTime(10000));
    expect(api.analysis.fetchManageTaskById).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('No matching tasks')).not.toBeInTheDocument();
    view.unmount();
});
