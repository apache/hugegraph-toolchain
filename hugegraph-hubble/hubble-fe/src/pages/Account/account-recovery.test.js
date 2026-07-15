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

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Account from './index';
import * as api from '../../api';

let mockCurrentUser;
let mockAuthContext;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('../../api', () => ({
    auth: {
        getAllUserList: jest.fn(),
        delUser: jest.fn(),
    },
}));

jest.mock('../../utils/user', () => ({getUser: () => mockCurrentUser}));
jest.mock('../../auth/AuthContext', () => ({
    useAuthContext: () => mockAuthContext,
}));
jest.mock('./EditLayer', () => () => null);
jest.mock('./SpaceAccess', () => () => <div>space access</div>);

beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = {id: 'admin', is_superadmin: true};
    mockAuthContext = {
        refresh: jest.fn(),
        context: {
            actions: {
                accounts: ['create', 'read', 'update', 'delete'],
                authorizations: ['read', 'grant', 'revoke'],
            },
        },
    };
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

test('shows an explicit recoverable state when no account read action remains', async () => {
    mockAuthContext = {
        refresh: jest.fn().mockResolvedValue(undefined),
        context: {actions: {accounts: [], members: [], roles: [], authorizations: []}},
    };

    render(<Account />);

    expect(screen.getByRole('alert')).toHaveTextContent('account.permission_changed');
    expect(api.auth.getAllUserList).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', {name: 'account.refresh_permissions'}));
    expect(mockAuthContext.refresh).toHaveBeenCalledTimes(1);
});

test('does not present a failed account request as an empty user table', async () => {
    api.auth.getAllUserList
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce({
            status: 200,
            data: {records: [{user_name: 'analyst'}], total: 1},
        });

    render(<Account />);

    expect(await screen.findByText('account.load.unavailable')).toBeInTheDocument();
    expect(screen.queryByText('analyst')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: 'account.load.retry'}));

    expect(await screen.findByText('analyst')).toBeInTheDocument();
    expect(screen.queryByText('account.load.unavailable')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'common.action.detail'})).toBeInTheDocument();
});

test('labels administrators, space administrators, and regular users in the list', async () => {
    api.auth.getAllUserList.mockResolvedValue({
        status: 200,
        data: {
            records: [
                {user_name: 'root', is_superadmin: true, adminSpaces: []},
                {user_name: 'space-admin', is_superadmin: false, adminSpaces: ['SPACE']},
                {user_name: 'analyst', is_superadmin: false, adminSpaces: []},
            ],
            total: 3,
        },
    });

    render(<Account />);

    expect(await screen.findByText('account.level.ADMIN')).toBeInTheDocument();
    expect(screen.getByText('account.level.SPACEADMIN')).toBeInTheDocument();
    expect(screen.getByText('account.level.USER')).toBeInTheDocument();
});

test('space administrators use scoped management without loading global accounts', async () => {
    mockCurrentUser = {
        id: 'space-admin',
        is_superadmin: true,
        adminSpaces: ['UNTRUSTED-CACHED-SPACE'],
    };
    mockAuthContext = {
        context: {
            actions: {
                accounts: [],
                members: ['read', 'add', 'remove'],
                roles: ['read', 'create', 'update', 'delete'],
                authorizations: ['read', 'grant', 'revoke'],
            },
            scopes: {admin_graphspaces: ['SPACE']},
        },
    };
    render(<Account />);

    expect(await screen.findByText('space access')).toBeInTheDocument();
    expect(api.auth.getAllUserList).not.toHaveBeenCalled();
});

test('ignores cached superadmin fields when the server denies account mutations', async () => {
    mockCurrentUser = {id: 'cached-admin', is_superadmin: true};
    mockAuthContext = {
        context: {
            actions: {accounts: ['read'], authorizations: ['read']},
        },
    };
    api.auth.getAllUserList.mockResolvedValue({
        status: 200,
        data: {
            records: [{user_name: 'analyst', is_superadmin: false, adminSpaces: []}],
            total: 1,
        },
    });

    render(<Account />);

    expect(await screen.findByText('analyst')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'account.create'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'common.action.edit'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {
        name: 'common.action.assign_permission',
    })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'common.action.delete'})).not.toBeInTheDocument();
});

test('super administrators retain all account management actions', async () => {
    api.auth.getAllUserList.mockResolvedValue({
        status: 200,
        data: {
            records: [{user_name: 'analyst', is_superadmin: false, adminSpaces: []}],
            total: 1,
        },
    });

    render(<Account />);

    expect(await screen.findByText('analyst')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'account.create'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'common.action.detail'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'common.action.edit'})).toBeInTheDocument();
    expect(screen.getByRole('button', {
        name: 'common.action.assign_permission',
    })).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'common.action.delete'})).toBeInTheDocument();
});
