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
import {MemoryRouter} from 'react-router-dom';
import OperationsRoute from './OperationsRoute';
import {resetOperationsCapabilities} from './capabilities';
import * as operationsApi from '../../api/operations';
import '../../i18n';

jest.mock('../../api/operations');

afterEach(() => {
    resetOperationsCapabilities();
    jest.resetAllMocks();
});

test('allows a direct route only when backend returns the capability', async () => {
    operationsApi.getCapabilities.mockResolvedValue({
        capabilities: ['operations_health_read'],
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
    operationsApi.getCapabilities.mockResolvedValue({capabilities: []});

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
});

test('does not misreport a capability request failure as permission denied', async () => {
    operationsApi.getCapabilities.mockRejectedValue(new Error('network failure'));

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
});
