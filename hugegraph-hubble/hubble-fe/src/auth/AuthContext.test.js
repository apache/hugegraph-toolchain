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
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import * as api from '../api/index';
import {AuthContextProvider, useAuthContext} from './AuthContext';
import {AUTH_REVALIDATE_EVENT} from '../utils/authEvents';
import {setUser} from '../utils/user';

jest.mock('../api/index', () => ({
    auth: {
        context: jest.fn(),
    },
}));

const response = capabilities => ({
    status: 200,
    data: {
        schema_version: 1,
        context_version: capabilities.join('-') || 'none',
        mode: 'PD',
        role: 'USER',
        username: 'alice',
        capabilities,
        actions: {},
        scopes: {},
    },
});

const deferred = () => {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return {promise, resolve};
};

const Probe = () => {
    const {loading, context, hasCapability} = useAuthContext();
    if (loading) {
        return <div>loading</div>;
    }
    return (
        <div>
            <span>{context?.context_version ?? 'no-context'}</span>
            {hasCapability('operations_health_read') && <span>operations</span>}
        </div>
    );
};

const renderProvider = () => render(
    <MemoryRouter
        initialEntries={['/navigation']}
        future={{v7_startTransition: true, v7_relativeSplatPath: true}}
    >
        <AuthContextProvider>
            <Probe />
        </AuthContextProvider>
    </MemoryRouter>
);

beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();
});

afterEach(() => cleanup());

test('loads capabilities from the server context without role inference', async () => {
    setUser({id: 'alice', is_superadmin: false});
    api.auth.context.mockResolvedValue(response(['operations_health_read']));

    renderProvider();

    expect(await screen.findByText('operations')).toBeInTheDocument();
    expect(api.auth.context).toHaveBeenCalledTimes(1);
});

test('ignores an old response after the same username logs in again', async () => {
    const oldRequest = deferred();
    const currentRequest = deferred();
    setUser({id: 'alice'});
    api.auth.context
        .mockReturnValueOnce(oldRequest.promise)
        .mockReturnValueOnce(currentRequest.promise);
    renderProvider();

    await waitFor(() => expect(api.auth.context).toHaveBeenCalledTimes(1));
    act(() => setUser({id: 'alice'}));
    await waitFor(() => expect(api.auth.context).toHaveBeenCalledTimes(2));
    await act(async () => {
        currentRequest.resolve(response([]));
    });
    expect(await screen.findByText('none')).toBeInTheDocument();

    await act(async () => {
        oldRequest.resolve(response(['operations_health_read']));
    });
    expect(screen.queryByText('operations')).not.toBeInTheDocument();
    expect(screen.getByText('none')).toBeInTheDocument();
});

test('forces a fresh context after a 403 and applies a downgrade', async () => {
    setUser({id: 'alice'});
    api.auth.context
        .mockResolvedValueOnce(response(['operations_health_read']))
        .mockResolvedValueOnce(response([]));
    renderProvider();
    expect(await screen.findByText('operations')).toBeInTheDocument();

    await act(async () => {
        window.dispatchEvent(new CustomEvent(AUTH_REVALIDATE_EVENT));
    });

    await waitFor(() => expect(api.auth.context).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('operations'))
        .not.toBeInTheDocument());
});

test('does not request an auth context for an anonymous browser state', async () => {
    renderProvider();

    expect(await screen.findByText('no-context')).toBeInTheDocument();
    expect(api.auth.context).not.toHaveBeenCalled();
});
