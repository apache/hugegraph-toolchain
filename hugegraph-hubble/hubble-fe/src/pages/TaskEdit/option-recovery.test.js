/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

import {Form, message} from 'antd';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import BaseForm from './BaseForm';
import FieldForm from './FieldForm';
import * as api from '../../api';
import {isPdEnabled} from '../../utils/config';

jest.mock('../../api', () => ({
    manage: {
        getDatasourceList: jest.fn(),
        getGraphList: jest.fn(),
        getGraphSpaceList: jest.fn(),
        getTaskList: jest.fn(),
        getDatasourceSchema: jest.fn(),
        loadSampleGraph: jest.fn(),
    },
}));

jest.mock('../../utils/config', () => ({isPdEnabled: jest.fn()}));
jest.mock('../../utils/rules', () => ({
    required: () => ({}),
    isNoramlName: () => ({}),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'task.edit.load_datasources_failed': 'Could not load data sources.',
        'task.edit.retry_datasources': 'Retry data sources',
        'task.edit.load_fields_failed': 'Could not load source fields.',
        'task.edit.retry_fields': 'Retry source fields',
        'task.edit.demo_title': 'Target graph, schema, and demo data',
        'task.edit.demo_target': 'Selected target: DEFAULT / empty_graph',
        'task.edit.demo_choose_graph': 'Choose a target graph first.',
        'task.edit.demo_failed': 'Could not prepare the demo.',
        'task.edit.retry_demo': 'Retry demo',
        'task.edit.prepare_schema_first': 'Prepare schema first',
        'graph.menu.load_hlm_sample': 'Build Red Chamber Demo',
        'graph.menu.load_loader_sample': 'Build People & Software Demo',
        'graph.sample.hlm_title': 'Build Red Chamber demo?',
        'graph.sample.hlm_description': 'Add its schema and data.',
        'graph.sample.confirm': 'Import example',
        'graph.sample.success': 'Demo ready',
        'graph.sample.failed': 'Demo import failed.',
        'common.action.cancel': 'Cancel',
    })[key] || key}),
}));

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    isPdEnabled.mockReturnValue(false);
    api.manage.getGraphList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.getTaskList.mockResolvedValue({status: 200, data: {total: 0}});
    jest.spyOn(message, 'success').mockImplementation(() => undefined);
});

const deferred = () => {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return {promise, resolve};
};

it('defaults a new task to the current graph when it is still eligible', async () => {
    window.localStorage.setItem('hubble_workbench_graph_context', JSON.stringify({
        graphspace: 'DEFAULT',
        graph: 'current_graph',
    }));
    api.manage.getDatasourceList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {records: [{
            name: 'current_graph',
            nickname: 'Current graph',
            schemaview: {vertices: [{name: 'person'}], edges: []},
        }]},
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <BaseForm visible cancel={jest.fn()} loading={false} />
        </MemoryRouter>
    );

    expect(await screen.findByText('Current graph', {
        selector: '.ant-select-selection-item',
    })).toBeInTheDocument();
});

it('prepares an empty target graph with the named people-and-software demo', async () => {
    window.localStorage.setItem('hubble_workbench_graph_context', JSON.stringify({
        graphspace: 'DEFAULT',
        graph: 'empty_graph',
    }));
    api.manage.getDatasourceList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {records: [{
            name: 'empty_graph',
            nickname: 'Empty graph',
            schemaview: {vertices: [], edges: []},
        }]},
    });
    api.manage.loadSampleGraph.mockResolvedValue({
        status: 200,
        data: {vertices: 8, edges: 6},
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <BaseForm visible cancel={jest.fn()} loading={false} />
        </MemoryRouter>
    );

    expect(await screen.findByText('Empty graph', {
        selector: '.ant-select-selection-item',
    })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {
        name: 'Build People & Software Demo',
    }));
    const confirm = await screen.findByRole('button', {name: 'Import example'});
    await act(async () => fireEvent.click(confirm));

    await waitFor(() => expect(api.manage.loadSampleGraph).toHaveBeenCalledWith(
        'DEFAULT',
        'empty_graph',
        'loader',
        {suppressBusinessErrorToast: true}
    ));
});

it('keeps demo preparation failure visible and lets the user retry', async () => {
    window.localStorage.setItem('hubble_workbench_graph_context', JSON.stringify({
        graphspace: 'DEFAULT',
        graph: 'empty_graph',
    }));
    api.manage.getDatasourceList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {records: [{
            name: 'empty_graph',
            schemaview: {vertices: [], edges: []},
        }]},
    });
    api.manage.loadSampleGraph
        .mockRejectedValueOnce(new Error('schema conflict'))
        .mockResolvedValueOnce({status: 200, data: {vertices: 14, edges: 15}});

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <BaseForm visible cancel={jest.fn()} loading={false} />
        </MemoryRouter>
    );

    await screen.findByText('empty_graph', {selector: '.ant-select-selection-item'});
    fireEvent.click(screen.getByRole('button', {name: 'Build Red Chamber Demo'}));
    const confirm = await screen.findByRole('button', {name: 'Import example'});
    await act(async () => fireEvent.click(confirm));

    expect(await screen.findByText('schema conflict')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Retry demo'}));
    await waitFor(() => expect(api.manage.loadSampleGraph).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('schema conflict'))
        .not.toBeInTheDocument());
});

it('does not let an old graph-space demo response prepare a same-named graph', async () => {
    isPdEnabled.mockReturnValue(true);
    window.localStorage.setItem('hubble_workbench_graph_context', JSON.stringify({
        graphspace: 'SPACE_A',
        graph: 'shared_name',
    }));
    const demo = deferred();
    api.manage.getDatasourceList.mockResolvedValue({
        status: 200,
        data: {records: [{datasource_id: '9', datasource_name: 'fixture.csv'}]},
    });
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'SPACE_A'}, {name: 'SPACE_B'}]},
    });
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {records: [{
            name: 'shared_name',
            schemaview: {vertices: [], edges: []},
        }]},
    });
    api.manage.loadSampleGraph.mockReturnValue(demo.promise);

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <BaseForm visible cancel={jest.fn()} loading={false} />
        </MemoryRouter>
    );

    await screen.findByText('shared_name', {selector: '.ant-select-selection-item'});
    fireEvent.click(screen.getByRole('button', {name: 'Build Red Chamber Demo'}));
    const confirm = await screen.findByRole('button', {name: 'Import example'});
    fireEvent.click(confirm);
    await waitFor(() => expect(api.manage.loadSampleGraph).toHaveBeenCalled());

    const graphspaceSelect = document.querySelector(
        '#base_form_ingestion_option_graphspace'
    );
    fireEvent.mouseDown(graphspaceSelect);
    fireEvent.click(await screen.findByText('SPACE_B', {
        selector: '.ant-select-item-option-content',
    }));
    await waitFor(() => expect(api.manage.getGraphList)
        .toHaveBeenCalledWith('SPACE_B', {page_size: -1}));
    const graphSelect = document.querySelector('#base_form_ingestion_option_graph');
    fireEvent.mouseDown(graphSelect);
    fireEvent.click(await screen.findByText('shared_name', {
        selector: '.ant-select-item-option-content',
    }));

    await act(async () => demo.resolve({
        status: 200,
        data: {vertices: 14, edges: 15},
    }));
    await act(async () => {
        fireEvent.click(screen.getByRole('button', {name: 'common.action.next'}));
    });

    expect(await screen.findByText('Prepare schema first')).toBeInTheDocument();
});

it('does not publish stale demo state after the form unmounts', async () => {
    window.localStorage.setItem('hubble_workbench_graph_context', JSON.stringify({
        graphspace: 'DEFAULT',
        graph: 'empty_graph',
    }));
    const demo = deferred();
    api.manage.getDatasourceList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {records: [{
            name: 'empty_graph',
            schemaview: {vertices: [], edges: []},
        }]},
    });
    api.manage.loadSampleGraph.mockReturnValue(demo.promise);

    const {unmount} = render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <BaseForm visible cancel={jest.fn()} loading={false} />
        </MemoryRouter>
    );

    await screen.findByText('empty_graph', {selector: '.ant-select-selection-item'});
    fireEvent.click(screen.getByRole('button', {name: 'Build Red Chamber Demo'}));
    const confirm = await screen.findByRole('button', {name: 'Import example'});
    fireEvent.click(confirm);
    await waitFor(() => expect(api.manage.loadSampleGraph).toHaveBeenCalled());
    unmount();
    await act(async () => demo.resolve({
        status: 200,
        data: {vertices: 14, edges: 15},
    }));

    expect(message.success).not.toHaveBeenCalled();
});

it('uses the graph name when the backend returns an empty alias', async () => {
    window.localStorage.setItem('hubble_workbench_graph_context', JSON.stringify({
        graphspace: 'DEFAULT',
        graph: 'current_graph',
    }));
    api.manage.getDatasourceList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {records: [{
            name: 'current_graph',
            nickname: '',
            schemaview: {vertices: [{name: 'person'}], edges: []},
        }]},
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <BaseForm visible cancel={jest.fn()} loading={false} />
        </MemoryRouter>
    );

    expect(await screen.findByText('current_graph', {
        selector: '.ant-select-selection-item',
    })).toBeInTheDocument();
});

it('defaults a PD task to the current graph space and graph', async () => {
    isPdEnabled.mockReturnValue(true);
    window.localStorage.setItem('hubble_workbench_graph_context', JSON.stringify({
        graphspace: 'SPACE_B',
        graph: 'current_graph',
    }));
    api.manage.getDatasourceList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [
            {name: 'SPACE_A', nickname: 'Space A'},
            {name: 'SPACE_B', nickname: 'Space B'},
        ]},
    });
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {records: [{
            name: 'current_graph',
            nickname: 'Current graph',
            schemaview: {vertices: [{name: 'person'}], edges: []},
        }]},
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <BaseForm visible cancel={jest.fn()} loading={false} />
        </MemoryRouter>
    );

    expect(await screen.findByText('Space B', {
        selector: '.ant-select-selection-item',
    })).toBeInTheDocument();
    expect(await screen.findByText('Current graph', {
        selector: '.ant-select-selection-item',
    })).toBeInTheDocument();
    expect(api.manage.getGraphList).toHaveBeenCalledWith('SPACE_B', {page_size: -1});
});

it('restores the last available data source or falls back to the first one', async () => {
    window.sessionStorage.setItem('user_', JSON.stringify({user_name: 'alice'}));
    window.localStorage.setItem('hubble_task_datasource.alice', '9');
    api.manage.getDatasourceList.mockResolvedValue({
        status: 200,
        data: {records: [
            {datasource_id: '8', datasource_name: 'first.csv'},
            {datasource_id: '9', datasource_name: 'saved.csv'},
        ]},
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <BaseForm visible cancel={jest.fn()} loading={false} />
        </MemoryRouter>
    );

    expect(await screen.findByText('saved.csv', {
        selector: '.ant-select-selection-item',
    })).toBeInTheDocument();
});

it('does not restore another user data source selection', async () => {
    window.sessionStorage.setItem('user_', JSON.stringify({user_name: 'bob'}));
    window.localStorage.setItem('hubble_task_datasource.alice', '9');
    api.manage.getDatasourceList.mockResolvedValue({
        status: 200,
        data: {records: [
            {datasource_id: '8', datasource_name: 'first.csv'},
            {datasource_id: '9', datasource_name: 'alice.csv'},
        ]},
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <BaseForm visible cancel={jest.fn()} loading={false} />
        </MemoryRouter>
    );

    expect(await screen.findByText('first.csv', {
        selector: '.ant-select-selection-item',
    })).toBeInTheDocument();
});

it('keeps a data-source option failure visible and retries in place', async () => {
    api.manage.getDatasourceList
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({
            status: 200,
            data: {records: [{datasource_id: '9', datasource_name: 'fixture.csv'}]},
        });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <BaseForm visible cancel={jest.fn()} loading={false} />
        </MemoryRouter>
    );

    expect(await screen.findByText('Could not load data sources.'))
        .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Retry data sources'}));

    await waitFor(() => expect(api.manage.getDatasourceList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Could not load data sources.'))
        .not.toBeInTheDocument());
});

it('turns a duplicate-name request rejection into a stable form error', async () => {
    api.manage.getDatasourceList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.getTaskList.mockRejectedValue(new Error('raw transport detail'));
    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <BaseForm visible cancel={jest.fn()} loading={false} />
        </MemoryRouter>
    );

    const name = screen.getByPlaceholderText('task.edit.name_placeholder');
    fireEvent.change(name, {target: {value: 'fixture_task'}});
    fireEvent.blur(name);
    expect(await screen.findByText('task.edit.duplicate_check_failed'))
        .toBeInTheDocument();
    expect(screen.queryByText('raw transport detail')).not.toBeInTheDocument();
});

it('clears stale fields and retries the selected data source schema', async () => {
    api.manage.getDatasourceSchema
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: ['id', 'name']});

    render(
        <FieldForm
            visible
            prev={jest.fn()}
            datasourceID='9'
        />
    );

    expect(await screen.findByText('Could not load source fields.'))
        .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Retry source fields'}));

    await waitFor(() => expect(api.manage.getDatasourceSchema).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('id')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.queryByText('Could not load source fields.')).not.toBeInTheDocument();
});

it('does not submit fields selected for a previous data source', async () => {
    const pendingB = deferred();
    api.manage.getDatasourceSchema.mockImplementation(id => {
        if (id === 'A') {
            return Promise.resolve({status: 200, data: ['old_field']});
        }
        return pendingB.promise;
    });
    const onFormFinish = jest.fn();
    const {rerender} = render(
        <Form.Provider onFormFinish={onFormFinish}>
            <FieldForm visible prev={jest.fn()} datasourceID='A' />
        </Form.Provider>
    );

    expect(await screen.findByText('old_field')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    const moveButton = screen.getAllByRole('button')
        .find(button => button.querySelector('[aria-label="right"]'));
    fireEvent.click(moveButton);
    expect(await screen.findAllByText('old_field')).toHaveLength(2);

    rerender(
        <Form.Provider onFormFinish={onFormFinish}>
            <FieldForm visible prev={jest.fn()} datasourceID='B' />
        </Form.Provider>
    );
    fireEvent.click(screen.getByRole('button', {name: 'common.action.next'}));
    await waitFor(() => expect(onFormFinish).not.toHaveBeenCalled());
    await act(async () => {
        pendingB.resolve({status: 200, data: ['new_field']});
        await pendingB.promise;
    });
});

it('recovers PD graph-space and graph option failures without stale overwrite', async () => {
    isPdEnabled.mockReturnValue(true);
    api.manage.getDatasourceList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.getGraphSpaceList
        .mockResolvedValueOnce({status: 503})
        .mockResolvedValueOnce({
            status: 200,
            data: {records: [{name: 'SPACE_A'}, {name: 'SPACE_B'}]},
        });
    api.manage.getGraphList
        .mockResolvedValueOnce({status: 503})
        .mockResolvedValueOnce({status: 200, data: {records: []}});

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <BaseForm visible cancel={jest.fn()} loading={false} />
        </MemoryRouter>
    );
    expect(await screen.findByText('task.edit.load_graphspaces_failed'))
        .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'task.edit.retry_graphspaces'}));
    await waitFor(() => expect(api.manage.getGraphSpaceList).toHaveBeenCalledTimes(2));

    const graphspaceSelect = screen.getAllByRole('combobox')[1];
    fireEvent.mouseDown(graphspaceSelect);
    fireEvent.click(await screen.findByText('SPACE_A', {
        selector: '.ant-select-item-option-content',
    }));
    await waitFor(() => expect(api.manage.getGraphList).toHaveBeenCalledWith(
        'SPACE_A',
        {page_size: -1}
    ));
    expect(await screen.findByText('task.edit.load_graphs_failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'task.edit.retry_graphs'}));
    await waitFor(() => expect(api.manage.getGraphList).toHaveBeenCalledTimes(2));
});

it('ignores a late graph response after the graph-space selection changes', async () => {
    isPdEnabled.mockReturnValue(true);
    const lateA = deferred();
    api.manage.getDatasourceList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'SPACE_A'}, {name: 'SPACE_B'}]},
    });
    api.manage.getGraphList.mockImplementation(space => {
        if (space === 'SPACE_A') {
            return lateA.promise;
        }
        return Promise.resolve({
            status: 200,
            data: {records: [{name: 'graph_b', nickname: 'Graph B'}]},
        });
    });

    render(
        <MemoryRouter future={{v7_startTransition: true, v7_relativeSplatPath: true}}>
            <BaseForm visible cancel={jest.fn()} loading={false} />
        </MemoryRouter>
    );
    await waitFor(() => expect(api.manage.getGraphSpaceList).toHaveBeenCalledTimes(1));
    const graphspaceSelect = screen.getAllByRole('combobox')[1];
    fireEvent.mouseDown(graphspaceSelect);
    fireEvent.click(await screen.findByText('SPACE_A', {
        selector: '.ant-select-item-option-content',
    }));
    fireEvent.mouseDown(graphspaceSelect);
    fireEvent.click(await screen.findByText('SPACE_B', {
        selector: '.ant-select-item-option-content',
    }));

    const graphSelect = screen.getAllByRole('combobox')[2];
    fireEvent.mouseDown(graphSelect);
    expect(await screen.findByRole('option', {name: 'Graph B'})).toBeInTheDocument();
    await act(async () => {
        lateA.resolve({
            status: 200,
            data: {records: [{name: 'graph_a', nickname: 'Graph A'}]},
        });
        await lateA.promise;
    });
    expect(screen.getByRole('option', {name: 'Graph B'})).toBeInTheDocument();
    expect(screen.queryByRole('option', {name: 'Graph A'})).not.toBeInTheDocument();
});
