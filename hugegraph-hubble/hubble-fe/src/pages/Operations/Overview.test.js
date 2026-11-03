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

import {message} from 'antd';
import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import Overview from './Overview';
import {getOverview} from '../../api/operations';
import {getDashboard} from '../../api/auth';
import i18n from '../../i18n';

jest.mock('../../api/operations');
jest.mock('../../api/auth');

beforeEach(() => {
    getDashboard.mockReturnValue(new Promise(() => {}));
});

beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: query => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        }),
    });
});

const renderOverview = () => render(
    <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
        <Overview />
    </MemoryRouter>
);

afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    i18n.changeLanguage('en-US');
});

test('keeps unknown and partial source states explicit', async () => {
    getOverview.mockResolvedValue({
        status: 'DEGRADED',
        reason: '1 Store is down',
        observed_at: 1000,
        stale: true,
        sources: {
            server: {status: 'UP', availability: 'AVAILABLE'},
            pd: {status: 'UNKNOWN', availability: 'MALFORMED'},
            stores: {status: 'UNKNOWN', availability: 'UNSUPPORTED'},
        },
        nodes: [],
        facts: {},
    });

    renderOverview();

    expect(await screen.findByText('Attention')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', {name: 'Overview view'}))
        .toBeInTheDocument();
    expect(screen.getByLabelText(/PD.*Abnormal - Unavailable.*Malformed/))
        .toBeInTheDocument();
    expect(screen.getByLabelText(/Store.*Not applicable in this deployment/))
        .toBeInTheDocument();
    expect(screen.getByText(/stale/i)).toBeInTheDocument();
});

test('loads once per mount and only reloads the snapshot on explicit refresh', async () => {
    getOverview.mockResolvedValue({
        status: 'UP', observed_at: 1000, sources: {}, facts: {}, nodes: [],
    });

    renderOverview();
    await screen.findByRole('button', {name: 'Refresh'});
    expect(getOverview).toHaveBeenCalledTimes(1);
    expect(getOverview).toHaveBeenLastCalledWith(false);

    await userEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    await waitFor(() => expect(screen.getByRole('button', {name: 'Refresh'}))
        .not.toHaveClass('ant-btn-loading'));
    expect(getOverview).toHaveBeenCalledTimes(2);
    expect(getOverview).toHaveBeenLastCalledWith(true);
});

test('moves the topology switch to the topbar when its host is available', async () => {
    getOverview.mockResolvedValue({
        status: 'UP', observed_at: 1000, sources: {}, facts: {}, nodes: [],
    });
    const topbarHost = document.createElement('div');
    topbarHost.id = 'hubble-topbar-page-context';
    document.body.appendChild(topbarHost);

    renderOverview();

    expect(await within(topbarHost).findByRole('radiogroup', {
        name: 'Overview view',
    })).toBeInTheDocument();

    topbarHost.remove();
});

test('shows loading without fabricating an empty cluster', () => {
    getOverview.mockReturnValue(new Promise(() => {}));

    const {container} = renderOverview();

    expect(container.querySelector('.ant-skeleton')).toBeInTheDocument();
    expect(screen.queryByText(/empty cluster/i)).not.toBeInTheDocument();
});

test('recovers after an initial overview failure without reloading the route', async () => {
    getOverview.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({
        status: 'UP', observed_at: 1000, sources: {}, facts: {},
        nodes: [{id: 'server-recovered', name: 'server-recovered', type: 'SERVER'}],
    });

    renderOverview();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: /Retry/i}));

    await waitFor(() => expect(getOverview).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('UP')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Refresh'})).toBeInTheDocument();
});

test('keeps the current snapshot visible while a refresh is pending', async () => {
    let finishRefresh;
    getOverview
        .mockResolvedValueOnce({
            status: 'UP',
            observed_at: 1000,
            sources: {},
            facts: {pd_leader: 'pd-current'},
            nodes: [
                {id: 'server-current', name: 'server-current', type: 'SERVER', status: 'UP'},
            ],
        })
        .mockReturnValueOnce(new Promise(resolve => {
            finishRefresh = resolve;
        }));

    renderOverview();
    expect(await screen.findByText('server-current')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', {name: 'Refresh'}));

    expect(screen.getByText('server-current')).toBeInTheDocument();
    expect(screen.getByText('pd-current')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Refresh'})).toHaveClass(
        'operations-refresh-button', 'ant-btn-text', 'ant-btn-circle', 'ant-btn-loading'
    );
    expect(screen.getByRole('button', {name: 'Refresh'})).toHaveTextContent('');

    finishRefresh({
        status: 'UP', observed_at: 2000, sources: {}, facts: {}, nodes: [],
    });
    await waitFor(() => expect(screen.getByRole('button', {name: 'Refresh'}))
        .not.toHaveClass('ant-btn-loading'));
});

test('expires cached node readiness after a failed overview refresh until fresh data arrives', async () => {
    const ready = {status: 'UP', observed_at: 1000, stale: false, sources: {}, facts: {},
        nodes: [{id: 'server-ready', name: 'Server ready', type: 'SERVER', status: 'UP',
            readiness: {status: 'READY', stale: false, observed_at: 1000}}]};
    let finishRetry;
    getOverview.mockResolvedValueOnce(ready).mockRejectedValueOnce(new Error('offline'))
        .mockReturnValueOnce(new Promise(resolve => {finishRetry = resolve;}));
    renderOverview();
    expect(await screen.findByLabelText('Service: Ready')).toBeVisible();

    await userEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    expect(await screen.findByLabelText('Service: Refresh needed')).toBeVisible();
    expect(screen.queryByLabelText('Service: Ready')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    expect(screen.getByLabelText('Service: Refresh needed')).toBeVisible();

    await act(async () => finishRetry(ready));
    expect(await screen.findByLabelText('Service: Ready')).toBeVisible();
});

test('does not restore an older overview after a newer refresh is forbidden', async () => {
    let resolveOlder;
    getOverview
        .mockResolvedValueOnce({
            status: 'UP',
            observed_at: 1000,
            sources: {},
            facts: {},
            nodes: [{id: 'initial-node', name: 'initial-node', type: 'SERVER', status: 'UP'}],
        })
        .mockReturnValueOnce(new Promise(resolve => {
            resolveOlder = resolve;
        }))
        .mockRejectedValueOnce(Object.assign(new Error('forbidden'), {status: 403}));

    renderOverview();
    await screen.findByText('initial-node');

    const refresh = screen.getByRole('button', {name: 'Refresh'});
    act(() => {
        refresh.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        refresh.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await act(async () => resolveOlder({
        status: 'UP',
        observed_at: 2000,
        sources: {},
        facts: {},
        nodes: [{id: 'stale-node', name: 'stale-node', type: 'SERVER'}],
    }));

    expect(screen.queryByText('stale-node')).not.toBeInTheDocument();
    expect(screen.queryByText('initial-node')).not.toBeInTheDocument();
});

test('shows an explicit empty cluster instead of a healthy-state claim', async () => {
    getOverview.mockResolvedValue({
        status: 'UNKNOWN', observed_at: 1000, sources: {}, facts: {}, nodes: [],
    });

    renderOverview();

    expect(await screen.findByText(
        'No nodes were discovered. Check the trusted Hubble service configuration.'
    )).toBeInTheDocument();
    expect(screen.queryByText('All discovered nodes are healthy')).not.toBeInTheDocument();
});

test('shows a bounded error state when no snapshot exists', async () => {
    getOverview.mockRejectedValue(new Error('upstream secret detail'));

    renderOverview();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText('upstream secret detail')).not.toBeInTheDocument();
});

test('removes an earlier privileged overview when a refresh is forbidden', async () => {
    getOverview
        .mockResolvedValueOnce({
            status: 'UP', observed_at: 1000, sources: {}, facts: {},
            nodes: [{id: 'admin-node', name: 'admin-node', type: 'SERVER', status: 'UP'}],
        })
        .mockRejectedValueOnce(Object.assign(new Error('forbidden'), {status: 403}));

    renderOverview();
    expect(await screen.findByText('admin-node')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', {name: 'Refresh'}))
        .not.toHaveClass('ant-btn-loading'));
    await userEvent.click(screen.getByRole('button', {name: 'Refresh'}));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText('admin-node')).not.toBeInTheDocument();
});

test('opens configured advanced monitoring with a safe external target', async () => {
    getDashboard.mockResolvedValue({
        status: 200,
        data: {
            configured: true,
            available: true,
            address: 'dashboard.example:8443',
            protocol: 'https',
        },
    });
    getOverview.mockResolvedValue({status: 'UP', nodes: [], sources: {}, facts: {}});
    const open = jest.spyOn(window, 'open').mockReturnValue({});

    renderOverview();
    await userEvent.click(await screen.findByRole('button', {
        name: 'External Advanced Dashboard',
    }));

    expect(open).toHaveBeenCalledWith(
        'https://dashboard.example:8443/monitor/machine',
        '_blank',
        'noopener,noreferrer'
    );
});

test.each([
    [{configured: false, available: false}, 'Dashboard is not configured'],
    [{
        configured: true,
        available: false,
        address: 'dashboard.example:8443',
        protocol: 'https',
    }, 'Dashboard is unavailable'],
])('keeps unavailable advanced monitoring secondary to native data', async (data, reason) => {
    getDashboard.mockResolvedValue({status: 200, data});
    getOverview.mockResolvedValue({status: 'UP', nodes: [], sources: {}, facts: {}});

    renderOverview();

    expect(await screen.findByRole('button', {name: 'External Advanced Dashboard'}))
        .toBeDisabled();
    expect(screen.getByLabelText(new RegExp(`External Advanced Dashboard: .*${reason}`)))
        .toHaveAttribute('tabindex', '0');
    expect(screen.queryByText(new RegExp(reason))).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard unavailable')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Cluster Overview'})).toBeInTheDocument();
});

test('hides advanced monitoring when the current user is forbidden', async () => {
    getDashboard.mockRejectedValue({response: {status: 403}});
    getOverview.mockResolvedValue({status: 'UP', nodes: [], sources: {}, facts: {}});

    renderOverview();

    expect(await screen.findByRole('heading', {name: 'Cluster Overview'}))
        .toBeInTheDocument();
    await waitFor(() => {
        expect(screen.queryByRole('button', {name: 'External Advanced Dashboard'}))
            .not.toBeInTheDocument();
    });
});

test('reports a blocked advanced monitoring popup without leaving the page', async () => {
    getDashboard.mockResolvedValue({
        status: 200,
        data: {
            configured: true,
            available: true,
            address: 'dashboard.example:8443',
            protocol: 'https',
        },
    });
    getOverview.mockResolvedValue({status: 'UP', nodes: [], sources: {}, facts: {}});
    jest.spyOn(window, 'open').mockReturnValue(null);
    const error = jest.spyOn(message, 'error').mockImplementation(() => {});

    renderOverview();
    await userEvent.click(await screen.findByRole('button', {
        name: 'External Advanced Dashboard',
    }));

    expect(error).toHaveBeenCalledWith(
        'The Dashboard window was blocked. Allow pop-ups and retry.'
    );
    expect(screen.getByRole('heading', {name: 'Cluster Overview'})).toBeInTheDocument();
});

test('localizes unavailable facts and safely degrades malformed observation data', async () => {
    await i18n.changeLanguage('zh-CN');
    getOverview.mockResolvedValue({
        status: 'UNKNOWN',
        observed_at: 'not-a-date',
        sources: {},
        nodes: [],
        facts: {stores_up: null},
    });

    renderOverview();

    expect((await screen.findAllByText('不可用')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
});

test('uses explicit Chinese topology labels and a compact monitoring tool status', async () => {
    await i18n.changeLanguage('zh-CN');
    getDashboard.mockResolvedValue({status: 200, data: {configured: false}});
    getOverview.mockResolvedValue({
        status: 'UP', observed_at: 1000, sources: {}, facts: {},
        nodes: [{id: 'server-1', name: 'server-1', type: 'SERVER', status: 'UP'}],
    });

    renderOverview();

    expect(await screen.findByRole('radio', {name: '拓扑图'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'HugeGraph 集群拓扑'}))
        .toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Server 层'})).toBeInTheDocument();
    const tools = document.querySelector('.operations-header-tools');
    expect(tools).not.toHaveTextContent('Dashboard 不可用');
    expect(screen.getByLabelText(
        /外部高级 Dashboard: 这是可选的外部监控入口.*Dashboard 尚未配置/
    )).toHaveAttribute('tabindex', '0');
    expect(tools).not.toHaveTextContent('dashboard.address 配置和服务健康状态');
});

test('shows a bounded, failure-first list of nodes needing attention', async () => {
    getOverview.mockResolvedValue({
        status: 'DEGRADED',
        observed_at: 1000,
        sources: {},
        facts: {},
        nodes: [
            {id: 'up', name: 'healthy', type: 'STORE', status: 'UP'},
            {id: 'unknown-b', name: 'unknown b', type: 'STORE', status: 'UNKNOWN'},
            {id: 'down-b', name: 'down b', type: 'STORE', status: 'DOWN'},
            {id: 'degraded', name: 'degraded', type: 'STORE', status: 'DEGRADED'},
            {id: 'down-a', name: 'down a', type: 'STORE', status: 'DOWN'},
            {id: 'unknown-a', name: 'unknown a', type: 'STORE', status: 'UNKNOWN'},
            {id: 'down-c', name: 'down c', type: 'STORE', status: 'DOWN'},
        ],
    });

    renderOverview();

    const attention = await screen.findByRole('region', {name: 'Items needing attention'});
    const rows = within(attention).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    expect(rows.map(row => row.textContent)).toEqual([
        expect.stringContaining('down a'),
        expect.stringContaining('down b'),
        expect.stringContaining('down c'),
        expect.stringContaining('degraded'),
        expect.stringContaining('unknown a'),
    ]);
});

test('shows the recovery reason for unavailable Store metrics without stale copy',
    async () => {
        getOverview.mockResolvedValue({
            status: 'DEGRADED',
            observed_at: 1000,
            sources: {},
            facts: {},
            nodes: [{
                id: 'store-untrusted',
                name: 'store-untrusted',
                type: 'STORE',
                status: 'UP',
                metric_statuses: {
                    system: {
                        availability: 'UNAVAILABLE',
                        stale: false,
                        reason: 'metrics_target_untrusted',
                    },
                },
            }],
        });

        renderOverview();

        const attention = await screen.findByRole('region', {
            name: 'Items needing attention',
        });
        expect(within(attention).getByRole('img', {
            name: /operations\.store\.allowed_targets/,
        })).toBeInTheDocument();
        expect(within(attention).queryByText('Stale')).not.toBeInTheDocument();
    });

test('keeps every failed source visible when the whole cluster is down', async () => {
    getOverview.mockResolvedValue({
        status: 'DOWN',
        observed_at: 1000,
        sources: {
            server: {status: 'DOWN', availability: 'UNAVAILABLE'},
            pd: {status: 'DOWN', availability: 'UNAVAILABLE'},
            stores: {status: 'DOWN', availability: 'UNAVAILABLE'},
        },
        facts: {},
        nodes: [
            {id: 'server-down', name: 'server-down', type: 'SERVER', status: 'DOWN'},
            {id: 'pd-down', name: 'pd-down', type: 'PD', status: 'DOWN'},
            {id: 'store-down', name: 'store-down', type: 'STORE', status: 'DOWN'},
        ],
    });

    renderOverview();

    const sources = await screen.findByRole('region', {name: 'Source freshness'});
    expect(within(sources).getAllByText('DOWN')).toHaveLength(3);
    expect(within(sources).getAllByLabelText(/Abnormal - Unavailable/))
        .toHaveLength(3);
    expect(screen.getByRole('region', {name: 'Items needing attention'}))
        .toBeInTheDocument();
});

test('keeps healthy freshness compact but preserves stale-source recovery context', async () => {
    getOverview.mockResolvedValue({
        status: 'DEGRADED',
        observed_at: 2000,
        sources: {
            server: {
                status: 'UP', availability: 'AVAILABLE', observed_at: 2000,
                last_success_at: 2000,
            },
            pd: {
                status: 'UP', availability: 'AVAILABLE', observed_at: 2000,
                last_success_at: 2000,
            },
            stores: {
                status: 'DOWN', availability: 'UNAVAILABLE', observed_at: 2000,
                stale: true, last_success_at: 1000,
            },
        },
        facts: {},
        nodes: [{id: 'store-down', name: 'store-down', type: 'STORE', status: 'DOWN'}],
    });

    renderOverview();

    const sources = await screen.findByRole('region', {name: 'Source freshness'});
    expect(within(sources).queryByText(/Last success/)).not.toBeInTheDocument();
    expect(within(sources).getByText(/Stale/)).toBeInTheDocument();
    expect(within(sources).getByLabelText(/Last observed.*Stale/))
        .toBeInTheDocument();
});

test('shows a concise healthy state when no node needs attention', async () => {
    getOverview.mockResolvedValue({
        status: 'UP',
        observed_at: 1000,
        sources: {},
        facts: {},
        nodes: [{id: 'up', name: 'healthy', type: 'SERVER', status: 'UP'}],
    });

    renderOverview();

    expect(await screen.findByText('All discovered nodes are healthy')).toBeInTheDocument();
});

test('explains PD cluster attention while keeping healthy nodes explicit', async () => {
    getOverview.mockResolvedValue({
        status: 'DEGRADED',
        reason: 'cluster_not_ready',
        observed_at: 1000,
        sources: {
            server: {status: 'UP', availability: 'AVAILABLE'},
            pd: {status: 'UP', availability: 'AVAILABLE'},
            stores: {status: 'UP', availability: 'AVAILABLE'},
        },
        facts: {},
        nodes: [
            {id: 'pd-1', name: 'pd-1', type: 'PD', status: 'UP', role: 'LEADER'},
            {
                id: 'pd-2',
                name: 'pd-2',
                type: 'PD',
                status: 'UP',
                role: 'FOLLOWER',
                metric_statuses: {
                    system: {
                        availability: 'UNSUPPORTED',
                        reason: 'metrics_not_collected',
                    },
                },
            },
        ],
    });

    renderOverview();

    const attention = await screen.findByRole('region', {
        name: 'Items needing attention',
    });
    expect(within(attention).getByText('Cluster state needs attention'))
        .toBeInTheDocument();
    expect(within(attention).getByText(/PD reports Cluster_Not_Ready/))
        .toBeInTheDocument();
    expect(within(attention).getByRole('link', {name: 'View all nodes'}))
        .toHaveAttribute('href', '/operations/nodes');
    expect(within(attention).getByText(
        'All nodes are healthy; the source or cluster state above is a separate signal.'
    )).toBeInTheDocument();
    expect(within(attention).queryByRole('table')).not.toBeInTheDocument();
});

test('shows failed sources even when discovery returned no nodes', async () => {
    getOverview.mockResolvedValue({
        status: 'DOWN',
        observed_at: 1000,
        sources: {
            server: {
                status: 'DOWN',
                availability: 'UNAVAILABLE',
                reason: 'upstream_unavailable',
            },
            pd: {status: 'UNSUPPORTED', availability: 'UNSUPPORTED'},
            stores: {status: 'UNSUPPORTED', availability: 'UNSUPPORTED'},
        },
        facts: {},
        nodes: [],
    });

    renderOverview();

    const attention = await screen.findByRole('region', {
        name: 'Items needing attention',
    });
    expect(within(attention).getByText('Server source needs attention'))
        .toBeInTheDocument();
    expect(within(attention).getByText('Upstream unavailable'))
        .toBeInTheDocument();
});

test('names failed metric groups beside a node that remains online', async () => {
    getOverview.mockResolvedValue({
        status: 'DEGRADED', observed_at: 1000, facts: {},
        sources: {server: {status: 'UP', availability: 'PARTIAL', reason: 'backend_metrics_failed'}},
        nodes: [{id: 'server-a', name: 'Server A', type: 'SERVER', status: 'UP', metric_statuses: {
            backend: {availability: 'UNAVAILABLE', reason: 'backend_metrics_failed'},
        }}],
    });
    renderOverview();
    const attention = await screen.findByRole('region', {name: 'Items needing attention'});
    expect(within(attention).getByRole('columnheader', {name: 'Failed metric groups'})).toBeVisible();
    const row = within(attention).getByText('Server A').closest('tr');
    expect(within(row).getByText('Backend')).toBeVisible();
    expect(within(row).getByText('UP', {exact: true})).toBeVisible();
});

test('switches between the topology and an accessible node list', async () => {
    getOverview.mockResolvedValue({
        status: 'UP',
        observed_at: Date.now(),
        sources: {},
        facts: {},
        nodes: [
            {id: 'server-1', name: 'server-1', type: 'SERVER', status: 'UP'},
            {id: 'pd-1', name: 'pd-1', type: 'PD', status: 'UP', role: 'LEADER'},
        ],
    });

    renderOverview();

    expect(await screen.findByRole('radio', {name: 'Topology'})).toBeChecked();
    await userEvent.click(screen.getByRole('radio', {name: 'Node list'}).closest('label'));

    expect(screen.getByRole('table', {name: 'Cluster nodes'})).toBeInTheDocument();
    expect(screen.queryByLabelText('Server, PD, and Store service topology'))
        .not.toBeInTheDocument();
});

test('renders leader, capacity and attention facts in the visual hierarchy', async () => {
    getOverview.mockResolvedValue({
        status: 'DEGRADED',
        reason: '1 Store is down',
        observed_at: Date.now() - 18_000,
        sources: {},
        facts: {
            pd_leader: 'pd-1',
            stores_up: 22,
            stores: 24,
            capacity_used_bytes: 40_802_189_312,
            capacity_total_bytes: 64_424_509_440,
            data_size_bytes: 15_676_565_504,
        },
        nodes: [
            {id: 'store-3', name: 'store-3', type: 'STORE', status: 'DOWN'},
        ],
    });

    renderOverview();

    expect(await screen.findByText(
        'Understand cluster topology, service tiers and node status at a glance'
    ))
        .toBeInTheDocument();
    expect(screen.getByText('1 Store is down')).toBeInTheDocument();
    expect(screen.getByText('PD Leader')).toBeInTheDocument();
    expect(screen.getByText('pd-1')).toBeInTheDocument();
    expect(screen.getByText('15.7 GB')).toBeInTheDocument();
    expect(screen.getByText('40.8 GB / 64.4 GB (63%)')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', {name: 'Capacity'})).toHaveAttribute(
        'aria-valuenow', '63'
    );
    const attention = screen.getByRole('region', {name: 'Items needing attention'});
    expect(within(attention).getByRole('table')).toBeInTheDocument();
    expect(within(attention).getByRole('columnheader', {name: 'Tier'}))
        .toBeInTheDocument();
    expect(within(attention).getByRole('columnheader', {name: 'Last observed'}))
        .toBeInTheDocument();
    expect(within(attention).getByRole('columnheader', {name: 'Action'}))
        .toBeInTheDocument();
});


test('links source alerts to dedicated diagnostics even when discovery returned no nodes', async () => {
    getOverview.mockResolvedValue({status: 'DEGRADED', sources: {stores: {
        status: 'UNKNOWN', availability: 'UNAVAILABLE', reason: 'response_too_large',
    }}, nodes: [], facts: {}});
    renderOverview();
    const link = await screen.findByRole('link', {name: 'Inspect Store source'});
    expect(link).toHaveAttribute('href',
        '/operations/nodes?type=STORE&source=stores#operations-source-diagnostics');
    expect(screen.getByText(/metrics or discovery response exceeded/)).toBeInTheDocument();
});

test('labels PD cluster statistics by their actual meaning and sampling time', async () => {
    getOverview.mockResolvedValue({
        status: 'UP', nodes: [], observed_at: 2000,
        sources: {pd_cluster_stats: {
            availability: 'AVAILABLE', observed_at: 1000, last_success_at: 1000, stale: false,
        }},
        facts: {graphs: 11, partitions: 12, replicas: 3, data_size_bytes: 1024},
    });
    renderOverview();
    const panel = (await screen.findByText('Cluster facts')).closest('aside');
    expect(within(panel).getByText('Graphs (/g)')).toBeInTheDocument();
    expect(within(panel).getByText('Shard groups')).toBeInTheDocument();
    expect(within(panel).getByText('Target replicas per group')).toBeInTheDocument();
    expect(within(panel).getByText('Approx. Store size (including replicas)')).toBeInTheDocument();
    expect(within(panel).getByText('11')).toBeInTheDocument();
    expect(within(panel).getByText('12')).toBeInTheDocument();
    expect(within(panel).getByText('3')).toBeInTheDocument();
    expect(within(panel).getByText('1 KB')).toBeInTheDocument();
    expect(within(panel).getByRole('status')).toHaveTextContent('PD statistics sampled at:');
    expect(within(panel).getByRole('status')).not.toHaveTextContent('Unavailable');
});

test('marks stale PD statistics and reports unavailable without a successful sample', async () => {
    getOverview.mockResolvedValueOnce({
        status: 'UP', nodes: [], sources: {pd_cluster_stats: {
            availability: 'PARTIAL', reason: 'statistics_stale',
            observed_at: 2000, last_success_at: 1000, stale: true,
        }}, facts: {graphs: 11},
    });
    const {unmount} = renderOverview();
    const panel = (await screen.findByText('Cluster facts')).closest('aside');
    expect(within(panel).getByRole('status')).toHaveTextContent('Stale');
    expect(within(panel).getByRole('status')).not.toHaveTextContent('Unavailable');
    unmount();
    getOverview.mockResolvedValueOnce({status: 'UP', nodes: [], sources: {
        pd_cluster_stats: {availability: 'UNAVAILABLE', reason: 'collection_failed', stale: false},
    }, facts: {}});
    renderOverview();
    const emptyPanel = (await screen.findByText('Cluster facts')).closest('aside');
    expect(within(emptyPanel).getByRole('status')).toHaveTextContent('Unavailable');
    expect(within(emptyPanel).getByRole('status')).not.toHaveTextContent(/Unavailable.*Unavailable/);
});

test('polls an initial statistics collection and stops after completion', async () => {
    jest.useFakeTimers();
    try {
        getOverview.mockResolvedValueOnce({status: 'UP', nodes: [], facts: {}, sources: {
            pd_cluster_stats: {availability: 'UNAVAILABLE', reason: 'collecting'},
        }}).mockResolvedValueOnce({status: 'UP', nodes: [], facts: {graphs: 11}, sources: {
            pd_cluster_stats: {availability: 'AVAILABLE', observed_at: 1000},
        }});
        await act(async () => { renderOverview(); });
        expect(screen.getByText(/PD statistics sampled at:.*Collecting/)).toBeInTheDocument();
        expect(getOverview).toHaveBeenCalledTimes(1);
        await act(async () => { jest.advanceTimersByTime(2000); });
        expect(getOverview).toHaveBeenCalledTimes(2);
        expect(getOverview).toHaveBeenLastCalledWith(false);
        expect(screen.getByText('11')).toBeInTheDocument();
        await act(async () => { jest.advanceTimersByTime(20000); });
        expect(getOverview).toHaveBeenCalledTimes(2);
    }
    finally {
        jest.useRealTimers();
    }
});

test('polls a refresh while retaining the previous statistics sample', async () => {
    jest.useFakeTimers();
    try {
        getOverview.mockResolvedValueOnce({status: 'UP', nodes: [], facts: {graphs: 11}, sources: {
            pd_cluster_stats: {availability: 'AVAILABLE', reason: 'collecting', last_success_at: 1000},
        }}).mockResolvedValueOnce({status: 'UP', nodes: [], facts: {graphs: 12}, sources: {
            pd_cluster_stats: {availability: 'AVAILABLE', last_success_at: 61000},
        }});
        await act(async () => { renderOverview(); });
        expect(screen.getByText('11')).toBeInTheDocument();
        await act(async () => { jest.advanceTimersByTime(2000); });
        expect(getOverview).toHaveBeenCalledTimes(2);
        expect(screen.getByText('12')).toBeInTheDocument();
        await act(async () => { jest.advanceTimersByTime(20000); });
        expect(getOverview).toHaveBeenCalledTimes(2);
    }
    finally {
        jest.useRealTimers();
    }
});

test('cancels statistics polling on unmount', async () => {
    jest.useFakeTimers();
    try {
        getOverview.mockResolvedValue({status: 'UP', nodes: [], facts: {}, sources: {
            pd_cluster_stats: {availability: 'UNAVAILABLE', reason: 'collecting'},
        }});
        let rendered;
        await act(async () => { rendered = renderOverview(); });
        rendered.unmount();
        await act(async () => { jest.advanceTimersByTime(2000); });
        expect(getOverview).toHaveBeenCalledTimes(1);
    }
    finally {
        jest.useRealTimers();
    }
});

test('limits statistics polling while collection remains pending', async () => {
    jest.useFakeTimers();
    try {
        getOverview.mockImplementation(async () => ({status: 'UP', nodes: [], facts: {}, sources: {
            pd_cluster_stats: {availability: 'UNAVAILABLE', reason: 'collecting'},
        }}));
        await act(async () => { renderOverview(); });
        for (let attempt = 0; attempt < 8; attempt++) {
            await act(async () => { jest.advanceTimersByTime(2000); });
        }
        expect(getOverview).toHaveBeenCalledTimes(8);
        expect(getOverview.mock.calls.slice(1, 7).every(([refresh]) => refresh === false)).toBe(true);
        expect(getOverview).toHaveBeenLastCalledWith(true);
        expect(screen.getByText(/Still collecting; refresh manually/)).toBeInTheDocument();
    }
    finally {
        jest.useRealTimers();
    }
});
