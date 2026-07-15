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
jest.mock('../../components/Status', () => ({
    StatusField: ({status}) => <span>{status}</span>,
}));
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
        'task.detail.import_count': 'Imported',
        'task.detail.create_time': 'Created',
        'task.detail.average_rate': 'Rate',
        'task.detail.duration': 'Duration',
        'task.detail.status': 'Status',
        'task.detail.other': 'Details',
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
