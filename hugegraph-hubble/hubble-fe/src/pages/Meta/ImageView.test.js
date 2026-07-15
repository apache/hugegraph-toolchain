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

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import ImageView from './ImageView';
import * as api from '../../api';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('react-router-dom', () => ({
    Link: ({children, to}) => <a href={to}>{children}</a>,
    useParams: () => ({graphspace: 'space-a', graph: 'graph-a'}),
}));

jest.mock('../../api', () => ({
    manage: {
        getGraphView: jest.fn(),
        getMetaVertexList: jest.fn(),
        getMetaPropertyList: jest.fn(),
    },
}));

jest.mock('../../components/GraphinView', () => props => {
    const node = props.data.nodes?.[0];
    const edge = props.data.edges?.[0];
    return (
        <div data-testid='graph-view'>
            <output data-testid='graph-presentation'>
                {JSON.stringify({
                    node: node?.style,
                    edge: edge?.style,
                    linkDistance: props.layout?.linkDistance,
                })}
            </output>
            <button
                data-testid='schema-node-single-click'
                onClick={() => props.onClick?.(
                    node?.id,
                    'node',
                    node?.data
                )}
            />
            <button
                data-testid='schema-node-double-click'
                onDoubleClick={() => props.onDoubleClick?.(
                    node?.id,
                    'node',
                    node?.data
                )}
            />
            {node && props.nodeTooltip?.({model: node})}
            {edge && props.edgeTooltip?.({model: edge})}
        </div>
    );
});
jest.mock('../../utils/formatGraphInData', () => ({
    formatToGraphInData: data => ({
        nodes: data.vertices.map(vertex => ({
            id: vertex.id,
            style: {
                label: {value: vertex.label},
                keyshape: {fill: vertex['~style'].color},
                icon: {fontSize: 12},
            },
            data: vertex,
        })),
        edges: data.edges.map(edge => ({
            source: edge.source,
            target: edge.target,
            style: {
                label: {value: edge.label},
                keyshape: {stroke: edge['~style'].color},
            },
            data: edge,
        })),
    }),
}));
jest.mock('./Property/EditLayer', () => ({EditPropertyLayer: () => null}));
jest.mock('./Vertex/EditLayer', () => ({EditVertexLayer: ({visible, name}) => (
    <output data-testid='vertex-edit-layer'>{visible ? name : 'closed'}</output>
)}));
jest.mock('./Edge/EditLayer', () => ({EditEdgeLayer: () => null}));
jest.mock('./Property', () => () => null);

beforeEach(() => {
    jest.clearAllMocks();
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
    api.manage.getGraphView.mockResolvedValue({
        status: 200,
        data: {vertices: [], edges: []},
    });
    api.manage.getMetaVertexList.mockResolvedValue({
        status: 200,
        data: {records: []},
    });
    api.manage.getMetaPropertyList.mockResolvedValue({
        status: 200,
        data: {records: []},
    });
});

test('guides an empty graph through property, vertex, then edge creation', async () => {
    render(<ImageView />);

    expect(await screen.findByText('schema.image_view.empty_title')).toBeInTheDocument();
    expect(screen.getByText('schema.image_view.step_property')).toBeInTheDocument();
    expect(screen.getByText('schema.image_view.step_vertex')).toBeInTheDocument();
    expect(screen.getByText('schema.image_view.step_edge')).toBeInTheDocument();

    expect(screen.getByRole('button', {name: 'schema.property.create'}))
        .toHaveClass('ant-btn-primary');
    expect(screen.getByRole('button', {name: 'schema.edge.form.title_create'}))
        .toBeDisabled();
    expect(screen.getByText('schema.image_view.template_description'))
        .toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'schema.image_view.use_template'}))
        .toHaveAttribute('href', '/graphspace/space-a/schema');
    expect(screen.queryByTestId('graph-view')).not.toBeInTheDocument();
});

const schemaVertex = (id, label = id) => ({
    id,
    label,
    primary_keys: ['name'],
    properties: {name: 'text', age: 'int'},
    '~style': {color: '#5c73e6', icon: '', size: 'NORMAL'},
});

const schemaEdge = {
    id: 'person-knows-person',
    label: 'knows',
    source: 'person',
    target: 'person',
    sort_keys: [],
    properties: {since: 'date'},
    '~style': {
        color: '#5c73e6',
        with_arrow: true,
        line_type: 'SOLID',
        thickness: 'NORMAL',
    },
};

const loadSchema = ({vertices, edges = []}) => {
    api.manage.getGraphView.mockResolvedValue({
        status: 200,
        data: {vertices, edges},
    });
    api.manage.getMetaVertexList.mockResolvedValue({
        status: 200,
        data: {records: vertices.map(vertex => ({name: vertex.label}))},
    });
    api.manage.getMetaPropertyList.mockResolvedValue({
        status: 200,
        data: {
            records: [
                {name: 'name', data_type: 'TEXT'},
                {name: 'age', data_type: 'INT'},
                {name: 'since', data_type: 'DATE'},
            ],
        },
    });
};

const waitForPresentation = async expectedLabel => {
    await waitFor(() => expect(screen.getByTestId('graph-presentation'))
        .toHaveTextContent(expectedLabel));
    return JSON.parse(screen.getByTestId('graph-presentation').textContent);
};

test('enlarges labels, nodes, edges and layout only for schemas below ten vertices', async () => {
    loadSchema({
        vertices: [schemaVertex('person'), schemaVertex('software')],
        edges: [schemaEdge],
    });

    render(<ImageView />);

    const smallPresentation = await waitForPresentation('person');
    expect(smallPresentation.node.keyshape.size).toBe(72);
    expect(smallPresentation.node.label.fontSize).toBe(18);
    expect(smallPresentation.edge.label.fontSize).toBe(16);
    expect(smallPresentation.edge.keyshape.lineWidth).toBe(2.5);
    expect(smallPresentation.linkDistance).toBe(240);
});

test('keeps the current graph scale for schemas with ten or more vertices', async () => {
    loadSchema({
        vertices: Array.from({length: 10}, (_, index) => schemaVertex(`v-${index}`)),
    });

    render(<ImageView />);

    const presentation = await waitForPresentation('v-0');
    expect(presentation.node.keyshape.size).toBeUndefined();
    expect(presentation.node.label.fontSize).toBeUndefined();
    expect(presentation.linkDistance).toBe(150);
});

test('shows applicable schema fields in vertex and edge hover details', async () => {
    loadSchema({vertices: [schemaVertex('person')], edges: [schemaEdge]});

    render(<ImageView />);

    expect((await screen.findAllByText('person')).length).toBeGreaterThan(0);
    expect(screen.getByText('schema.image_view.hover.primary_keys')).toBeInTheDocument();
    expect(screen.getByText('name (text), age (int)')).toBeInTheDocument();
    expect(screen.getByText('knows')).toBeInTheDocument();
    expect(screen.getByText('schema.image_view.hover.source')).toBeInTheDocument();
    expect(screen.getByText('schema.image_view.hover.target')).toBeInTheDocument();
    expect(screen.getByText('since (date)')).toBeInTheDocument();
    expect(screen.getByText('schema.image_view.hover.none')).toBeInTheDocument();
});

test('opens schema editing on double click but not on single click', async () => {
    loadSchema({vertices: [schemaVertex('person')]});

    render(<ImageView />);

    await waitForPresentation('person');
    fireEvent.click(screen.getByTestId('schema-node-single-click'));
    expect(screen.getByTestId('vertex-edit-layer')).toHaveTextContent('closed');

    fireEvent.doubleClick(screen.getByTestId('schema-node-double-click'));
    await waitFor(() => expect(screen.getByTestId('vertex-edit-layer'))
        .toHaveTextContent('person'));
});

test('links safely to the official HugeGraph SchemaLabel documentation', async () => {
    loadSchema({vertices: [schemaVertex('person')]});

    render(<ImageView />);

    await waitForPresentation('person');
    const docs = screen.getByRole('link', {
        name: 'schema.image_view.docs_link',
    });
    expect(docs).toHaveAttribute(
        'href',
        'https://hugegraph.apache.org/docs/clients/hugegraph-client/'
    );
    expect(docs).toHaveAttribute('target', '_blank');
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer');
});
