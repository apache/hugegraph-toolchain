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
import {message} from 'antd';
import {MemoryRouter, useLocation, useNavigate} from 'react-router-dom';
import Nodes from './Nodes';
import {getNodes} from '../../api/operations';
import i18n from '../../i18n';
import enPages from '../../i18n/resources/en-US/modules/pages.json';
import zhPages from '../../i18n/resources/zh-CN/modules/pages.json';

jest.mock('../../api/operations');

beforeEach(() => {
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

test('limits standalone node details to Server nodes and filters', async () => {
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));
    getNodes.mockResolvedValue({
        items: [
            {id: 'server-1', name: 'Server A', type: 'SERVER', status: 'UP'},
            {id: 'pd-1', name: 'PD A', type: 'PD', status: 'UP'},
            {id: 'store-1', name: 'Store A', type: 'STORE', status: 'UP'},
        ],
        total: 3,
        observed_at: 1000,
        stale: false,
    });

    render(
        <MemoryRouter
            initialEntries={['/operations/nodes?type=STORE']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Nodes />
        </MemoryRouter>
    );

    expect(await screen.findByRole('heading', {name: 'Node details'})).toBeInTheDocument();
    await waitFor(() => expect(getNodes).toHaveBeenCalledWith(
        expect.objectContaining({type: 'SERVER'})
    ));
    fireEvent.mouseDown(screen.getByRole('combobox', {name: /node type/i}));
    expect(screen.getByRole('option', {name: 'Server'})).toBeInTheDocument();
    expect(screen.queryByRole('option', {name: 'PD'})).not.toBeInTheDocument();
    expect(screen.queryByRole('option', {name: 'Store'})).not.toBeInTheDocument();
    expect(screen.getByRole('link', {name: /Server A/})).toBeInTheDocument();
    expect(screen.queryByRole('link', {name: /PD A/})).not.toBeInTheDocument();
    expect(screen.queryByRole('link', {name: /Store A/})).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', {name: /Refresh/}))
        .not.toHaveClass('ant-btn-loading'));
});

afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
});

const HistoryControls = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const showSecondQuery = () => navigate('/operations/nodes?query=second');
    return (
        <>
            <button type='button' onClick={showSecondQuery}>
                history query
            </button>
            <output aria-label='current query'>{location.search}</output>
        </>
    );
};

const FilterLocationProbe = () => {
    const location = useLocation();
    return <output aria-label='filter location'>{location.search}</output>;
};

test('clears all user filters while preserving paging size and sort preferences', async () => {
    getNodes.mockResolvedValue({items: [], total: 0, observed_at: 1000, stale: false});

    render(
        <MemoryRouter
            initialEntries={[
                '/operations/nodes?type=PD&status=DOWN&query=node&page=4'
                + '&page_size=50&sort=status&order=desc',
            ]}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <FilterLocationProbe />
            <Nodes />
        </MemoryRouter>
    );

    const clearFilters = await screen.findByRole('button', {name: 'Clear filters'});
    expect(screen.getByRole('textbox', {name: /search node/i})).toHaveValue('node');
    fireEvent.click(clearFilters);

    await waitFor(() => {
        const params = new URLSearchParams(
            screen.getByLabelText('filter location').textContent
        );
        expect(params.has('type')).toBe(false);
        expect(params.has('status')).toBe(false);
        expect(params.has('query')).toBe(false);
        expect(params.get('page')).toBe('1');
        expect(params.get('page_size')).toBe('50');
        expect(params.get('sort')).toBe('status');
        expect(params.get('order')).toBe('desc');
    });
    expect(screen.getByRole('textbox', {name: /search node/i})).toHaveValue('');
    await waitFor(() => expect(getNodes).toHaveBeenLastCalledWith({
        type: undefined,
        status: undefined,
        query: undefined,
        page: 1,
        page_size: 50,
        sort: 'status',
        order: 'desc',
    }));
    await waitFor(() => expect(screen.getByRole('button', {name: /Refresh/}))
        .not.toHaveClass('ant-btn-loading'));
    expect(screen.queryByRole('button', {name: 'Clear filters'}))
        .not.toBeInTheDocument();
});

test('hides clear filters when no user-controlled filter is active', async () => {
    getNodes.mockResolvedValue({items: [], total: 0, observed_at: 1000, stale: false});

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <Nodes />
        </MemoryRouter>
    );

    expect(await screen.findByText('0 nodes')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', {name: /Refresh/}))
        .not.toHaveClass('ant-btn-loading'));
    expect(screen.queryByRole('button', {name: 'Clear filters'}))
        .not.toBeInTheDocument();
});

test('does not treat the standalone fixed SERVER type as a clearable filter', async () => {
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));
    getNodes.mockResolvedValue({
        items: [{id: 'server-1', name: 'Server A', type: 'SERVER', status: 'UP'}],
        total: 1,
        observed_at: 1000,
        stale: false,
    });

    render(
        <MemoryRouter
            initialEntries={['/operations/nodes?type=STORE']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Nodes />
        </MemoryRouter>
    );

    expect(await screen.findByRole('link', {name: /Server A/})).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', {name: /Refresh/}))
        .not.toHaveClass('ant-btn-loading'));
    expect(screen.queryByRole('button', {name: 'Clear filters'}))
        .not.toBeInTheDocument();
    expect(getNodes).toHaveBeenCalledWith(expect.objectContaining({type: 'SERVER'}));
});

test('ships the clear-filters action in Chinese and English', () => {
    expect(zhPages.operations.clear_filters).toBe('清空筛选');
    expect(enPages.operations.clear_filters).toBe('Clear filters');
});

test.each([
    [0, '0 nodes', '0 个节点'],
    [1, '1 node', '1 个节点'],
    [2, '2 nodes', '2 个节点'],
])('pluralizes the %i-node count in both languages', (count, english, chinese) => {
    for (const key of ['result_count', 'node_count']) {
        expect(i18n.t(`operations.${key}`, {lng: 'en-US', count})).toBe(english);
        expect(i18n.t(`operations.${key}`, {lng: 'zh-CN', count})).toBe(chinese);
    }
});

test('shows stale observation metadata and exposes real detail links', async () => {
    getNodes.mockResolvedValue({
        items: [
            {id: 'server-safe', name: 'Server A', type: 'SERVER', status: 'UP'},
        ],
        total: 1,
        observed_at: 1000,
        stale: true,
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <Nodes />
        </MemoryRouter>
    );

    const detailLink = await screen.findByLabelText('View details for Server A');
    expect(detailLink).toHaveRole('link');
    expect(detailLink).toHaveAccessibleName(/Server A/);
    expect(detailLink).toBeVisible();
    expect(detailLink).toHaveAttribute(
        'href', '/operations/nodes/server-safe'
    );
    const table = within(screen.getByRole('table'));
    const refresh = screen.getByLabelText('Refresh');
    expect(screen.getAllByText(/Stale/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Observed/i).length).toBeGreaterThan(0);
    const type = screen.getByLabelText(/node type/i);
    expect(type).toHaveRole('combobox');
    expect(type).toBeVisible();
    const status = screen.getByLabelText(/node status/i);
    expect(status).toHaveRole('combobox');
    expect(status).toBeVisible();
    fireEvent.mouseDown(status);
    expect(await screen.findByRole('option', {name: 'Attention'})).toBeInTheDocument();
    expect(screen.queryByRole('option', {name: 'DEGRADED'})).not.toBeInTheDocument();
    const search = screen.getByLabelText(/search node/i);
    expect(search).toHaveRole('textbox');
    expect(search).toBeVisible();
    expect(screen.getByText('Browse, filter and inspect every discovered service node'))
        .toBeInTheDocument();
    expect(screen.getByText('1 node')).toBeInTheDocument();
    expect(screen.getByLabelText('SERVER icon')).toBeInTheDocument();
    expect(screen.getByText('Node ID: server-safe')).toBeInTheDocument();
    expect(table.getByRole('cell', {name: 'Server'})).toBeInTheDocument();
    expect(refresh).toHaveRole('button');
    expect(refresh).toBeVisible();
    expect(refresh).toHaveClass(
        'operations-refresh-button', 'ant-btn-text', 'ant-btn-circle'
    );
    expect(refresh).toHaveTextContent('');

    fireEvent.click(table.getByRole('columnheader', {name: 'Type'}));
    await waitFor(() => expect(getNodes).toHaveBeenLastCalledWith(
        expect.objectContaining({sort: 'type', order: 'asc'})
    ));
    await waitFor(() => expect(refresh).not.toHaveClass('ant-btn-loading'));
});

test('explains unavailable Store metrics in the node list', async () => {
    getNodes.mockResolvedValue({
        items: [{
            id: 'store-unavailable',
            name: 'Store unavailable',
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
        total: 1,
        observed_at: 1000,
        stale: false,
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <Nodes />
        </MemoryRouter>
    );

    const reason = await screen.findByLabelText(/Store metrics origin is not trusted/);
    expect(reason).toHaveRole('img');
    expect(reason).toHaveAccessibleName(/Store metrics origin is not trusted/);
    expect(reason).toBeVisible();
    expect(screen.queryByText('Stale')).not.toBeInTheDocument();
});

test('keeps the search input synchronized with URL history and clear actions', async () => {
    getNodes.mockResolvedValue({items: [], total: 0, observed_at: 1000, stale: false});

    render(
        <MemoryRouter
            initialEntries={['/operations/nodes?query=first']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <HistoryControls />
            <Nodes />
        </MemoryRouter>
    );
    const search = await screen.findByRole('textbox', {name: /search node/i});
    expect(search).toHaveValue('first');

    fireEvent.click(screen.getByRole('button', {name: 'history query'}));
    await waitFor(() => expect(search).toHaveValue('second'));

    fireEvent.change(search, {target: {value: 'third'}});
    fireEvent.keyDown(search, {key: 'Enter', code: 'Enter'});
    await waitFor(() => expect(screen.getByLabelText('current query'))
        .toHaveTextContent('query=third'));

    fireEvent.change(search, {target: {value: ''}});
    await waitFor(() => expect(screen.getByLabelText('current query'))
        .not.toHaveTextContent('query='));
    await waitFor(() => expect(getNodes).toHaveBeenLastCalledWith(
        expect.objectContaining({query: undefined})
    ));
    await waitFor(() => expect(screen.getByRole('button', {name: /Refresh/}))
        .not.toHaveClass('ant-btn-loading'));
});

test('renders a bounded empty table for a valid zero-node response', async () => {
    getNodes.mockResolvedValue({items: [], total: 0, observed_at: 1000, stale: false});

    const {container} = render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <Nodes />
        </MemoryRouter>
    );

    expect(await screen.findByText('0 nodes')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', {name: /Refresh/}))
        .not.toHaveClass('ant-btn-loading'));
    expect(container.querySelector('.ant-empty')).toBeInTheDocument();
    expect(screen.queryByRole('link', {name: /view node details/i}))
        .not.toBeInTheDocument();
});

test.each([401, 403])('clears an earlier privileged snapshot when refresh returns %s', async status => {
    getNodes
        .mockResolvedValueOnce({
            items: [{id: 'admin-node', name: 'Admin node', type: 'SERVER', status: 'UP'}],
            total: 1,
            observed_at: 1000,
            stale: false,
            sources: {pd: {status: 'UP', availability: 'PARTIAL', reason: 'pd_metrics_unmapped',
                diagnostics: {pd_endpoint_metrics: {metrics: {process_cpu_usage: 0.125},
                    metric_status: {availability: 'AVAILABLE', fresh: true}}}}},
        })
        .mockRejectedValueOnce(Object.assign(new Error('forbidden'), {status}));

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <Nodes />
        </MemoryRouter>
    );
    expect(await screen.findByRole('link', {name: /Admin node/})).toBeInTheDocument();
    expect(screen.getByText('Configured PD endpoint sample')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', {name: /Refresh/}))
        .not.toHaveClass('ant-btn-loading'));

    fireEvent.click(screen.getByRole('button', {name: /Refresh/}));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByRole('link', {name: /Admin node/})).not.toBeInTheDocument();
    expect(screen.queryByText('Configured PD endpoint sample')).not.toBeInTheDocument();
    expect(screen.getByText('0 nodes')).toBeInTheDocument();
});

test('marks retained PD samples and node readiness stale until a retry succeeds', async () => {
    i18n.changeLanguage('en-US');
    const pdNode = {id: 'pd-safe', name: 'PD A', type: 'PD', status: 'UP',
        readiness: {status: 'READY', stale: false},
        metric_statuses: {system: {availability: 'AVAILABLE', stale: false}}};
    const snapshot = {items: [pdNode], diagnostic_nodes: [pdNode], total: 1, observed_at: 1000, stale: false,
        sources: {pd: {status: 'UP', availability: 'PARTIAL', reason: 'pd_metrics_unmapped', stale: false,
            diagnostics: {pd_endpoint_metrics: {metrics: {process_cpu_usage: 0.125, heap_used_bytes: 1048576},
                metric_status: {availability: 'AVAILABLE', fresh: true, stale: false, observed_at: 1000}}}}}};
    let finishRetry;
    getNodes.mockResolvedValueOnce(snapshot).mockRejectedValueOnce(new Error('offline'))
        .mockReturnValueOnce(new Promise(resolve => {finishRetry = resolve;}));
    render(<MemoryRouter initialEntries={['/operations/nodes?source=pd']}><Nodes /></MemoryRouter>);
    await screen.findByRole('link', {name: /PD A/});
    fireEvent.click(screen.getByText('Check addresses and how to fix'));
    const sample = screen.getByText('Configured PD endpoint sample').parentElement;
    const row = screen.getByRole('link', {name: /PD A/}).closest('tr');
    expect(within(sample).getByText('12.5%')).toBeVisible();
    expect(within(sample).getByText('1 MB')).toBeVisible();
    expect(within(row).getByLabelText('Service: Ready')).toBeVisible();

    fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    await waitFor(() => expect(within(sample).getAllByText('Stale').length).toBeGreaterThan(0));
    expect(within(sample).queryByText('12.5%')).not.toBeInTheDocument();
    expect(within(sample).queryByText('1 MB')).not.toBeInTheDocument();
    expect(within(row).getByLabelText('Service: Refresh needed')).toBeVisible();
    expect(within(row).getByText('Stale')).toBeVisible();
    fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    expect(within(sample).getAllByText('Stale').length).toBeGreaterThan(0);
    expect(within(sample).queryByText('12.5%')).not.toBeInTheDocument();
    expect(within(row).getByLabelText('Service: Refresh needed')).toBeVisible();

    await act(async () => finishRetry(snapshot));
    expect(within(sample).getByText('12.5%')).toBeVisible();
    expect(within(sample).getByText('1 MB')).toBeVisible();
    expect(within(row).getByLabelText('Service: Ready')).toBeVisible();
    expect(within(row).queryByText('Stale')).not.toBeInTheDocument();
});

test('does not restore an older node list after a newer request is forbidden', async () => {
    let resolveOlder;
    getNodes
        .mockReturnValueOnce(new Promise(resolve => {
            resolveOlder = resolve;
        }))
        .mockRejectedValueOnce(Object.assign(new Error('forbidden'), {status: 403}));

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <HistoryControls />
            <Nodes />
        </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', {name: 'history query'}));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await act(async () => resolveOlder({
        items: [{id: 'stale-admin-node', name: 'Stale admin node', type: 'SERVER'}],
        total: 1,
        observed_at: 1000,
        stale: false,
    }));

    expect(screen.queryByRole('link', {name: /Stale admin node/})).not.toBeInTheDocument();
    expect(screen.getByText('0 nodes')).toBeInTheDocument();
});

test('merges role into node identity and keeps the full ID explainable and copyable', async () => {
    jest.spyOn(message, 'success').mockImplementation(() => {});
    const writeText = jest.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {writeText},
    });
    getNodes.mockResolvedValue({
        items: [{
            id: 'store-c410c1adb107-full-id',
            name: 'store-c410c1',
            type: 'STORE',
            role: 'LEADER',
            status: 'UP',
        }],
        total: 1,
        observed_at: 1000,
        stale: false,
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <Nodes />
        </MemoryRouter>
    );

    const identity = (await screen.findByText('store-c410c1'))
        .closest('.operations-node-identity-cell');
    expect(identity).toHaveAccessibleName(
        /service-reported node name.*store-c410c1adb107-full-id/i
    );
    expect(identity).toHaveTextContent('Leader');
    expect(within(identity).getByLabelText('Leader role')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', {name: 'Role'})).not.toBeInTheDocument();

    fireEvent.click(within(identity).getByRole('button', {name: 'Copy full node ID'}));
    expect(writeText).toHaveBeenCalledWith('store-c410c1adb107-full-id');
});

test('renders a Store leader-shard count without an explicit node role', async () => {
    getNodes.mockResolvedValue({
        items: [{
            id: 'store-shards',
            name: 'store-shards',
            type: 'STORE',
            role: null,
            status: 'UP',
            metrics: {backend: {leaders: 3}},
        }],
        total: 1,
        observed_at: 1000,
        stale: false,
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <Nodes />
        </MemoryRouter>
    );

    const identity = (await screen.findByText('store-shards'))
        .closest('.operations-node-identity-cell');
    expect(within(identity).getByText('3 leader shards')).toBeInTheDocument();
});


test('opens source diagnostics from an alert without needing a node result', async () => {
    getNodes.mockResolvedValue({items: [], total: 0, sources: {stores: {
        status: 'UP', availability: 'PARTIAL', reason: 'response_too_large',
        diagnostics: {request_path: '/v1/stores', max_response_bytes: 1048576},
    }}});
    render(<MemoryRouter initialEntries={[
        '/operations/nodes?type=STORE&source=stores#operations-source-diagnostics',
    ]}><Nodes /></MemoryRouter>);
    const panel = await screen.findByRole('region', {name: 'Source diagnostics'});
    await waitFor(() => expect(within(panel).getByText('/v1/stores')).toBeInTheDocument());
    await waitFor(() => expect(panel).toHaveFocus());
});

test('hides source diagnostics after an initial load failure and shows a received healthy source on retry', async () => {
    getNodes.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce({
        items: [], total: 0, sources: {stores: {status: 'UP', availability: 'AVAILABLE', fresh: true}},
    });
    render(<MemoryRouter initialEntries={[
        '/operations/nodes?type=STORE&source=stores#operations-source-diagnostics',
    ]}><Nodes /></MemoryRouter>);
    await screen.findByText('Unable to load current cluster data');
    expect(screen.queryByRole('region', {name: 'Source diagnostics'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Refresh'}));
    expect(await screen.findByText('Source collection has recovered')).toBeInTheDocument();
});

test('uses compact snapshot diagnostics independently of the filtered node table', async () => {
    getNodes.mockResolvedValue({items: [], total: 0, sources: {stores: {
        status: 'UP', availability: 'PARTIAL', reason: 'upstream_rejected',
    }}, diagnostic_nodes: [{id: 'store-failing', type: 'STORE', name: 'Store outside filters',
        status: 'UP', metric_statuses: {system: {availability: 'UNAVAILABLE',
            reason: 'upstream_rejected', diagnostics: {request_path: '/metrics/system', http_status: 503}}},
    }]});
    render(<MemoryRouter initialEntries={[
        '/operations/nodes?type=STORE&source=stores&status=DOWN&query=no-match&page=3',
    ]}><Nodes /></MemoryRouter>);

    expect(await screen.findByText(/Store outside filters · system/)).toBeInTheDocument();
    expect(screen.getByText('/metrics/system')).toBeInTheDocument();
    expect(screen.getByText('503')).toBeInTheDocument();
    expect(screen.getByText('Affected metrics across this snapshot')).toBeInTheDocument();
    expect(document.querySelector('.operations-nodes-table')).not.toHaveTextContent('Store outside filters');
    expect(getNodes).toHaveBeenCalledTimes(1);
});

test('keeps current-page diagnostic wording when an older backend omits snapshot diagnostics', async () => {
    getNodes.mockResolvedValue({items: [{id: 'store-old', type: 'STORE', name: 'Store on page',
        status: 'UP', metric_statuses: {system: {availability: 'MALFORMED', reason: 'malformed_response'}},
    }], total: 1, sources: {stores: {status: 'UP', availability: 'PARTIAL'}}});
    render(<MemoryRouter initialEntries={['/operations/nodes?type=STORE&source=stores']}>
        <Nodes />
    </MemoryRouter>);

    expect(await screen.findByText(/Store on page · system/)).toBeInTheDocument();
    expect(screen.getByText('Affected metrics on this page')).toBeInTheDocument();
    expect(screen.queryByText('Affected metrics across this snapshot')).not.toBeInTheDocument();
});

test('preserves reported custom Server names and renders concise generated Server names', async () => {
    getNodes.mockResolvedValue({items: [
        {id: 'server-a', type: 'SERVER', name: 'Server 7eb71715c010', status: 'UP'},
        {id: 'server-b', type: 'SERVER', name: 'HugeGraph Server custom-name', status: 'UP'},
    ], total: 2});
    render(<MemoryRouter><Nodes /></MemoryRouter>);
    expect(await screen.findByRole('link', {name: /Server 7eb71715c010/})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: /HugeGraph Server custom-name/})).toBeInTheDocument();
});

test('explicit refresh bypasses the cached snapshot and retries source collection', async () => {
    getNodes.mockResolvedValue({items: [], total: 0, sources: {}, observed_at: 1000, stale: false});
    render(<MemoryRouter><Nodes /></MemoryRouter>);
    const refresh = await screen.findByRole('button', {name: 'Refresh'});
    await waitFor(() => expect(refresh).not.toHaveClass('ant-btn-loading'));
    expect(getNodes).toHaveBeenCalledTimes(1);
    expect(getNodes.mock.calls[0][0]).not.toHaveProperty('refresh');
    fireEvent.click(refresh);
    await waitFor(() => expect(getNodes).toHaveBeenCalledTimes(2));
    expect(getNodes).toHaveBeenLastCalledWith(expect.objectContaining({refresh: true}));
});
