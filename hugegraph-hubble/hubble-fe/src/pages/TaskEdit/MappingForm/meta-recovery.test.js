/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
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

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import MappingForm from './index';
import * as api from '../../../api';

jest.mock('../../../api', () => ({manage: {
    getMetaVertexList: jest.fn(),
    getMetaEdgeList: jest.fn(),
}}));
jest.mock('./Vertex', () => () => null);
jest.mock('./Edge', () => () => null);
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: key => ({
            'task.edit.step_mapping_fields': 'Mappings',
            'task.edit.mapping_help_title': 'How mapping works',
            'task.edit.mapping_help': 'Map source fields to schema.',
            'task.edit.mapping_example_title': 'Complete mapping example',
            'task.edit.mapping_example_vertex_source': 'person_id=42, person_name=Alice',
            'task.edit.mapping_example_vertex_target': 'person / ID person_id / name',
            'task.edit.mapping_example_edge_source': 'from_id=42, to_id=84',
            'task.edit.mapping_example_edge_target': 'knows / from_id -> to_id',
            'task.edit.add_vertex_mapping': 'Add vertex mapping',
            'task.edit.add_edge_mapping': 'Add edge mapping',
            'task.edit.mapping_meta_failed': 'Could not load target schema.',
            'task.edit.mapping_meta_retry': 'Retry schema',
        })[key] || key,
    }),
}));

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

it('shows an inline retry instead of treating metadata failure as empty schema', async () => {
    api.manage.getMetaVertexList
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {records: [{name: 'person'}]}});
    api.manage.getMetaEdgeList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'knows'}]},
    });
    render(
        <MappingForm
            visible
            targetField={[]}
            graphspace='DEFAULT'
            graph='hugegraph'
            vertexList={[]}
            edgeList={[]}
            changeVertexList={jest.fn()}
            changeEdgeList={jest.fn()}
            prev={jest.fn()}
        />
    );

    expect(await screen.findByText('Could not load target schema.'))
        .toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Add vertex mapping'})).toBeDisabled();
    await act(async () => {
        fireEvent.click(screen.getByRole('button', {name: 'Retry schema'}));
        await Promise.resolve();
        await Promise.resolve();
    });

    await waitFor(() => expect(api.manage.getMetaVertexList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Could not load target schema.'))
        .not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', {
        name: 'Add vertex mapping',
    })).toBeEnabled());
});

it('keeps complete vertex and edge mapping examples visible on the mapping step', () => {
    api.manage.getMetaVertexList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.getMetaEdgeList.mockResolvedValue({status: 200, data: {records: []}});

    render(
        <MappingForm
            visible
            targetField={[]}
            graphspace=''
            graph=''
            vertexList={[]}
            edgeList={[]}
            changeVertexList={jest.fn()}
            changeEdgeList={jest.fn()}
            prev={jest.fn()}
        />
    );

    expect(screen.getByText('Complete mapping example')).toBeInTheDocument();
    expect(screen.getByText('person_id=42, person_name=Alice')).toBeInTheDocument();
    expect(screen.getByText('person / ID person_id / name')).toBeInTheDocument();
    expect(screen.getByText('from_id=42, to_id=84')).toBeInTheDocument();
    expect(screen.getByText('knows / from_id -> to_id')).toBeInTheDocument();
});
