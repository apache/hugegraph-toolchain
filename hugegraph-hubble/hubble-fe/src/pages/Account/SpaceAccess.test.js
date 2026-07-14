/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {act, render, screen, waitFor} from '@testing-library/react';
import SpaceAccess from './SpaceAccess';
import * as api from '../../api';

let mockAuthContext;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('../../auth/AuthContext', () => ({
    useAuthContext: () => mockAuthContext,
}));

jest.mock('../../api', () => ({
    auth: {
        getSpaceMembers: jest.fn(),
        getSpaceRoles: jest.fn(),
        getSpaceTargets: jest.fn(),
        getSpaceAccesses: jest.fn(),
        addSpaceMember: jest.fn(),
        updateSpaceMember: jest.fn(),
        deleteSpaceMember: jest.fn(),
        addSpaceRole: jest.fn(),
        updateSpaceRole: jest.fn(),
        deleteSpaceRole: jest.fn(),
        addSpaceTarget: jest.fn(),
        updateSpaceTarget: jest.fn(),
        deleteSpaceTarget: jest.fn(),
        saveSpaceAccess: jest.fn(),
        deleteSpaceAccess: jest.fn(),
        getAllUserList: jest.fn(),
    },
    manage: {
        getGraphSpaceList: jest.fn(),
    },
}));

const deferred = () => {
    let resolve;
    const promise = new Promise(resolvePromise => {
        resolve = resolvePromise;
    });
    return {promise, resolve};
};

const page = records => ({status: 200, data: {records, total: records.length}});

const setResponses = ({members = [], roles = [], targets = [], accesses = []} = {}) => {
    api.auth.getSpaceMembers.mockResolvedValue(page(members));
    api.auth.getSpaceRoles.mockResolvedValue(page(roles));
    api.auth.getSpaceTargets.mockResolvedValue(page(targets));
    api.auth.getSpaceAccesses.mockResolvedValue({status: 200, data: accesses});
};

beforeEach(() => {
    jest.clearAllMocks();
    mockAuthContext = {
        context: {
            context_version: 'v1',
            actions: {
                members: ['read', 'add', 'remove'],
                roles: ['read', 'create', 'update', 'delete'],
                authorizations: ['read', 'grant', 'revoke'],
            },
            scopes: {
                all_graphspaces: false,
                admin_graphspaces: ['SPACE_A'],
            },
        },
    };
    setResponses({
        members: [{user_id: 'alice', user_name: 'alice', roles: []}],
        roles: [{id: 'reader-id', role_name: 'reader'}],
    });
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

test('uses only path-scoped APIs for a space administrator', async () => {
    render(<SpaceAccess />);

    expect((await screen.findAllByText('alice')).length).toBeGreaterThan(0);
    expect(api.auth.getSpaceMembers).toHaveBeenCalledWith(
        'SPACE_A', expect.any(Object), expect.any(Object)
    );
    expect(api.auth.getSpaceRoles).toHaveBeenCalledWith(
        'SPACE_A', expect.any(Object), expect.any(Object)
    );
    expect(api.auth.getSpaceTargets).toHaveBeenCalledWith(
        'SPACE_A', expect.any(Object), expect.any(Object)
    );
    expect(api.auth.getSpaceAccesses).toHaveBeenCalledWith(
        'SPACE_A', expect.any(Object), expect.any(Object)
    );
    expect(api.auth.getAllUserList).not.toHaveBeenCalled();
    expect(api.manage.getGraphSpaceList).not.toHaveBeenCalled();
});

test('drops late scoped responses after the authorization context changes', async () => {
    const requestA = deferred();
    api.auth.getSpaceMembers.mockReturnValueOnce(requestA.promise);
    const view = render(<SpaceAccess />);
    await waitFor(() => expect(api.auth.getSpaceMembers).toHaveBeenCalledWith(
        'SPACE_A', expect.any(Object), expect.any(Object)
    ));

    mockAuthContext = {
        context: {
            ...mockAuthContext.context,
            context_version: 'v2',
            scopes: {
                all_graphspaces: false,
                admin_graphspaces: ['SPACE_B'],
            },
        },
    };
    api.auth.getSpaceMembers.mockResolvedValueOnce(page([
        {user_id: 'bob', user_name: 'bob', roles: []},
    ]));
    view.rerender(<SpaceAccess />);

    expect((await screen.findAllByText('bob')).length).toBeGreaterThan(0);
    await act(async () => requestA.resolve(page([
        {user_id: 'alice', user_name: 'alice', roles: []},
    ])));
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
    expect(screen.getAllByText('bob').length).toBeGreaterThan(0);
});

test('does not infer mutations when the server grants read-only actions', async () => {
    mockAuthContext = {
        context: {
            ...mockAuthContext.context,
            actions: {
                members: ['read'],
                roles: ['read'],
                authorizations: ['read'],
            },
        },
    };

    render(<SpaceAccess />);

    expect((await screen.findAllByText('alice')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', {
        name: 'account.space_access.member.add',
    })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {
        name: 'common.action.delete',
    })).not.toBeInTheDocument();
});
