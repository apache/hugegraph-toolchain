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
import {MemoryRouter, useLocation} from 'react-router-dom';
import GraphContextSwitcher from './index';
import * as api from '../../api';

jest.mock('../../api', () => ({
    manage: {
        getGraphSpaceList: jest.fn(),
        getGraphList: jest.fn(),
    },
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

jest.mock('antd', () => {
    const React = require('react');
    const Select = ({'aria-label': ariaLabel, children, disabled, onChange, value}) => (
        <select
            aria-label={ariaLabel}
            disabled={disabled}
            value={value || ''}
            onChange={event => onChange?.(event.target.value)}
        >
            <option value="" />
            {children}
        </select>
    );
    Select.Option = ({children, value}) => <option value={value}>{children}</option>;
    return {
        Alert: ({action, message}) => <div role="alert">{message}{action}</div>,
        Button: ({children, onClick}) => <button onClick={onClick}>{children}</button>,
        Select,
        Space: ({children}) => <div>{children}</div>,
        Tag: ({children}) => <span>{children}</span>,
    };
});

const LocationProbe = () => {
    const location = useLocation();
    return <output>{location.pathname}</output>;
};

const renderSwitcher = path => render(
    <MemoryRouter
        initialEntries={[path]}
        future={{v7_startTransition: true, v7_relativeSplatPath: true}}
    >
        <GraphContextSwitcher />
        <LocationProbe />
    </MemoryRouter>
);

describe('GraphContextSwitcher', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
        api.manage.getGraphSpaceList.mockResolvedValue({
            status: 200,
            data: {records: [
                {name: 'space_a', nickname: 'Space A'},
                {name: 'space_b', nickname: 'Space B'},
            ]},
        });
        api.manage.getGraphList.mockResolvedValue({
            status: 200,
            data: {records: [{name: 'graph_a', nickname: 'Graph A'}]},
        });
    });

    test('non-PD fixes GraphSpace to DEFAULT and loads its graphs', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));
        renderSwitcher('/navigation');

        expect(screen.getByRole('combobox', {name: 'workbench.context.graphspace'}))
            .toBeDisabled();
        await waitFor(() => {
            expect(api.manage.getGraphList).toHaveBeenCalledWith(
                'DEFAULT',
                {page_no: 1, page_size: -1},
                expect.any(Object)
            );
        });
        expect(screen.getByText('workbench.context.non_pd_fixed')).toBeInTheDocument();
        expect(screen.getByRole('group', {name: 'workbench.context.name'})).toBeInTheDocument();
    });

    test('route context selects and persists the current graph', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
        renderSwitcher('/gremlin/space_a/graph_a');

        await waitFor(() => {
            expect(screen.getByRole('combobox', {name: 'workbench.context.graph'}))
                .toHaveValue('graph_a');
        });
        expect(JSON.parse(localStorage.getItem('hubble_workbench_graph_context'))).toEqual({
            graphspace: 'space_a',
            graph: 'graph_a',
        });
    });

    test('selecting a graph opens its overview', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
        renderSwitcher('/graphspace/space_a');

        const graphSelect = await screen.findByRole('combobox', {
            name: 'workbench.context.graph',
        });
        await screen.findByRole('option', {name: 'Graph A'});
        fireEvent.change(graphSelect, {target: {value: 'graph_a'}});
        expect(screen.getByText('/graphspace/space_a/graph/graph_a/detail')).toBeInTheDocument();
    });

    test('shows an inline retry when graph loading fails', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));
        api.manage.getGraphList.mockRejectedValueOnce(new Error('offline'));
        renderSwitcher('/navigation');

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'workbench.context.graphs_load_failed'
        );
        fireEvent.click(screen.getByRole('button', {
            name: 'workbench.context.retry_graphs',
        }));
        await waitFor(() => expect(api.manage.getGraphList).toHaveBeenCalledTimes(2));
    });

    test('treats a resolved graph business error as retryable', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));
        api.manage.getGraphList.mockResolvedValueOnce({status: 503, data: null});
        renderSwitcher('/navigation');

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'workbench.context.graphs_load_failed'
        );
    });

    test('graph success cannot erase a concurrent GraphSpace failure', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
        api.manage.getGraphSpaceList.mockResolvedValueOnce({status: 500, data: null});
        renderSwitcher('/gremlin/space_a/graph_a');

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'workbench.context.graphspaces_load_failed'
        );
        expect(screen.getByRole('combobox', {name: 'workbench.context.graph'}))
            .toHaveValue('graph_a');
    });

    test('switching GraphSpace immediately removes graphs from the previous space', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
        let resolveSpaceB;
        api.manage.getGraphList
            .mockResolvedValueOnce({
                status: 200,
                data: {records: [{name: 'graph_a', nickname: 'Graph A'}]},
            })
            .mockReturnValueOnce(new Promise(resolve => {
                resolveSpaceB = resolve;
            }));
        renderSwitcher('/graphspace/space_a');
        await screen.findByRole('option', {name: 'Graph A'});

        fireEvent.change(
            screen.getByRole('combobox', {name: 'workbench.context.graphspace'}),
            {target: {value: 'space_b'}}
        );

        expect(screen.queryByRole('option', {name: 'Graph A'})).not.toBeInTheDocument();
        expect(screen.getByRole('combobox', {name: 'workbench.context.graph'})).toBeDisabled();
        resolveSpaceB({
            status: 200,
            data: {records: [{name: 'graph_b', nickname: 'Graph B'}]},
        });
        expect(await screen.findByRole('option', {name: 'Graph B'})).toBeInTheDocument();
    });

    test('stacks both failures and retries only the selected source', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
        api.manage.getGraphSpaceList.mockRejectedValueOnce(new Error('pd offline'));
        api.manage.getGraphList.mockRejectedValueOnce(new Error('server offline'));
        renderSwitcher('/gremlin/space_a/graph_a');

        expect(await screen.findByText('workbench.context.graphspaces_load_failed'))
            .toBeInTheDocument();
        expect(await screen.findByText('workbench.context.graphs_load_failed'))
            .toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {
            name: 'workbench.context.retry_graphspaces',
        }));
        await waitFor(() => expect(api.manage.getGraphSpaceList).toHaveBeenCalledTimes(2));
        expect(api.manage.getGraphList).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', {
            name: 'workbench.context.retry_graphs',
        }));
        await waitFor(() => expect(api.manage.getGraphList).toHaveBeenCalledTimes(2));
    });
});
