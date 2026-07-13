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

import {render, screen} from '@testing-library/react';
import ImageView from './ImageView';
import * as api from '../../api';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('react-router-dom', () => ({
    useParams: () => ({graphspace: 'space-a', graph: 'graph-a'}),
}));

jest.mock('../../api', () => ({
    manage: {
        getGraphView: jest.fn(),
        getMetaVertexList: jest.fn(),
        getMetaPropertyList: jest.fn(),
    },
}));

jest.mock('../../components/GraphinView', () => ({data}) => (
    <div data-testid='graph-view'>{data.nodes?.length || 0}</div>
));
jest.mock('../../utils/formatGraphInData', () => ({
    formatToGraphInData: () => ({nodes: [], edges: []}),
}));
jest.mock('./Property/EditLayer', () => ({EditPropertyLayer: () => null}));
jest.mock('./Vertex/EditLayer', () => ({EditVertexLayer: () => null}));
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
    expect(screen.queryByTestId('graph-view')).not.toBeInTheDocument();
});
