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

import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {MemoryRouter, Route, Routes, useNavigate} from 'react-router-dom';
import NodeDetail from './NodeDetail';
import {getNode} from '../../api/operations';
import i18n from '../../i18n';

jest.mock('../../api/operations');

beforeEach(() => {
    i18n.changeLanguage('en-US');
    sessionStorage.clear();
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
    window.matchMedia = () => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
    });
});

test('focuses standalone Server details on applicable sources and metric cards', async () => {
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));
    getNode.mockResolvedValue({
        node: {
            id: 'server-safe',
            name: 'Server A',
            type: 'SERVER',
            status: 'UP',
            version: '1.7.0',
            metrics: {
                system: {
                    basic: {processors: 8, uptime: 128889, systemload_average: 1.5},
                    heap: {used: 512, max: 1024, committed: 768},
                    nonheap: {used: 256, max: 0, committed: 320},
                    thread: {count: 42, daemon: 20, peak: 56},
                    process_cpu_usage: 0.125,
                    system_cpu_usage: 0.25,
                },
                backend: {graphs: 2},
            },
            metric_statuses: {
                system: {availability: 'AVAILABLE', observed_at: 1000},
                backend: {availability: 'AVAILABLE', observed_at: 1000},
                drive: {
                    availability: 'NOT_APPLICABLE',
                    reason: 'deployment_mode_unsupported',
                },
                raft: {
                    availability: 'NOT_APPLICABLE',
                    reason: 'deployment_mode_unsupported',
                },
            },
        },
        observed_at: 1000,
        stale: false,
        sources: {
            server: {status: 'UP', availability: 'AVAILABLE', observed_at: 1000},
            pd: {
                status: 'UNKNOWN',
                availability: 'UNSUPPORTED',
                reason: 'deployment_mode_unsupported',
            },
            stores: {
                status: 'UNKNOWN',
                availability: 'UNSUPPORTED',
                reason: 'deployment_mode_unsupported',
            },
        },
    });

    renderDetail();
    await screen.findByRole('heading', {name: 'Server A'});

    const sources = screen.getByRole('region', {name: 'Source freshness'});
    expect(within(sources).getByText('Server')).toBeInTheDocument();
    expect(within(sources).queryByText('PD')).not.toBeInTheDocument();
    expect(within(sources).queryByText('Store')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', {name: 'Drive'})).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', {name: 'Raft'})).not.toBeInTheDocument();
    expect(screen.queryByText('Unsupported by the current deployment mode'))
        .not.toBeInTheDocument();

    const system = screen.getByRole('heading', {name: 'System'}).closest('section');
    const heap = within(system).getByRole('progressbar', {name: 'Heap memory usage'});
    expect(heap).toHaveAttribute('aria-valuenow', '50');
    expect(within(system).getByText(/512 MB \/ 1 GiB/)).toBeInTheDocument();
    expect(within(system).getByText(/256 MB \/ Unavailable/)).toBeInTheDocument();
    expect(within(system).getByText(/Committed:.*768 MB/)).toBeInTheDocument();
    expect(within(system).queryByText(/NaN|Infinity/)).not.toBeInTheDocument();

    const threads = within(system).getByRole('group', {name: 'Threads'});
    expect(within(threads).getByText('Live')).toBeInTheDocument();
    expect(within(threads).getByText('42')).toBeInTheDocument();
    expect(within(threads).getByText('Daemon')).toBeInTheDocument();
    expect(within(threads).getByText('20')).toBeInTheDocument();
    expect(within(threads).getByText('Peak')).toBeInTheDocument();
    expect(within(threads).getByText('56')).toBeInTheDocument();

    expect(within(system).getByRole('group', {name: 'CPU and runtime'}))
        .toHaveTextContent('12.5%');
    expect(within(system).getByRole('group', {name: 'CPU and runtime'}))
        .toHaveTextContent('25%');
    expect(within(system).getByRole('group', {name: 'CPU and runtime'}))
        .toHaveTextContent('1.5');
    expect(within(system).getByRole('group', {name: 'CPU and runtime'}))
        .toHaveTextContent('2m 9s');
    expect(system.querySelectorAll('.ant-statistic').length).toBeGreaterThanOrEqual(7);
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

function renderDetail() {
    return render(
        <MemoryRouter
            initialEntries={['/operations/nodes/store-safe']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Routes>
                <Route path='/operations/nodes/:nodeId' element={<NodeDetail />} />
            </Routes>
        </MemoryRouter>
    );
}

const NodeHistoryControls = () => {
    const navigate = useNavigate();
    return (
        <button type='button' onClick={() => navigate('/operations/nodes/store-new')}>
            next node
        </button>
    );
};

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
    expect(screen.getByRole('region', {name: 'Node metrics'})).toBeInTheDocument();
    expect(screen.getByText(/Observed:/)).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Refresh'})).toHaveClass(
        'operations-refresh-button', 'ant-btn-text', 'ant-btn-circle'
    );
    expect(screen.getByRole('button', {name: 'Refresh'})).toHaveTextContent('');
});

test('uses the version instead of an unavailable role in the node identity', async () => {
    getNode.mockResolvedValue({
        ...response,
        node: {...response.node, role: null, version: '1.7.0'},
    });

    renderDetail();

    const identity = await screen.findByRole('region', {name: 'Node identity'});
    expect(within(identity).getByText('Store · 1.7.0')).toBeInTheDocument();
    expect(within(identity).queryByText('Store · Unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('Role')).not.toBeInTheDocument();
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

test('recovers an initial node failure and keeps a canonical node-list action', async () => {
    getNode.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(response);

    renderDetail();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: /Back to nodes/i}))
        .toHaveAttribute('href', '/operations/nodes');

    fireEvent.click(screen.getByRole('button', {name: /Retry/i}));

    expect(await screen.findByRole('heading', {name: 'Store A'})).toBeInTheDocument();
    expect(getNode).toHaveBeenCalledTimes(2);
});

test('removes an earlier privileged node detail when refresh is forbidden', async () => {
    getNode
        .mockResolvedValueOnce(response)
        .mockRejectedValueOnce(Object.assign(new Error('forbidden'), {status: 403}));

    renderDetail();
    expect(await screen.findByRole('heading', {name: 'Store A'})).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', {name: /Refresh/}))
        .not.toHaveClass('ant-btn-loading'));

    fireEvent.click(screen.getByRole('button', {name: /Refresh/}));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByRole('heading', {name: 'Store A'})).not.toBeInTheDocument();
});

test('does not restore an older node detail after a newer request is forbidden', async () => {
    let resolveOlder;
    getNode
        .mockReturnValueOnce(new Promise(resolve => {
            resolveOlder = resolve;
        }))
        .mockRejectedValueOnce(Object.assign(new Error('forbidden'), {status: 403}));

    render(
        <MemoryRouter
            initialEntries={['/operations/nodes/store-old']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <NodeHistoryControls />
            <Routes>
                <Route path='/operations/nodes/:nodeId' element={<NodeDetail />} />
            </Routes>
        </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', {name: 'next node'}));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await act(async () => resolveOlder(response));

    expect(screen.queryByRole('heading', {name: 'Store A'})).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
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

    for (const name of ['System', 'Drive', 'Raft', 'Backend']) {
        const group = screen.getByRole('heading', {name}).closest('section');
        expect(group.querySelector('.operations-metric-header')).toBeInTheDocument();
        expect(within(group).getByRole('status')).toBeInTheDocument();
    }
});

test('explains metric groups that do not apply to a PD node', async () => {
    getNode.mockResolvedValue({
        ...response,
        node: {
            ...response.node,
            id: 'pd-safe',
            name: 'PD A',
            type: 'PD',
            role: 'LEADER',
            metrics: {system: {uptime_seconds: 10}},
            metric_statuses: {
                system: {availability: 'AVAILABLE', observed_at: 1000},
            },
        },
        sources: {pd: {availability: 'AVAILABLE', observed_at: 1000}},
    });

    renderDetail();
    await screen.findByRole('heading', {name: 'PD A'});

    const sources = screen.getByRole('region', {name: 'Source freshness'});
    expect(within(sources).getByText('PD')).toBeInTheDocument();
    expect(within(sources).getByText('Store')).toBeInTheDocument();

    const drive = screen.getByRole('heading', {name: 'Drive'}).closest('section');
    expect(within(drive).getByText('Not applicable')).toBeInTheDocument();
    expect(within(drive).getByText(
        'Drive metrics are collected from Store nodes, not PD nodes.'
    )).toBeInTheDocument();

    const raft = screen.getByRole('heading', {name: 'Raft'}).closest('section');
    expect(within(raft).getByText(
        'Raft metrics are collected from Store nodes, not PD nodes.'
    )).toBeInTheDocument();

    const backend = screen.getByRole('heading', {name: 'Backend'}).closest('section');
    expect(within(backend).getByText(
        'Backend metrics are provided by Server and Store nodes, not PD nodes.'
    )).toBeInTheDocument();
    expect(screen.queryByText('Unsupported by this service version')).not.toBeInTheDocument();
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
                    garbage_collector: {young_count: 3},
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
    const runtime = screen.getByRole('group', {name: 'CPU and runtime'});
    expect(runtime).toHaveTextContent('Uptime');
    expect(runtime).toHaveTextContent('2m 9s');
    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByText('1m 5s')).toBeInTheDocument();
    expect(screen.getByText(/young count:.*3/i)).toBeInTheDocument();
    expect(screen.queryByText(/mem total/)).not.toBeInTheDocument();
    const capacity = screen.getAllByRole('progressbar', {name: 'Capacity usage'});
    expect(capacity.some(item => item.getAttribute('aria-valuenow') === '75')).toBe(true);
    expect(capacity.some(item => item.getAttribute('aria-valuenow') === '98')).toBe(true);
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('98%')).toBeInTheDocument();
    expect(screen.getByText(/222.6 GiB \/ 228.3 GiB/)).toBeInTheDocument();
});
