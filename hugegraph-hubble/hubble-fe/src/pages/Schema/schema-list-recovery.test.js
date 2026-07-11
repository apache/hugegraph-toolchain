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
import Schema from './index';
import * as api from '../../api';

let mockGraphspace = 'SPACE';
const mockTranslate = (key, values) => ({
    'schema_template.title': `${values?.name || 'unknown'} - Schema templates`,
    'schema_template.create': 'Create template',
    'schema_template.search_placeholder': 'Search',
    'schema_template.load_failed': 'Could not load schema templates.',
    'schema_template.retry': 'Retry schema templates',
    'schema_template.graphspace_failed': 'Could not load graph-space details.',
    'schema_template.retry_graphspace': 'Retry graph-space details',
    'schema_template.column.name': 'Name',
    'schema_template.column.created_at': 'Created',
    'schema_template.column.updated_at': 'Updated',
    'schema_template.column.creator': 'Creator',
    'schema_template.column.operation': 'Actions',
}[key] || key);

jest.mock('../../api', () => ({
    manage: {
        getGraphSpace: jest.fn(),
        getSchemaList: jest.fn(),
        delSchema: jest.fn(),
    },
}));
jest.mock('./EditLayer', () => () => null);
jest.mock('../../components/DataPreparationNav', () => () => null);
jest.mock('react-router-dom', () => ({
    useNavigate: () => jest.fn(),
    useParams: () => ({graphspace: mockGraphspace}),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: mockTranslate}),
}));

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

afterEach(() => {
    mockGraphspace = 'SPACE';
    jest.clearAllMocks();
});

it('does not present a failed schema-template request as an empty list', async () => {
    api.manage.getGraphSpace.mockResolvedValue({status: 200, data: {nickname: 'Space'}});
    api.manage.getSchemaList
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {records: [], total: 0}});

    render(<Schema />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not load schema templates.'
    );
    fireEvent.click(screen.getByRole('button', {name: 'Retry schema templates'}));

    await waitFor(() => expect(api.manage.getSchemaList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

it('ignores graph-space detail returned after the route has changed', async () => {
    let resolveA;
    let resolveB;
    api.manage.getGraphSpace.mockImplementation(graphspace => new Promise(resolve => {
        if (graphspace === 'SPACE_A') {
            resolveA = resolve;
        }
        else {
            resolveB = resolve;
        }
    }));
    api.manage.getSchemaList.mockResolvedValue({
        status: 200,
        data: {records: [], total: 0},
    });
    mockGraphspace = 'SPACE_A';
    const {rerender} = render(<Schema />);

    mockGraphspace = 'SPACE_B';
    rerender(<Schema />);
    await act(async () => {
        resolveB({status: 200, data: {nickname: 'Space B'}});
        await Promise.resolve();
    });
    expect(screen.getByText('Space B - Schema templates')).toBeInTheDocument();

    await act(async () => {
        resolveA({status: 200, data: {nickname: 'Space A'}});
        await Promise.resolve();
    });
    expect(screen.queryByText('Space A - Schema templates')).not.toBeInTheDocument();
    expect(screen.getByText('Space B - Schema templates')).toBeInTheDocument();
});

it('hides graph-space A identity and rows while graph-space B is pending', async () => {
    let resolveGraphspaceB;
    let resolveListB;
    api.manage.getGraphSpace.mockImplementation(graphspace => {
        return graphspace === 'SPACE_A'
            ? Promise.resolve({status: 200, data: {nickname: 'Space A'}})
            : new Promise(resolve => {
                resolveGraphspaceB = resolve;
            });
    });
    api.manage.getSchemaList.mockImplementation(graphspace => {
        return graphspace === 'SPACE_A' ? Promise.resolve({
            status: 200,
            data: {records: [{name: 'Schema A', key: 'Schema A'}], total: 1},
        })
            : new Promise(resolve => {
                resolveListB = resolve;
            });
    });
    mockGraphspace = 'SPACE_A';
    const {rerender} = render(<Schema />);
    expect(await screen.findByText('Schema A')).toBeInTheDocument();
    expect(screen.getByText('Space A - Schema templates')).toBeInTheDocument();

    mockGraphspace = 'SPACE_B';
    rerender(<Schema />);
    expect(screen.queryByText('Schema A')).not.toBeInTheDocument();
    expect(screen.queryByText('Space A - Schema templates')).not.toBeInTheDocument();
    expect(screen.getByText('SPACE_B - Schema templates')).toBeInTheDocument();

    await act(async () => {
        resolveGraphspaceB({status: 200, data: {nickname: 'Space B'}});
        resolveListB({status: 200, data: {records: [], total: 0}});
        await Promise.resolve();
    });
});
