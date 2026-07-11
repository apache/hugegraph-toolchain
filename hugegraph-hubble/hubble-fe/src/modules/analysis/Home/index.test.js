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
import AnalysisHome from './index';
import GraphAnalysisContext from '../../Context';
import * as api from '../../../api';

jest.mock('../../../api', () => ({
    analysis: {
        getExecutionLogs: jest.fn(),
        fetchFavoriteQueries: jest.fn(),
        getGraphData: jest.fn(),
        getExecutionQuery: jest.fn(),
        getCypherExecutionQuery: jest.fn(),
        getExecutionTask: jest.fn(),
        getCypherTask: jest.fn(),
    },
    manage: {
        getMetaEdgeList: jest.fn(),
        getMetaVertexList: jest.fn(),
        getMetaPropertyList: jest.fn(),
    },
}));
jest.mock('../QueryBar/Home', () => props => (
    <div>
        <button onClick={() => props.onTabsChange('Text2GQL')}>Natural language</button>
        <button onClick={() => props.onExecute(props.activeTab)}>Run current</button>
    </div>
));
jest.mock('../QueryResult/Home', () => ({queryStatus, queryMessage}) => (
    <div>query result {queryStatus} {queryMessage}</div>
));
jest.mock('../LogsDetail/Home', () => props => (
    <div>
        query history
        <span>favorite page {props.pageFavorite}</span>
        <button onClick={() => props.onFavoritePageChange(2, 10)}>Go favorite page 2</button>
        <span>{props.executionLogsData.records?.[0]?.content}</span>
        {props.executionLogsError && (
            <button onClick={props.onRetryExecutionLogs}>Retry records</button>
        )}
        {props.favoriteQueriesError && (
            <button onClick={props.onRetryFavoriteQueries}>Retry favorites</button>
        )}
    </div>
));
jest.mock('react-i18next', () => ({useTranslation: () => ({t: key => key})}));

const okList = {status: 200, data: {records: [], total: 0}};

beforeEach(() => {
    api.analysis.getExecutionLogs.mockResolvedValue(okList);
    api.analysis.fetchFavoriteQueries.mockResolvedValue(okList);
    api.analysis.getGraphData.mockResolvedValue({
        status: 200,
        data: {vertexcount: 0, edgecount: 0},
    });
    api.manage.getMetaEdgeList.mockResolvedValue(okList);
    api.manage.getMetaVertexList.mockResolvedValue(okList);
    api.manage.getMetaPropertyList.mockResolvedValue(okList);
});

afterEach(() => jest.clearAllMocks());

it('makes no backend request when switching to the Text2GQL placeholder', async () => {
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await act(async () => Promise.resolve());
    Object.values(api.analysis).forEach(mock => mock.mockClear());
    Object.values(api.manage).forEach(mock => mock.mockClear());

    fireEvent.click(screen.getByRole('button', {name: 'Natural language'}));
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole('button', {name: 'Run current'}));
    await act(async () => Promise.resolve());

    Object.values(api.analysis).forEach(mock => expect(mock).not.toHaveBeenCalled());
    Object.values(api.manage).forEach(mock => expect(mock).not.toHaveBeenCalled());
    expect(screen.queryByText('query result')).not.toBeInTheDocument();
    expect(screen.queryByText('query history')).not.toBeInTheDocument();
});

it('turns a rejected synchronous query into a recoverable failed result', async () => {
    api.analysis.getExecutionQuery.mockRejectedValue(new Error('offline'));
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await act(async () => Promise.resolve());

    fireEvent.click(screen.getByRole('button', {name: 'Run current'}));

    expect(await screen.findByText(/query result failed/)).toHaveTextContent(
        'analysis.query_result.run_failed_action'
    );
});

it('keeps execution-history failure separate and retries only that source', async () => {
    api.analysis.getExecutionLogs
        .mockRejectedValueOnce(new Error('history offline'))
        .mockResolvedValueOnce(okList);
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );

    fireEvent.click(await screen.findByRole('button', {name: 'Retry records'}));

    await waitFor(() => expect(api.analysis.getExecutionLogs).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', {
        name: 'Retry records',
    })).not.toBeInTheDocument());
    expect(api.analysis.fetchFavoriteQueries).toHaveBeenCalledTimes(1);
});

it('does not let late history from the previous graph replace current rows', async () => {
    let resolveA;
    let resolveB;
    api.analysis.getExecutionLogs.mockImplementation((space, graph) => (
        new Promise(resolve => {
            if (graph === 'graph-a') {
                resolveA = resolve;
            }
            else {
                resolveB = resolve;
            }
        })
    ));
    const {rerender} = render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'graph-a'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await act(async () => Promise.resolve());
    rerender(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'graph-b'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await act(async () => Promise.resolve());

    await act(async () => resolveB({
        status: 200,
        data: {records: [{id: 2, content: 'current-b'}], total: 1},
    }));
    expect(await screen.findByText('current-b')).toBeInTheDocument();
    await act(async () => resolveA({
        status: 200,
        data: {records: [{id: 1, content: 'stale-a'}], total: 1},
    }));
    expect(screen.getByText('current-b')).toBeInTheDocument();
    expect(screen.queryByText('stale-a')).not.toBeInTheDocument();
});

it('keeps a pending favorite page selected instead of rolling back early', async () => {
    let resolvePageTwo;
    api.analysis.fetchFavoriteQueries
        .mockResolvedValueOnce(okList)
        .mockImplementationOnce(() => new Promise(resolve => {
            resolvePageTwo = resolve;
        }));
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitFor(() => expect(api.analysis.fetchFavoriteQueries).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', {name: 'Go favorite page 2'}));
    await waitFor(() => expect(api.analysis.fetchFavoriteQueries).toHaveBeenCalledTimes(2));
    expect(screen.getByText('favorite page 2')).toBeInTheDocument();

    await act(async () => {
        resolvePageTwo({
            status: 200,
            data: {records: [{id: 2}], total: 11},
        });
    });
    expect(screen.getByText('favorite page 2')).toBeInTheDocument();
    expect(api.analysis.fetchFavoriteQueries).toHaveBeenCalledTimes(2);
});
