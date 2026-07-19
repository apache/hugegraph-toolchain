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

    expect(await screen.findByText('DEGRADED')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', {name: 'Overview view'}))
        .toBeInTheDocument();
    expect(screen.getByText('Malformed')).toBeInTheDocument();
    expect(screen.getByText('Unsupported')).toBeInTheDocument();
    expect(screen.getByText(/stale/i)).toBeInTheDocument();
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
    expect(screen.getByRole('heading', {name: '服务拓扑图'})).toBeInTheDocument();
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

    const attention = await screen.findByRole('region', {name: 'Nodes needing attention'});
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
    expect(within(sources).getAllByText('Unavailable')).toHaveLength(3);
    expect(screen.getByRole('region', {name: 'Nodes needing attention'}))
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
    expect(within(sources).getAllByText(/Last success/)).toHaveLength(1);
    expect(within(sources).getByText(/Stale/)).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('radio', {name: 'Node list'}));

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
            capacity_used: 38.2,
            capacity_total: 60,
            capacity_unit: 'TB',
            data_size: 14.6,
            data_size_unit: 'TB',
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
    expect(screen.getByRole('progressbar', {name: 'Capacity'})).toHaveAttribute(
        'aria-valuenow', '64'
    );
    const attention = screen.getByRole('region', {name: 'Nodes needing attention'});
    expect(within(attention).getByRole('table')).toBeInTheDocument();
    expect(within(attention).getByRole('columnheader', {name: 'Tier'}))
        .toBeInTheDocument();
    expect(within(attention).getByRole('columnheader', {name: 'Last observed'}))
        .toBeInTheDocument();
    expect(within(attention).getByRole('columnheader', {name: 'Action'}))
        .toBeInTheDocument();
});
