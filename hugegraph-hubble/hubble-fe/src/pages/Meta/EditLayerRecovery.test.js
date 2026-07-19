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
import {EditVertexLayer} from './Vertex/EditLayer';
import {EditEdgeLayer} from './Edge/EditLayer';
import {EditPropertyLayer} from './Property/EditLayer';
import * as api from '../../api';

jest.mock('react-i18next', () => ({
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({t: key => key}),
}));

jest.mock('../../api', () => ({
    manage: {
        getMetaVertex: jest.fn(),
        getMetaEdge: jest.fn(),
        getMetaEdgeList: jest.fn(),
        addMetaProperty: jest.fn(),
    },
}));

jest.mock('../../components/ColorSelect', () => ({
    InputColorSelect: () => <input aria-label='color' />,
}));
jest.mock('../../components/IconSelect', () => () => <input aria-label='icon' />);
jest.mock('./common/RelateProperty', () => () => <div>properties</div>);
jest.mock('./common/RelatePropertyIndex', () => () => <div>indexes</div>);

beforeEach(() => {
    jest.clearAllMocks();
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }));
    api.manage.getMetaEdgeList.mockResolvedValue({status: 200, data: {records: []}});
});

test('vertex detail failure ends loading, disables submit and retries', async () => {
    api.manage.getMetaVertex
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({
            status: 200,
            data: {
                name: 'person', properties: [], property_indexes: [],
                id_strategy: 'AUTOMATIC', primaryKeys: [],
            },
        });

    render(
        <EditVertexLayer
            visible
            onCancle={jest.fn()}
            graphspace='DEFAULT'
            graph='hugegraph'
            name='person'
            propertyList={[]}
        />
    );

    expect(await screen.findByText('schema.vertex.detail_failed')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'OK'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name: 'schema.retry'}));
    await waitFor(() => expect(api.manage.getMetaVertex).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', {name: 'OK'})).toBeEnabled());
});

test('edge detail failure ends loading, disables submit and retries', async () => {
    api.manage.getMetaEdge
        .mockResolvedValueOnce({status: 500})
        .mockResolvedValueOnce({
            status: 200,
            data: {
                name: 'knows', properties: [], property_indexes: [],
                link_multi_times: false, edgelabel_type: 'NORMAL',
            },
        });

    render(
        <EditEdgeLayer
            visible
            onCancle={jest.fn()}
            graphspace='DEFAULT'
            graph='hugegraph'
            name='knows'
            propertyList={[]}
            vertexList={[]}
        />
    );

    expect(await screen.findByText('schema.edge.detail_failed')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'OK'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name: 'schema.retry'}));
    await waitFor(() => expect(api.manage.getMetaEdge).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', {name: 'OK'})).toBeEnabled());
    expect(screen.getByRole('combobox', {name: 'schema.edge.form.arrow_style'}))
        .toBeInTheDocument();
});

test('property form explains its read and write contract with examples', () => {
    render(
        <EditPropertyLayer
            visible
            onCancle={jest.fn()}
            graphspace='DEFAULT'
            graph='hugegraph'
            refresh={jest.fn()}
        />
    );

    expect(screen.getByPlaceholderText('schema.property.form.name_placeholder'))
        .toBeInTheDocument();
    expect(screen.getByLabelText(
        'schema.property.form.name: schema.property.form.name_help'
    )).toBeInTheDocument();
    expect(screen.getByLabelText(
        'schema.property.form.type: schema.property.form.type_help'
    )).toBeInTheDocument();
    expect(screen.getByLabelText(
        'schema.property.form.cardinality: schema.property.form.cardinality_help'
    ))
        .toBeInTheDocument();
});
