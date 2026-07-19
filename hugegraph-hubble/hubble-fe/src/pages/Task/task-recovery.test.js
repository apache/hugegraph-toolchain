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
import {message} from 'antd';
import Task from './index';
import * as api from '../../api';

jest.mock('../../api', () => ({
    manage: {
        getTaskList: jest.fn(),
        getMetricsTask: jest.fn(),
        enableTask: jest.fn(),
        disableTask: jest.fn(),
        deleteTask: jest.fn(),
        loadSampleGraph: jest.fn(),
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
    Link: ({children, to, ...props}) => <a href={to} {...props}>{children}</a>,
    useNavigate: () => jest.fn(),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'task.title': 'Import tasks',
        'task.load_failed': 'Could not load import tasks.',
        'task.retry': 'Retry import tasks',
        'task.metrics_failed': 'Could not load import summary.',
        'task.retry_metrics': 'Retry import summary',
        'task.demo.title': 'Quick demo datasets',
        'task.demo.target': 'Current target',
        'task.demo.choose_graph': 'Choose a target graph first',
        'task.demo.select_graph': 'Choose graph',
        'graph.menu.load_hlm_sample': 'Build Red Chamber Demo',
        'graph.menu.load_loader_sample': 'Build People & Software Demo',
        'graph.sample.hlm_title': 'Build demo?',
        'graph.sample.hlm_description': 'Safe demo',
        'graph.sample.confirm': 'Build demo',
        'graph.sample.success': 'Demo ready',
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
        'task.action.detail': 'View execution history',
        'task.action.config': 'View task configuration',
        'task.action.edit': 'Edit task',
        'task.action.pause': 'Pause task',
        'task.action.run': 'Run task',
        'task.action.delete': 'Delete task',
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
    localStorage.clear();
});

it('offers quick demos for the current target graph on the import page', async () => {
    localStorage.setItem('hubble_workbench_graph_context', JSON.stringify({
        graphspace: 'demo_space',
        graph: 'literature_demo',
    }));
    api.manage.getTaskList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0, size: 10},
    });
    api.manage.getMetricsTask.mockResolvedValue({status: 200, data: {}});

    render(<Task />);

    expect(await screen.findByText('Quick demo datasets')).toBeInTheDocument();
    expect(screen.getByText('Current target')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Build Red Chamber Demo'}))
        .toBeEnabled();
    expect(screen.getByRole('button', {name: 'Build People & Software Demo'}))
        .toBeEnabled();
    await act(async () => Promise.resolve());
});

it('does not publish a demo result after leaving the import page', async () => {
    localStorage.setItem('hubble_workbench_graph_context', JSON.stringify({
        graphspace: 'demo_space',
        graph: 'literature_demo',
    }));
    api.manage.getTaskList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0, size: 10},
    });
    api.manage.getMetricsTask.mockResolvedValue({status: 200, data: {}});
    let resolveDemo;
    api.manage.loadSampleGraph.mockReturnValue(new Promise(resolve => {
        resolveDemo = resolve;
    }));
    jest.spyOn(message, 'success').mockImplementation(() => undefined);

    const {unmount} = render(<Task />);
    fireEvent.click(await screen.findByRole('button', {name: 'Build Red Chamber Demo'}));
    fireEvent.click(await screen.findByRole('button', {name: 'Build demo'}));
    await waitFor(() => expect(api.manage.loadSampleGraph).toHaveBeenCalled());
    unmount();
    await act(async () => resolveDemo({
        status: 200,
        data: {vertices: 14, edges: 15},
    }));

    expect(message.success).not.toHaveBeenCalled();
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

    expect(await screen.findByText('Could not load import tasks.'))
        .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Retry import tasks'}));

    await waitFor(() => expect(api.manage.getTaskList).toHaveBeenCalledTimes(2));
    expect(api.manage.getMetricsTask).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Could not load import tasks.'))
        .not.toBeInTheDocument());
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
    expect(screen.getByText('Could not load import tasks.')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(24000));
    expect(api.manage.getTaskList).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Could not load import tasks.')).toBeInTheDocument();
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

it('gives every task-row action an accessible name and disables unsafe actions', async () => {
    api.manage.getTaskList.mockResolvedValue({
        status: 200,
        data: {
            records: [{
                task_id: 7,
                task_name: 'nightly import',
                ingestion_mapping: {structs: []},
                ingestion_option: {graphspace: 'DEFAULT', graph: 'hugegraph'},
                task_schedule_status: 'ENABLE',
                task_schedule_type: 'ONCE',
            }],
            total: 1,
            size: 10,
        },
    });
    api.manage.getMetricsTask.mockResolvedValue({status: 200, data: {}});

    render(<Task />);

    expect(await screen.findByRole('link', {
        name: 'View execution history',
    })).toBeInTheDocument();
    expect(screen.getByRole('button', {
        name: 'View task configuration',
    })).toBeEnabled();
    expect(screen.getByRole('button', {name: 'Edit task'})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'Pause task'})).toBeEnabled();
    expect(screen.getByRole('button', {name: 'Delete task'})).toBeDisabled();
});
