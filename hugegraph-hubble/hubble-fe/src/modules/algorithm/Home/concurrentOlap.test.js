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

import {act, render, renderHook, waitFor} from '@testing-library/react';
import AlgorithmHome from './index';
import GraphAnalysisContext from '../../Context';
import * as api from '../../../api';
import {GRAPH_STATUS} from '../../../utils/constants';
import {clearOlapTasks, clearOlapTasksForGraph, recordOlapTask} from '../olapTaskRegistry';
import useAlgorithmSubmission from '../algorithmsForm/useAlgorithmSubmission';
import {USER_CHANGE_EVENT} from '../../../utils/user';

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

const formProps = jest.fn();
jest.mock('../algorithmsForm/Home', () => props => {
    formProps(props);
    return <div>algorithm-form</div>;
});
const resultProps = jest.fn();
jest.mock('../GraphResult/Home', () => props => {
    resultProps(props);
    return <div>algorithm-result</div>;
});
jest.mock('../LogsDetail/Home', () => () => null);

const okList = {status: 200, data: {records: [], total: 0}};
const currentResult = () => resultProps.mock.lastCall[0];
const start = (kind, algorithm) => {
    const receive = formProps.mock.lastCall[0][`handle${kind}FormSubmit`](algorithm);
    receive(GRAPH_STATUS.LOADING);
    return receive;
};
const home = () => (
    <GraphAnalysisContext.Provider value={{
        graphSpace: 'DEFAULT', graph: 'hugegraph', isVermeer: true, vermeerReady: true,
    }}>
        <AlgorithmHome engine='olap' />
    </GraphAnalysisContext.Provider>
);

beforeEach(() => {
    clearOlapTasks();
    jest.clearAllMocks();
    api.analysis.fetchFavoriteQueries.mockResolvedValue(okList);
    api.analysis.getExecutionLogs.mockResolvedValue(okList);
    api.analysis.getGraphData.mockResolvedValue({status: 200, data: {vertexcount: 2, edgecount: 1}});
    api.analysis.getOlapCapability.mockResolvedValue({status: 200, data: {available: true}});
    api.manage.getMetaEdgeList.mockResolvedValue(okList);
    api.manage.getMetaVertexList.mockResolvedValue(okList);
    api.manage.getMetaPropertyList.mockResolvedValue(okList);
});

test('accepts every same-scope OLAP completion even when responses arrive in reverse order', async () => {
    render(home());
    await waitFor(() => expect(formProps).toHaveBeenCalled());
    let first;
    let second;
    act(() => {
        formProps.mock.lastCall[0].updateCurrentAlgorithm('PageRank');
        first = start('Olap', 'PageRank');
        formProps.mock.lastCall[0].updateCurrentAlgorithm('WCC');
        second = start('Olap', 'WCC');
    });
    act(() => second(GRAPH_STATUS.SUCCESS, -22));
    expect(currentResult().asyncTaskId).toBe(-22);
    expect(currentResult().algorithm).toBe('WCC');
    expect(currentResult().queryStatus).toBe(GRAPH_STATUS.SUCCESS);
    act(() => formProps.mock.lastCall[0].updateCurrentAlgorithm('Triangle Count'));
    expect(currentResult().algorithm).toBe('WCC');
    act(() => first(GRAPH_STATUS.SUCCESS, -21));
    expect(currentResult().asyncTaskId).toBe(-21);
    expect(currentResult().algorithm).toBe('PageRank');
    expect(currentResult().queryStatus).toBe(GRAPH_STATUS.SUCCESS);
});

test('keeps a successful preview and exposes another concurrent failure as a warning', async () => {
    render(home());
    await waitFor(() => expect(formProps).toHaveBeenCalled());
    let success;
    let failure;
    act(() => {
        success = start('Olap');
        failure = start('Olap');
        success(GRAPH_STATUS.SUCCESS, -31);
    });
    expect(currentResult().asyncTaskId).toBe(-31);
    act(() => failure(GRAPH_STATUS.FAILED, '', 'worker failed'));
    expect(currentResult().asyncTaskId).toBe(-31);
    expect(currentResult().queryStatus).toBe(GRAPH_STATUS.SUCCESS);
    expect(currentResult().queryMessage).toBe('worker failed');
});

test('keeps loading until every concurrent OLAP submission has settled', async () => {
    render(home());
    await waitFor(() => expect(formProps).toHaveBeenCalled());
    let first;
    let second;
    act(() => {
        first = start('Olap');
        second = start('Olap');
    });
    act(() => first(GRAPH_STATUS.FAILED, '', 'first failed'));
    expect(currentResult().queryStatus).toBe(GRAPH_STATUS.LOADING);
    expect(currentResult().queryMessage).toBe('first failed');
    expect(currentResult().asyncTaskId).toBeUndefined();
    act(() => second(GRAPH_STATUS.FAILED, '', 'second failed'));
    expect(currentResult().queryStatus).toBe(GRAPH_STATUS.FAILED);
    expect(currentResult().queryMessage).toBe('second failed');
});

test('retains a sibling failure warning when the remaining submission succeeds', async () => {
    render(home());
    await waitFor(() => expect(formProps).toHaveBeenCalled());
    let first;
    let second;
    act(() => {
        first = start('Olap');
        second = start('Olap');
    });
    act(() => first(GRAPH_STATUS.FAILED, '', 'first failed'));
    expect(currentResult().queryStatus).toBe(GRAPH_STATUS.LOADING);
    expect(currentResult().queryMessage).toBe('first failed');
    act(() => second(GRAPH_STATUS.SUCCESS, -33));
    expect(currentResult().queryStatus).toBe(GRAPH_STATUS.SUCCESS);
    expect(currentResult().asyncTaskId).toBe(-33);
    expect(currentResult().queryMessage).toBe('first failed');
    act(() => { start('Olap'); });
    expect(currentResult().queryMessage).toBeUndefined();
});

test('a new OLAP attempt and success clear the retained warning and reject late loading', async () => {
    render(home());
    await waitFor(() => expect(formProps).toHaveBeenCalled());
    let success;
    let failure;
    act(() => {
        success = start('Olap');
        failure = start('Olap');
        success(GRAPH_STATUS.SUCCESS, -35);
        failure(GRAPH_STATUS.FAILED, '', 'old warning');
    });
    expect(currentResult().queryMessage).toBe('old warning');
    let recovery;
    act(() => { recovery = start('Olap'); });
    expect(currentResult().asyncTaskId).toBe(-35);
    expect(currentResult().queryStatus).toBe(GRAPH_STATUS.SUCCESS);
    expect(currentResult().queryMessage).toBeUndefined();
    act(() => recovery(GRAPH_STATUS.SUCCESS, -36, 'accepted'));
    expect(currentResult().asyncTaskId).toBe(-36);
    expect(currentResult().queryStatus).toBe(GRAPH_STATUS.SUCCESS);
    expect(currentResult().queryMessage).toBeUndefined();
    act(() => recovery(GRAPH_STATUS.LOADING));
    expect(currentResult().asyncTaskId).toBe(-36);
    expect(currentResult().queryStatus).toBe(GRAPH_STATUS.SUCCESS);
});

test('keeps OLTP latest-only while OLTP and concurrent OLAP invalidate each other', async () => {
    render(home());
    await waitFor(() => expect(formProps).toHaveBeenCalled());
    let oldOltp;
    let currentOlap;
    act(() => {
        oldOltp = start('Oltp');
        currentOlap = start('Olap');
        currentOlap(GRAPH_STATUS.SUCCESS, -41);
        oldOltp(GRAPH_STATUS.SUCCESS, {vertices: [{id: 'stale-oltp'}]});
    });
    expect(currentResult().asyncTaskId).toBe(-41);
    expect(currentResult().data).toEqual({});

    let oldOlap;
    let currentOltp;
    const graphResult = {vertices: [{id: 'current-oltp'}], edges: []};
    act(() => {
        oldOlap = start('Olap');
        currentOltp = start('Oltp');
        currentOltp(GRAPH_STATUS.SUCCESS, graphResult);
        oldOlap(GRAPH_STATUS.SUCCESS, -42);
    });
    expect(currentResult().isQueryMode).toBe(true);
    expect(currentResult().data).toBe(graphResult);
    expect(currentResult().asyncTaskId).toBeUndefined();
});

test('invalidates the whole OLAP completion group after an explicit result reset', async () => {
    render(home());
    await waitFor(() => expect(formProps).toHaveBeenCalled());
    let first;
    let second;
    act(() => {
        first = start('Olap');
        second = start('Olap');
        currentResult().resetGraphStatus(GRAPH_STATUS.STANDBY, undefined, {});
        first(GRAPH_STATUS.SUCCESS, -51);
        second(GRAPH_STATUS.SUCCESS, -52);
    });
    expect(currentResult().asyncTaskId).toBeUndefined();
    expect(currentResult().queryStatus).toBe(GRAPH_STATUS.STANDBY);
    expect(currentResult().data).toEqual({});
});


test('restores recent tasks after navigation and switches by selected algorithm', async () => {
    recordOlapTask({graphSpace: 'DEFAULT', graph: 'hugegraph', id: -7, algorithm: 'PageRank'});
    recordOlapTask({graphSpace: 'DEFAULT', graph: 'hugegraph', id: -8, algorithm: 'Triangle Count'});
    const view = render(home());
    await waitFor(() => expect(currentResult().asyncTaskId).toBe(-8));
    expect(currentResult().restoredOlapTask).toBe(true);
    act(() => formProps.mock.lastCall[0].onSelectOlapAlgorithm('PageRank'));
    expect(currentResult().asyncTaskId).toBe(-7);
    expect(currentResult().algorithm).toBe('PageRank');
    act(() => formProps.mock.lastCall[0].onSelectOlapAlgorithm('WCC'));
    expect(currentResult().asyncTaskId).toBeUndefined();
    expect(currentResult().queryStatus).toBe(GRAPH_STATUS.STANDBY);
    view.unmount();
    render(home());
    await waitFor(() => expect(currentResult().asyncTaskId).toBe(-8));
});

test('retains a pending acceptance over navigation and restores it once accepted', async () => {
    const view = render(home());
    await waitFor(() => expect(formProps).toHaveBeenCalled());
    const hook = renderHook(() => useAlgorithmSubmission(
        formProps.mock.lastCall[0].handleOlapFormSubmit, 'DEFAULT', 'hugegraph', 'PageRank', true
    ));
    let finish;
    act(() => { finish = hook.result.current(GRAPH_STATUS.LOADING); });
    view.unmount();
    render(home());
    await waitFor(() => expect(currentResult().queryStatus).toBe(GRAPH_STATUS.LOADING));
    act(() => { finish(GRAPH_STATUS.SUCCESS, -19); });
    await waitFor(() => expect(currentResult().asyncTaskId).toBe(-19));
    expect(currentResult().restoredOlapTask).toBe(true);
});

test.each(['identity', 'deleted graph'])('invalidates detached pending submissions on %s change', async change => {
    const view = render(home());
    await waitFor(() => expect(formProps).toHaveBeenCalled());
    const hook = renderHook(() => useAlgorithmSubmission(
        formProps.mock.lastCall[0].handleOlapFormSubmit, 'DEFAULT', 'hugegraph', 'PageRank', true
    ));
    let finish;
    act(() => { finish = hook.result.current(GRAPH_STATUS.LOADING); });
    view.unmount();
    act(() => {
        if (change === 'identity') window.dispatchEvent(new Event(USER_CHANGE_EVENT));
        else clearOlapTasksForGraph('DEFAULT', 'hugegraph');
        finish(GRAPH_STATUS.SUCCESS, -19);
    });
    render(home());
    await waitFor(() => expect(currentResult().queryStatus).toBe(GRAPH_STATUS.STANDBY));
    expect(currentResult().asyncTaskId).toBeUndefined();
});


test('keeps the latest task per algorithm beyond the eight recent-task switcher entries', async () => {
    recordOlapTask({graphSpace: 'DEFAULT', graph: 'hugegraph', id: -1, algorithm: 'PageRank'});
    for (let i = 2; i <= 10; i += 1) {
        recordOlapTask({graphSpace: 'DEFAULT', graph: 'hugegraph', id: -i, algorithm: `algorithm-${i}`});
    }
    render(home());
    await waitFor(() => expect(currentResult().asyncTaskId).toBe(-10));
    act(() => formProps.mock.lastCall[0].onSelectOlapAlgorithm('PageRank'));
    expect(currentResult().asyncTaskId).toBe(-1);
});

test('does not restore a task from a different graph', async () => {
    recordOlapTask({graphSpace: 'DEFAULT', graph: 'another', id: -1, algorithm: 'PageRank'});
    render(home());
    await waitFor(() => expect(formProps).toHaveBeenCalled());
    expect(currentResult().asyncTaskId).toBeUndefined();
    act(() => formProps.mock.lastCall[0].onSelectOlapAlgorithm('PageRank'));
    expect(currentResult().asyncTaskId).toBeUndefined();
});
