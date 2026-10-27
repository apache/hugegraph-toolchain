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
import enAnalysis from '../../../i18n/resources/en-US/modules/analysis.json';
import zhAnalysis from '../../../i18n/resources/zh-CN/modules/analysis.json';

const mockTranslate = jest.fn(key => key);

const mockNavigate = jest.fn();
const mockParams = {graphSpace: undefined, graph: undefined, taskId: undefined};

jest.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
}));
jest.mock('../../../api', () => ({
    analysis: {
        getGraphSpaceList: jest.fn(),
        loadVermeerTask: jest.fn(),
        fetchAsyncTaskResult: jest.fn(),
    },
    manage: {getGraph: jest.fn(), getGraphList: jest.fn()},
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: mockTranslate}),
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
    mockTranslate.mockImplementation(key => key);
    Object.assign(mockParams, {
        graphSpace: undefined,
        graph: undefined,
        taskId: undefined,
    });
    api.analysis.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {graphspaces: ['DEFAULT']},
    });
    api.manage.getGraphList.mockResolvedValue({status: 200, data: {records: []}});
    api.manage.getGraph.mockResolvedValue({status: 200, data: {status: 'loaded'}});
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

it('uses route context and brief authorized graph metadata without enumerating all spaces', async () => {
    Object.assign(mockParams, {graphSpace: 'A', graph: 'graph-b'});
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'graph-a'}, {name: 'graph-b'}]},
    });
    const onGraphInfoChange = jest.fn();

    renderTopBar({isVermeer: false}, {onGraphInfoChange});

    await waitFor(() => expect(onGraphInfoChange).toHaveBeenCalledWith(
        'A', expect.objectContaining({name: 'graph-b'})
    ));
    expect(api.manage.getGraphList).toHaveBeenCalledWith(
        'A', expect.objectContaining({brief: true, page_no: 1, page_size: 100}), {suppressBusinessErrorToast: true}
    );
    expect(api.analysis.getGraphSpaceList).not.toHaveBeenCalled();
    expect(api.manage.getGraph).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
});

it('does not select a fallback graph when route access is forbidden', async () => {
    Object.assign(mockParams, {graphSpace: 'protected', graph: 'private'});
    api.manage.getGraphList.mockRejectedValueOnce(
        Object.assign(new Error('forbidden'), {status: 403})
    );
    const onGraphInfoChange = jest.fn();

    renderTopBar({isVermeer: false}, {onGraphInfoChange});

    expect(await screen.findByText('analysis.topbar.graphs_failed')).toBeInTheDocument();
    expect(api.analysis.getGraphSpaceList).not.toHaveBeenCalled();
    expect(api.manage.getGraph).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(onGraphInfoChange.mock.calls.some(([, graph]) => graph?.name)).toBe(false);
});

it('does not replace a missing route-selected graph with another graph', async () => {
    Object.assign(mockParams, {graphSpace: 'A', graph: 'missing'});
    api.manage.getGraphList.mockResolvedValue({
        status: 200, data: {records: [{name: 'other'}]},
    });
    const onGraphInfoChange = jest.fn();

    renderTopBar({isVermeer: false}, {onGraphInfoChange});

    expect(await screen.findByText('analysis.topbar.graphs_failed')).toBeInTheDocument();
    expect(api.manage.getGraphList).toHaveBeenCalledTimes(1);
    expect(onGraphInfoChange.mock.calls.some(([, graph]) => graph?.name)).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
});

it('loads status only for the selected Vermeer graph and respects its loading state', async () => {
    Object.assign(mockParams, {graphSpace: 'A', graph: 'graph-b'});
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'graph-a'}, {name: 'graph-b'}]},
    });
    api.manage.getGraph.mockResolvedValue({status: 200, data: {status: 'loading'}});

    renderTopBar({isVermeer: true});

    expect(await screen.findByRole('button', {
        name: 'analysis.topbar.load_to_vermeer',
    })).toBeDisabled();
    expect(api.manage.getGraph).toHaveBeenCalledTimes(1);
    expect(api.manage.getGraph).toHaveBeenCalledWith(
        'A', 'graph-b', {suppressBusinessErrorToast: true}
    );
    expect(api.analysis.getGraphSpaceList).not.toHaveBeenCalled();
});

it('retains the selected loaded graph status and load date', async () => {
    Object.assign(mockParams, {graphSpace: 'A', graph: 'graph-a'});
    api.manage.getGraphList.mockResolvedValue({
        status: 200, data: {records: [{name: 'graph-a'}]},
    });
    api.manage.getGraph.mockResolvedValue({
        status: 200,
        data: {status: 'loaded', last_load_time: '2026-10-22T12:00:00Z'},
    });

    renderTopBar({isVermeer: true});

    expect(await screen.findByRole('button', {
        name: 'analysis.topbar.reload_to_vermeer',
    })).toBeEnabled();
    expect(screen.getByText('2026-10-22')).toBeInTheDocument();
});

it('makes a failed Vermeer load an explicit accessible entry to its tasks', async () => {
    Object.assign(mockParams, {graphSpace: 'A', graph: 'graph-a'});
    api.manage.getGraphList.mockResolvedValue({
        status: 200, data: {records: [{name: 'graph-a'}]},
    });
    api.manage.getGraph.mockResolvedValue({status: 200, data: {status: 'error'}});

    renderTopBar({isVermeer: true});

    const failure = await screen.findByRole('button', {
        name: /analysis.topbar.load_failed.*analysis.async_task.action.check_reason/,
    });
    expect(failure).toHaveTextContent('analysis.topbar.load_failed');
    expect(failure).toHaveTextContent('analysis.async_task.action.check_reason');
    fireEvent.click(failure);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/asyncTasks');
});

it.each([['en-US', enAnalysis], ['zh-CN', zhAnalysis]])(
    'includes the visible failure action in its accessible name in %s', async (_, translations) => {
        mockTranslate.mockImplementation(key => key.split('.').reduce((value, part) => value?.[part], translations)
            ?? key);
        Object.assign(mockParams, {graphSpace: 'A', graph: 'graph-a'});
        api.manage.getGraphList.mockResolvedValue({
            status: 200, data: {records: [{name: 'graph-a'}]},
        });
        api.manage.getGraph.mockResolvedValue({status: 200, data: {status: 'error'}});
        renderTopBar({isVermeer: true});

        const action = translations.analysis.async_task.action.check_reason;
        const button = await screen.findByRole('button', {name: new RegExp(action)});
        expect(button).toHaveTextContent(action);
        expect(button).toHaveAccessibleName(new RegExp(action));
        fireEvent.click(button);
        expect(mockNavigate).toHaveBeenCalledWith('/asyncTasks');
    }
);

it.each(['created', 'loading', 'loaded'])('does not offer failure details for status %s', async status => {
    Object.assign(mockParams, {graphSpace: 'A', graph: 'graph-a'});
    api.manage.getGraphList.mockResolvedValue({
        status: 200, data: {records: [{name: 'graph-a'}]},
    });
    api.manage.getGraph.mockResolvedValue({status: 200, data: {status}});

    renderTopBar({isVermeer: true});

    await screen.findByRole('button', {name: status === 'loaded'
        ? 'analysis.topbar.reload_to_vermeer' : 'analysis.topbar.load_to_vermeer'});
    expect(screen.queryByText('analysis.async_task.action.check_reason')).not.toBeInTheDocument();
    if (status === 'created') {
        expect(screen.getByRole('button', {name: 'analysis.topbar.not_loaded'})).toBeDisabled();
    }
});

it('refreshes selected graph details when the Vermeer capability resolves after the brief list', async () => {
    Object.assign(mockParams, {graphSpace: 'A', graph: 'graph-a'});
    api.manage.getGraphList.mockResolvedValue({
        status: 200, data: {records: [{name: 'graph-a'}]},
    });
    api.manage.getGraph.mockResolvedValue({
        status: 200,
        data: {status: 'loaded', last_load_time: '2026-10-22T12:00:00Z'},
    });
    const onGraphInfoChange = jest.fn();
    const capability = deferred();
    const view = renderTopBar({isVermeer: false}, {onGraphInfoChange});
    const capabilityReady = capability.promise.then(isVermeer => view.rerender(
        <GraphAnalysisContext.Provider value={{isVermeer}}>
            <TopBar moduleName='gremlin' onGraphInfoChange={onGraphInfoChange} />
        </GraphAnalysisContext.Provider>
    ));
    await waitFor(() => expect(onGraphInfoChange).toHaveBeenCalledWith(
        'A', expect.objectContaining({name: 'graph-a'})
    ));
    expect(api.manage.getGraph).not.toHaveBeenCalled();
    onGraphInfoChange.mockClear();

    await act(async () => {
        capability.resolve(true);
        await capabilityReady;
    });

    expect(await screen.findByRole('button', {
        name: 'analysis.topbar.reload_to_vermeer',
    })).toBeEnabled();
    expect(screen.getByText('2026-10-22')).toBeInTheDocument();
    expect(api.manage.getGraphList).toHaveBeenCalledTimes(2);
    expect(api.manage.getGraph).toHaveBeenCalledTimes(1);
    expect(onGraphInfoChange.mock.calls.every(([, graph]) => graph?.name === 'graph-a')).toBe(true);
});

it('does not automatically retry a forbidden detail request after capability activation', async () => {
    Object.assign(mockParams, {graphSpace: 'A', graph: 'graph-a'});
    api.manage.getGraphList.mockResolvedValue({
        status: 200, data: {records: [{name: 'graph-a'}]},
    });
    api.manage.getGraph
        .mockRejectedValueOnce(Object.assign(new Error('forbidden'), {status: 403}))
        .mockResolvedValueOnce({status: 200, data: {status: 'loaded'}});
    const onGraphInfoChange = jest.fn();
    const view = renderTopBar({isVermeer: false}, {onGraphInfoChange});
    await waitFor(() => expect(onGraphInfoChange).toHaveBeenCalledWith(
        'A', expect.objectContaining({name: 'graph-a'})
    ));

    view.rerender(
        <GraphAnalysisContext.Provider value={{isVermeer: true}}>
            <TopBar moduleName='gremlin' onGraphInfoChange={onGraphInfoChange} />
        </GraphAnalysisContext.Provider>
    );

    expect(await screen.findByText('analysis.topbar.graphs_failed')).toBeInTheDocument();
    expect(api.manage.getGraphList).toHaveBeenCalledTimes(2);
    expect(api.manage.getGraph).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', {name: 'analysis.topbar.retry_graphs'}));
    expect(await screen.findByRole('button', {
        name: 'analysis.topbar.reload_to_vermeer',
    })).toBeEnabled();
    expect(api.manage.getGraph).toHaveBeenCalledTimes(2);
});

it('ignores pending capability-triggered details after the route selects a different graph', async () => {
    Object.assign(mockParams, {graphSpace: 'A', graph: 'graph-a'});
    api.manage.getGraphList.mockResolvedValue({
        status: 200, data: {records: [{name: 'graph-a'}, {name: 'graph-b'}]},
    });
    const oldDetail = deferred();
    api.manage.getGraph.mockImplementation((space, graph) => (
        graph === 'graph-a' ? oldDetail.promise : Promise.resolve({
            status: 200, data: {status: 'loaded', last_load_time: '2026-10-22T12:00:00Z'},
        })
    ));
    const onGraphInfoChange = jest.fn();
    const view = renderTopBar({isVermeer: false}, {onGraphInfoChange});
    await waitFor(() => expect(onGraphInfoChange).toHaveBeenCalledWith(
        'A', expect.objectContaining({name: 'graph-a'})
    ));
    const enabledTopBar = (
        <GraphAnalysisContext.Provider value={{isVermeer: true}}>
            <TopBar moduleName='gremlin' onGraphInfoChange={onGraphInfoChange} />
        </GraphAnalysisContext.Provider>
    );
    view.rerender(enabledTopBar);
    await waitFor(() => expect(api.manage.getGraph).toHaveBeenCalledWith(
        'A', 'graph-a', expect.any(Object)
    ));
    onGraphInfoChange.mockClear();
    Object.assign(mockParams, {graph: 'graph-b'});
    view.rerender(
        <GraphAnalysisContext.Provider value={{isVermeer: true}}>
            <TopBar moduleName='gremlin' onGraphInfoChange={onGraphInfoChange} />
        </GraphAnalysisContext.Provider>
    );
    await waitFor(() => expect(onGraphInfoChange).toHaveBeenCalledWith(
        'A', expect.objectContaining({name: 'graph-b', status: 'loaded'})
    ));

    await act(async () => oldDetail.resolve({
        status: 200, data: {status: 'loading', last_load_time: '2026-10-21T12:00:00Z'},
    }));

    expect(onGraphInfoChange.mock.calls.some(([, graph]) => graph?.name === 'graph-a')).toBe(false);
    expect(screen.getByText('2026-10-22')).toBeInTheDocument();
    expect(screen.queryByText('2026-10-21')).not.toBeInTheDocument();
});

it('treats a graph without Vermeer status as not yet loaded', async () => {
    Object.assign(mockParams, {graphSpace: 'A', graph: 'graph-a'});
    api.manage.getGraphList.mockResolvedValue({
        status: 200, data: {records: [{name: 'graph-a'}]},
    });
    api.manage.getGraph.mockResolvedValue({status: 200, data: {backend: 'hstore'}});

    renderTopBar({isVermeer: true});

    expect(await screen.findByText('analysis.topbar.not_loaded')).toBeInTheDocument();
    expect(screen.getByRole('button', {
        name: 'analysis.topbar.load_to_vermeer',
    })).toBeEnabled();
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
    api.manage.getGraphList
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {records: []}});

    renderTopBar();

    const retry = await screen.findByRole('button', {
        name: 'analysis.topbar.retry_graphs',
    });
    fireEvent.click(retry);

    await waitFor(() => expect(api.manage.getGraphList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(
        'analysis.topbar.graphs_failed'
    )).not.toBeInTheDocument());
});

it('settles a rejected Vermeer load and lets the user retry', async () => {
    jest.spyOn(message, 'error').mockImplementation(() => undefined);
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'hugegraph', status: 'loaded'}]},
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

    await waitFor(() => {
        expect(reload).toBeEnabled();
        expect(reload).not.toHaveClass('ant-btn-loading');
    });
    fireEvent.click(reload);
    await waitFor(() => expect(api.analysis.loadVermeerTask).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.manage.getGraphList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reload).toBeEnabled());
});

it('ignores a late graph response after the route switches GraphSpace', async () => {
    const oldGraphs = deferred();
    Object.assign(mockParams, {graphSpace: 'A'});
    api.analysis.getGraphSpaceList.mockResolvedValue({
        status: 200,
        data: {graphspaces: ['A', 'B']},
    });
    api.manage.getGraphList.mockImplementation(graphSpace => (
        graphSpace === 'A'
            ? oldGraphs.promise
            : Promise.resolve({
                status: 200,
                data: {records: [{name: 'graph-b', status: 'created'}]},
            })
    ));

    const view = renderTopBar();
    await waitFor(() => expect(api.manage.getGraphList).toHaveBeenCalledWith(
        'A', expect.objectContaining({brief: true, page_no: 1, page_size: 100}), expect.any(Object)
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
    await waitFor(() => expect(api.manage.getGraphList).toHaveBeenCalledWith(
        'B', expect.objectContaining({brief: true, page_no: 1, page_size: 100}), expect.any(Object)
    ));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
        '/gremlin/B/graph-b', {replace: true}
    ));

    await act(async () => oldGraphs.resolve({
        status: 200,
        data: {records: [{name: 'graph-a', status: 'created'}]},
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
        api.manage.getGraphList.mockResolvedValue({
            status: 200,
            data: {records: [
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

it('tracks the accepted load task while graph metadata still reports loaded', async () => {
    jest.useFakeTimers();
    try {
        api.manage.getGraphList.mockResolvedValue({
            status: 200, data: {records: [{name: 'hugegraph', status: 'loaded'}]},
        });
        api.analysis.loadVermeerTask.mockResolvedValue({status: 200, data: {task_id: -10}});
        api.analysis.fetchAsyncTaskResult
            .mockResolvedValueOnce({status: 200, data: {task_status: 'queued'}})
            .mockResolvedValue({status: 200, data: {task_status: 'success'}});
        const view = renderTopBar({isVermeer: true});
        await act(async () => {});
        fireEvent.click(screen.getByRole('button', {name: 'analysis.topbar.reload_to_vermeer'}));
        await act(async () => {});
        expect(screen.getByText('analysis.topbar.loading')).toBeInTheDocument();
        await act(async () => jest.advanceTimersByTime(2000));
        expect(screen.getByText('analysis.topbar.loading')).toBeInTheDocument();
        expect(api.manage.getGraphList).toHaveBeenCalledTimes(1);
        await act(async () => jest.advanceTimersByTime(2000));
        expect(api.analysis.fetchAsyncTaskResult).toHaveBeenCalledWith('DEFAULT', 'hugegraph', -10);
        expect(screen.getByText('analysis.topbar.loaded')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'analysis.topbar.reload_to_vermeer'})).toBeEnabled();
        view.unmount();
        const requests = api.analysis.fetchAsyncTaskResult.mock.calls.length;
        await act(async () => jest.advanceTimersByTime(10000));
        expect(api.analysis.fetchAsyncTaskResult).toHaveBeenCalledTimes(requests);
    }
    finally {
        jest.useRealTimers();
    }
});

it('resumes a queued load after switching away and back to its graph', async () => {
    jest.useFakeTimers();
    try {
        Object.assign(mockParams, {graphSpace: 'A', graph: 'graph-a'});
        api.analysis.getGraphSpaceList.mockResolvedValue({
            status: 200, data: {graphspaces: ['A']},
        });
        api.manage.getGraphList.mockResolvedValue({
            status: 200,
            data: {records: [
                {name: 'graph-a', status: 'loaded'},
                {name: 'graph-b', status: 'loaded'},
            ]},
        });
        api.analysis.loadVermeerTask.mockResolvedValue({status: 200, data: {task_id: -10}});
        api.analysis.fetchAsyncTaskResult.mockResolvedValue({
            status: 200, data: {task_status: 'queued'},
        });
        const onGraphInfoChange = jest.fn();
        const topBar = () => (
            <GraphAnalysisContext.Provider value={{isVermeer: true}}>
                <TopBar
                    moduleName='algorithms'
                    onGraphInfoChange={onGraphInfoChange}
                    showOlapSwitch={false}
                    showNavigationButton={false}
                    isOlapModeEnable={false}
                    isOlapModeLoading={false}
                    onOlapModeChange={jest.fn()}
                />
            </GraphAnalysisContext.Provider>
        );
        const view = render(topBar());
        await act(async () => {});
        fireEvent.click(screen.getByRole('button', {name: 'analysis.topbar.reload_to_vermeer'}));
        await act(async () => {});
        await act(async () => jest.advanceTimersByTime(2000));
        expect(api.analysis.fetchAsyncTaskResult).toHaveBeenCalledWith('A', 'graph-a', -10);

        Object.assign(mockParams, {graph: 'graph-b'});
        view.rerender(topBar());
        await act(async () => {});
        expect(screen.getByRole('button', {name: 'analysis.topbar.reload_to_vermeer'})).toBeEnabled();
        const requests = api.analysis.fetchAsyncTaskResult.mock.calls.length;
        await act(async () => jest.advanceTimersByTime(4000));
        expect(api.analysis.fetchAsyncTaskResult).toHaveBeenCalledTimes(requests);

        Object.assign(mockParams, {graph: 'graph-a'});
        view.rerender(topBar());
        await act(async () => {});
        const loading = screen.getByRole('button', {name: 'analysis.topbar.load_to_vermeer'});
        expect(loading).toBeDisabled();
        expect(screen.getByText('analysis.topbar.loading')).toBeInTheDocument();
        expect(onGraphInfoChange).toHaveBeenLastCalledWith(
            'A', expect.objectContaining({name: 'graph-a', status: 'loading'})
        );
        fireEvent.click(loading);
        expect(api.analysis.loadVermeerTask).toHaveBeenCalledTimes(1);
        await act(async () => jest.advanceTimersByTime(2000));
        expect(api.analysis.fetchAsyncTaskResult).toHaveBeenCalledTimes(requests + 1);
        expect(api.analysis.fetchAsyncTaskResult).toHaveBeenLastCalledWith('A', 'graph-a', -10);
        expect(loading).toBeDisabled();

        api.analysis.fetchAsyncTaskResult.mockResolvedValue({
            status: 200, data: {task_status: 'success'},
        });
        await act(async () => jest.advanceTimersByTime(2000));
        expect(screen.getByRole('button', {name: 'analysis.topbar.reload_to_vermeer'})).toBeEnabled();
        expect(onGraphInfoChange).toHaveBeenLastCalledWith(
            'A', expect.objectContaining({name: 'graph-a', status: 'loaded'})
        );
        view.unmount();
    }
    finally {
        jest.useRealTimers();
    }
});

it('refreshes graph status when Vermeer becomes available again', async () => {
    api.manage.getGraphList.mockResolvedValueOnce({
        status: 200, data: {records: [{name: 'hugegraph', status: ''}]},
    }).mockResolvedValue({
        status: 200, data: {records: [{name: 'hugegraph', status: 'loaded'}]},
    });
    const onGraphInfoChange = jest.fn();
    const view = renderTopBar({isVermeer: false}, {onGraphInfoChange});
    await waitFor(() => expect(onGraphInfoChange).toHaveBeenCalledWith(
        'DEFAULT', expect.objectContaining({name: 'hugegraph', status: ''})
    ));
    view.rerender(
        <GraphAnalysisContext.Provider value={{isVermeer: true}}>
            <TopBar
                moduleName='algorithms'
                onGraphInfoChange={onGraphInfoChange}
                showOlapSwitch={false}
                showNavigationButton={false}
                isOlapModeEnable={false}
                isOlapModeLoading={false}
                onOlapModeChange={jest.fn()}
            />
        </GraphAnalysisContext.Provider>
    );
    expect(await screen.findByText('analysis.topbar.loaded')).toBeInTheDocument();
    expect(api.manage.getGraphList).toHaveBeenCalledTimes(2);
    expect(onGraphInfoChange).toHaveBeenLastCalledWith(
        'DEFAULT', expect.objectContaining({name: 'hugegraph', status: 'loaded'})
    );
});

it('preserves an in-flight load guard when switching away and back before its acknowledgement', async () => {
    jest.useFakeTimers();
    const first = deferred();
    const second = deferred();
    try {
        Object.assign(mockParams, {graphSpace: 'A', graph: 'graph-a'});
        api.analysis.getGraphSpaceList.mockResolvedValue({status: 200, data: {graphspaces: ['A']}});
        // A1 may already have completed natively while its HTTP acknowledgement
        // is delayed; graph metadata legitimately still reports loaded.
        api.manage.getGraphList.mockResolvedValue({status: 200, data: {records: [
            {name: 'graph-a', status: 'loaded'}, {name: 'graph-b', status: 'loaded'},
        ]}});
        api.analysis.loadVermeerTask.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        api.analysis.fetchAsyncTaskResult.mockResolvedValue({status: 200, data: {task_status: 'queued'}});
        const onGraphInfoChange = jest.fn();
        const topBar = () => <GraphAnalysisContext.Provider value={{isVermeer: true}}>
            <TopBar moduleName='algorithms' onGraphInfoChange={onGraphInfoChange}
                showOlapSwitch={false} showNavigationButton={false} isOlapModeEnable={false}
                isOlapModeLoading={false} onOlapModeChange={jest.fn()} />
        </GraphAnalysisContext.Provider>;
        const view = render(topBar());
        await act(async () => {});
        fireEvent.click(screen.getByRole('button', {name: /analysis.topbar.reload_to_vermeer/}));
        await act(async () => {});
        Object.assign(mockParams, {graph: 'graph-b'});
        view.rerender(topBar());
        await act(async () => {});
        const loadB = screen.getByRole('button', {name: /analysis.topbar.reload_to_vermeer/});
        expect(loadB).toBeEnabled();
        fireEvent.click(loadB);
        expect(api.analysis.loadVermeerTask).toHaveBeenCalledTimes(2);
        Object.assign(mockParams, {graph: 'graph-a'});
        view.rerender(topBar());
        await act(async () => {});
        const load = screen.getByRole('button', {name: /analysis.topbar.reload_to_vermeer/});
        // Desired behavior: pending A1 still blocks duplicate A2 for A only.
        expect(load).toBeDisabled();
        fireEvent.click(load);
        expect(api.analysis.loadVermeerTask).toHaveBeenCalledTimes(2);
        await act(async () => second.resolve({status: 200, data: {task_id: -11}}));
        expect(screen.getByRole('button', {name: /analysis.topbar.reload_to_vermeer/})).toBeDisabled();
        await act(async () => first.resolve({status: 200, data: {task_id: -10}}));
        await act(async () => jest.advanceTimersByTime(2000));
        expect(api.analysis.fetchAsyncTaskResult).toHaveBeenLastCalledWith('A', 'graph-a', -10);
        Object.assign(mockParams, {graph: 'graph-b'});
        view.rerender(topBar());
        await act(async () => {});
        expect(screen.getByRole('button', {name: 'analysis.topbar.load_to_vermeer'})).toBeDisabled();
        await act(async () => jest.advanceTimersByTime(2000));
        expect(api.analysis.fetchAsyncTaskResult).toHaveBeenLastCalledWith('A', 'graph-b', -11);
        view.unmount();
    }
    finally {
        jest.useRealTimers();
    }
});

it('resolves a route-selected late-page graph from the same bounded response', async () => {
    Object.assign(mockParams, {graphSpace: 'A', graph: 'graph_10000'});
    const selected = {name: 'graph_10000', nickname: 'Late graph'};
    api.manage.getGraphList.mockResolvedValue({
        status: 200,
        data: {records: [{name: 'graph_00000'}], total: 10001, selected},
    });
    const onGraphInfoChange = jest.fn();

    renderTopBar({isVermeer: false}, {onGraphInfoChange});

    await waitFor(() => expect(onGraphInfoChange).toHaveBeenCalledWith('A', selected));
    expect(api.manage.getGraphList).toHaveBeenCalledTimes(1);
    expect(api.manage.getGraphList).toHaveBeenCalledWith('A', {
        brief: true, page_no: 1, page_size: 100, query: '', selected: 'graph_10000',
    }, expect.any(Object));
    expect(mockNavigate).not.toHaveBeenCalled();
});
