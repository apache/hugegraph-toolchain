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
import {render, screen, waitFor, within} from '@testing-library/react';
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
    expect(screen.getByText('Malformed')).toBeInTheDocument();
    expect(screen.getByText('Unsupported')).toBeInTheDocument();
    expect(screen.getByText(/stale/i)).toBeInTheDocument();
});

test('shows loading without fabricating an empty cluster', () => {
    getOverview.mockReturnValue(new Promise(() => {}));

    const {container} = renderOverview();

    expect(container.querySelector('.ant-skeleton')).toBeInTheDocument();
    expect(screen.queryByText(/empty cluster/i)).not.toBeInTheDocument();
});

test('shows a bounded error state when no snapshot exists', async () => {
    getOverview.mockRejectedValue(new Error('upstream secret detail'));

    renderOverview();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText('upstream secret detail')).not.toBeInTheDocument();
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
        name: 'Advanced monitoring',
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

    expect(await screen.findByRole('button', {name: 'Advanced monitoring'}))
        .toBeDisabled();
    expect(screen.getByLabelText(new RegExp(`Advanced monitoring: ${reason}`)))
        .toHaveAttribute('tabindex', '0');
    expect(screen.getByText(new RegExp(reason))).toBeVisible();
    expect(screen.getByRole('heading', {name: 'Cluster Overview'})).toBeInTheDocument();
});

test('hides advanced monitoring when the current user is forbidden', async () => {
    getDashboard.mockRejectedValue({response: {status: 403}});
    getOverview.mockResolvedValue({status: 'UP', nodes: [], sources: {}, facts: {}});

    renderOverview();

    expect(await screen.findByRole('heading', {name: 'Cluster Overview'}))
        .toBeInTheDocument();
    await waitFor(() => {
        expect(screen.queryByRole('button', {name: 'Advanced monitoring'}))
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
        name: 'Advanced monitoring',
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
        'Understand cluster topology, service tiers and node status at a glance.'
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
