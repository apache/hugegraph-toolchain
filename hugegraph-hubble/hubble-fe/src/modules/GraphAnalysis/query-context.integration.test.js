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
import {useLayoutEffect} from 'react';
import {MemoryRouter, Route, Routes, useLocation} from 'react-router-dom';
import GraphAnalysisHome from './index';
import GraphContextSwitcher from '../../components/GraphContextSwitcher';
import * as api from '../../api';

jest.mock('../../api', () => ({
    analysis: {
        getGraphSpaceList: jest.fn(),
        getGraphList: jest.fn(),
        getOlapMode: jest.fn(),
        getExecutionLogs: jest.fn(),
        fetchFavoriteQueries: jest.fn(),
        getGraphData: jest.fn(),
        getExecutionQuery: jest.fn(),
    },
    manage: {
        getGraphList: jest.fn(),
        getMetaEdgeList: jest.fn(),
        getMetaVertexList: jest.fn(),
        getMetaPropertyList: jest.fn(),
    },
    auth: {getVermeer: jest.fn()},
}));
jest.mock('../../utils/config', () => ({
    isPdEnabled: () => false,
    isCypherEnabled: () => false,
}));
jest.mock('react-i18next', () => ({
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({t: key => key}),
}));
jest.mock('../../components/CodeEditor', () => ({value, onExecutionShortcut}) => (
    <pre
        data-testid='query-shortcut'
        onKeyDown={event => {
            if (event.ctrlKey && event.key === 'Enter') {
                onExecutionShortcut?.();
            }
        }}
    >{value}
    </pre>
));
jest.mock('../analysis/QueryResult/Home', () => () => <div />);
jest.mock('../analysis/LogsDetail/Home', () => () => <div />);
jest.mock('../algorithm/Home', () => () => <div />);
jest.mock('../asyncTasks/Home', () => () => <div />);

const Location = () => <output>{useLocation().pathname}</output>;
// Exercise the first committed route before TopBar's passive effects hydrate it.
const ExecuteOnNavigation = ({action}) => {
    const {pathname} = useLocation();
    useLayoutEffect(() => {
        if (!pathname.endsWith('/java17_legacy17_ui')) {
            return;
        }
        if (action === 'button') {
            screen.getByRole('button', {name: 'analysis.query.execute_query'}).click();
        }
        else {
            screen.getByTestId('query-shortcut').dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', ctrlKey: true, bubbles: true,
            }));
        }
    }, [action, pathname]);
    return null;
};
const graphs = [{name: 'hugegraph'}, {name: 'java17_legacy17_ui'}];
const graphResponse = {status: 200, data: {graphs}};
const records = {status: 200, data: {records: [], total: 0}};

it.each(['button', 'shortcut'])(
    'waits for dropdown route hydration before executing via %s', async action => {
        jest.clearAllMocks();
        window.matchMedia = window.matchMedia || (() => ({
            matches: false, addListener: jest.fn(), removeListener: jest.fn(),
        }));
        localStorage.clear();
        api.auth.getVermeer.mockResolvedValue({status: 200, data: {enable: false}});
        api.analysis.getGraphSpaceList.mockResolvedValue({
            status: 200, data: {graphspaces: ['DEFAULT']},
        });
        let resolveGraphs;
        api.analysis.getGraphList
            .mockImplementationOnce(() => new Promise(resolve => {
                resolveGraphs = resolve;
            }))
            .mockResolvedValue(graphResponse);
        api.manage.getGraphList.mockResolvedValue({status: 200, data: {records: graphs}});
        api.analysis.getOlapMode.mockResolvedValue({status: 200, data: {status: '1'}});
        api.analysis.getExecutionLogs.mockResolvedValue(records);
        api.analysis.fetchFavoriteQueries.mockResolvedValue(records);
        api.analysis.getGraphData.mockResolvedValue({
            status: 200, data: {vertexcount: 8, edgecount: 6},
        });
        api.analysis.getExecutionQuery.mockResolvedValue({status: 200, data: {}});
        api.manage.getMetaEdgeList.mockResolvedValue(records);
        api.manage.getMetaVertexList.mockResolvedValue(records);
        api.manage.getMetaPropertyList.mockResolvedValue(records);

        render(
            <MemoryRouter
                initialEntries={['/gremlin/DEFAULT/hugegraph']}
                future={{v7_startTransition: true, v7_relativeSplatPath: true}}
            >
                <GraphContextSwitcher />
                <Location />
                <Routes>
                    <Route
                        path='/gremlin/:graphSpace/:graph'
                        element={<GraphAnalysisHome moduleName='gremlin' />}
                    />
                </Routes>
                <ExecuteOnNavigation action={action} />
            </MemoryRouter>
        );
        await waitFor(() => expect(api.analysis.getGraphList).toHaveBeenCalled());
        const run = () => screen.getByRole('button', {name: 'analysis.query.execute_query'});
        expect(run()).toBeDisabled();
        fireEvent.click(run());
        expect(api.analysis.getExecutionQuery).not.toHaveBeenCalled();
        expect(api.analysis.getGraphData).not.toHaveBeenCalled();

        await act(async () => {
            resolveGraphs(graphResponse);
        });
        await waitFor(() => expect(run()).toBeEnabled());
        fireEvent.mouseDown(screen.getByRole('combobox', {name: 'workbench.context.graph'}));
        fireEvent.click(await screen.findByText('java17_legacy17_ui', {
            selector: '.ant-select-item-option-content',
        }));
        await screen.findByText('/gremlin/DEFAULT/java17_legacy17_ui');
        expect(api.analysis.getExecutionQuery).not.toHaveBeenCalled();
        await waitFor(() => expect(api.analysis.getGraphData)
            .toHaveBeenCalledWith('DEFAULT', 'java17_legacy17_ui'));
        await waitFor(() => expect(run()).toBeEnabled());
        await act(async () => {
            fireEvent.click(run());
        });
        expect(api.analysis.getExecutionQuery).toHaveBeenCalledWith(
            'DEFAULT', 'java17_legacy17_ui', 'g.V().limit(10)'
        );
        for (const [space, graph] of api.analysis.getGraphData.mock.calls) {
            expect(space).toBe('DEFAULT');
            expect(graphs.some(item => item.name === graph)).toBe(true);
        }
    });

it('executes the ready dropdown graph while the previous graph query is pending', async () => {
    jest.clearAllMocks();
    window.matchMedia = window.matchMedia || (() => ({
        matches: false, addListener: jest.fn(), removeListener: jest.fn(),
    }));
    localStorage.clear();
    api.auth.getVermeer.mockResolvedValue({status: 200, data: {enable: false}});
    api.analysis.getGraphSpaceList.mockResolvedValue({
        status: 200, data: {graphspaces: ['DEFAULT']},
    });
    api.analysis.getGraphList.mockResolvedValue(graphResponse);
    api.manage.getGraphList.mockResolvedValue({status: 200, data: {records: graphs}});
    api.analysis.getOlapMode.mockResolvedValue({status: 200, data: {status: '1'}});
    api.analysis.getExecutionLogs.mockResolvedValue(records);
    api.analysis.fetchFavoriteQueries.mockResolvedValue(records);
    api.analysis.getGraphData.mockResolvedValue({
        status: 200, data: {vertexcount: 8, edgecount: 6},
    });
    api.manage.getMetaEdgeList.mockResolvedValue(records);
    api.manage.getMetaVertexList.mockResolvedValue(records);
    api.manage.getMetaPropertyList.mockResolvedValue(records);
    let resolveA;
    let resolveB;
    api.analysis.getExecutionQuery
        .mockImplementationOnce(() => new Promise(resolve => {
            resolveA = resolve;
        }))
        .mockImplementationOnce(() => new Promise(resolve => {
            resolveB = resolve;
        }));

    render(
        <MemoryRouter
            initialEntries={['/gremlin/DEFAULT/hugegraph']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <GraphContextSwitcher />
            <Location />
            <Routes>
                <Route
                    path='/gremlin/:graphSpace/:graph'
                    element={<GraphAnalysisHome moduleName='gremlin' />}
                />
            </Routes>
        </MemoryRouter>
    );
    const run = () => screen.getByRole('button', {name: 'analysis.query.execute_query'});
    await waitFor(() => expect(run()).toBeEnabled());
    await act(async () => fireEvent.click(run()));
    expect(api.analysis.getExecutionQuery).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.mouseDown(screen.getByRole('combobox', {
        name: 'workbench.context.graph',
    })));
    const graphOption = await screen.findByText('java17_legacy17_ui', {
        selector: '.ant-select-item-option-content',
    });
    await act(async () => fireEvent.click(graphOption));
    await screen.findByText('/gremlin/DEFAULT/java17_legacy17_ui');
    await waitFor(() => expect(api.analysis.getGraphData)
        .toHaveBeenCalledWith('DEFAULT', 'java17_legacy17_ui'));
    await waitFor(() => expect(run()).toBeEnabled());
    await act(async () => fireEvent.click(run()));
    expect(api.analysis.getExecutionQuery).toHaveBeenCalledTimes(2);
    expect(api.analysis.getExecutionQuery).toHaveBeenLastCalledWith(
        'DEFAULT', 'java17_legacy17_ui', 'g.V().limit(10)'
    );
    await act(async () => resolveA({status: 200, data: {}}));
    expect(run()).toBeDisabled();
    await act(async () => resolveB({status: 200, data: {}}));
    await waitFor(() => expect(run()).toBeEnabled());
});
