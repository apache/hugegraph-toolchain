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
        'analysis.async_task.get_failed': 'Could not load tasks.',
        'analysis.async_task.retry_list': 'Retry tasks',
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
