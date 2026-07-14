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
import userEvent from '@testing-library/user-event';
import GraphSpace from './index';
import * as api from '../../api';
import * as user from '../../utils/user';

let mockAuthContext;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('../../api', () => ({
    manage: {
        getGraphSpaceList: jest.fn(),
        delGraphSpace: jest.fn(),
        initBuiltin: jest.fn(),
    },
}));

jest.mock('../../utils/user', () => ({getUser: jest.fn()}));
jest.mock('../../auth/AuthContext', () => ({
    useAuthContext: () => mockAuthContext,
}));

jest.mock('react-router-dom', () => ({
    Link: ({children}) => <span>{children}</span>,
}));

jest.mock('./Card', () => ({item, canUpdate, canDelete}) => (
    <div>{item.nickname}:{canUpdate && canDelete ? 'manage' : 'view'}</div>
));
jest.mock('./EditLayer', () => ({EditLayer: ({visible}) => (
    visible ? <div>graphspace create layer</div> : null
)}));

beforeEach(() => {
    jest.clearAllMocks();
    user.getUser.mockReturnValue({is_superadmin: true, adminSpaces: []});
    mockAuthContext = {
        context: {
            actions: {graphspaces: ['create', 'read', 'update', 'delete']},
        },
    };
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

test('keeps a failed GraphSpace request distinct from a valid empty list', async () => {
    api.manage.getGraphSpaceList
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce({
            status: 200,
            data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 1},
        });

    render(<GraphSpace />);

    expect(await screen.findByText('graphspace.load.unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Space A')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'graphspace.create'}))
        .not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: 'graphspace.load.retry'}));

    expect(await screen.findByText('Space A:manage')).toBeInTheDocument();
    expect(screen.queryByText('graphspace.load.unavailable')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'graphspace.create'})).toBeEnabled();
});

test('keeps public spaces readable without exposing GraphSpace mutations', async () => {
    user.getUser.mockReturnValue({is_superadmin: true, adminSpaces: ['public']});
    mockAuthContext = {
        context: {actions: {graphspaces: ['read']}},
    };
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'public', nickname: 'Public'}], total: 1},
    });

    render(<GraphSpace />);

    expect(await screen.findByText('Public:view')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'graphspace.create'}))
        .not.toBeInTheDocument();
});

test('places the only create entry after loaded cards and supports the keyboard', async () => {
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 1},
    });

    render(<GraphSpace />);

    const graphspace = await screen.findByText('Space A:manage');
    const create = screen.getByRole('button', {name: 'graphspace.create'});
    expect(graphspace.compareDocumentPosition(create)
        & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText('graphspace.create')).toHaveLength(1);

    fireEvent.keyDown(create, {key: 'Enter'});
    expect(screen.getByText('graphspace create layer')).toBeInTheDocument();
});

test('keeps a filtered empty result distinct from the create card', async () => {
    api.manage.getGraphSpaceList
        .mockResolvedValueOnce({
            status: 200,
            data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 1},
        })
        .mockResolvedValueOnce({status: 200, data: {records: [], total: 0}});

    render(<GraphSpace />);
    await screen.findByText('Space A:manage');
    const search = screen.getByPlaceholderText('graphspace.search_placeholder');
    await userEvent.type(search, 'missing{enter}');

    expect(await screen.findByText('graphspace.no_matches')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'graphspace.create'})).toBeEnabled();
});

test('uses one list-mode create button and keeps page size at eleven', async () => {
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 1},
    });

    render(<GraphSpace />);
    await screen.findByText('Space A:manage');
    fireEvent.click(screen.getByLabelText('common.label.list_mode'));

    expect(await screen.findByRole('button', {name: 'graphspace.create'})).toBeEnabled();
    expect(screen.getAllByText('graphspace.create')).toHaveLength(1);
    await waitFor(() => expect(api.manage.getGraphSpaceList).toHaveBeenLastCalledWith(
        expect.objectContaining({page_size: 11}),
        expect.anything()
    ));
});

test('hides the list-mode create button for ordinary users and load failures', async () => {
    user.getUser.mockReturnValue({is_superadmin: false, adminSpaces: []});
    mockAuthContext = {
        context: {actions: {graphspaces: ['read']}},
    };
    api.manage.getGraphSpaceList.mockRejectedValue(new Error('down'));

    render(<GraphSpace />);
    fireEvent.click(screen.getByLabelText('common.label.list_mode'));

    expect(await screen.findByText('graphspace.load.unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'graphspace.create'}))
        .not.toBeInTheDocument();
});

test('does not let a space admin mutate GraphSpace objects from cached scopes', async () => {
    user.getUser.mockReturnValue({
        is_superadmin: true,
        adminSpaces: ['space-a'],
    });
    mockAuthContext = {
        context: {
            actions: {
                graphspaces: ['read'],
                members: ['read', 'add', 'remove'],
            },
            scopes: {admin_graphspaces: ['space-a']},
        },
    };
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 1},
    });

    render(<GraphSpace />);

    expect(await screen.findByText('Space A:view')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'graphspace.create'}))
        .not.toBeInTheDocument();
});

test('keeps the eleven-card image page size fixed without a size selector', async () => {
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'space-a', nickname: 'Space A'}], total: 100},
    });

    render(<GraphSpace />);
    await screen.findByText('Space A:manage');

    expect(document.querySelector('.ant-pagination-options-size-changer')).toBeNull();
    expect(api.manage.getGraphSpaceList).toHaveBeenLastCalledWith(
        expect.objectContaining({page_size: 11}),
        expect.anything()
    );
});
