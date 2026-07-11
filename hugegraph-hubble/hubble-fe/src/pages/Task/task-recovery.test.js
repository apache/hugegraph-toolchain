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
import Task from './index';
import * as api from '../../api';

jest.mock('../../api', () => ({
    manage: {
        getTaskList: jest.fn(),
        getMetricsTask: jest.fn(),
        enableTask: jest.fn(),
        disableTask: jest.fn(),
        deleteTask: jest.fn(),
    },
}));
jest.mock('./components/EditLayer', () => () => null);
jest.mock('./components/ViewLayer', () => () => null);
jest.mock('./components/TopStatistic', () => ({data, available}) => (
    <div data-testid='task-metrics'>
        {available ? data.total_realtime_size : '--'}
    </div>
));
jest.mock('../../components/DataPreparationNav', () => () => null);
jest.mock('react-router-dom', () => ({
    Link: ({children}) => <span>{children}</span>,
    useNavigate: () => jest.fn(),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'task.title': 'Import tasks',
        'task.load_failed': 'Could not load import tasks.',
        'task.retry': 'Retry import tasks',
        'task.metrics_failed': 'Could not load import summary.',
        'task.retry_metrics': 'Retry import summary',
        'task.create': 'Create task',
        'task.search_placeholder': 'Search',
        'task.col.name': 'Name',
        'task.col.source_type': 'Source',
        'task.col.target_space': 'Graph space',
        'task.col.target_graph': 'Graph',
        'task.col.create_time': 'Created',
        'task.col.status': 'Status',
        'task.col.sync_type': 'Schedule',
        'account.col.id': 'Creator',
        'graphspace.col.operation': 'Actions',
        'common.label.unknown': 'Unknown',
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

it('keeps task-list failure distinct from an empty list and retries only that source', async () => {
    api.manage.getTaskList
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({
            status: 200,
            data: {records: [], total: 0, size: 10},
        });
    api.manage.getMetricsTask.mockResolvedValue({status: 200, data: {}});

    render(<Task />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not load import tasks.'
    );
    fireEvent.click(screen.getByRole('button', {name: 'Retry import tasks'}));

    await waitFor(() => expect(api.manage.getTaskList).toHaveBeenCalledTimes(2));
    expect(api.manage.getMetricsTask).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

it('does not overlap or auto-retry a pending then failed task-list poll', async () => {
    jest.useFakeTimers();
    let rejectList;
    api.manage.getTaskList.mockImplementation(() => new Promise((resolve, reject) => {
        rejectList = reject;
    }));
    api.manage.getMetricsTask.mockResolvedValue({status: 200, data: {}});

    const {unmount} = render(<Task />);
    await act(async () => Promise.resolve());

    act(() => jest.advanceTimersByTime(24000));
    expect(api.manage.getTaskList).toHaveBeenCalledTimes(1);

    await act(async () => {
        rejectList(new Error('offline'));
        await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load import tasks.');

    act(() => jest.advanceTimersByTime(24000));
    expect(api.manage.getTaskList).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    unmount();
});

it('keeps metrics unknown until a metrics-only retry succeeds', async () => {
    api.manage.getTaskList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0, size: 10},
    });
    api.manage.getMetricsTask
        .mockRejectedValueOnce(new Error('metrics offline'))
        .mockResolvedValueOnce({status: 200, data: {total_realtime_size: 7}});

    render(<Task />);

    expect(await screen.findByText('Could not load import summary.')).toBeInTheDocument();
    expect(screen.getByTestId('task-metrics')).toHaveTextContent('--');
    expect(screen.getByTestId('task-metrics')).not.toHaveTextContent('0');
    fireEvent.click(screen.getByRole('button', {name: 'Retry import summary'}));

    await waitFor(() => expect(screen.getByTestId('task-metrics')).toHaveTextContent('7'));
    expect(api.manage.getMetricsTask).toHaveBeenCalledTimes(2);
    expect(api.manage.getTaskList).toHaveBeenCalledTimes(1);
});
