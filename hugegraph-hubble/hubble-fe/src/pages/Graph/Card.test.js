/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import path from 'path';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter, useLocation} from 'react-router-dom';
import GraphCard from './Card';
import * as api from '../../api';

jest.mock('../../api', () => ({
    manage: {getGraphView: jest.fn(() => new Promise(() => {})),
        getGraphStatistic: jest.fn(), updateGraphStatistic: jest.fn(),
        getVermeerStatistic: jest.fn()},
    analysis: {getGraphData: jest.fn(() => new Promise(() => {}))},
}));

const mockT = (key, values) => {
    if (key === 'graph.card.element_counts') {
        return `${key}:${values.vertices}/${values.edges}`;
    }
    if (key === 'graph.detail.bounded_statistics_hint') {
        return `${key}:${values.limit}`;
    }
    if (key === 'graph.card.view_schema') {
        return `${key}:${values.graph}`;
    }
    return key;
};

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: mockT}),
}));

jest.mock('../../visualization/react', () => ({GraphCanvas: props => <div>
    graph preview<output data-testid='preview-contract'>{JSON.stringify(props)}</output>
</div>}));

jest.mock('../../utils/config', () => ({
    isPdEnabled: () => true,
}));

const LocationProbe = () => <div data-testid='location'>{useLocation().pathname}</div>;

beforeEach(() => {
    api.manage.getGraphStatistic.mockReset();
    api.manage.getVermeerStatistic.mockReset();
    api.manage.updateGraphStatistic.mockReset();
    api.manage.updateGraphStatistic.mockResolvedValue({status: 200});
});

test('falls back to the graph name when a PD graph has no alias', () => {
    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <GraphCard
                item={{
                    name: 'hugegraph',
                    nickname: null,
                    graphspace: 'DEFAULT',
                    graphspace_nickname: '默认图空间',
                    default: true,
                    storage: 0,
                    create_time: '2026-07-12',
                }}
                menus={[]}
            />
        </MemoryRouter>
    );

    expect(screen.getByTitle('graphspace.default_name-hugegraph')).toBeInTheDocument();
    expect(screen.queryByTitle('graphspace.default_name-null')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'graph.card.more_actions'}))
        .toBeInTheDocument();
});

test('treats backend nickname echoes as unset aliases', () => {
    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <GraphCard
                item={{
                    name: 'movies', nickname: 'movies', graphspace: 'space',
                    graphspace_nickname: 'space', storage: 0,
                    create_time: '2026-07-12', schemaview: {vertices: [], edges: []},
                }}
                menus={[]}
            />
        </MemoryRouter>
    );

    expect(screen.getByTitle('space-movies')).toBeInTheDocument();
});

test('uses a compact actionable state when the graph has no schema', () => {
    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <GraphCard
                item={{
                    name: 'hugegraph',
                    graphspace: 'DEFAULT',
                    graphspace_nickname: 'Default',
                    storage: 0,
                    create_time: '2026-07-12',
                    schemaview: {vertices: [], edges: []},
                }}
                menus={[]}
            />
        </MemoryRouter>
    );

    expect(screen.getByText('graph.card.empty_schema')).toBeInTheDocument();
    expect(screen.getByText(/graph\.card\.schema_types/)).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'graph.card.open_schema'}))
        .toBeInTheDocument();
    expect(screen.queryByText('graph preview')).not.toBeInTheDocument();
    expect(screen.getByText(/graph\.col\.create_time/).closest('[role="button"]'))
        .not.toBeInTheDocument();
});

test('labels an empty schema as view-only for a read-only account', () => {
    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <GraphCard
                item={{
                    name: 'hugegraph',
                    graphspace: 'space',
                    storage: 0,
                    schemaview: {vertices: [], edges: []},
                }}
                menus={[]}
                canMutate={false}
            />
        </MemoryRouter>
    );

    expect(screen.getByRole('button', {name: 'graph.menu.view_schema'}))
        .toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'graph.card.open_schema'}))
        .not.toBeInTheDocument();
});

test('ships the requested graph creation and schema labels', () => {
    const zh = require('../../i18n/resources/zh-CN/modules/pages.json');
    const en = require('../../i18n/resources/en-US/modules/pages.json');

    expect(zh.graph.create).toBe('新建图');
    expect(en.graph.create).toBe('New Graph');
    expect(zh.graph.form.title_create).toBe('新建图');
    expect(en.graph.form.title_create).toBe('New Graph');
    expect(zh.graph.form.schema).toBe('Graph Schema');
    expect(en.graph.form.schema).toBe('Graph Schema');
    expect(zh.graph.form.name_help).toContain(' / ');
    expect(en.graph.form.name_help).toContain(' / ');
    expect(zh.graph.card.view_schema).toBe('查看 {{graph}} 的 Schema');
    expect(en.graph.card.view_schema).toBe('View Schema for {{graph}}');
});

test('opens Schema from the graph preview and keeps Gremlin as the footer action', () => {
    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <GraphCard
                item={{
                    name: 'hugegraph',
                    nickname: 'HugeGraph',
                    graphspace: 'DEFAULT',
                    graphspace_nickname: 'Default',
                    storage: 1024,
                    create_time: '2026-07-12',
                    statistic: {vertex: 12, edge: 8},
                    schemaview: {vertices: [{id: 'person', label: 'person'}], edges: []},
                }}
                menus={[]}
            />
            <LocationProbe />
        </MemoryRouter>
    );

    const preview = JSON.parse(screen.getByTestId('preview-contract').textContent);
    expect(preview.preset).toBe('thumbnail');
    expect(preview.layout).toEqual({type: 'dagre', options: {rankdir: 'LR', nodesep: 30, ranksep: 60}});
    expect(preview.data.nodes[0]).toMatchObject({id: 'node:string:person', data: {raw: {id: 'person', label: 'person'}}});
    const metadata = screen.getByText(/graph\.card\.storage/);
    expect(metadata).toHaveTextContent('graph.col.create_time');
    expect(screen.getByText(/graph\.card\.element_counts/)).toHaveTextContent('12');
    expect(screen.getByText(/graph\.card\.element_counts/)).toHaveTextContent('8');
    expect(screen.getByRole('link', {name: 'graph.card.overview'}))
        .toHaveAttribute('href', '/graphspace/DEFAULT/graph/hugegraph/detail');
    expect(screen.getByRole('link', {name: 'graph.card.query_graph'}))
        .toHaveAttribute('href', '/gremlin/DEFAULT/hugegraph');

    const schemaPreview = screen.getByRole('button', {
        name: 'graph.card.view_schema:HugeGraph',
    });
    expect(schemaPreview).toHaveAttribute('tabindex', '0');
    fireEvent.click(schemaPreview);
    expect(screen.getByTestId('location')).toHaveTextContent(
        '/graphspace/DEFAULT/graph/hugegraph/meta'
    );
});

test.each(['Enter', ' '])(
    'opens Schema from the named graph preview with the %p key',
    key => {
            render(
            <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
                <GraphCard
                    item={{
                        name: 'hugegraph',
                        nickname: 'HugeGraph',
                        graphspace: 'DEFAULT',
                        graphspace_nickname: 'Default',
                        storage: 1024,
                        create_time: '2026-07-12',
                        schemaview: {vertices: [{id: 'person', label: 'person'}], edges: []},
                    }}
                    menus={[]}
                />
                <LocationProbe />
            </MemoryRouter>
        );

        const schemaPreview = screen.getByRole('button', {
            name: 'graph.card.view_schema:HugeGraph',
        });
        fireEvent.keyDown(schemaPreview, {key});

        expect(screen.getByTestId('location')).toHaveTextContent(
            '/graphspace/DEFAULT/graph/hugegraph/meta'
        );
    }
);

test('gives the keyboard-focusable schema preview a visible design-system focus ring', () => {
    const stylesheet = fs.readFileSync(path.join(__dirname, 'index.module.scss'), 'utf8');
    const previewRule = stylesheet.match(
        /\.card_content\s*\{[\s\S]*?&:focus-visible\s*\{([^}]*)\}/
    )?.[1] || '';

    expect(previewRule).toContain('outline: 2px solid #1890ff');
    expect(previewRule).toContain('outline-offset: -2px');
});

test('does not invent point and edge counts when the list API omits them', () => {
    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <GraphCard
                item={{
                    name: 'hugegraph',
                    graphspace: 'DEFAULT',
                    graphspace_nickname: 'Default',
                    storage: 0,
                    create_time: '2026-07-12',
                    schemaview: {vertices: [], edges: []},
                }}
                menus={[]}
            />
        </MemoryRouter>
    );

    expect(screen.queryByText(/graph\.card\.element_counts/)).not.toBeInTheDocument();
});


test('renders core graph actions before schema and snapshot statistics complete', async () => {
    let resolveSchema;
    let resolveSnapshot;
    api.manage.getGraphView.mockReturnValueOnce(new Promise(resolve => { resolveSchema = resolve; }));
    api.analysis.getGraphData.mockReturnValueOnce(new Promise(resolve => { resolveSnapshot = resolve; }));
    render(<MemoryRouter><GraphCard item={{name: 'g', graphspace: 'space'}} menus={[]} /></MemoryRouter>);
    expect(screen.getByRole('link', {name: 'graph.card.overview'})).toHaveAttribute('href', '/graphspace/space/graph/g/detail');
    expect(screen.getByRole('link', {name: 'graph.card.query_graph'})).toHaveAttribute('href', '/gremlin/space/g');
    expect(screen.getByText('graph.card.schema_loading', {selector: 'span'})).toBeInTheDocument();
    expect(screen.queryByText('graph.card.empty_schema')).not.toBeInTheDocument();
    expect(api.manage.getGraphView).toHaveBeenLastCalledWith('space', 'g', {suppressBusinessErrorToast: true});
    expect(api.analysis.getGraphData).toHaveBeenLastCalledWith('space', 'g', {suppressBusinessErrorToast: true});
    await act(async () => {
        resolveSnapshot({status: 200, data: {vertexcount: null, edgecount: null}});
    });
    expect(screen.getByText('graph.detail.not_collected')).toBeInTheDocument();
    expect(screen.queryByText('graph.detail.statistics_unavailable')).not.toBeInTheDocument();
    await act(async () => {
        resolveSchema({status: 200, data: {vertices: [{id: 'person', label: 'person'}], edges: []}});
    });
    expect(screen.getByTestId('preview-contract')).toBeInTheDocument();
});


test('shows a capped snapshot as a lower bound with its scan limit', async () => {
    api.analysis.getGraphData.mockResolvedValueOnce({status: 200, data: {
        vertexcount: '100000', edgecount: '20', approximate: true, scan_limit: 100000,
    }});
    render(<MemoryRouter><GraphCard item={{name: 'g', graphspace: 'space',
        schemaview: {vertices: [], edges: []}}} menus={[]} /></MemoryRouter>);
    const counts = await screen.findByText('graph.card.element_counts:≥100000/≈20');
    fireEvent.mouseEnter(counts);
    expect(await screen.findByText('graph.detail.bounded_statistics_hint:100000')).toBeInTheDocument();
});

test.each([
    ['network failure', () => Promise.reject(new Error('network failure'))],
    ['non-success response', () => Promise.resolve({status: 503})],
])('shows a snapshot error for %s while keeping core actions available', async (_, response) => {
    const calls = api.analysis.getGraphData.mock.calls.length;
    api.analysis.getGraphData.mockImplementationOnce(response);
    render(<MemoryRouter><GraphCard item={{name: 'g', graphspace: 'space',
        schemaview: {vertices: [], edges: []}}} menus={[]} /></MemoryRouter>);

    expect(await screen.findByText('graph.detail.statistics_unavailable')).toBeInTheDocument();
    expect(screen.queryByText('graph.detail.not_collected')).not.toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'graph.card.overview'}))
        .toHaveAttribute('href', '/graphspace/space/graph/g/detail');
    expect(screen.getByRole('link', {name: 'graph.card.query_graph'}))
        .toHaveAttribute('href', '/gremlin/space/g');
    expect(api.analysis.getGraphData).toHaveBeenCalledTimes(calls + 1);
});


test('reads bounded Server statistics directly and keeps one request in flight', async () => {
    api.analysis.getGraphData.mockResolvedValueOnce({status: 200, data: {vertexcount: null, edgecount: null}});
    let resolveStatistic;
    api.manage.getGraphStatistic.mockReturnValueOnce(new Promise(done => { resolveStatistic = done; }));
    render(<MemoryRouter><GraphCard item={{name: 'g', graphspace: 'space',
        schemaview: {vertices: [], edges: []}}} menus={[]} /></MemoryRouter>);
    const collectButton = await screen.findByRole('button', {name: 'graph.detail.not_collected'});
    fireEvent.click(collectButton);
    fireEvent.click(collectButton);
    expect(api.manage.updateGraphStatistic).not.toHaveBeenCalled();
    expect(api.manage.getGraphStatistic).toHaveBeenCalledTimes(1);
    expect(api.manage.getGraphStatistic).toHaveBeenLastCalledWith(
        'space', 'g', {suppressBusinessErrorToast: true}
    );

    await act(async () => resolveStatistic({status: 200, data: {
        vertex_count: '100000', edge_count: '200', approximate: true, scan_limit: 100000,
    }}));
    expect(screen.getByText('graph.card.element_counts:≥100000/≈200')).toBeVisible();
});

test('an enabled graph-compute source reads a clearly identified loaded snapshot', async () => {
    api.analysis.getGraphData.mockResolvedValueOnce({status: 200, data: {vertexcount: null, edgecount: null}});
    api.manage.getVermeerStatistic.mockResolvedValueOnce({status: 200, data: {
        source: 'vermeer', vertex_count: '3000', edge_count: '6000', update_time: '2026-10-29T08:00:00Z',
    }});
    render(<MemoryRouter><GraphCard item={{name: 'g', graphspace: 'space',
        schemaview: {vertices: [], edges: []}}} menus={[]} canComputeStatistics /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', {name: 'graph.card.statistics_source'}));
    fireEvent.click(await screen.findByText('graph.card.vermeer_statistics'));
    await waitFor(() => expect(api.manage.getVermeerStatistic).toHaveBeenLastCalledWith(
        'space', 'g', {suppressBusinessErrorToast: true}
    ));
    expect(await screen.findByRole('button', {name: /graph.card.vermeer_snapshot_label/}))
        .toHaveTextContent('3000/6000');
});

test('a failed Vermeer snapshot retries the same source instead of collecting Server statistics', async () => {
    api.analysis.getGraphData.mockResolvedValueOnce({status: 200, data: {vertexcount: null, edgecount: null}});
    api.manage.getVermeerStatistic
        .mockResolvedValueOnce({status: 503, message: 'snapshot temporarily unavailable'})
        .mockResolvedValueOnce({status: 200, data: {
            source: 'vermeer', vertex_count: '30', edge_count: '60', update_time: '2026-10-29T08:00:00Z',
        }});
    render(<MemoryRouter><GraphCard item={{name: 'g', graphspace: 'space',
        schemaview: {vertices: [], edges: []}}} menus={[]} canComputeStatistics /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', {name: 'graph.card.statistics_source'}));
    fireEvent.click(await screen.findByText('graph.card.vermeer_statistics'));
    const retry = await screen.findByRole('button', {name: 'graph.detail.retry_statistics'});
    fireEvent.click(retry);

    await waitFor(() => expect(api.manage.getVermeerStatistic).toHaveBeenCalledTimes(2));
    expect(api.manage.updateGraphStatistic).not.toHaveBeenCalled();
    expect(api.manage.getGraphStatistic).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', {name: /graph.card.vermeer_snapshot_label/}))
        .toHaveTextContent('30/60');
});

test('a specifically unloaded Vermeer snapshot gives visible scoped loading guidance', async () => {
    api.analysis.getGraphData.mockResolvedValueOnce({status: 200, data: {vertexcount: null, edgecount: null}});
    api.manage.getVermeerStatistic.mockResolvedValueOnce({status: 400,
        message: 'Load this graph from OLAP graph compute before collecting Vermeer statistics'});
    render(<MemoryRouter><GraphCard item={{name: 'my graph', graphspace: 'my space',
        schemaview: {vertices: [], edges: []}}} menus={[]} canComputeStatistics /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', {name: 'graph.card.statistics_source'}));
    fireEvent.click(await screen.findByText('graph.card.vermeer_statistics'));
    expect(await screen.findByRole('status')).toHaveTextContent('graph.card.vermeer_load_first');
    expect(screen.getByRole('link', {name: 'graph.card.open_graph_compute'}))
        .toHaveAttribute('href', '/algorithms/my%20space/my%20graph?engine=olap');
    expect(screen.getByRole('button', {name: 'graph.detail.retry_statistics'})).toBeEnabled();
});

test('an HTTP error for an unloaded snapshot clears guidance on a successful retry', async () => {
    api.analysis.getGraphData.mockResolvedValueOnce({status: 200, data: {vertexcount: null, edgecount: null}});
    api.manage.getVermeerStatistic.mockRejectedValueOnce({response: {status: 400, data: {status: 400,
        message: 'Load this graph from OLAP graph compute before collecting Vermeer statistics'}}})
        .mockResolvedValueOnce({status: 200, data: {vertexcount: 12, edgecount: 34}});
    render(<MemoryRouter><GraphCard item={{name: 'g', graphspace: 'space',
        schemaview: {vertices: [], edges: []}}} menus={[]} canComputeStatistics /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', {name: 'graph.card.statistics_source'}));
    fireEvent.click(await screen.findByText('graph.card.vermeer_statistics'));
    expect(await screen.findByRole('status')).toHaveTextContent('graph.card.vermeer_load_first');
    fireEvent.click(screen.getByRole('button', {name: 'graph.detail.retry_statistics'}));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(api.manage.getVermeerStatistic).toHaveBeenCalledTimes(2);
});

test.each([
    {status: 403, message: 'Load this graph from OLAP graph compute before collecting Vermeer statistics'},
    {status: 400, message: 'Vermeer workers are not ready'},
    {status: 503, message: 'Load this graph from OLAP graph compute before collecting Vermeer statistics'},
])('other Vermeer failures do not claim the snapshot is unloaded: %j', async response => {
    api.analysis.getGraphData.mockResolvedValueOnce({status: 200, data: {vertexcount: null, edgecount: null}});
    api.manage.getVermeerStatistic.mockResolvedValueOnce(response);
    render(<MemoryRouter><GraphCard item={{name: 'g', graphspace: 'space',
        schemaview: {vertices: [], edges: []}}} menus={[]} canComputeStatistics /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', {name: 'graph.card.statistics_source'}));
    fireEvent.click(await screen.findByText('graph.card.vermeer_statistics'));
    await screen.findByRole('button', {name: 'graph.detail.retry_statistics'});
    expect(screen.queryByRole('link', {name: 'graph.card.open_graph_compute'})).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('a failed collection leaves a retryable action and keeps graph navigation available', async () => {
    api.analysis.getGraphData.mockResolvedValueOnce({status: 200, data: {vertexcount: null, edgecount: null}});
    api.manage.getGraphStatistic.mockResolvedValueOnce({status: 503, message: 'collect temporarily unavailable'});
    render(<MemoryRouter><GraphCard item={{name: 'g', graphspace: 'space',
        schemaview: {vertices: [], edges: []}}} menus={[]} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', {name: 'graph.detail.not_collected'}));
    expect(await screen.findByRole('button', {name: 'graph.detail.retry_statistics'})).toBeEnabled();
    expect(screen.getByRole('link', {name: 'graph.card.query_graph'})).toBeVisible();
    expect(screen.queryByRole('button', {name: 'graph.card.statistics_source'})).not.toBeInTheDocument();
});


test.each(['', ' ', -1, 'not-a-number'])('rejects an invalid collected count (%s)', async count => {
    api.analysis.getGraphData.mockResolvedValueOnce({status: 200, data: {vertexcount: null, edgecount: null}});
    api.manage.getGraphStatistic.mockResolvedValueOnce({status: 200, data: {vertex_count: count, edge_count: '2'}});
    render(<MemoryRouter><GraphCard item={{name: 'g', graphspace: 'space',
        schemaview: {vertices: [], edges: []}}} menus={[]} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', {name: 'graph.detail.not_collected'}));
    expect(await screen.findByRole('button', {name: 'graph.detail.retry_statistics'})).toBeEnabled();
    expect(screen.queryByText(/graph.card.element_counts/)).not.toBeInTheDocument();
});
