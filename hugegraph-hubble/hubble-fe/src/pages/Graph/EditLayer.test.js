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
import userEvent from '@testing-library/user-event';
import {EditLayer, ViewLayer} from './EditLayer';
import * as api from '../../api';
import {BUILTIN_SCHEMA_TEMPLATES} from '../Schema/builtinSchemaTemplates';

jest.mock('react-i18next', () => ({
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({t: key => key}),
}));

jest.mock('../../api', () => ({
    manage: {
        getGraphSchema: jest.fn(),
        exportSchema: jest.fn(),
        getSchemaList: jest.fn(),
        getSchema: jest.fn(),
        addSchema: jest.fn(),
        addGraphSchema: jest.fn(),
        addGraph: jest.fn(),
        getGraph: jest.fn(),
    },
}));

beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
    URL.createObjectURL = jest.fn(() => 'blob:schema');
    URL.revokeObjectURL = jest.fn();
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }));
});

test('shows schema and downloads the exported Groovy document', async () => {
    api.manage.getGraphSchema.mockResolvedValue({
        status: 200,
        data: {schema: 'graph.schema().propertyKey("name")'},
    });
    api.manage.exportSchema.mockResolvedValue('schema export');
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});

    render(
        <ViewLayer
            visible
            onCancel={jest.fn()}
            graphspace='DEFAULT'
            graph='hugegraph'
        />
    );

    expect(await screen.findByText('graph.schema().propertyKey("name")'))
        .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'graph.schema_view.export'}));

    await waitFor(() => expect(api.manage.exportSchema)
        .toHaveBeenCalledWith('DEFAULT', 'hugegraph'));
    await waitFor(() => expect(screen.getByRole('button', {
        name: 'graph.schema_view.export',
    })).not.toHaveClass('ant-btn-loading'));
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    click.mockRestore();
});

test('keeps schema load failure visible and retries the current graph', async () => {
    api.manage.getGraphSchema
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {schema: 'recovered'}});

    render(
        <ViewLayer
            visible
            onCancel={jest.fn()}
            graphspace='DEFAULT'
            graph='hugegraph'
        />
    );

    expect(await screen.findByText('graph.schema_view.load_failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'graph.schema_view.retry'}));
    expect(await screen.findByText('recovered')).toBeInTheDocument();
    expect(api.manage.getGraphSchema).toHaveBeenCalledTimes(2);
});

test('explains template list failure and retries without a silent empty select', async () => {
    api.manage.getSchemaList
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {records: []}});

    render(
        <EditLayer
            visible
            onCancel={jest.fn()}
            refresh={jest.fn()}
            graphspace='DEFAULT'
        />
    );

    expect(await screen.findByText('graph.form.schema_load_failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'graph.form.schema_retry'}));
    await waitFor(() => expect(api.manage.getSchemaList).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('graph.form.schema_load_failed')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
});

test('offers built-in Graph Schema choices and a direct create-template route', async () => {
    api.manage.getSchemaList.mockResolvedValue({status: 200, data: {records: []}});

    render(
        <EditLayer
            visible
            onCancel={jest.fn()}
            refresh={jest.fn()}
            graphspace='DEFAULT'
        />
    );

    expect(await screen.findByRole('link', {name: 'graph.form.schema_create'}))
        .toHaveAttribute('href', '/graphspace/DEFAULT/schema?create=true');
    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('schema_template.builtin.people_network')).toBeInTheDocument();
    expect(screen.getByText('schema_template.builtin.product_catalog')).toBeInTheDocument();
});

test('persists a selected built-in template before creating the graph', async () => {
    api.manage.getSchemaList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.addSchema.mockResolvedValue({status: 200});
    api.manage.addGraph.mockResolvedValue({status: 200});

    render(
        <EditLayer
            visible
            onCancel={jest.fn()}
            refresh={jest.fn()}
            graphspace='DEFAULT'
        />
    );

    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    await userEvent.type(screen.getByPlaceholderText('graph.form.name_placeholder'), 'people');
    await userEvent.type(screen.getByPlaceholderText('graph.form.nickname_placeholder'), 'People');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByText('schema_template.builtin.people_network'));
    fireEvent.click(document.querySelector('.ant-modal-footer .ant-btn-primary'));

    await waitFor(() => expect(api.manage.addSchema).toHaveBeenCalledWith(
        'DEFAULT',
        expect.objectContaining({name: 'people_network'}),
        expect.objectContaining({suppressBusinessErrorToast: true})
    ));
    await waitFor(() => expect(api.manage.addGraph).toHaveBeenCalledWith(
        'DEFAULT',
        expect.objectContaining({graph: 'people', schema: 'people_network'})
    ));
});

test('creates a standalone graph before applying its built-in schema', async () => {
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));
    api.manage.getSchemaList.mockRejectedValue(new Error('PD unavailable'));
    api.manage.addGraph.mockResolvedValue({status: 200});
    api.manage.addGraphSchema.mockResolvedValue({status: 200});

    render(
        <EditLayer
            visible
            onCancel={jest.fn()}
            refresh={jest.fn()}
            graphspace='DEFAULT'
        />
    );

    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    expect(api.manage.getSchemaList).not.toHaveBeenCalled();
    await userEvent.type(
        screen.getByPlaceholderText('graph.form.name_placeholder'),
        'standalone_people'
    );
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByText('schema_template.builtin.people_network'));
    fireEvent.click(document.querySelector('.ant-modal-footer .ant-btn-primary'));

    await waitFor(() => expect(api.manage.addGraph).toHaveBeenCalledWith(
        'DEFAULT',
        expect.not.objectContaining({schema: 'people_network'})
    ));
    expect(api.manage.addSchema).not.toHaveBeenCalled();
    await waitFor(() => expect(api.manage.addGraphSchema).toHaveBeenCalledWith(
        'DEFAULT',
        'standalone_people',
        {'schema-groovy': expect.stringContaining('graph.schema().vertexLabel("person")')},
        expect.objectContaining({suppressBusinessErrorToast: true})
    ));
});

test('refreshes a created standalone graph when its schema application fails', async () => {
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));
    api.manage.getSchemaList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.addGraph.mockResolvedValue({status: 200});
    api.manage.addGraphSchema.mockRejectedValue({
        response: {data: {message: 'schema rejected by server'}},
    });
    const onCancel = jest.fn();
    const refresh = jest.fn();

    render(
        <EditLayer
            visible
            onCancel={onCancel}
            refresh={refresh}
            graphspace='DEFAULT'
        />
    );

    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    await userEvent.type(
        screen.getByPlaceholderText('graph.form.name_placeholder'),
        'partial_graph'
    );
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByText('schema_template.builtin.people_network'));
    fireEvent.click(document.querySelector('.ant-modal-footer .ant-btn-primary'));

    await waitFor(() => expect(onCancel).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByText('schema rejected by server')).toBeInTheDocument();
});

test('creates without an alias and never copies the graph name into nickname', async () => {
    api.manage.getSchemaList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.addGraph.mockResolvedValue({status: 200});
    render(
        <EditLayer visible onCancel={jest.fn()} refresh={jest.fn()} graphspace='DEFAULT' />
    );
    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    await userEvent.type(screen.getByPlaceholderText('graph.form.name_placeholder'), 'movies');
    fireEvent.click(document.querySelector('.ant-modal-footer .ant-btn-primary'));

    await waitFor(() => expect(api.manage.addGraph).toHaveBeenCalled());
    expect(api.manage.addGraph.mock.calls[0][1].nickname).not.toBe('movies');
});

test('keeps an existing graph path name immutable', async () => {
    api.manage.getGraph.mockResolvedValue({
        status: 200,
        data: {name: 'movie_graph', nickname: 'movie_graph'},
    });
    render(
        <EditLayer
            visible
            onCancel={jest.fn()}
            refresh={jest.fn()}
            graphspace='DEFAULT'
            graph='movie_graph'
        />
    );

    const pathName = screen.getByPlaceholderText('graph.form.name_placeholder');
    await waitFor(() => expect(pathName).toHaveValue('movie_graph'));
    expect(pathName).toBeDisabled();
    const alias = screen.getByPlaceholderText('graph.form.nickname_placeholder');
    expect(alias).toBeEnabled();
    expect(alias).toHaveValue('');
});

test('preserves a real graph alias while editing', async () => {
    api.manage.getGraph.mockResolvedValue({
        status: 200,
        data: {name: 'movie_graph', nickname: 'Movies'},
    });
    render(
        <EditLayer
            visible
            onCancel={jest.fn()}
            refresh={jest.fn()}
            graphspace='DEFAULT'
            graph='movie_graph'
        />
    );
    await waitFor(() => expect(
        screen.getByPlaceholderText('graph.form.nickname_placeholder')
    ).toHaveValue('Movies'));
});

test('retries graph creation after the built-in template was already persisted', async () => {
    api.manage.getSchemaList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.addSchema
        .mockResolvedValueOnce({status: 200})
        .mockResolvedValueOnce({
            status: 400,
            message: 'Cannot create schema template since it has been created',
        });
    api.manage.getSchema.mockResolvedValue({
        status: 200,
        data: {
            name: 'people_network',
            schema: BUILTIN_SCHEMA_TEMPLATES.people_network,
        },
    });
    api.manage.addGraph
        .mockResolvedValueOnce({status: 400, message: 'graph id unavailable'})
        .mockResolvedValueOnce({status: 200});

    render(
        <EditLayer
            visible
            onCancel={jest.fn()}
            refresh={jest.fn()}
            graphspace='DEFAULT'
        />
    );

    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    const graphInput = screen.getByPlaceholderText('graph.form.name_placeholder');
    await userEvent.type(graphInput, 'people');
    await userEvent.type(
        screen.getByPlaceholderText('graph.form.nickname_placeholder'),
        'People'
    );
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByText('schema_template.builtin.people_network'));
    fireEvent.click(document.querySelector('.ant-modal-footer .ant-btn-primary'));
    await waitFor(() => expect(api.manage.addGraph).toHaveBeenCalledTimes(1));

    await userEvent.clear(graphInput);
    await userEvent.type(graphInput, 'people_retry');
    fireEvent.click(document.querySelector('.ant-modal-footer .ant-btn-primary'));

    await waitFor(() => expect(api.manage.addGraph).toHaveBeenCalledTimes(2));
    expect(api.manage.getSchema).toHaveBeenCalledWith(
        'DEFAULT',
        'people_network',
        expect.objectContaining({suppressBusinessErrorToast: true})
    );
    expect(api.manage.addGraph.mock.calls[1][1]).toEqual(expect.objectContaining({
        graph: 'people_retry',
        schema: 'people_network',
    }));
});

test('does not reuse a same-named built-in template with different content', async () => {
    api.manage.getSchemaList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'people_network', schema: 'different schema'}]},
    });

    render(
        <EditLayer
            visible
            onCancel={jest.fn()}
            refresh={jest.fn()}
            graphspace='DEFAULT'
        />
    );

    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    await userEvent.type(screen.getByPlaceholderText('graph.form.name_placeholder'), 'people');
    await userEvent.type(
        screen.getByPlaceholderText('graph.form.nickname_placeholder'),
        'People'
    );
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByText('schema_template.builtin.people_network'));
    fireEvent.click(document.querySelector('.ant-modal-footer .ant-btn-primary'));

    expect(await screen.findByText('graph.form.schema_conflict')).toBeInTheDocument();
    expect(api.manage.addGraph).not.toHaveBeenCalled();
    expect(api.manage.addSchema).not.toHaveBeenCalled();
});

test('does not leak an old graph export failure into the next graph', async () => {
    let rejectOld;
    api.manage.getGraphSchema.mockResolvedValue({
        status: 200, data: {schema: 'schema'},
    });
    api.manage.exportSchema.mockImplementationOnce(() => new Promise((resolve, reject) => {
        rejectOld = reject;
    }));
    const {rerender} = render(
        <ViewLayer visible onCancel={jest.fn()} graphspace='DEFAULT' graph='graph-a' />
    );
    await screen.findByText('schema');
    fireEvent.click(screen.getByRole('button', {name: 'graph.schema_view.export'}));

    rerender(
        <ViewLayer visible onCancel={jest.fn()} graphspace='DEFAULT' graph='graph-b' />
    );
    await waitFor(() => expect(screen.getByRole('button', {
        name: 'graph.schema_view.export',
    })).toBeEnabled());
    rejectOld(new Error('old offline'));
    await waitFor(() => expect(api.manage.getGraphSchema).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('graph.schema_view.export_failed')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'graph.schema_view.export'}))
        .not.toHaveClass('ant-btn-loading');
});
