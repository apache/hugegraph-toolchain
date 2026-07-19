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
    const Select = ({
        'aria-description': ariaDescription,
        'aria-label': ariaLabel,
        children,
        disabled,
        onChange,
        title,
        value,
        style,
    }) => (
        <select
            aria-description={ariaDescription}
            aria-label={ariaLabel}
            disabled={disabled}
            title={title}
            value={value || ''}
            style={style}
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

        const graphspace = screen.getByRole('combobox', {
            name: 'workbench.context.graphspace',
        });
        expect(graphspace).toBeDisabled();
        expect(graphspace).toHaveAttribute(
            'aria-description', 'DEFAULT'
        );
        expect(graphspace).toHaveAttribute('title', 'DEFAULT');
        expect(screen.getByRole('option', {name: 'DEFAULT'})).toBeInTheDocument();
        expect(screen.queryByText('workbench.context.graphspace_label'))
            .not.toBeInTheDocument();
        expect(screen.getByText('/')).toBeInTheDocument();
        await waitFor(() => {
            expect(api.manage.getGraphList).toHaveBeenCalledWith(
                'DEFAULT',
                {page_no: 1, page_size: -1},
                expect.any(Object)
            );
        });
        expect(screen.queryByText('workbench.context.non_pd_fixed')).not.toBeInTheDocument();
        expect(screen.getByRole('group', {name: 'workbench.context.name'})).toBeInTheDocument();
    });

    test('loads every PD GraphSpace without pagination truncation', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
        api.manage.getGraphSpaceList.mockResolvedValueOnce({
            status: 200,
            data: [
                {name: 'DEFAULT', nickname: 'Default'},
                {name: 'demo_space', nickname: 'Demo Space'},
                {name: 'loader_space', nickname: 'Loader Space'},
            ],
        });
        renderSwitcher('/graphspace/demo_space');

        expect(await screen.findByRole('option', {name: 'Loader Space'})).toBeInTheDocument();
        expect(screen.getByRole('combobox', {name: 'workbench.context.graphspace'}))
            .toHaveValue('demo_space');
        expect(api.manage.getGraphSpaceList).toHaveBeenCalledWith(
            {all: true},
            expect.any(Object)
        );
    });

    test('sizes current names within bounds and exposes full values', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
        const longName = 'graph_with_a_name_that_is_far_too_long_for_the_topbar';
        api.manage.getGraphList.mockResolvedValueOnce({
            status: 200,
            data: {records: [{name: longName}]},
        });
        renderSwitcher(`/gremlin/space_a/${longName}`);

        const graphspace = screen.getByRole('combobox', {
            name: 'workbench.context.graphspace',
        });
        const graph = await screen.findByRole('combobox', {
            name: 'workbench.context.graph',
        });
        await waitFor(() => expect(graph).toHaveValue(longName));

        expect(graphspace).toHaveStyle({width: '112px'});
        expect(graph).toHaveStyle({width: '240px'});
        expect(graph).toHaveAttribute('title', longName);
        expect(graph).toHaveAttribute('aria-description', longName);
    });

    test('temporarily keeps the selected GraphSpace in options while loading', () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
        api.manage.getGraphSpaceList.mockReturnValueOnce(new Promise(() => {}));
        renderSwitcher('/graphspace/demo_space');

        expect(screen.getByRole('combobox', {name: 'workbench.context.graphspace'}))
            .toHaveValue('demo_space');
        expect(screen.getByRole('option', {name: 'demo_space'})).toBeInTheDocument();
    });

    test('replaces a missing GraphSpace and never reuses its graph', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
        api.manage.getGraphSpaceList.mockResolvedValueOnce({
            status: 200,
            data: [{name: 'space_b', nickname: 'Space B'}],
        });
        renderSwitcher('/gremlin/deleted_space/old_graph');

        await waitFor(() => {
            expect(screen.getByRole('combobox', {name: 'workbench.context.graphspace'}))
                .toHaveValue('space_b');
        });
        expect(screen.getByRole('combobox', {name: 'workbench.context.graph'}))
            .not.toHaveValue('old_graph');
        expect(screen.getByText('/graphspace/space_b')).toBeInTheDocument();
        expect(JSON.parse(localStorage.getItem('hubble_workbench_graph_context'))).toEqual({
            graphspace: 'space_b',
        });
    });

    test('clears a deep-linked graph that does not belong to its GraphSpace', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
        api.manage.getGraphList.mockResolvedValueOnce({
            status: 200,
            data: {records: [{name: 'graph_b', nickname: 'Graph B'}]},
        });
        renderSwitcher('/gremlin/space_a/missing_graph');

        await waitFor(() => {
            expect(screen.getByRole('combobox', {name: 'workbench.context.graph'}))
                .toHaveValue('');
        });
        await waitFor(() => {
            expect(screen.getByText('/graphspace/space_a')).toBeInTheDocument();
        });
        expect(JSON.parse(localStorage.getItem('hubble_workbench_graph_context'))).toEqual({
            graphspace: 'space_a',
        });
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

    test.each(['gremlin', 'algorithms', 'asyncTasks'])(
        'selecting a graph preserves the %s workbench',
        async moduleName => {
            sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
            renderSwitcher(`/${moduleName}`);

            const graphspace = screen.getByRole('combobox', {
                name: 'workbench.context.graphspace',
            });
            await screen.findByRole('option', {name: 'Space A'});
            fireEvent.change(graphspace, {target: {value: 'space_a'}});
            expect(screen.getByText(`/${moduleName}`)).toBeInTheDocument();

            const graph = await screen.findByRole('combobox', {
                name: 'workbench.context.graph',
            });
            await screen.findByRole('option', {name: 'Graph A'});
            fireEvent.change(graph, {target: {value: 'graph_a'}});

            expect(screen.getByText(`/${moduleName}/space_a/graph_a`))
                .toBeInTheDocument();
        }
    );

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

    test('distinguishes missing graph permission from a temporary failure', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));
        api.manage.getGraphList.mockResolvedValueOnce({status: 403, data: null});
        renderSwitcher('/navigation');

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'workbench.context.graphs_forbidden'
        );
        expect(screen.queryByRole('button', {
            name: 'workbench.context.retry_graphs',
        })).not.toBeInTheDocument();
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
        api.manage.getGraphList.mockImplementation(graphspace => {
            if (graphspace === 'space_b') {
                return new Promise(resolve => {
                    resolveSpaceB = resolve;
                });
            }
            return Promise.resolve({
                status: 200,
                data: {records: [{name: 'graph_a', nickname: 'Graph A'}]},
            });
        });
        renderSwitcher('/graphspace/space_a');
        await screen.findByRole('option', {name: 'Graph A'});

        fireEvent.change(
            screen.getByRole('combobox', {name: 'workbench.context.graphspace'}),
            {target: {value: 'space_b'}}
        );

        expect(screen.queryByRole('option', {name: 'Graph A'})).not.toBeInTheDocument();
        expect(screen.getByRole('combobox', {name: 'workbench.context.graph'})).toBeDisabled();
        await waitFor(() => {
            expect(api.manage.getGraphList).toHaveBeenCalledWith(
                'space_b',
                {page_no: 1, page_size: -1},
                expect.any(Object)
            );
        });
        resolveSpaceB({
            status: 200,
            data: {records: [{name: 'graph_b', nickname: 'Graph B'}]},
        });
        expect(await screen.findByRole('option', {name: 'Graph B'})).toBeInTheDocument();
    });

    test('ignores a graph response from the previously selected GraphSpace', async () => {
        sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
        let resolveSpaceA;
        api.manage.getGraphList.mockImplementation(graphspace => {
            if (graphspace === 'space_a') {
                return new Promise(resolve => {
                    resolveSpaceA = resolve;
                });
            }
            return Promise.resolve({
                status: 200,
                data: {records: [{name: 'graph_b', nickname: 'Graph B'}]},
            });
        });
        renderSwitcher('/graphspace/space_a');
        await screen.findByRole('option', {name: 'Space B'});

        fireEvent.change(
            screen.getByRole('combobox', {name: 'workbench.context.graphspace'}),
            {target: {value: 'space_b'}}
        );
        expect(await screen.findByRole('option', {name: 'Graph B'})).toBeInTheDocument();

        await act(async () => {
            resolveSpaceA({
                status: 200,
                data: {records: [{name: 'graph_a', nickname: 'Graph A'}]},
            });
            await Promise.resolve();
        });
        expect(screen.queryByRole('option', {name: 'Graph A'})).not.toBeInTheDocument();
        expect(screen.getByRole('option', {name: 'Graph B'})).toBeInTheDocument();
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
