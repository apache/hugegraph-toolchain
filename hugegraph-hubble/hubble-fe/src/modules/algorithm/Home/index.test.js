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

jest.mock('../../../api', () => ({
    analysis: {
        fetchFavoriteQueries: jest.fn(),
        getExecutionLogs: jest.fn(),
        getGraphData: jest.fn(),
    },
    manage: {
        getMetaEdgeList: jest.fn(),
        getMetaVertexList: jest.fn(),
        getMetaPropertyList: jest.fn(),
    },
}));
jest.mock('../algorithmsForm/Home', () => props => (
    <div>algorithm forms edges {props.graphNums.edgeCount}</div>
));
jest.mock('../GraphResult/Home', () => () => <div>algorithm result</div>);
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
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
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
