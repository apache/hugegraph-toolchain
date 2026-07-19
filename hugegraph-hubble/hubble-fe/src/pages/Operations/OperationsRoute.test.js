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

import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter, Route, Routes, useLocation} from 'react-router-dom';
import OperationsRoute, {OperationsOverviewRoute} from './OperationsRoute';
import {useOperationsCapabilities} from './capabilities';
import {isPdEnabled} from '../../utils/config';
import '../../i18n';

jest.mock('./capabilities');
jest.mock('../../utils/config');

afterEach(() => {
    jest.resetAllMocks();
});

const CurrentRoute = () => {
    const location = useLocation();
    return <div>{location.pathname}</div>;
};

test('redirects the cluster overview to node details outside PD mode', () => {
    isPdEnabled.mockReturnValue(false);

    render(
        <MemoryRouter
            initialEntries={['/operations/overview']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Routes>
                <Route
                    path='/operations/overview'
                    element={(
                        <OperationsOverviewRoute>
                            <div>cluster content</div>
                        </OperationsOverviewRoute>
                    )}
                />
                <Route path='/operations/nodes' element={<CurrentRoute />} />
            </Routes>
        </MemoryRouter>
    );

    expect(screen.getByText('/operations/nodes')).toBeInTheDocument();
    expect(screen.queryByText('cluster content')).not.toBeInTheDocument();
    expect(useOperationsCapabilities).not.toHaveBeenCalled();
});

test('keeps the cluster overview and capability guard in PD mode', async () => {
    isPdEnabled.mockReturnValue(true);
    useOperationsCapabilities.mockReturnValue({
        loading: false,
        capabilities: ['operations_health_read'],
        error: null,
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <OperationsOverviewRoute>
                <div>cluster content</div>
            </OperationsOverviewRoute>
        </MemoryRouter>
    );

    expect(await screen.findByText('cluster content')).toBeInTheDocument();
});

test('allows a direct route only when backend returns the capability', async () => {
    useOperationsCapabilities.mockReturnValue({
        loading: false,
        capabilities: ['operations_health_read'],
        error: null,
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <OperationsRoute required='operations_health_read'>
                <div>cluster content</div>
            </OperationsRoute>
        </MemoryRouter>
    );

    expect(await screen.findByText('cluster content')).toBeInTheDocument();
});

test('shows a 403 state without rendering protected content', async () => {
    useOperationsCapabilities.mockReturnValue({
        loading: false,
        capabilities: [],
        error: null,
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <OperationsRoute required='operations_topology_read'>
                <div>secret topology</div>
            </OperationsRoute>
        </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText('secret topology')).not.toBeInTheDocument();
    expect(screen.getAllByText(/permission/i)).not.toHaveLength(0);
    expect(screen.queryByRole('button', {name: /retry/i})).not.toBeInTheDocument();
});

test('does not misreport a capability request failure as permission denied', async () => {
    const refresh = jest.fn();
    useOperationsCapabilities.mockReturnValue({
        loading: false,
        capabilities: [],
        error: new Error('network failure'),
        refresh,
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <OperationsRoute required='operations_health_read'>
                <div>cluster content</div>
            </OperationsRoute>
        </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText('cluster content')).not.toBeInTheDocument();
    expect(screen.getByText(/unable to load/i)).toBeInTheDocument();
    expect(screen.queryByText(/permission required/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: /retry/i}));
    expect(refresh).toHaveBeenCalledTimes(1);
});
