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

jest.mock('../../../api/index', () => ({
    analysis: {fetchManageTaskList: jest.fn()},
}));
jest.mock('react-router-dom', () => ({useParams: () => ({})}));
jest.mock('../Detail', () => props => (
    <div>{props.loading ? 'loading tasks' : `tasks ${props.asyncManageTaskData.total || 0}`}</div>
));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
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
    })[key] || key}),
}));

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
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
