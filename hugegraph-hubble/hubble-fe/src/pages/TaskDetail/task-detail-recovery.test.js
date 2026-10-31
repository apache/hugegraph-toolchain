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
import TaskDetail from './index';
import * as api from '../../api';

let mockTaskId = '42';

jest.mock('../../api', () => ({manage: {getJobsList: jest.fn()}}));
jest.mock('../../components/DataPreparationNav', () => () => (
    <nav aria-label='Data preparation journey' />
));
jest.mock('react-router-dom', () => ({
    useNavigate: () => jest.fn(),
    useParams: () => ({taskid: mockTaskId}),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: (key, values) => ({
        'task.detail.title': 'Import task details',
        'task.detail.load_failed': 'Could not load task runs.',
        'task.detail.retry': 'Retry task runs',
        'task.detail.job_id': 'Run ID',
        'task.detail.import_count': 'Input records read',
        'task.detail.input_count_help': 'May include headers and skipped rows; not successful writes.',
        'task.detail.confirmed_vertices': 'Confirmed vertex writes',
        'task.detail.confirmed_edges': 'Confirmed edge writes',
        'task.detail.confirmed_writes_help': 'Latest attempt; updates count again and interrupted requests may be missing',
        'task.detail.create_time': 'Created',
        'task.detail.average_rate': 'Rate',
        'task.detail.duration': 'Duration',
        'task.detail.status': 'Status',
        'task.detail.other': 'Details',
        'task.status.pending': 'Pending',
        'task.status.running': 'Running',
        'task.status.success': 'Completed',
        'task.status.failed': 'Failed',
        'task.status.paused': 'Paused',
        'task.status.stopped': 'Stopped',
        'task.status.initializing': 'Initializing',
        'task.status.cancelling': 'Cancelling',
        'task.status.cancelled': 'Cancelled',
        'task.status.unknown': 'Unknown',
        'task.detail.records_per_second': `${values?.rate} records/s`,
        'task.detail.seconds': `${values?.seconds} s`,
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
    mockTaskId = '42';
    jest.clearAllMocks();
});

it('uses the import-task title and recovers a failed run list', async () => {
    api.manage.getJobsList
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({
            status: 200,
            data: {records: [{job_id: 7, job_status: 'SUCCEED'}]},
        });

    render(<TaskDetail />);

    expect(api.manage.getJobsList).toHaveBeenCalledWith(
        {taskid: '42'},
        {suppressBusinessErrorToast: true}
    );
    expect(screen.getByText('Import task details')).toBeInTheDocument();
    expect(screen.getByRole('navigation', {name: 'Data preparation journey'}))
        .toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not load task runs.'
    );
    expect(screen.queryByText('7')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: 'Retry task runs'}));
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('SUCCEED')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('hides task A runs while task B is pending', async () => {
    let resolveB;
    api.manage.getJobsList.mockImplementation(({taskid}) => {
        if (taskid === 'A') {
            return Promise.resolve({
                status: 200,
                data: {records: [{job_id: 11, job_status: 'SUCCEED'}]},
            });
        }
        return new Promise(resolve => {
            resolveB = resolve;
        });
    });
    mockTaskId = 'A';
    const {rerender} = render(<TaskDetail />);
    expect(await screen.findByText('11')).toBeInTheDocument();

    mockTaskId = 'B';
    rerender(<TaskDetail />);
    expect(screen.queryByText('11')).not.toBeInTheDocument();

    resolveB({
        status: 200,
        data: {records: [{job_id: 22, job_status: 'RUNNING'}]},
    });
    expect(await screen.findByText('22')).toBeInTheDocument();
    expect(screen.queryByText('11')).not.toBeInTheDocument();
});

it('does not restore task A when its response arrives after task B', async () => {
    let resolveA;
    let resolveB;
    api.manage.getJobsList.mockImplementation(({taskid}) => new Promise(resolve => {
        if (taskid === 'A') {
            resolveA = resolve;
        }
        else {
            resolveB = resolve;
        }
    }));
    mockTaskId = 'A';
    const {rerender} = render(<TaskDetail />);
    mockTaskId = 'B';
    rerender(<TaskDetail />);

    resolveB({
        status: 200,
        data: {records: [{job_id: 22, job_status: 'RUNNING'}]},
    });
    expect(await screen.findByText('22')).toBeInTheDocument();
    resolveA({
        status: 200,
        data: {records: [{job_id: 11, job_status: 'SUCCEED'}]},
    });
    await Promise.resolve();
    expect(screen.queryByText('11')).not.toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
});


it('labels the input offset without presenting it as successful writes', async () => {
    api.manage.getJobsList.mockResolvedValue({
        status: 200,
        data: {records: [{
            job_id: 7,
            job_status: 'SUCCEED',
            job_metrics: {total_count: 2, avg_rate: 1, total_time: 2000},
        }]},
    });

    render(<TaskDetail />);

    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('Input records read').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', {
        name: 'Input records read: May include headers and skipped rows; not successful writes.',
    }).length).toBeGreaterThan(0);
});

it('distinguishes zero input records from an unavailable count', async () => {
    api.manage.getJobsList.mockResolvedValue({
        status: 200,
        data: {records: [
            {job_id: 7, job_status: 'SUCCEED', job_metrics: {total_count: 0}},
            {job_id: 8, job_status: 'SUCCEED'},
        ]},
    });

    render(<TaskDetail />);

    const zeroRow = (await screen.findByText('7')).closest('tr');
    const unknownRow = screen.getByText('8').closest('tr');
    expect(zeroRow.querySelectorAll('td')[2]).toHaveTextContent(/^0$/);
    expect(unknownRow.querySelectorAll('td')[2]).toHaveTextContent(/^-$/);
});

it('shows confirmed vertex and edge operations separately, preserving unknown and zero', async () => {
    api.manage.getJobsList.mockResolvedValue({
        status: 200,
        data: {records: [
            {job_id: 7, job_status: 'SUCCEED', job_metrics: {
                total_count: 2, confirmed_vertex_writes: 1, confirmed_edge_writes: 0,
            }},
            {job_id: 8, job_status: 'SUCCEED', job_metrics: {total_count: 2}},
        ]},
    });

    render(<TaskDetail />);

    const row = (await screen.findByText('7')).closest('tr');
    const legacyRow = screen.getByText('8').closest('tr');
    // The two write-count columns must obey the same single-line layout as
    // the existing columns, without fixing this test to a source-code count.
    const cells = [...row.querySelectorAll('td')];
    expect(cells).toHaveLength(9);
    cells.forEach(cell => expect(cell).toHaveClass('no_wrap'));
    expect(row.querySelectorAll('td')[2]).toHaveTextContent(/^2$/);
    expect(row.querySelectorAll('td')[3]).toHaveTextContent(/^1$/);
    expect(row.querySelectorAll('td')[4]).toHaveTextContent(/^0$/);
    expect(legacyRow.querySelectorAll('td')[3]).toHaveTextContent(/^-$/);
    expect(legacyRow.querySelectorAll('td')[4]).toHaveTextContent(/^-$/);
    expect(screen.getAllByRole('img', {
        name: /Latest attempt; updates count again/,
    })).toHaveLength(2);
});
