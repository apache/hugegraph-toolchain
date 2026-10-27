/*
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
import EditElement from './index';
import {GraphContext} from '../Context';
import GraphAnalysisContext from '../../Context';
import * as api from '../../../api/index';
import {getBoundedGraphView} from '../../analysis/QueryResult/Home/utils';

jest.mock('react-i18next', () => ({useTranslation: () => ({t: key => key})}));
jest.mock('../../../api/index', () => ({analysis: {
    getVertexProperties: jest.fn(), getEdgeProperties: jest.fn(),
    updateVertexProperties: jest.fn(), updateEdgeProperties: jest.fn(),
}}));
const initial = {kind: 'node', renderingId: 'node:large', id: 90071992547409930000n,
    itemType: 'person', properties: {name: 'Alice', code: 'K1', count: 3}, raw: {}};
const fixture = () => ({controller: {}, report: jest.fn()});
const content = (value, props, context = {graphSpace: 'DEFAULT', graph: 'g'}) => (
    <GraphContext.Provider value={{...value, run: operation => Promise.resolve().then(operation).catch(value.report)}}>
        <GraphAnalysisContext.Provider value={context}><EditElement show drawerInfo={initial} {...props} /></GraphAnalysisContext.Provider>
    </GraphContext.Provider>
);
const edit = () => fireEvent.click(screen.getByRole('button', {name: 'analysis.canvas.edit_element.edit'}));
const save = () => fireEvent.click(screen.getByRole('button', {name: 'analysis.canvas.edit_element.save'}));
beforeAll(() => {
    window.matchMedia = query => ({matches: false, media: query,
        addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(),
        removeEventListener: jest.fn(), dispatchEvent: jest.fn()});
});
beforeEach(() => {
    jest.resetAllMocks();
    api.analysis.getVertexProperties.mockResolvedValue({status: 200,
        data: {nullableProps: ['name'], nonNullableProps: ['code'], primaryKeys: ['code']}});
    api.analysis.updateVertexProperties.mockResolvedValue({status: 200});
});

test('saves using raw ID and reports only one raw patch with preserved primary properties', async () => {
    const value = fixture();
    const onChange = jest.fn().mockResolvedValue({status: 'applied'});
    const cancel = jest.fn();
    render(content(value, {onChange, cancel}));
    edit();
    const input = await screen.findByRole('textbox', {name: 'name'});
    fireEvent.change(input, {target: {value: 'Bob'}});
    save();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('nodes', 'node:large', {
        id: initial.id, label: 'person', properties: {name: 'Bob', code: 'K1', count: 3},
    }));
    expect(api.analysis.updateVertexProperties).toHaveBeenCalledWith('DEFAULT', 'g', {
        id: initial.id, label: 'person', properties: {name: 'Bob'},
    });
    expect(cancel).toHaveBeenCalledTimes(1);
});

test.each([['NUMBER', {id_type: 'NUMBER'}], [undefined, {}]])(
    'forwards only the explicit numeric ID type marker (%s) without coercing the ID', async (idType, extra) => {
        const value = fixture();
        const id = '9223372036854775807';
        const onChange = jest.fn().mockResolvedValue({status: 'applied'});
        render(content(value, {onChange,
            drawerInfo: {...initial, id, raw: {id, id_type: idType}}}));
        edit();
        const input = await screen.findByRole('textbox', {name: 'name'});
        fireEvent.change(input, {target: {value: 'Updated'}});
        save();
        await waitFor(() => expect(api.analysis.updateVertexProperties).toHaveBeenCalledWith('DEFAULT', 'g', {
            id, label: 'person', properties: {name: 'Updated'}, ...extra,
        }));
        expect(onChange).toHaveBeenCalledWith('nodes', initial.renderingId, {
            id, label: 'person', properties: {name: 'Updated', code: 'K1', count: 3}, ...extra,
        });
        expect(value.report).not.toHaveBeenCalled();
    }
);

test('ignores late metadata response after changing graph or element', async () => {
    const value = fixture();
    let resolve;
    api.analysis.getVertexProperties.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const result = render(content(value, {onChange: jest.fn()}));
    edit();
    await waitFor(() => expect(api.analysis.getVertexProperties).toHaveBeenCalled());
    result.rerender(content(value, {onChange: jest.fn(), drawerInfo: {...initial, renderingId: 'node:new', id: 'new'}},
        {graphSpace: 'OTHER', graph: 'other'}));
    await act(async () => resolve({status: 200, data: {nullableProps: ['name']}}));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'analysis.canvas.edit_element.edit'})).toBeEnabled();
});

test('ignores late save response after changing graph and catches rejected requests', async () => {
    const value = fixture();
    const onChange = jest.fn();
    let resolve;
    api.analysis.updateVertexProperties.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const result = render(content(value, {onChange}));
    edit();
    await screen.findByRole('textbox', {name: 'name'});
    save();
    await waitFor(() => expect(api.analysis.updateVertexProperties).toHaveBeenCalled());
    result.rerender(content(value, {onChange}, {graphSpace: 'OTHER', graph: 'other'}));
    await act(async () => resolve({status: 200}));
    expect(onChange).not.toHaveBeenCalled();
    api.analysis.getVertexProperties.mockRejectedValueOnce(new Error('network'));
    edit();
    await waitFor(() => expect(value.report).toHaveBeenCalledWith(expect.any(Error)));
    expect(screen.getByRole('button', {name: 'analysis.canvas.edit_element.edit'})).toBeEnabled();
});

test('edge editing preserves original endpoints and uses rendering ID only for callback', async () => {
    const value = fixture();
    api.analysis.getEdgeProperties.mockResolvedValue({status: 200, data: {nullableProps: ['weight']}});
    api.analysis.updateEdgeProperties.mockResolvedValue({status: 200});
    const onChange = jest.fn().mockResolvedValue({status: 'applied'});
    render(content(value, {onChange, drawerInfo: {kind: 'edge', renderingId: 'edge:render', id: 'business-edge',
        itemType: 'knows', source: initial.id, target: 'peer', properties: {weight: '1'}}}));
    edit();
    const input = await screen.findByRole('textbox', {name: 'weight'});
    fireEvent.change(input, {target: {value: '2'}});
    save();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('edges', 'edge:render', {
        id: 'business-edge', label: 'knows', source: initial.id, target: 'peer', properties: {weight: '2'},
    }));
});

test('never edits or PUTs truncated preview properties, including a programmatic form submit', async () => {
    const value = fixture();
    const onChange = jest.fn();
    render(content(value, {onChange, drawerInfo: {...initial,
        raw: {'~hubble_properties_preview': true},
        properties: {name: 'prefix… [preview 256/1000000 chars]'},
    }}));
    expect(screen.getByRole('button', {name: 'analysis.canvas.edit_element.edit'})).toBeDisabled();
    expect(screen.getByText('analysis.query_result.properties_preview_read_only')).toBeInTheDocument();
    expect(screen.getByText('prefix… [preview 256/1000000 chars]')).toBeInTheDocument();
    edit();
    await act(async () => { fireEvent.submit(document.querySelector('form')); });
    expect(api.analysis.getVertexProperties).not.toHaveBeenCalled();
    expect(api.analysis.updateVertexProperties).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
});

test('keeps a complete vertex editable beside a partial vertex from the same query', async () => {
    const value = fixture();
    const preview = getBoundedGraphView({vertices: [
        {id: initial.id, label: 'person', properties: initial.properties},
        {id: 'partial', label: 'person', properties: {name: 'prefix… [preview 256/257 chars]'}},
    ], edges: []}, 500, {vertexIds: ['partial'], edgeIds: []});
    const drawer = vertex => ({...initial, id: vertex.id, renderingId: `node:${vertex.id}`,
        properties: vertex.properties, raw: vertex});
    const onChange = jest.fn();
    const result = render(content(value, {onChange, drawerInfo: drawer(preview.vertices[0])}));
    expect(screen.getByRole('button', {name: 'analysis.canvas.edit_element.edit'})).toBeEnabled();
    edit();
    expect(await screen.findByRole('textbox', {name: 'name'})).toHaveValue('Alice');
    result.rerender(content(value, {onChange, drawerInfo: drawer(preview.vertices[1])}));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'analysis.canvas.edit_element.edit'})).toBeDisabled();
    edit();
    await act(async () => { fireEvent.submit(document.querySelector('form')); });
    expect(api.analysis.getVertexProperties).toHaveBeenCalledTimes(1);
    expect(api.analysis.updateVertexProperties).not.toHaveBeenCalled();
});

test('invalidates an open edit form when its data becomes a property preview', async () => {
    const value = fixture();
    const onChange = jest.fn();
    const result = render(content(value, {onChange}));
    edit();
    await screen.findByRole('textbox', {name: 'name'});
    result.rerender(content(value, {onChange, drawerInfo: {...initial,
        raw: {'~hubble_properties_preview': true},
    }}));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await act(async () => { fireEvent.submit(document.querySelector('form')); });
    expect(api.analysis.updateVertexProperties).not.toHaveBeenCalled();
});
