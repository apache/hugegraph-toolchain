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
import TopBar from './index';
import GraphAnalysisContext from '../../Context';
import * as api from '../../../api';

const mockNavigate = jest.fn();
const mockParams = {graphSpace: undefined, graph: undefined, taskId: undefined};

jest.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
}));
jest.mock('../../../api', () => ({
    analysis: {
        getGraphSpaceList: jest.fn(),
        getGraphList: jest.fn(),
        loadVermeerTask: jest.fn(),
    },
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

const renderTopBar = (
    context = {isVermeer: false},
    {moduleName = 'gremlin', onGraphInfoChange = jest.fn()} = {}
) => render(
    <GraphAnalysisContext.Provider value={context}>
        <TopBar
            moduleName={moduleName}
            onGraphInfoChange={onGraphInfoChange}
            showOlapSwitch={false}
            showNavigationButton={false}
            isOlapModeEnable={false}
            isOlapModeLoading={false}
            onOlapModeChange={jest.fn()}
        />
    </GraphAnalysisContext.Provider>
);

beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockParams, {
        graphSpace: undefined,
        graph: undefined,
        taskId: undefined,
    });
    api.analysis.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {graphspaces: ['DEFAULT']},
    });
    api.analysis.getGraphList.mockResolvedValue({status: 200, data: {graphs: []}});
});

const deferred = () => {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return {promise, resolve};
};

it('does not repeat the global GraphSpace and graph selectors', async () => {
    renderTopBar();

    expect(screen.queryByText('analysis.topbar.current_graph_space'))
        .not.toBeInTheDocument();
    expect(screen.queryByText('analysis.topbar.current_graph')).not.toBeInTheDocument();
    await waitFor(() => expect(api.analysis.getGraphSpaceList).toHaveBeenCalledTimes(1));
});

it('recovers a rejected GraphSpace request without leaving the selector loading', async () => {
    api.analysis.getGraphSpaceList
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {graphspaces: ['DEFAULT']}});

    renderTopBar();

    const retry = await screen.findByRole('button', {
        name: 'analysis.topbar.retry_graph_spaces',
    });
    fireEvent.click(retry);

    await waitFor(() => expect(api.analysis.getGraphSpaceList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(
        'analysis.topbar.graph_spaces_failed'
    )).not.toBeInTheDocument());
});

it('recovers a rejected graph request and ignores the failed result', async () => {
    api.analysis.getGraphList
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {graphs: []}});

    renderTopBar();

    const retry = await screen.findByRole('button', {
        name: 'analysis.topbar.retry_graphs',
    });
    fireEvent.click(retry);

    await waitFor(() => expect(api.analysis.getGraphList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(
        'analysis.topbar.graphs_failed'
    )).not.toBeInTheDocument());
});

it('settles a rejected Vermeer load and lets the user retry', async () => {
    jest.spyOn(message, 'error').mockImplementation(() => undefined);
    api.analysis.getGraphList.mockResolvedValue({
        status: 200,
        data: {graphs: [{name: 'hugegraph', status: 'loaded'}]},
    });
    api.analysis.loadVermeerTask
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200});

    renderTopBar({isVermeer: true});

    const reload = await screen.findByRole('button', {
        name: 'analysis.topbar.reload_to_vermeer',
    });
    fireEvent.click(reload);
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(
        'analysis.topbar.load_vermeer_failed'
    ));

    fireEvent.click(reload);
    await waitFor(() => expect(api.analysis.loadVermeerTask).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.analysis.getGraphList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reload).toBeEnabled());
});

it('ignores a late graph response after the route switches GraphSpace', async () => {
    const oldGraphs = deferred();
    Object.assign(mockParams, {graphSpace: 'A'});
    api.analysis.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {graphspaces: ['A', 'B']},
    });
    api.analysis.getGraphList.mockImplementation(graphSpace => (
        graphSpace === 'A'
            ? oldGraphs.promise
            : Promise.resolve({
                status: 200,
                data: {graphs: [{name: 'graph-b', status: 'created'}]},
            })
    ));

    const view = renderTopBar();
    await waitFor(() => expect(api.analysis.getGraphList).toHaveBeenCalledWith(
        'A', expect.any(Object)
    ));

    Object.assign(mockParams, {graphSpace: 'B'});
    view.rerender(
        <GraphAnalysisContext.Provider value={{isVermeer: false}}>
            <TopBar
                moduleName='gremlin'
                onGraphInfoChange={jest.fn()}
                showOlapSwitch={false}
                showNavigationButton={false}
                isOlapModeEnable={false}
                isOlapModeLoading={false}
                onOlapModeChange={jest.fn()}
            />
        </GraphAnalysisContext.Provider>
    );
    await waitFor(() => expect(api.analysis.getGraphList).toHaveBeenCalledWith(
        'B', expect.any(Object)
    ));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
        '/gremlin/B/graph-b', {replace: true}
    ));

    await act(async () => oldGraphs.resolve({
        status: 200,
        data: {graphs: [{name: 'graph-a', status: 'created'}]},
    }));
    expect(mockNavigate).not.toHaveBeenCalledWith(
        '/gremlin/A/graph-a', expect.any(Object)
    );
});

it.each(['gremlin', 'algorithms', 'asyncTasks'])(
    'keeps a route-selected graph when switching inside the %s module',
    async moduleName => {
        Object.assign(mockParams, {graphSpace: 'A', graph: 'graph-a'});
        api.analysis.getGraphSpaceList.mockResolvedValue({
            status: 200,
            data: {graphspaces: ['A']},
        });
        api.analysis.getGraphList.mockResolvedValue({
            status: 200,
            data: {graphs: [
                {name: 'graph-a', status: 'created'},
                {name: 'graph-b', status: 'created'},
            ]},
        });

        const onGraphInfoChange = jest.fn();
        const view = renderTopBar(
            {isVermeer: false},
            {moduleName, onGraphInfoChange}
        );
        await waitFor(() => expect(onGraphInfoChange).toHaveBeenCalledWith(
            'A', expect.objectContaining({name: 'graph-a'})
        ));

        mockNavigate.mockClear();
        onGraphInfoChange.mockClear();
        Object.assign(mockParams, {graph: 'graph-b'});
        view.rerender(
            <GraphAnalysisContext.Provider value={{isVermeer: false}}>
                <TopBar
                    moduleName={moduleName}
                    onGraphInfoChange={onGraphInfoChange}
                    showOlapSwitch={false}
                    showNavigationButton={false}
                    isOlapModeEnable={false}
                    isOlapModeLoading={false}
                    onOlapModeChange={jest.fn()}
                />
            </GraphAnalysisContext.Provider>
        );

        await waitFor(() => expect(onGraphInfoChange).toHaveBeenCalledWith(
            'A', expect.objectContaining({name: 'graph-b'})
        ));
        expect(mockNavigate).not.toHaveBeenCalledWith(
            `/${moduleName}/A/graph-a`, {replace: true}
        );
    }
);
