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
import AlgorithmHome from './index';
import GraphAnalysisContext from '../../Context';
import * as api from '../../../api';
import {setUser} from '../../../utils/user';
import {GRAPH_STATUS} from '../../../utils/constants';

jest.mock('../../../api', () => ({
    analysis: {
        fetchFavoriteQueries: jest.fn(),
        getExecutionLogs: jest.fn(),
        getGraphData: jest.fn(),
        getOlapCapability: jest.fn(),
    },
    manage: {
        getMetaEdgeList: jest.fn(),
        getMetaVertexList: jest.fn(),
        getMetaPropertyList: jest.fn(),
    },
}));
const mockAlgorithmFormProps = jest.fn();
jest.mock('../algorithmsForm/Home', () => props => {
    mockAlgorithmFormProps(props);
    return <div>algorithm forms edges {props.graphNums.edgeCount}</div>;
});
const mockGraphResultProps = jest.fn();
jest.mock('../GraphResult/Home', () => props => {
    mockGraphResultProps(props);
    return <div>algorithm result counts {String(props.graphNums.vertexCount)} {String(props.graphNums.edgeCount)}</div>;
});
jest.mock('../LogsDetail/Home', () => props => (
    <div>
        <span>favorite page {props.pageFavorite}</span>
        <button onClick={() => props.onFavoritePageChange(2, 10)}>Go page 2</button>
        {props.executionLogsError && (
            <button onClick={props.onRetryExecutionLogs}>Retry records</button>
        )}
        {props.favoriteQueriesError && (
            <button onClick={props.onRetryFavoriteQueries}>Retry favorites</button>
        )}
    </div>
));
let mockLanguage = 'zh';
const mockModeTranslations = {
    zh: {OLTP: '交互式探索', OLAP: '集群批量计算'},
    en: {OLTP: 'Interactive exploration', OLAP: 'Cluster batch computation'},
};
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => {
        const mode = key.match(/^analysis\.algorithm\.mode\.(OLTP|OLAP)$/)?.[1];
        return mode ? mockModeTranslations[mockLanguage][mode] : key;
    }}),
}));

const okList = {status: 200, data: {records: [], total: 0}};
const deferred = () => {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return {promise, resolve};
};

beforeEach(() => {
    mockLanguage = 'zh';
    api.analysis.getOlapCapability.mockResolvedValue({status: 200, data: {available: false}});
    api.analysis.fetchFavoriteQueries.mockResolvedValue(okList);
    api.analysis.getExecutionLogs.mockResolvedValue(okList);
    api.analysis.getGraphData.mockResolvedValue({
        status: 200,
        data: {vertexcount: 0, edgecount: 0},
    });
    api.manage.getMetaEdgeList.mockResolvedValue(okList);
    api.manage.getMetaVertexList.mockResolvedValue(okList);
    api.manage.getMetaPropertyList.mockResolvedValue(okList);
});

afterEach(() => jest.clearAllMocks());

it('keeps algorithm history failure separate and retries only that source', async () => {
    api.analysis.getExecutionLogs
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(okList);
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AlgorithmHome />
        </GraphAnalysisContext.Provider>
    );

    fireEvent.click(await screen.findByRole('button', {name: 'Retry records'}));

    await waitFor(() => expect(api.analysis.getExecutionLogs).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', {
        name: 'Retry records',
    })).not.toBeInTheDocument());
    expect(api.analysis.fetchFavoriteQueries).toHaveBeenCalledTimes(1);
});

it('does not treat a pending favorite page as an empty page and roll back', async () => {
    let resolvePageTwo;
    api.analysis.fetchFavoriteQueries
        .mockResolvedValueOnce(okList)
        .mockImplementationOnce(() => new Promise(resolve => {
            resolvePageTwo = resolve;
        }));
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AlgorithmHome />
        </GraphAnalysisContext.Provider>
    );
    await waitFor(() => expect(api.analysis.fetchFavoriteQueries).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', {name: 'Go page 2'}));
    await waitFor(() => expect(api.analysis.fetchFavoriteQueries).toHaveBeenCalledTimes(2));
    expect(screen.getByText('favorite page 2')).toBeInTheDocument();
    expect(api.analysis.fetchFavoriteQueries).toHaveBeenCalledTimes(2);

    await act(async () => {
        resolvePageTwo({
            status: 200,
            data: {records: [{id: 2}], total: 11},
        });
    });
    await waitFor(() => expect(screen.getByText('favorite page 2')).toBeInTheDocument());
    expect(api.analysis.fetchFavoriteQueries).toHaveBeenCalledTimes(2);
});

it('invalidates old graph counts immediately when the graph changes', async () => {
    const oldGraph = deferred();
    const newGraph = deferred();
    api.analysis.getGraphData.mockImplementation((graphSpace, graph) => (
        graph === 'old' ? oldGraph.promise : newGraph.promise
    ));
    const view = render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'old'}}>
            <AlgorithmHome />
        </GraphAnalysisContext.Provider>
    );
    view.rerender(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'empty'}}>
            <AlgorithmHome />
        </GraphAnalysisContext.Provider>
    );

    expect(screen.getByText('algorithm forms edges -1')).toBeInTheDocument();
    await act(async () => oldGraph.resolve({
        status: 200,
        data: {vertexcount: 5, edgecount: 7},
    }));
    expect(screen.getByText('algorithm forms edges -1')).toBeInTheDocument();

    await act(async () => newGraph.resolve({
        status: 200,
        data: {vertexcount: 0, edgecount: 0},
    }));
    expect(screen.getByText('algorithm forms edges 0')).toBeInTheDocument();
});

const countsHomeFor = (graph = 'graph-a', graphSpace = 'DEFAULT') => (
    <GraphAnalysisContext.Provider value={{graphSpace, graph}}>
        <AlgorithmHome />
    </GraphAnalysisContext.Provider>
);

it('refreshes server graph totals through the callback passed to the result without resetting confirmed counts', async () => {
    api.analysis.getGraphData.mockResolvedValue({status: 200, data: {vertexcount: 7, edgecount: 9, approximate: true, scan_limit: 100000}});
    render(countsHomeFor());
    expect(await screen.findByText('algorithm result counts 7 9')).toBeInTheDocument();
    expect(mockGraphResultProps.mock.lastCall[0].graphNums).toMatchObject({approximate: true, scan_limit: 100000});
    const initialCalls = api.analysis.getGraphData.mock.calls.length;
    const onRefreshGraphNums = mockGraphResultProps.mock.lastCall[0].onRefreshGraphNums;
    api.analysis.getGraphData.mockResolvedValueOnce({status: 200, data: {vertexcount: 7, edgecount: 9}});
    await act(async () => onRefreshGraphNums());
    expect(api.analysis.getGraphData).toHaveBeenCalledTimes(initialCalls + 1);
    expect(api.analysis.getGraphData).toHaveBeenLastCalledWith('DEFAULT', 'graph-a', {suppressBusinessErrorToast: true});
    expect(screen.getByText('algorithm result counts 7 9')).toBeInTheDocument();
    api.analysis.getGraphData.mockResolvedValueOnce({status: 200, data: {vertexcount: 8, edgecount: 12}});
    await act(async () => onRefreshGraphNums());
    expect(screen.getByText('algorithm result counts 8 12')).toBeInTheDocument();
    api.analysis.getGraphData.mockRejectedValueOnce(new Error('statistics unavailable'));
    await act(async () => { await expect(onRefreshGraphNums()).resolves.toEqual({status: 'unavailable'}); });
    expect(screen.getByText('algorithm result counts null null')).toBeInTheDocument();
});

it.each(['graph', 'space', 'return-to-a'].flatMap(change =>
    ['success', 'http-error', 'network-error'].map(outcome => [change, outcome])))('rejects stale count-refresh callbacks after a %s change with late %s responses', async (change, outcome) => {
    api.analysis.getGraphData.mockResolvedValue({status: 200, data: {vertexcount: 7, edgecount: 9}});
    const view = render(countsHomeFor());
    expect(await screen.findByText('algorithm result counts 7 9')).toBeInTheDocument();
    const staleRefresh = mockGraphResultProps.mock.lastCall[0].onRefreshGraphNums;
    let resolveOld;
    let rejectOld;
    api.analysis.getGraphData.mockImplementationOnce(() => new Promise((resolve, reject) => {
        resolveOld = resolve;
        rejectOld = reject;
    }));
    act(() => { void staleRefresh(); });
    api.analysis.getGraphData.mockResolvedValue({status: 200, data: {vertexcount: 20, edgecount: 21}});
    view.rerender(countsHomeFor(change === 'space' ? 'graph-a' : 'graph-b', change === 'space' ? 'OTHER' : 'DEFAULT'));
    expect(await screen.findByText('algorithm result counts 20 21')).toBeInTheDocument();
    if (change === 'return-to-a') {
        api.analysis.getGraphData.mockResolvedValue({status: 200, data: {vertexcount: 30, edgecount: 31}});
        view.rerender(countsHomeFor());
        expect(await screen.findByText('algorithm result counts 30 31')).toBeInTheDocument();
    }
    const calls = api.analysis.getGraphData.mock.calls.length;
    await act(async () => staleRefresh());
    expect(api.analysis.getGraphData).toHaveBeenCalledTimes(calls);
    await act(async () => {
        if (outcome === 'network-error') rejectOld(new Error('old scope unavailable'));
        else resolveOld({status: outcome === 'success' ? 200 : 503, data: {vertexcount: 100, edgecount: 101}});
    });
    expect(screen.getByText(change === 'return-to-a' ? 'algorithm result counts 30 31' : 'algorithm result counts 20 21')).toBeInTheDocument();
    const currentRefresh = mockGraphResultProps.mock.lastCall[0].onRefreshGraphNums;
    view.unmount();
    await currentRefresh();
    expect(api.analysis.getGraphData).toHaveBeenCalledTimes(calls);
});

it('keeps the latest same-graph refresh and ignores a refresh response after unmount', async () => {
    api.analysis.getGraphData.mockResolvedValue({status: 200, data: {vertexcount: 7, edgecount: 9}});
    const view = render(countsHomeFor());
    expect(await screen.findByText('algorithm result counts 7 9')).toBeInTheDocument();
    const onRefreshGraphNums = mockGraphResultProps.mock.lastCall[0].onRefreshGraphNums;
    const first = deferred();
    const second = deferred();
    api.analysis.getGraphData.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    act(() => { void onRefreshGraphNums(); void onRefreshGraphNums(); });
    await act(async () => second.resolve({status: 200, data: {vertexcount: 20, edgecount: 21}}));
    await act(async () => first.resolve({status: 200, data: {vertexcount: 10, edgecount: 11}}));
    expect(screen.getByText('algorithm result counts 20 21')).toBeInTheDocument();
    const pending = deferred();
    api.analysis.getGraphData.mockReturnValueOnce(pending.promise);
    act(() => { void onRefreshGraphNums(); });
    view.unmount();
    await act(async () => pending.resolve({status: 200, data: {vertexcount: 40, edgecount: 41}}));
});

it.each(['http-error', 'network-error'])('marks current graph totals unavailable after a %s refresh and recovers on retry', async outcome => {
    api.analysis.getGraphData.mockResolvedValue({status: 200, data: {vertexcount: 7, edgecount: 9}});
    render(countsHomeFor());
    expect(await screen.findByText('algorithm result counts 7 9')).toBeInTheDocument();
    const onRefreshGraphNums = mockGraphResultProps.mock.lastCall[0].onRefreshGraphNums;
    if (outcome === 'http-error') api.analysis.getGraphData.mockResolvedValueOnce({status: 503});
    else api.analysis.getGraphData.mockRejectedValueOnce(new Error('statistics unavailable'));
    await act(async () => { await expect(onRefreshGraphNums()).resolves.toEqual({status: 'unavailable'}); });
    expect(screen.getByText('algorithm result counts null null')).toBeInTheDocument();
    await act(async () => { await expect(onRefreshGraphNums()).resolves.toEqual({status: 'refreshed'}); });
    expect(screen.getByText('algorithm result counts 7 9')).toBeInTheDocument();
});

it('does not let a failed older same-graph refresh invalidate a newer successful total', async () => {
    api.analysis.getGraphData.mockResolvedValue({status: 200, data: {vertexcount: 7, edgecount: 9}});
    render(countsHomeFor());
    expect(await screen.findByText('algorithm result counts 7 9')).toBeInTheDocument();
    const onRefreshGraphNums = mockGraphResultProps.mock.lastCall[0].onRefreshGraphNums;
    let rejectOld;
    api.analysis.getGraphData.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectOld = reject; }));
    act(() => { void onRefreshGraphNums(); });
    api.analysis.getGraphData.mockResolvedValueOnce({status: 200, data: {vertexcount: 20, edgecount: 21}});
    await act(async () => onRefreshGraphNums());
    await act(async () => rejectOld(new Error('older statistics failed')));
    expect(screen.getByText('algorithm result counts 20 21')).toBeInTheDocument();
});

it.each([false, true].flatMap(returnToAlice =>
    ['success', 'http-error', 'network-error'].map(outcome => [returnToAlice, outcome])))('isolates graph counts across setUser on the mounted graph (return to Alice: %s, old response: %s)', async (returnToAlice, outcome) => {
    setUser({id: 'alice', user_name: 'alice'});
    api.analysis.getGraphData.mockResolvedValue({status: 200, data: {vertexcount: 7, edgecount: 9}});
    const view = render(countsHomeFor());
    expect(await screen.findByText('algorithm result counts 7 9')).toBeInTheDocument();
    const staleRefresh = mockGraphResultProps.mock.lastCall[0].onRefreshGraphNums;
    let resolveOld;
    let rejectOld;
    api.analysis.getGraphData.mockImplementationOnce(() => new Promise((resolve, reject) => {
        resolveOld = resolve;
        rejectOld = reject;
    }));
    act(() => { void staleRefresh(); });
    const beforeIdentityChange = api.analysis.getGraphData.mock.calls.length;
    let resolveCurrent;
    api.analysis.getGraphData.mockImplementationOnce(() => new Promise(resolve => { resolveCurrent = resolve; }));
    let immediateOldRefresh;
    let synchronousCalls;
    await act(async () => {
        setUser({id: 'bob', user_name: 'bob'});
        // This invocation runs before React commits the new identity epoch.
        immediateOldRefresh = staleRefresh();
        synchronousCalls = api.analysis.getGraphData.mock.calls.length;
        await expect(immediateOldRefresh).resolves.toEqual({status: 'disposed'});
    });
    expect(synchronousCalls).toBe(beforeIdentityChange);
    expect(api.analysis.getGraphData).toHaveBeenCalledTimes(beforeIdentityChange + 1);
    expect(api.analysis.getGraphData).toHaveBeenLastCalledWith('DEFAULT', 'graph-a', {suppressBusinessErrorToast: true});
    expect(screen.getByText('algorithm result counts -1 -1')).toBeInTheDocument();
    await act(async () => resolveCurrent({status: 200, data: {vertexcount: 20, edgecount: 21}}));
    expect(screen.getByText('algorithm result counts 20 21')).toBeInTheDocument();
    if (returnToAlice) {
        api.analysis.getGraphData.mockResolvedValue({status: 200, data: {vertexcount: 30, edgecount: 31}});
        await act(async () => setUser({id: 'alice', user_name: 'alice'}));
        expect(screen.getByText('algorithm result counts 30 31')).toBeInTheDocument();
    }
    const calls = api.analysis.getGraphData.mock.calls.length;
    await act(async () => { await expect(staleRefresh()).resolves.toEqual({status: 'disposed'}); });
    expect(api.analysis.getGraphData).toHaveBeenCalledTimes(calls);
    await act(async () => {
        if (outcome === 'network-error') rejectOld(new Error('old account count failure'));
        else resolveOld({status: outcome === 'success' ? 200 : 503, data: {vertexcount: 100, edgecount: 101}});
    });
    expect(screen.getByText(returnToAlice ? 'algorithm result counts 30 31' : 'algorithm result counts 20 21')).toBeInTheDocument();
    view.unmount();
});


// Exercise completion ownership independently of the algorithm's HTTP timing.
const startAlgorithm = kind => {
    const handler = mockAlgorithmFormProps.mock.lastCall[0][`handle${kind}FormSubmit`];
    const receive = handler();
    receive(GRAPH_STATUS.LOADING);
    return receive;
};
const algorithmResult = () => mockGraphResultProps.mock.lastCall[0];

it('retains a completed OLTP graph while changing languages in both directions', async () => {
    const view = render(countsHomeFor());
    await screen.findByText('algorithm forms edges 0');
    const data = {vertices: [{id: 'v1'}, {id: 'v2'}], edges: []};
    await act(async () => { startAlgorithm('Oltp')(GRAPH_STATUS.SUCCESS, data); });
    for (const language of ['en', 'zh']) {
        mockLanguage = language;
        view.rerender(countsHomeFor());
        expect(algorithmResult().isQueryMode).toBe(true);
        expect(algorithmResult().queryStatus).toBe(GRAPH_STATUS.SUCCESS);
        expect(algorithmResult().data).toBe(data);
        expect(algorithmResult().asyncTaskId).toBeUndefined();
    }
});

it('renders an OLTP request completed after a language change as a graph', async () => {
    const view = render(countsHomeFor());
    await screen.findByText('algorithm forms edges 0');
    let complete;
    await act(async () => { complete = startAlgorithm('Oltp'); });
    mockLanguage = 'en';
    view.rerender(countsHomeFor());
    const data = {vertices: [{id: 'late-result'}], edges: []};
    await act(async () => { complete(GRAPH_STATUS.SUCCESS, data); });
    expect(algorithmResult().isQueryMode).toBe(true);
    expect(algorithmResult().data).toBe(data);
    expect(algorithmResult().asyncTaskId).toBeUndefined();
});

it('retains a real OLAP task across language changes', async () => {
    const view = render(countsHomeFor());
    await screen.findByText('algorithm forms edges 0');
    await act(async () => { startAlgorithm('Olap')(GRAPH_STATUS.SUCCESS, 'real-task'); });
    for (const language of ['en', 'zh']) {
        mockLanguage = language;
        view.rerender(countsHomeFor());
        expect(algorithmResult().isQueryMode).toBe(false);
        expect(algorithmResult().asyncTaskId).toBe('real-task');
        expect(algorithmResult().data).toEqual({});
    }
});

it('keeps the latest algorithm result when OLTP and OLAP finish in reverse order', async () => {
    render(countsHomeFor());
    await screen.findByText('algorithm forms edges 0');
    let oldOltp;
    let newOlap;
    act(() => { oldOltp = startAlgorithm('Oltp'); });
    act(() => { newOlap = startAlgorithm('Olap'); });
    act(() => { newOlap(GRAPH_STATUS.SUCCESS, 'current-task'); });
    expect(algorithmResult().asyncTaskId).toBe('current-task');
    act(() => { oldOltp(GRAPH_STATUS.SUCCESS, {vertices: [{id: 'stale'}]}); });
    expect(algorithmResult().asyncTaskId).toBe('current-task');
    expect(algorithmResult().data).toEqual({});
    expect(algorithmResult().isQueryMode).toBe(false);
});

it.each(['graph', 'identity'])('rejects algorithm results and old submitters after a %s change', async change => {
    const view = render(countsHomeFor());
    await screen.findByText('algorithm forms edges 0');
    const oldStart = mockAlgorithmFormProps.mock.lastCall[0].handleOltpFormSubmit;
    let oldCompletion;
    act(() => { oldCompletion = startAlgorithm('Oltp'); });
    if (change === 'graph') view.rerender(countsHomeFor('graph-b'));
    else act(() => { setUser({id: 'algorithm-reader', user_name: 'algorithm-reader'}); });
    await act(async () => {});
    expect(algorithmResult().data).toEqual({});
    act(() => { oldCompletion(GRAPH_STATUS.SUCCESS, {vertices: [{id: 'old-scope'}]}); });
    expect(algorithmResult().data).toEqual({});
    act(() => {
        const staleCompletion = oldStart();
        staleCompletion(GRAPH_STATUS.SUCCESS, {vertices: [{id: 'stale-start'}]});
    });
    expect(algorithmResult().data).toEqual({});
    let current;
    act(() => { current = startAlgorithm('Oltp'); });
    act(() => { current(GRAPH_STATUS.SUCCESS, {vertices: [{id: 'current'}]}); });
    expect(algorithmResult().data).toEqual({vertices: [{id: 'current'}]});
    view.unmount();
    act(() => { current(GRAPH_STATUS.FAILED, {}, 'late failure'); });
});


it.each(['Oltp', 'Olap'])('keeps a user-cleared or imported result after a pending %s execution finishes', async kind => {
    render(countsHomeFor());
    await screen.findByText('algorithm forms edges 0');
    let pending;
    act(() => { pending = startAlgorithm(kind); });
    const imported = {vertices: [{id: 'imported'}], edges: []};
    act(() => { algorithmResult().resetGraphStatus(GRAPH_STATUS.SUCCESS, undefined, imported); });
    act(() => { pending(GRAPH_STATUS.SUCCESS, {vertices: [{id: 'obsolete'}]}); });
    expect(algorithmResult().data).toEqual(imported);
    act(() => { pending = startAlgorithm(kind); });
    act(() => { algorithmResult().resetGraphStatus(GRAPH_STATUS.STANDBY, undefined, {}); });
    act(() => { pending(GRAPH_STATUS.FAILED, {}, 'obsolete failure'); });
    expect(algorithmResult().data).toEqual({});
    expect(algorithmResult().queryStatus).toBe(GRAPH_STATUS.STANDBY);
});


const schemaList = name => ({status: 200, data: {records: [{name}]}});
const currentSchema = name => ({edgeMeta: [{name: `${name}-edge`}], vertexMeta: [{name: `${name}-vertex`}]});

it.each([
    ['graph', 'edge'], ['graph', 'vertex'],
    ['return-to-a', 'edge'], ['return-to-a', 'vertex'], ['identity', 'vertex'],
])('keeps Schema inputs owned after %s changes with late %s metadata', async (change, held) => {
    const oldMetadata = deferred();
    const oldKeys = deferred();
    api.manage.getMetaEdgeList
        .mockReturnValueOnce(held === 'edge' ? oldMetadata.promise : Promise.resolve(schemaList('old-edge')))
        .mockResolvedValueOnce(schemaList('b-edge'))
        .mockResolvedValue(schemaList('a2-edge'));
    if (held === 'vertex') api.manage.getMetaVertexList.mockReturnValueOnce(oldMetadata.promise);
    api.manage.getMetaVertexList.mockResolvedValueOnce(schemaList('b-vertex'));
    if (change === 'return-to-a') api.manage.getMetaVertexList.mockResolvedValueOnce(schemaList('a2-vertex'));
    api.manage.getMetaVertexList.mockResolvedValue(schemaList('old-vertex'));
    api.manage.getMetaPropertyList
        .mockReturnValueOnce(oldKeys.promise)
        .mockResolvedValueOnce(schemaList('b-key'))
        .mockResolvedValue(schemaList('a2-key'));
    const view = render(countsHomeFor());
    await act(async () => {});
    if (change === 'identity') act(() => setUser({id: 'schema-reader', user_name: 'schema-reader'}));
    else view.rerender(countsHomeFor('graph-b'));
    await waitFor(() => expect(algorithmResult().metaData).toEqual(currentSchema('b')));
    expect(algorithmResult().propertyKeysRecords).toEqual([{name: 'b-key'}]);
    let expected = 'b';
    if (change === 'return-to-a') {
        view.rerender(countsHomeFor());
        await waitFor(() => expect(algorithmResult().metaData).toEqual(currentSchema('a2')));
        expect(algorithmResult().propertyKeysRecords).toEqual([{name: 'a2-key'}]);
        expected = 'a2';
    }
    await act(async () => {
        oldMetadata.resolve(schemaList(`old-${held}`));
        oldKeys.resolve(schemaList('old-key'));
    });
    expect(algorithmResult().metaData).toEqual(currentSchema(expected));
    expect(algorithmResult().propertyKeysRecords).toEqual([{name: `${expected}-key`}]);
    view.unmount();
});

it('hides confirmed old Schema inputs as soon as the selected graph changes', async () => {
    api.manage.getMetaEdgeList.mockResolvedValue(schemaList('a-edge'));
    api.manage.getMetaVertexList.mockResolvedValue(schemaList('a-vertex'));
    api.manage.getMetaPropertyList.mockResolvedValue(schemaList('a-key'));
    const view = render(countsHomeFor());
    await waitFor(() => expect(algorithmResult().metaData).toEqual(currentSchema('a')));
    const pending = deferred();
    api.manage.getMetaEdgeList.mockReturnValueOnce(pending.promise);
    api.manage.getMetaPropertyList.mockReturnValueOnce(pending.promise);
    view.rerender(countsHomeFor('graph-b'));
    expect(algorithmResult().metaData).toBeUndefined();
    expect(algorithmResult().propertyKeysRecords).toBeUndefined();
    view.unmount();
    const vertexCalls = api.manage.getMetaVertexList.mock.calls.length;
    await act(async () => pending.resolve(schemaList('disposed')));
    expect(api.manage.getMetaVertexList).toHaveBeenCalledTimes(vertexCalls);
});


const computeHome = ({engine = 'olap', graph = 'g', graphSpace = 'DEFAULT',
    isVermeer = false, vermeerReady = true} = {}) => (
    <GraphAnalysisContext.Provider value={{graphSpace, graph, isVermeer, vermeerReady}}>
        <AlgorithmHome engine={engine} />
    </GraphAnalysisContext.Provider>
);
const computeStatus = () => mockGraphResultProps.mock.lastCall[0].computerStatus;

it('probes Computer only on active OLAP after Vermeer is confirmed disabled with a selected graph', async () => {
    const view = render(computeHome({engine: 'oltp'}));
    expect(api.analysis.getOlapCapability).not.toHaveBeenCalled();
    view.rerender(computeHome({vermeerReady: false}));
    expect(computeStatus()).toBe('unconfirmed');
    view.rerender(computeHome({isVermeer: true}));
    expect(api.analysis.getOlapCapability).not.toHaveBeenCalled();
    view.rerender(computeHome({graph: null}));
    expect(computeStatus()).toBe('select-graph');
    expect(api.analysis.getOlapCapability).not.toHaveBeenCalled();
    view.rerender(computeHome());
    await waitFor(() => expect(computeStatus()).toBe('unavailable'));
    expect(api.analysis.getOlapCapability).toHaveBeenCalledTimes(1);
    expect(api.analysis.getOlapCapability).toHaveBeenCalledWith('DEFAULT', 'g', {suppressBusinessErrorToast: true});
    expect(mockAlgorithmFormProps.mock.lastCall[0].computerStatus).toBe('unavailable');
});

it.each([
    [{status: 200, data: {available: true}}, 'available'],
    [{status: 200, data: {available: false}}, 'unavailable'],
    [{status: 401, data: {available: false}}, 'error'],
    [{status: 503, data: {available: false}}, 'error'],
    [{status: 200, data: {}}, 'error'],
])('distinguishes confirmed Computer capability %j as %s', async (response, status) => {
    api.analysis.getOlapCapability.mockResolvedValue(response);
    render(computeHome());
    await waitFor(() => expect(computeStatus()).toBe(status));
    expect(mockAlgorithmFormProps.mock.lastCall[0].computerStatus).toBe(status);
    expect(api.analysis.getOlapCapability).toHaveBeenCalledTimes(1);
});

it('shares one cached capability across tabs and retries a failed probe inline', async () => {
    api.analysis.getOlapCapability.mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({status: 200, data: {available: true}});
    const view = render(computeHome());
    await waitFor(() => expect(computeStatus()).toBe('error'));
    act(() => mockGraphResultProps.mock.lastCall[0].onRetryComputerCapability());
    await waitFor(() => expect(computeStatus()).toBe('available'));
    view.rerender(computeHome({engine: 'oltp'}));
    view.rerender(computeHome());
    expect(computeStatus()).toBe('available');
    expect(api.analysis.getOlapCapability).toHaveBeenCalledTimes(2);
});

it.each(['graph', 'space', 'identity', 'readiness'])(
    'does not leak an old Computer probe after %s changes', async change => {
        const old = deferred();
        const current = deferred();
        api.analysis.getOlapCapability.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
        const view = render(computeHome());
        expect(computeStatus()).toBe('checking');
        if (change === 'graph') view.rerender(computeHome({graph: 'other'}));
        if (change === 'space') view.rerender(computeHome({graphSpace: 'OTHER'}));
        if (change === 'identity') act(() => setUser({id: 'computer-reader', user_name: 'computer-reader'}));
        if (change === 'readiness') {
            view.rerender(computeHome({vermeerReady: false}));
            view.rerender(computeHome());
        }
        await act(async () => current.resolve({status: 200, data: {available: true}}));
        expect(computeStatus()).toBe('available');
        await act(async () => old.resolve({status: 200, data: {available: false}}));
        expect(computeStatus()).toBe('available');
        expect(api.analysis.getOlapCapability).toHaveBeenCalledTimes(2);
    }
);

it.each(['graph', 'identity'])('does not revive cached Computer capability when returning to a previous %s', async change => {
    const first = deferred();
    const second = deferred();
    const returned = deferred();
    api.analysis.getOlapCapability.mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise).mockReturnValueOnce(returned.promise);
    const view = render(computeHome());
    if (change === 'graph') view.rerender(computeHome({graph: 'other'}));
    else act(() => setUser({id: 'computer-bob', user_name: 'computer-bob'}));
    await act(async () => second.resolve({status: 200, data: {available: true}}));
    expect(computeStatus()).toBe('available');
    if (change === 'graph') view.rerender(computeHome());
    else act(() => setUser({id: 'computer-alice', user_name: 'computer-alice'}));
    expect(computeStatus()).toBe('checking');
    await act(async () => first.resolve({status: 200, data: {available: true}}));
    expect(computeStatus()).toBe('checking');
    await act(async () => returned.resolve({status: 200, data: {available: false}}));
    expect(computeStatus()).toBe('unavailable');
    expect(api.analysis.getOlapCapability).toHaveBeenCalledTimes(3);
});

it('clears old OLAP submission and ignores late completion when switching engines', async () => {
    const view = render(computeHome({engine: 'olap', isVermeer: true}));
    await screen.findByText('algorithm forms edges 0');
    let complete;
    await act(async () => { complete = startAlgorithm('Olap'); });
    await act(async () => { complete(GRAPH_STATUS.SUCCESS, -24); });
    expect(algorithmResult().asyncTaskId).toBe(-24);
    view.rerender(computeHome({engine: 'oltp', isVermeer: true}));
    expect(algorithmResult().asyncTaskId).toBeUndefined();
    expect(algorithmResult().queryStatus).toBe(GRAPH_STATUS.STANDBY);
    await act(async () => { complete(GRAPH_STATUS.SUCCESS, -24); });
    expect(algorithmResult().asyncTaskId).toBeUndefined();
    view.rerender(computeHome({engine: 'olap', isVermeer: true}));
    expect(algorithmResult().asyncTaskId).toBeUndefined();
});

it.each(['graph', 'space'])('never renders an old OLAP task for a new %s', async change => {
    const view = render(computeHome({engine: 'olap', isVermeer: true}));
    await screen.findByText('algorithm forms edges 0');
    await act(async () => { startAlgorithm('Olap')(GRAPH_STATUS.SUCCESS, -24); });
    expect(algorithmResult().asyncTaskId).toBe(-24);
    mockGraphResultProps.mockClear();
    view.rerender(computeHome({engine: 'olap', isVermeer: true,
        ...(change === 'graph' ? {graph: 'other'} : {graphSpace: 'OTHER'})}));
    expect(mockGraphResultProps.mock.calls.every(([props]) => props.asyncTaskId === undefined)).toBe(true);
    expect(algorithmResult().queryStatus).toBe(GRAPH_STATUS.STANDBY);
});
