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

import {fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import NodeDetail from './NodeDetail';
import {getNode} from '../../api/operations';
import '../../i18n';

jest.mock('../../api/operations');

beforeEach(() => {
    window.matchMedia = () => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
    });
});

afterEach(() => jest.clearAllMocks());

const response = {
    node: {
        id: 'store-safe',
        name: 'Store A',
        type: 'STORE',
        status: 'DEGRADED',
        metrics: {system: {heap_used: null}},
    },
    observed_at: 1000,
    stale: true,
    sources: {
        stores: {
            status: 'UNKNOWN',
            availability: 'TIMEOUT',
            stale: true,
            reason: 'upstream_timeout',
            last_success_at: 900,
        },
    },
};

const renderDetail = () => render(
    <MemoryRouter
        initialEntries={['/operations/nodes/store-safe']}
        future={{v7_startTransition: true, v7_relativeSplatPath: true}}
    >
        <Routes>
            <Route path='/operations/nodes/:nodeId' element={<NodeDetail />} />
        </Routes>
    </MemoryRouter>
);

test('keeps null metrics safe and distinguishes unavailable groups', async () => {
    getNode.mockResolvedValue(response);

    renderDetail();

    expect(await screen.findByRole('heading', {name: 'Store A'})).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(screen.getByText(/TIMEOUT/)).toBeInTheDocument();
    expect(screen.getAllByText(/Stale/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    const identity = screen.getByRole('region', {name: 'Node identity'});
    expect(within(identity).getByLabelText('STORE icon')).toBeInTheDocument();
    expect(within(identity).getByText('Store A')).toBeInTheDocument();
});

test('uses the version instead of an unavailable role in the node identity', async () => {
    getNode.mockResolvedValue({
        ...response,
        node: {...response.node, role: null, version: '1.7.0'},
    });

    renderDetail();

    const identity = await screen.findByRole('region', {name: 'Node identity'});
    expect(within(identity).getByText('STORE · 1.7.0')).toBeInTheDocument();
    expect(within(identity).queryByText('STORE · Unavailable')).not.toBeInTheDocument();
});

test('keeps the snapshot visible and reports a refresh failure', async () => {
    getNode.mockResolvedValueOnce(response).mockRejectedValueOnce(new Error('secret'));

    renderDetail();
    expect(await screen.findByRole('heading', {name: 'Store A'})).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: /Refresh/}));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('heading', {name: 'Store A'})).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
});

test('renders each metric group from its own metric status', async () => {
    getNode.mockResolvedValue({
        ...response,
        node: {
            ...response.node,
            metrics: {
                system: {},
                drive: {used_bytes: 7},
                backend: {graphs: 2},
            },
            metric_statuses: {
                system: {
                    availability: 'MALFORMED',
                    observed_at: 1000,
                    fresh: false,
                    stale: false,
                    reason: 'malformed_response',
                },
                drive: {
                    availability: 'UNAVAILABLE',
                    observed_at: 1000,
                    last_success_at: 900,
                    fresh: false,
                    stale: true,
                    reason: 'refresh_failed',
                },
                raft: {
                    availability: 'UNSUPPORTED',
                    observed_at: 1000,
                    fresh: false,
                    stale: false,
                    reason: 'unsupported_version',
                },
                backend: {
                    availability: 'AVAILABLE',
                    observed_at: 1000,
                    last_success_at: 1000,
                    fresh: true,
                    stale: false,
                },
            },
        },
    });

    renderDetail();
    await screen.findByRole('heading', {name: 'Store A'});

    const system = screen.getByRole('heading', {name: 'System'}).closest('section');
    expect(within(system).getByText('Malformed')).toBeInTheDocument();
    expect(within(system).getByText('Malformed response')).toBeInTheDocument();

    const drive = screen.getByRole('heading', {name: 'Drive'}).closest('section');
    expect(within(drive).getByText('Unavailable')).toBeInTheDocument();
    expect(within(drive).getByText('7')).toBeInTheDocument();
    expect(within(drive).getByText(/Stale/)).toBeInTheDocument();
    expect(within(drive).getByText(/Last success/)).toBeInTheDocument();

    const raft = screen.getByRole('heading', {name: 'Raft'}).closest('section');
    expect(within(raft).getByText('Unsupported')).toBeInTheDocument();
    expect(within(raft).getByText('Unsupported service version')).toBeInTheDocument();
    expect(within(raft).getByText(/Unsupported by this service version/))
        .toBeInTheDocument();

    const backend = screen.getByRole('heading', {name: 'Backend'}).closest('section');
    expect(within(backend).getByText('Available')).toBeInTheDocument();
    expect(within(backend).getByText('2')).toBeInTheDocument();
    expect(within(backend).queryByText('Refresh failed')).not.toBeInTheDocument();
});

test('presents native metric labels, units and capacity instead of raw keys', async () => {
    getNode.mockResolvedValue({
        ...response,
        node: {
            ...response.node,
            metrics: {
                system: {
                    basic: {mem_total: 64, mem_used: 46, uptime: 128889},
                    process_cpu_usage: 0.125,
                    uptime_seconds: 65,
                },
                drive: {
                    total_space: 233752,
                    usable_space: 5802,
                    free_space: 5802,
                    size_unit: 'MB',
                },
                backend: {capacity_bytes: 4096, available_bytes: 1024},
            },
        },
    });

    renderDetail();
    await screen.findByRole('heading', {name: 'Store A'});

    expect(screen.getByText(/Total memory:.*64 MB/)).toBeInTheDocument();
    expect(screen.getByText(/Uptime:.*2m 9s/)).toBeInTheDocument();
    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByText('1m 5s')).toBeInTheDocument();
    expect(screen.queryByText(/mem total/)).not.toBeInTheDocument();
    const capacity = screen.getAllByRole('progressbar', {name: 'Capacity usage'});
    expect(capacity.some(item => item.getAttribute('aria-valuenow') === '75')).toBe(true);
    expect(capacity.some(item => item.getAttribute('aria-valuenow') === '98')).toBe(true);
    expect(screen.getByText(/222.6 GiB \/ 228.3 GiB/)).toBeInTheDocument();
});
