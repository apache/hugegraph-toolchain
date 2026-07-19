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

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {message} from 'antd';
import ImageView from './ImageView';
import * as api from '../../api';

let mockRouteParams = {graphspace: 'space-a', graph: 'graph-a'};

jest.mock('antd', () => {
    const actual = jest.requireActual('antd');
    return {
        ...actual,
        message: {...actual.message, success: jest.fn(), error: jest.fn()},
    };
});

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('react-router-dom', () => ({
    Link: ({children, to}) => <a href={to}>{children}</a>,
    useParams: () => mockRouteParams,
}));

jest.mock('../../api', () => ({
    manage: {
        getGraphView: jest.fn(),
        getMetaVertexList: jest.fn(),
        getMetaPropertyList: jest.fn(),
        getSchemaList: jest.fn(),
        getSchema: jest.fn(),
        addGraphSchema: jest.fn(),
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
jest.mock('./Property/EditLayer', () => ({EditPropertyLayer: ({visible}) => (
    <output data-testid='property-edit-layer'>{visible ? 'open' : 'closed'}</output>
)}));
jest.mock('./Vertex/EditLayer', () => ({EditVertexLayer: ({visible, name}) => (
    <output data-testid='vertex-edit-layer'>{visible ? name : 'closed'}</output>
)}));
jest.mock('./Edge/EditLayer', () => ({EditEdgeLayer: () => null}));
jest.mock('./Property', () => () => null);

beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {graphspace: 'space-a', graph: 'graph-a'};
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
    api.manage.getSchemaList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'saved_network'}]},
    });
    api.manage.getSchema.mockResolvedValue({
        status: 200,
        data: {
            name: 'saved_network',
            schema: 'schema.propertyKey("saved").asText().ifNotExist().create()',
        },
    });
    api.manage.addGraphSchema.mockResolvedValue({status: 200});
});

test('guides an empty graph through property, vertex, then edge creation', async () => {
    const {container} = render(<ImageView />);

    expect(await screen.findByRole('heading', {
        name: 'schema.image_view.create_from_template',
    })).toBeInTheDocument();
    expect(screen.getByText('schema.image_view.step_property')).toBeInTheDocument();
    expect(screen.getByText('schema.image_view.step_vertex')).toBeInTheDocument();
    expect(screen.getByText('schema.image_view.step_edge')).toBeInTheDocument();

    expect(screen.getByRole('button', {name: 'schema.property.create'}))
        .toHaveClass('ant-btn-default');
    expect(screen.getByRole('button', {name: 'schema.edge.form.title_create'}))
        .toBeDisabled();
    expect(screen.getByText('schema.image_view.start_description'))
        .toBeInTheDocument();
    expect(container.querySelector('a[href="/graphspace/space-a/schema"]'))
        .toBeNull();

    fireEvent.click(screen.getByRole('button', {
        name: 'schema.image_view.start_with_property',
    }));

    expect(screen.getByTestId('property-edit-layer')).toHaveTextContent('open');
    expect(screen.queryByTestId('graph-view')).not.toBeInTheDocument();
});

test('loads built-in and saved templates in place and applies a built-in template', async () => {
    let resolveApply;
    api.manage.addGraphSchema.mockReturnValue(new Promise(resolve => {
        resolveApply = resolve;
    }));
    render(<ImageView />);

    fireEvent.click(await screen.findByRole('button', {
        name: 'schema.image_view.create_from_template',
    }));

    await waitFor(() => expect(api.manage.getSchemaList).toHaveBeenCalledWith(
        'space-a',
        {page_size: -1},
        {suppressBusinessErrorToast: true}
    ));
    fireEvent.mouseDown(screen.getByRole('combobox', {
        name: 'schema.image_view.template_select',
    }));
    expect(await screen.findByText('schema_template.builtin.people_network'))
        .toBeInTheDocument();
    expect(screen.getByText('saved_network')).toBeInTheDocument();

    fireEvent.click(screen.getByText('schema_template.builtin.people_network'));
    fireEvent.click(screen.getByRole('button', {
        name: 'schema.image_view.apply_template',
    }));

    await waitFor(() => expect(api.manage.addGraphSchema).toHaveBeenCalledWith(
        'space-a',
        'graph-a',
        expect.objectContaining({
            'schema-groovy': expect.stringContaining(
                'graph.schema().propertyKey("name")'
            ),
        }),
        {suppressBusinessErrorToast: true}
    ));
    await act(async () => resolveApply({status: 200}));
    const schemaPayload = api.manage.addGraphSchema.mock.calls[0][2]['schema-groovy'];
    expect(schemaPayload.split('\n').every(line => line.startsWith('graph.schema().')))
        .toBe(true);
    expect(schemaPayload).not.toContain('indexLabel("personByName")');
    await waitFor(() => expect(api.manage.getGraphView).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.querySelector('.ant-spin-spinning')).toBeNull());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('fetches the selected saved template detail before applying it', async () => {
    let resolveApply;
    api.manage.addGraphSchema.mockReturnValue(new Promise(resolve => {
        resolveApply = resolve;
    }));
    api.manage.getSchema.mockResolvedValue({
        status: 200,
        data: {
            name: 'saved_network',
            schema: '"// generated template\\n'
                + 'graph.schema().propertyKey(\'saved\').asText()'
                + '.ifNotExist().create();\\n"',
        },
    });
    render(<ImageView />);

    fireEvent.click(await screen.findByRole('button', {
        name: 'schema.image_view.create_from_template',
    }));
    await waitFor(() => expect(api.manage.getSchemaList).toHaveBeenCalled());
    fireEvent.mouseDown(screen.getByRole('combobox', {
        name: 'schema.image_view.template_select',
    }));
    fireEvent.click(await screen.findByText('saved_network'));
    fireEvent.click(screen.getByRole('button', {
        name: 'schema.image_view.apply_template',
    }));

    await waitFor(() => expect(api.manage.getSchema).toHaveBeenCalledWith(
        'space-a',
        'saved_network',
        {suppressBusinessErrorToast: true}
    ));
    await waitFor(() => expect(api.manage.addGraphSchema).toHaveBeenCalled());
    await act(async () => resolveApply({status: 200}));
    await waitFor(() => expect(api.manage.addGraphSchema).toHaveBeenCalledWith(
        'space-a',
        'graph-a',
        {
            'schema-groovy': "graph.schema().propertyKey('saved')"
                + '.asText().ifNotExist().create();',
        },
        {suppressBusinessErrorToast: true}
    ));
    await waitFor(() => expect(document.querySelector('.ant-spin-spinning')).toBeNull());
});

test('applies saved content when a saved template has a built-in name', async () => {
    api.manage.getSchemaList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'people_network'}]},
    });
    api.manage.getSchema.mockResolvedValue({
        status: 200,
        data: {
            name: 'people_network',
            schema: 'schema.propertyKey("saved_only").asText()'
                + '.ifNotExist().create()',
        },
    });
    render(<ImageView />);

    fireEvent.click(await screen.findByRole('button', {
        name: 'schema.image_view.create_from_template',
    }));
    await waitFor(() => expect(api.manage.getSchemaList).toHaveBeenCalled());
    fireEvent.mouseDown(screen.getByRole('combobox', {
        name: 'schema.image_view.template_select',
    }));
    fireEvent.click(await screen.findByText(
        'people_network (schema.image_view.saved_templates)'
    ));
    fireEvent.click(screen.getByRole('button', {
        name: 'schema.image_view.apply_template',
    }));

    await waitFor(() => expect(api.manage.getSchema).toHaveBeenCalledWith(
        'space-a',
        'people_network',
        {suppressBusinessErrorToast: true}
    ));
    await waitFor(() => expect(api.manage.addGraphSchema).toHaveBeenCalledWith(
        'space-a',
        'graph-a',
        {
            'schema-groovy': 'graph.schema().propertyKey("saved_only").asText()'
                + '.ifNotExist().create()',
        },
        {suppressBusinessErrorToast: true}
    ));
});

test('keeps template selection open and offers retry when templates cannot load', async () => {
    api.manage.getSchemaList.mockRejectedValueOnce(new Error('templates unavailable'));
    render(<ImageView />);

    fireEvent.click(await screen.findByRole('button', {
        name: 'schema.image_view.create_from_template',
    }));

    expect(await screen.findByText('schema.image_view.template_load_failed'))
        .toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {
        name: 'schema.image_view.retry_templates',
    }));
    await waitFor(() => expect(api.manage.getSchemaList).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('combobox', {
        name: 'schema.image_view.template_select',
    })).toBeInTheDocument();
});

test('closes and refreshes after apply failure to reveal any partial Schema', async () => {
    let rejectApply;
    api.manage.addGraphSchema.mockReturnValue(new Promise((_, reject) => {
        rejectApply = reject;
    }));
    render(<ImageView />);

    fireEvent.click(await screen.findByRole('button', {
        name: 'schema.image_view.create_from_template',
    }));
    await waitFor(() => expect(api.manage.getSchemaList).toHaveBeenCalled());
    fireEvent.mouseDown(screen.getByRole('combobox', {
        name: 'schema.image_view.template_select',
    }));
    fireEvent.click(await screen.findByText('schema_template.builtin.people_network'));
    fireEvent.click(screen.getByRole('button', {
        name: 'schema.image_view.apply_template',
    }));

    await waitFor(() => expect(api.manage.addGraphSchema).toHaveBeenCalled());
    await act(async () => rejectApply(new Error('schema rejected')));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(
        'schema.image_view.template_apply_failed'
    ));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(api.manage.getGraphView).toHaveBeenCalledTimes(2));
});

test('does not treat a graph with property keys as an empty Schema', async () => {
    let resolveProperties;
    api.manage.getMetaPropertyList.mockReturnValue(new Promise(resolve => {
        resolveProperties = resolve;
    }));

    render(<ImageView />);

    await act(async () => resolveProperties({
        status: 200,
        data: {records: [{name: 'name', data_type: 'TEXT'}]},
    }));
    await waitFor(() => expect(document.querySelector('.ant-spin-spinning')).toBeNull());

    expect(screen.getByRole('button', {name: 'schema.property.create'}))
        .toBeInTheDocument();
    expect(screen.queryByRole('button', {
        name: 'schema.image_view.create_from_template',
    })).not.toBeInTheDocument();
});

test('ignores a completed template apply after the graph context changes', async () => {
    let resolveApply;
    api.manage.addGraphSchema.mockReturnValue(new Promise(resolve => {
        resolveApply = resolve;
    }));
    const {rerender} = render(<ImageView />);

    fireEvent.click(await screen.findByRole('button', {
        name: 'schema.image_view.create_from_template',
    }));
    await waitFor(() => expect(api.manage.getSchemaList).toHaveBeenCalled());
    fireEvent.mouseDown(screen.getByRole('combobox', {
        name: 'schema.image_view.template_select',
    }));
    fireEvent.click(await screen.findByText('schema_template.builtin.people_network'));
    fireEvent.click(screen.getByRole('button', {
        name: 'schema.image_view.apply_template',
    }));
    await waitFor(() => expect(api.manage.addGraphSchema).toHaveBeenCalled());

    mockRouteParams = {graphspace: 'space-b', graph: 'graph-b'};
    rerender(<ImageView />);
    await act(async () => resolveApply({status: 200}));

    await waitFor(() => expect(api.manage.getGraphView).toHaveBeenCalledWith(
        'space-b',
        'graph-b'
    ));
    expect(api.manage.getGraphView).toHaveBeenCalledTimes(2);
    expect(message.success).not.toHaveBeenCalled();
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
