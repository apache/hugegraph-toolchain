/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter, Route, Routes, useNavigate} from 'react-router-dom';
import GraphDetail from './index';
import * as api from '../../api';
import {message} from 'antd';

jest.mock('../../api', () => ({
    manage: {
        getGraphSpace: jest.fn(),
        getGraph: jest.fn(),
        getGraphStatistic: jest.fn(),
        updateGraphStatistic: jest.fn(),
    },
}));

jest.mock('antd', () => ({
    ...jest.requireActual('antd'),
    message: {
        error: jest.fn(),
        success: jest.fn(),
    },
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'graph.detail.title': 'Detail',
        'graph.detail.last_update': 'Last Updated: ',
        'graph.detail.update_data': 'Update Data',
        'graph.detail.vertex_total': 'Total vertices',
        'graph.detail.edge_total': 'Total edges',
        'graph.detail.vertex_type': 'Vertex type',
        'graph.detail.edge_type': 'Edge type',
        'graph.detail.count': 'Count',
        'graph.detail.statistics_unavailable': 'Statistics are unavailable. Retry later.',
        'graph.detail.unavailable': 'Graph details are unavailable. Check the server and retry.',
        'graph.detail.overview': 'Overview',
        'graph.detail.schema': 'Schema',
        'graph.detail.query': 'Query this graph',
        'graph.detail.data_status': 'Data status',
        'graph.detail.available': 'Available',
        'graph.detail.partial': 'Partial',
        'graph.detail.loading': 'Loading',
        'graph.detail.retry_page': 'Retry graph details',
        'graph.detail.back_to_graphs': 'Back to graphs',
        'graph.detail.retry_statistics': 'Retry statistics',
        'graph.detail.update_failed': 'Data update failed. Retry later.',
        'graph.detail.empty_title': 'This graph has no schema or data yet',
        'graph.detail.empty_description': 'Create schema, prepare data, or run a safe query.',
        'graph.detail.create_schema': 'Create schema',
        'graph.detail.prepare_data': 'Prepare data',
    })[key] || key}),
}));

beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: query => ({
            matches: false,
            media: query,
            addListener: jest.fn(),
            removeListener: jest.fn(),
        }),
    });
});

test('renders one actionable page error when all initialization requests fail', async () => {
    api.manage.getGraphSpace.mockRejectedValue(new Error('connection refused'));
    api.manage.getGraph.mockRejectedValue(new Error('connection refused'));
    api.manage.getGraphStatistic.mockRejectedValue(new Error('connection refused'));

    render(
        <MemoryRouter
            initialEntries={['/graphspace/DEFAULT/graph/g/detail']}
            future={{
                v7_relativeSplatPath: true,
                v7_startTransition: true,
            }}
        >
            <Routes>
                <Route
                    path='/graphspace/:graphspace/graph/:graph/detail'
                    element={<GraphDetail />}
                />
            </Routes>
        </MemoryRouter>
    );

    expect(await screen.findByText(
        'Graph details are unavailable. Check the server and retry.'
    )).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('link', {name: 'Back to graphs'}))
        .toHaveAttribute('href', '/graphspace/DEFAULT');
    expect(message.error).not.toHaveBeenCalled();
});

test('shows one inline fallback without duplicating the transport toast', async () => {
    api.manage.getGraphSpace.mockResolvedValue({
        status: 200,
        data: {nickname: 'Space'},
    });
    api.manage.getGraph.mockResolvedValue({
        status: 200,
        data: {nickname: 'Graph'},
    });
    api.manage.getGraphStatistic.mockResolvedValue({
        status: 400,
        message: 'Gremlin execution failed, details: ',
    });

    render(
        <MemoryRouter
            initialEntries={['/graphspace/DEFAULT/graph/g/detail']}
            future={{
                v7_relativeSplatPath: true,
                v7_startTransition: true,
            }}
        >
            <Routes>
                <Route
                    path='/graphspace/:graphspace/graph/:graph/detail'
                    element={<GraphDetail />}
                />
            </Routes>
        </MemoryRouter>
    );

    expect(await screen.findByText('Statistics are unavailable. Retry later.'))
        .toBeInTheDocument();
    await waitFor(() => expect(api.manage.getGraphStatistic).toHaveBeenCalledTimes(1));
    expect(message.error).not.toHaveBeenCalled();
});

test('exposes overview, schema and query as one graph journey', async () => {
    api.manage.getGraphSpace.mockResolvedValue({
        status: 200,
        data: {nickname: 'Space'},
    });
    api.manage.getGraph.mockResolvedValue({
        status: 200,
        data: {nickname: 'Graph'},
    });
    api.manage.getGraphStatistic.mockResolvedValue({
        status: 200,
        data: {
            vertex_count: 312,
            edge_count: 608,
            vertices: {person: 312},
            edges: {knows: 608},
            update_time: '2026-07-12 05:29:21',
        },
    });

    render(
        <MemoryRouter
            initialEntries={['/graphspace/DEFAULT/graph/g/detail']}
            future={{
                v7_relativeSplatPath: true,
                v7_startTransition: true,
            }}
        >
            <Routes>
                <Route
                    path='/graphspace/:graphspace/graph/:graph/detail'
                    element={<GraphDetail />}
                />
            </Routes>
        </MemoryRouter>
    );

    expect(await screen.findAllByText('312')).not.toHaveLength(0);
    expect(screen.getAllByText('608')).not.toHaveLength(0);
    expect(screen.getByRole('link', {name: 'Schema'}))
        .toHaveAttribute('href', '/graphspace/DEFAULT/graph/g/meta');
    expect(screen.getByRole('button', {name: /Query this graph/}))
        .toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Overview'}))
        .toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Detail')).toBeInTheDocument();
    expect(screen.queryByText('Space - Graph - Detail')).not.toBeInTheDocument();
});

test('turns zero statistics into an actionable empty graph journey', async () => {
    api.manage.getGraphSpace.mockResolvedValue({status: 200, data: {nickname: 'Space'}});
    api.manage.getGraph.mockResolvedValue({status: 200, data: {nickname: 'Graph'}});
    api.manage.getGraphStatistic.mockResolvedValue({
        status: 200,
        data: {vertex_count: 0, edge_count: 0, vertices: {}, edges: {}},
    });

    render(
        <MemoryRouter
            initialEntries={['/graphspace/DEFAULT/graph/g/detail']}
            future={{v7_relativeSplatPath: true, v7_startTransition: true}}
        >
            <Routes>
                <Route
                    path='/graphspace/:graphspace/graph/:graph/detail'
                    element={<GraphDetail />}
                />
            </Routes>
        </MemoryRouter>
    );

    expect(await screen.findByText('This graph has no schema or data yet'))
        .toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Create schema'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Prepare data'})).toBeInTheDocument();
    expect(screen.getAllByRole('button', {name: /Query this graph/}).length)
        .toBeGreaterThan(0);
});

test('does not represent unavailable statistics as zero and retries only statistics', async () => {
    api.manage.getGraphSpace.mockResolvedValue({
        status: 200,
        data: {nickname: 'Space'},
    });
    api.manage.getGraph.mockResolvedValue({
        status: 200,
        data: {nickname: 'Graph'},
    });
    api.manage.getGraphStatistic
        .mockResolvedValueOnce({status: 503})
        .mockResolvedValueOnce({
            status: 200,
            data: {vertex_count: 12, edge_count: 20, vertices: {}, edges: {}},
        });

    render(
        <MemoryRouter
            initialEntries={['/graphspace/DEFAULT/graph/g/detail']}
            future={{
                v7_relativeSplatPath: true,
                v7_startTransition: true,
            }}
        >
            <Routes>
                <Route
                    path='/graphspace/:graphspace/graph/:graph/detail'
                    element={<GraphDetail />}
                />
            </Routes>
        </MemoryRouter>
    );

    expect(await screen.findByText('Partial')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getAllByText('--')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', {name: 'Retry statistics'}));

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(api.manage.getGraphStatistic).toHaveBeenCalledTimes(2);
    expect(api.manage.getGraphSpace).toHaveBeenCalledTimes(1);
    expect(api.manage.getGraph).toHaveBeenCalledTimes(1);
});

const createDeferred = () => {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return {promise, resolve};
};

const RouteHarness = () => {
    const navigate = useNavigate();
    return (
        <>
            <button onClick={() => navigate('/graphspace/B/graph/b/detail')}>
                switch graph
            </button>
            <Routes>
                <Route
                    path='/graphspace/:graphspace/graph/:graph/detail'
                    element={<GraphDetail />}
                />
            </Routes>
        </>
    );
};

test('does not claim statistics are available before the current request succeeds', async () => {
    const statistics = createDeferred();
    api.manage.getGraphSpace.mockResolvedValue({status: 200, data: {nickname: 'Space'}});
    api.manage.getGraph.mockResolvedValue({status: 200, data: {nickname: 'Graph'}});
    api.manage.getGraphStatistic.mockReturnValue(statistics.promise);

    render(
        <MemoryRouter
            initialEntries={['/graphspace/DEFAULT/graph/g/detail']}
            future={{v7_relativeSplatPath: true, v7_startTransition: true}}
        >
            <Routes>
                <Route
                    path='/graphspace/:graphspace/graph/:graph/detail'
                    element={<GraphDetail />}
                />
            </Routes>
        </MemoryRouter>
    );

    expect(await screen.findByText('Loading')).toBeInTheDocument();
    expect(screen.queryByText('Available')).not.toBeInTheDocument();

    await act(async () => {
        statistics.resolve({status: 200, data: {vertex_count: 1, edge_count: 2}});
        await statistics.promise;
    });
    expect(await screen.findByText('Available')).toBeInTheDocument();
});

test('keeps a failed route body free of stale graph identity', async () => {
    const graphspaceB = createDeferred();
    const graphB = createDeferred();
    api.manage.getGraphSpace
        .mockResolvedValueOnce({status: 200, data: {nickname: 'Space A'}})
        .mockReturnValueOnce(graphspaceB.promise);
    api.manage.getGraph
        .mockResolvedValueOnce({status: 200, data: {nickname: 'Graph A'}})
        .mockReturnValueOnce(graphB.promise);
    api.manage.getGraphStatistic.mockResolvedValue({status: 200, data: {}});

    render(
        <MemoryRouter
            initialEntries={['/graphspace/A/graph/a/detail']}
            future={{v7_relativeSplatPath: true, v7_startTransition: true}}
        >
            <RouteHarness />
        </MemoryRouter>
    );

    expect(await screen.findByText('Detail')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'switch graph'}));
    expect(screen.queryByText(/Space A|Graph A/)).not.toBeInTheDocument();

    await act(async () => {
        graphspaceB.resolve({status: 503});
        graphB.resolve({status: 503});
        await Promise.all([graphspaceB.promise, graphB.promise]);
    });

    expect(await screen.findByText(
        'Graph details are unavailable. Check the server and retry.'
    )).toBeInTheDocument();
    expect(screen.queryByText(/Space A|Graph A/)).not.toBeInTheDocument();
});

test('ignores an update completion after navigating to another graph', async () => {
    const update = createDeferred();
    const statisticsA = createDeferred();
    const statisticsB = createDeferred();
    api.manage.getGraphSpace.mockImplementation(space => Promise.resolve({
        status: 200,
        data: {nickname: `Space ${space}`},
    }));
    api.manage.getGraph.mockImplementation((space, graph) => Promise.resolve({
        status: 200,
        data: {nickname: `Graph ${graph}`},
    }));
    api.manage.getGraphStatistic
        .mockReturnValueOnce(statisticsA.promise)
        .mockReturnValueOnce(statisticsB.promise);
    api.manage.updateGraphStatistic.mockReturnValue(update.promise);

    render(
        <MemoryRouter
            initialEntries={['/graphspace/A/graph/a/detail']}
            future={{v7_relativeSplatPath: true, v7_startTransition: true}}
        >
            <RouteHarness />
        </MemoryRouter>
    );

    expect(await screen.findByText('Detail')).toBeInTheDocument();
    await act(async () => {
        statisticsA.resolve({status: 200, data: {vertex_count: 1, edge_count: 2}});
        await statisticsA.promise;
    });
    expect(await screen.findByText('1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: /Update Data/}));
    await userEvent.click(screen.getByRole('button', {name: 'switch graph'}));
    await waitFor(() => expect(screen.getByRole('link', {name: 'Schema'}))
        .toHaveAttribute('href', '/graphspace/B/graph/b/meta'));
    await act(async () => {
        statisticsB.resolve({status: 200, data: {vertex_count: 22, edge_count: 2}});
        await statisticsB.promise;
    });
    expect(await screen.findByText('22')).toBeInTheDocument();

    await act(async () => {
        update.resolve({status: 200});
        await update.promise;
    });
    await waitFor(() => expect(message.success).not.toHaveBeenCalled());
    expect(api.manage.getGraphStatistic).toHaveBeenCalledTimes(2);
    expect(screen.getByText('22')).toBeInTheDocument();
});
