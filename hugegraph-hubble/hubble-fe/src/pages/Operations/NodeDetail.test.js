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
                    garbage_collector: {
                        g1_young_generation_count: 3,
                        g1_young_generation_time: 12,
                        g1_old_generation_count: 1,
                        g1_old_generation_time: 4,
                        time_unit: 'ms',
                    },
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
    expect(within(system).getByText(/512 MB \/ 1 GB/)).toBeInTheDocument();
    expect(within(system).getByText(/256 MB \/ Unavailable/)).toBeInTheDocument();
    expect(within(system).getByText(/Committed:.*768 MB/)).toBeInTheDocument();
    expect(within(system).queryByText(/NaN|Infinity/)).not.toBeInTheDocument();

    const runtime = within(system).getByRole('group', {name: 'CPU and runtime'});
    expect(runtime).toHaveTextContent('12.5%');
    expect(runtime).toHaveTextContent('25%');
    expect(runtime).toHaveTextContent('1-minute system load1.5');
    expect(runtime).not.toHaveTextContent('1.5%');
    expect(runtime).toHaveTextContent('2m 9s');
    expect(runtime).toHaveTextContent('Live threads42');
    expect(runtime).not.toHaveTextContent('Daemon');
    expect(runtime).not.toHaveTextContent('Peak');
    expect(runtime).toHaveTextContent('GC count4');
    expect(runtime).toHaveTextContent('GC time16 ms');
    expect(system.querySelectorAll('.ant-statistic').length).toBeGreaterThanOrEqual(8);
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

test.each([
    ['en-US', 'Graphs with failed backend metrics', 'Some graph backend metrics failed'],
    ['zh-CN', '后端指标获取失败的图数', '部分图的后端指标获取失败'],
])('shows current backend failure count over cached successful values in %s', async (
    language, label, reason
) => {
    await i18n.changeLanguage(language);
    getNode.mockResolvedValue({
        ...response,
        node: {
            id: 'server-safe', name: 'Server A', type: 'SERVER', status: 'UP',
            metrics: {backend: {graphs: 2, nodes: 4, failed_graphs: 0}},
            metric_statuses: {backend: {
                availability: 'UNAVAILABLE', reason: 'backend_metrics_failed',
                stale: true, last_success_at: 1000, observed_at: 2000,
                diagnostics: {failed_graphs: 1},
            }},
        },
    });

    renderDetail();
    await screen.findByRole('heading', {name: 'Server A'});
    const backend = screen.getByRole('heading', {
        name: i18n.t('operations.metric_server_backend'),
    }).closest('section');
    const count = within(backend).getByText(label).closest('.operations-statistic-card');
    expect(count).toHaveTextContent('1');
    expect(count).not.toHaveTextContent('0');
    expect(backend).toHaveTextContent(reason);
});

test('keeps null metrics safe and distinguishes unavailable groups', async () => {
    getNode.mockResolvedValue(response);

    renderDetail();

    expect(await screen.findByRole('heading', {name: 'Store A'})).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/TIMEOUT/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Stale/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    const identity = screen.getByRole('region', {name: 'Node identity'});
    expect(within(identity).getByLabelText('STORE icon')).toBeInTheDocument();
    expect(within(identity).getByText('Store A')).toBeInTheDocument();
    expect(screen.getByRole('region', {name: 'Node metrics'})).toBeInTheDocument();
    expect(screen.getAllByText(/Last observed:/).length).toBeGreaterThan(0);
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

test('keeps old readiness stale through a retry until a successful node response arrives', async () => {
    const ready = {...response, stale: false,
        node: {...response.node, readiness: {status: 'READY', stale: false, observed_at: 1000},
            process_lifecycle: {state: 'STARTED', stale: false, observed_at: 1000}}};
    let finishRetry;
    getNode.mockResolvedValueOnce(ready).mockRejectedValueOnce(new Error('offline'))
        .mockReturnValueOnce(new Promise(resolve => {finishRetry = resolve;}));
    renderDetail();
    const panel = await screen.findByRole('region', {name: 'Service readiness'});
    const lifecycle = screen.getByRole('region', {name: 'Store process lifecycle'});
    expect(within(panel).getByText('Ready', {exact: true})).toBeVisible();
    expect(within(lifecycle).getByText('Started', {exact: true})).toBeVisible();

    fireEvent.click(screen.getByRole('button', {name: /Refresh/}));
    await waitFor(() => expect(within(panel).getByText('Refresh needed')).toBeVisible());
    expect(within(lifecycle).getByText('Stale', {exact: true})).toBeVisible();
    expect(within(panel).queryByText('Ready', {exact: true})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /Refresh/}));
    expect(within(panel).getByText('Refresh needed')).toBeVisible();

    await act(async () => finishRetry(ready));
    expect(within(panel).getByText('Ready', {exact: true})).toBeVisible();
});

test.each([
    ['explicit metric status', {system: {availability: 'AVAILABLE', fresh: true, stale: false}}, 'AVAILABLE', true],
    ['partial source fallback', undefined, 'PARTIAL', true],
    ['available source fallback', undefined, 'AVAILABLE', false],
])('keeps %s stale through refresh failure and pending retry', async (_, statuses, availability, initiallyFresh) => {
    getNode.mockReset();
    const snapshot = {...response, stale: false,
        node: {...response.node, id: 'pd-safe', name: 'PD A', type: 'PD',
            metrics: {system: {uptime_seconds: 12}}, metric_statuses: statuses},
        sources: {pd: {status: 'UP', availability, fresh: true, stale: false, observed_at: 1000}}};
    let finishRetry;
    getNode.mockResolvedValueOnce(snapshot).mockRejectedValueOnce(new Error('offline'))
        .mockReturnValueOnce(new Promise(resolve => {finishRetry = resolve;}));
    renderDetail();
    await screen.findByRole('heading', {name: 'PD A'});
    const system = screen.getByRole('heading', {name: 'System'}).closest('section');
    expect(Boolean(within(system).queryByRole('img', {name: 'Fresh'}))).toBe(initiallyFresh);

    fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    await waitFor(() => expect(within(system).getByText('Stale')).toBeVisible());
    expect(within(system).queryByRole('img', {name: 'Fresh'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    expect(within(system).getByText('Stale')).toBeVisible();
    expect(within(system).queryByRole('img', {name: 'Fresh'})).not.toBeInTheDocument();

    await act(async () => finishRetry(snapshot));
    expect(within(system).queryByText('Stale')).not.toBeInTheDocument();
    expect(Boolean(within(system).queryByRole('img', {name: 'Fresh'}))).toBe(initiallyFresh);
});

test('does not display a fresh icon when a metric response is also stale', async () => {
    getNode.mockReset();
    getNode.mockResolvedValue({...response, node: {...response.node,
        metric_statuses: {system: {availability: 'AVAILABLE', fresh: true, stale: true}}}});
    renderDetail();
    await screen.findByRole('heading', {name: 'Store A'});
    const system = screen.getByRole('heading', {name: 'System'}).closest('section');
    expect(within(system).getByText('Stale')).toBeVisible();
    expect(within(system).queryByRole('img', {name: 'Fresh'})).not.toBeInTheDocument();
});

test('keeps a retained PD endpoint sample stale through a failed refresh and pending retry', async () => {
    const pd = {...response, stale: false, node: {...response.node,
        id: 'pd-safe', name: 'PD A', type: 'PD', metrics: {}, metric_statuses: {}},
    sources: {pd: {status: 'UP', availability: 'PARTIAL', reason: 'pd_metrics_unmapped', stale: false,
        diagnostics: {pd_endpoint_metrics: {metrics: {process_cpu_usage: 0.125, heap_used_bytes: 1048576},
            metric_status: {availability: 'AVAILABLE', fresh: true, stale: false, observed_at: 1000}}}}}};
    let finishRetry;
    getNode.mockResolvedValueOnce(pd).mockRejectedValueOnce(new Error('offline'))
        .mockReturnValueOnce(new Promise(resolve => {finishRetry = resolve;}));
    renderDetail();
    await screen.findByRole('heading', {name: 'PD A'});
    fireEvent.click(screen.getByText('Check addresses and how to fix'));
    const sample = screen.getByText('Configured PD endpoint sample').parentElement;
    expect(within(sample).getByText('12.5%')).toBeVisible();
    expect(within(sample).getByText('1 MB')).toBeVisible();

    fireEvent.click(screen.getByRole('button', {name: /Refresh/}));
    await waitFor(() => expect(within(sample).getAllByText('Stale').length).toBeGreaterThan(0));
    expect(within(sample).queryByText('12.5%')).not.toBeInTheDocument();
    expect(within(sample).queryByText('1 MB')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /Refresh/}));
    expect(within(sample).getAllByText('Stale').length).toBeGreaterThan(0);
    expect(within(sample).queryByText('12.5%')).not.toBeInTheDocument();

    await act(async () => finishRetry(pd));
    expect(within(sample).getByText('12.5%')).toBeVisible();
    expect(within(sample).getByText('1 MB')).toBeVisible();
    expect(within(sample).queryByText('Stale')).not.toBeInTheDocument();
});

test('shows Store process lifecycle independently of readiness', async () => {
    getNode.mockResolvedValue({...response, stale: false, node: {...response.node,
        readiness: {status: 'NOT_READY', state: 'STARTING', stale: false},
        process_lifecycle: {state: 'STARTED', stale: false, observed_at: 1000}}});
    renderDetail();
    const lifecycle = await screen.findByRole('region', {name: 'Store process lifecycle'});
    expect(within(lifecycle).getByText('Started', {exact: true})).toBeVisible();
    expect(within(lifecycle).getByText(/does not establish PD membership, partition health or read\/write readiness/))
        .toBeVisible();
    expect(within(screen.getByRole('region', {name: 'Service readiness'})).getByText('Not ready', {exact: true}))
        .toBeVisible();
});

test('old Store lifecycle endpoint degrades safely', async () => {
    getNode.mockResolvedValue({...response, stale: false, node: {...response.node,
        process_lifecycle: {state: 'UNKNOWN', reason: 'unsupported_version', stale: false}}});
    renderDetail();
    const lifecycle = await screen.findByRole('region', {name: 'Store process lifecycle'});
    expect(within(lifecycle).getByText('Not supported by this Store version')).toBeVisible();
    expect(within(lifecycle).queryByText('Started')).not.toBeInTheDocument();
});

test('older Hubble responses without lifecycle do not invent a state', async () => {
    getNode.mockResolvedValue(response);
    renderDetail();
    await screen.findByRole('heading', {name: 'Store A'});
    expect(screen.queryByRole('region', {name: 'Store process lifecycle'})).not.toBeInTheDocument();
});

test('recovers an initial node failure and keeps a canonical node-list action', async () => {
    getNode.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(response);

    renderDetail();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Back to nodes/i})).toBeEnabled();

    fireEvent.click(screen.getByRole('button', {name: /Retry/i}));

    expect(await screen.findByRole('heading', {name: 'Store A'})).toBeInTheDocument();
    expect(getNode).toHaveBeenCalledTimes(2);
});

test.each([401, 403])('removes an earlier privileged node detail when refresh returns %s', async status => {
    getNode
        .mockResolvedValueOnce(response)
        .mockRejectedValueOnce(Object.assign(new Error('forbidden'), {status}));

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
                    observed_at: 2000,
                    last_success_at: 1000,
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
    const formatter = new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium',
    });
    expect(drive).toHaveTextContent(formatter.format(new Date(1000)));
    expect(drive).not.toHaveTextContent(formatter.format(new Date(2000)));
    expect(within(drive).queryByText(/Last observed/)).not.toBeInTheDocument();

    const raft = screen.getByRole('heading', {name: 'Raft'}).closest('section');
    expect(within(raft).getByText('Unsupported')).toBeInTheDocument();
    expect(within(raft).getByText('Unsupported service version')).toBeInTheDocument();
    expect(within(raft).getByText(/Unsupported by this service version/))
        .toBeInTheDocument();
    fireEvent.mouseOver(within(raft).getByText('Unsupported'));
    expect(await screen.findByText(
        'Upgrade HugeGraph to a version that provides this metric'
    )).toBeInTheDocument();

    const backend = screen.getByRole('heading', {
        name: 'Storage & partitions',
    }).closest('section');
    expect(within(backend).getByText('Available')).toBeInTheDocument();
    expect(within(backend).getByText('2')).toBeInTheDocument();
    expect(within(backend).queryByText('Refresh failed')).not.toBeInTheDocument();
    expect(within(backend).getByLabelText('Fresh')).toBeInTheDocument();
    expect(within(backend).queryByText('Fresh')).not.toBeInTheDocument();
    expect(within(backend).getAllByText(/Last observed/)).toHaveLength(1);
    expect(within(backend).queryByText(/Last success/)).not.toBeInTheDocument();

    for (const name of ['System', 'Drive', 'Raft', 'Storage & partitions']) {
        const group = screen.getByRole('heading', {name}).closest('section');
        expect(group.querySelector('.operations-metric-header')).toBeInTheDocument();
        expect(within(group).getByRole('status')).toBeInTheDocument();
    }
});

test('hides metric groups that do not apply to a PD node', async () => {
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
    expect(within(sources).queryByText('Store')).not.toBeInTheDocument();
    expect(within(sources).queryByText('Server')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'System'}))
        .toBeInTheDocument();

    expect(screen.queryByRole('heading', {name: 'Drive'})).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', {name: 'Raft'})).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', {name: 'Storage & partitions'}))
        .not.toBeInTheDocument();
    expect(screen.queryByText('Unsupported by this service version')).not.toBeInTheDocument();
});

test.each([
    [{stale: true, observed_at: 5000, last_success_at: 1000}, 'Last success', 1000],
    [{stale: true, observed_at: 5000}, 'Last observed', 5000],
    [{stale: false, last_success_at: 1000}, 'Last success', 1000],
    [{stale: false, observed_at: 5000, last_success_at: 1000}, 'Last observed', 5000],
])('labels the metric timestamp by its actual field: %j', async (status, label, timestamp) => {
    getNode.mockResolvedValue({
        ...response,
        node: {...response.node, metrics: {system: {uptime_seconds: 10}}, metric_statuses: {
            system: {availability: 'UNAVAILABLE', reason: 'upstream_timeout',
                ...status},
        }},
    });
    renderDetail();
    const group = (await screen.findByRole('heading', {name: 'System'})).closest('section');
    const formatted = new Intl.DateTimeFormat('en-US', {dateStyle: 'medium', timeStyle: 'medium'})
        .format(new Date(timestamp));
    expect(within(group).getByText(`${label}: ${formatted}`)).toBeVisible();
    expect(within(group).queryByText(label === 'Last success' ? /^Last observed:/ : /^Last success:/))
        .not.toBeInTheDocument();
});

test('presents native metric labels, units and capacity instead of raw keys', async () => {
    getNode.mockResolvedValue({
        ...response,
        node: {
            ...response.node,
            metrics: {
                system: {
                    basic: {
                        mem_total: 64,
                        mem_used: 46,
                        uptime: 128889,
                        systemload_average: 2.33,
                    },
                    process_cpu_usage: 0.125,
                    uptime_seconds: 65,
                    garbage_collector: {
                        young_count: 3,
                        young_time: 8,
                        old_count: 1,
                        old_time: 2,
                        time_unit: 'ms',
                    },
                },
                drive: {
                    total_space: 233752,
                    usable_space: 5802,
                    free_space: 5802,
                    size_unit: 'MB',
                },
                backend: {
                    capacity_bytes: 4096,
                    available_bytes: 1024,
                    partitions: 12,
                    leaders: 3,
                },
            },
        },
    });

    renderDetail();
    await screen.findByRole('heading', {name: 'Store A'});

    expect(screen.queryByText(/Total memory/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Used memory/)).not.toBeInTheDocument();
    const runtime = screen.getByRole('group', {name: 'CPU and runtime'});
    expect(runtime).toHaveTextContent('Uptime');
    expect(runtime).toHaveTextContent('1-minute system load');
    expect(runtime).toHaveTextContent('2.33');
    expect(runtime).not.toHaveTextContent('2.33%');
    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(screen.getByText('1m 5s')).toBeInTheDocument();
    expect(screen.queryByText('2m 9s')).not.toBeInTheDocument();
    expect(runtime).toHaveTextContent('GC count4');
    expect(runtime).toHaveTextContent('GC time10 ms');
    expect(screen.queryByText(/mem total/)).not.toBeInTheDocument();
    const capacity = screen.getAllByRole('progressbar', {name: 'Capacity usage'});
    expect(capacity.some(item => item.getAttribute('aria-valuenow') === '75')).toBe(true);
    expect(capacity.some(item => item.getAttribute('aria-valuenow') === '98')).toBe(true);
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('98%')).toBeInTheDocument();
    expect(screen.getByText(/222.6 GB \/ 228.3 GB/)).toBeInTheDocument();
    const drive = screen.getByRole('heading', {name: 'Drive'}).closest('section');
    expect(within(drive).getByText('Available space')).toBeInTheDocument();
    expect(within(drive).getByText('5.7 GB')).toBeInTheDocument();
    expect(within(drive).queryByText('Free space')).not.toBeInTheDocument();
    expect(within(drive).queryByText('Space unit')).not.toBeInTheDocument();
    expect(within(drive).getByText('Available space')
        .closest('.operations-statistic-card')).toBeInTheDocument();
    const backend = screen.getByRole('heading', {
        name: 'Storage & partitions',
    }).closest('section');
    expect(within(backend).getByText('Partition count')).toBeInTheDocument();
    expect(within(backend).getByText('Leader partitions')).toBeInTheDocument();
    expect(within(backend).queryByText('Total capacity')).not.toBeInTheDocument();
    expect(within(backend).queryByText('Available capacity')).not.toBeInTheDocument();
});

test('uses concise Chinese names for Raft and Store storage metrics', async () => {
    i18n.changeLanguage('zh-CN');
    getNode.mockResolvedValue({
        ...response,
        node: {
            ...response.node,
            metrics: {
                system: {},
                drive: {total_space: 100, usable_space: 40, size_unit: 'MB'},
                raft: {groups: 12, enabled_groups: 12},
                backend: {
                    capacity_bytes: 100,
                    available_bytes: 40,
                    partitions: 12,
                    leaders: 3,
                },
            },
            metric_statuses: {
                system: {availability: 'AVAILABLE', observed_at: 1000},
                drive: {availability: 'AVAILABLE', observed_at: 1000},
                raft: {availability: 'AVAILABLE', observed_at: 1000},
                backend: {availability: 'AVAILABLE', observed_at: 1000},
            },
        },
    });

    renderDetail();

    expect(await screen.findByRole('heading', {name: 'Raft'}))
        .toBeInTheDocument();
    expect(screen.getByRole('heading', {name: '存储与分区'}))
        .toBeInTheDocument();
    expect(screen.queryByText('Raft 共识')).not.toBeInTheDocument();
});

test('shows an empty state when a metric group only has hidden metadata', async () => {
    getNode.mockResolvedValue({
        ...response,
        node: {
            ...response.node,
            metrics: {
                system: {},
                drive: {total_space: 100, free_space: 40, size_unit: 'MB'},
            },
            metric_statuses: {
                system: {availability: 'AVAILABLE', observed_at: 1000},
                drive: {availability: 'AVAILABLE', observed_at: 1000},
            },
        },
    });

    renderDetail();

    const drive = (await screen.findByRole('heading', {name: 'Drive'}))
        .closest('section');
    expect(within(drive).getByRole('note')).toHaveTextContent('No metric data');
    expect(drive.querySelector('.operations-group-statistics'))
        .not.toBeInTheDocument();
});
