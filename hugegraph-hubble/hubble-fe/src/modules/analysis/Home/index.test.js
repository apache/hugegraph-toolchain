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
import AnalysisHome, {extractQueryErrorMessage} from './index';
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
        <span data-testid='query-content'>{props.codeEditorContent}</span>
        <button onClick={() => props.onTabsChange('Text2GQL')}>Natural language</button>
        <button onClick={() => props.onTabsChange('Cypher')}>Cypher</button>
        <button onClick={() => props.setCodeEditorContent('g.E().limit(3)')}>Edit query</button>
        <button onClick={() => props.onExecute(props.activeTab)}>Run current</button>
    </div>
));
jest.mock('../QueryResult/Home', () => ({
    queryStatus,
    queryMessage,
    graphRenderMode,
    onGraphRenderModeChange,
    metaData,
    propertyKeysRecords,
    graphNums,
}) => (
    <div>
        query result {queryStatus} {queryMessage}
        <span>render mode {graphRenderMode}</span>
        <span>metadata ready {String(Boolean(metaData))}</span>
        <span>properties ready {String(Boolean(propertyKeysRecords))}</span>
        <span>graph counts {graphNums.vertexCount} {graphNums.edgeCount}</span>
        <button onClick={() => onGraphRenderModeChange('3D模式')}>Use 3D</button>
    </div>
));
jest.mock('../LogsDetail/Home', () => props => (
    <div>
        query history
        <span>favorite page {props.pageFavorite}</span>
        <span>execution total {props.executionLogsData.total ?? 'pending'}</span>
        <span>favorite total {props.favoriteQueriesData.total ?? 'pending'}</span>
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
let consoleError;

beforeAll(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.setItem('user_', JSON.stringify({
        id: 'alice',
        user_name: 'alice',
    }));
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

const waitForInitialData = async () => {
    expect(await screen.findByText('execution total 0')).toBeInTheDocument();
    expect(await screen.findByText('favorite total 0')).toBeInTheDocument();
    expect(await screen.findByText('metadata ready true')).toBeInTheDocument();
    expect(await screen.findByText('properties ready true')).toBeInTheDocument();
    expect(await screen.findByText('graph counts 0 0')).toBeInTheDocument();
};

it('starts with a limited default only when no saved query exists', async () => {
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();

    expect(await screen.findByTestId('query-content')).toHaveTextContent('g.V().limit(10)');
    await act(async () => {
        fireEvent.click(screen.getByRole('button', {name: 'Cypher'}));
        await Promise.resolve();
    });
    expect(screen.getByTestId('query-content'))
        .toHaveTextContent('MATCH (n) RETURN n LIMIT 10');
});

it('restores the last input for the current graph instead of replacing it', async () => {
    window.localStorage.setItem(
        'hubble.query.alice.DEFAULT.hugegraph.Gremlin',
        'g.E().hasLabel("created")'
    );
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();

    expect(screen.getByTestId('query-content'))
        .toHaveTextContent('g.E().hasLabel("created")');
    fireEvent.click(screen.getByRole('button', {name: 'Edit query'}));
    expect(window.localStorage.getItem('hubble.query.alice.DEFAULT.hugegraph.Gremlin'))
        .toBe('g.E().limit(3)');
});

it('falls back to the real default after a cleared draft is mounted again', async () => {
    window.localStorage.setItem('hubble.query.alice.DEFAULT.hugegraph.Gremlin', '');
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();

    expect(screen.getByTestId('query-content')).toHaveTextContent('g.V().limit(10)');
});

it('does not restore another user draft for the same graph', async () => {
    window.localStorage.setItem(
        'hubble.query.bob.DEFAULT.hugegraph.Gremlin',
        'g.V().has("private", true)'
    );

    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();

    expect(screen.getByTestId('query-content')).toHaveTextContent('g.V().limit(10)');
    expect(screen.getByTestId('query-content')).not.toHaveTextContent('private');
});

it('prefers a multiline backend diagnostic for rejected HTTP queries', () => {
    expect(extractQueryErrorMessage({
        response: {data: {message: 'Syntax error\nline 2: unexpected token'}},
        message: 'Request failed',
    }, 'fallback')).toBe('Syntax error\nline 2: unexpected token');
    expect(extractQueryErrorMessage({message: 'Network Error'}, 'fallback'))
        .toBe('Network Error');
});

afterEach(() => {
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockClear();
    jest.clearAllMocks();
});

afterAll(() => consoleError.mockRestore());

it('makes no backend request when switching to the Text2GQL placeholder', async () => {
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();
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
    await waitForInitialData();

    fireEvent.click(screen.getByRole('button', {name: 'Run current'}));

    expect(await screen.findByText(/query result failed/)).toHaveTextContent(
        'offline'
    );
});

it('shows a backend query diagnostic when the service returns one', async () => {
    api.analysis.getExecutionQuery.mockResolvedValue({
        status: 400,
        message: 'Syntax error near limit',
    });
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();

    fireEvent.click(screen.getByRole('button', {name: 'Run current'}));

    expect(await screen.findByText(/query result failed/))
        .toHaveTextContent('Syntax error near limit');
});

it('does not start a duplicate query while the first request is pending', async () => {
    let resolveQuery;
    api.analysis.getExecutionQuery.mockImplementation(() => new Promise(resolve => {
        resolveQuery = resolve;
    }));
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();

    const run = screen.getByRole('button', {name: 'Run current'});
    fireEvent.click(run);
    fireEvent.click(run);

    expect(api.analysis.getExecutionQuery).toHaveBeenCalledTimes(1);
    await act(async () => resolveQuery({status: 200, data: {}}));
});

it('preserves the 3D canvas mode while repeating a graph query', async () => {
    let resolveRepeatedQuery;
    api.analysis.getExecutionQuery
        .mockResolvedValueOnce({
            status: 200,
            data: {
                graph_view: {
                    vertices: [{id: 'v1'}],
                    edges: [],
                },
            },
        })
        .mockImplementationOnce(() => new Promise(resolve => {
            resolveRepeatedQuery = resolve;
        }));
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();

    const run = screen.getByRole('button', {name: 'Run current'});
    fireEvent.click(run);
    await screen.findByText(/query result success/);
    fireEvent.click(screen.getByRole('button', {name: 'Use 3D'}));
    expect(screen.getByText('render mode 3D模式')).toBeInTheDocument();

    fireEvent.click(run);
    expect(await screen.findByText(/query result loading/)).toBeInTheDocument();
    expect(screen.getByText('render mode 3D模式')).toBeInTheDocument();

    await act(async () => resolveRepeatedQuery({
        status: 200,
        data: {
            graph_view: {
                vertices: [{id: 'v1'}],
                edges: [],
            },
        },
    }));
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
