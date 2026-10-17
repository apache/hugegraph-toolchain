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
import {EXECUTION_LOGS_TYPE} from '../../../utils/constants';
import {setConfig} from '../../../utils/config';
import {setUser} from '../../../utils/user';

jest.mock('../../../api', () => ({
    analysis: {
        streamText2Gql: jest.fn(),
        getText2GqlConfig: jest.fn(),
        getExecutionLogs: jest.fn(),
        fetchFavoriteQueries: jest.fn(),
        getGraphData: jest.fn(),
        getExecutionQuery: jest.fn(),
        executeText2Gql: jest.fn(),
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
        <span data-testid='source-question'>{props.text2gql.question}</span>
        <span data-testid='query-language'>{props.language}</span>
        <span data-testid='editor-source'>{props.editorSource}</span>
        <output data-testid='execution-duration'>{props.executionDurationMs ?? ''}</output>
        <span data-testid='model-source'>{props.text2gql.source}</span>
        <button onClick={() => props.onLanguageChange('cypher')}>Cypher</button>
        <button onClick={() => props.onLanguageChange('cypher')}>Generate Cypher</button>
        <button onClick={() => props.onLanguageChange('gremlin')}>Generate Gremlin</button>
        <button onClick={() => props.setCodeEditorContent('MATCH (n) RETURN n LIMIT 4')}>Edit Cypher</button>
        <button onClick={() => props.setCodeEditorContent('g.E().limit(3)')}>Edit query</button>
        <button onClick={() => props.onExecute(props.activeTab)}>Run current</button>
        <button onClick={() => props.onExecuteModeChange('task')}>Use async</button>
        <button onClick={() => props.setCodeEditorContent(props.codeEditorContent)}>Echo current query</button>
        <button onClick={props.text2gql.cancel}>Cancel generation</button>
        <button onClick={props.onClear}>Clear query</button>
        <button onClick={() => props.text2gql.changeSource('shared')}>Use shared model</button>
        <button onClick={() => props.text2gql.changeSource('custom')}>Use custom model</button>
        <button
            onClick={() => {
                props.text2gql.updateConfig('provider', 'ollama');
                props.text2gql.updateConfig('model', 'local-model');
                props.text2gql.setQuestion('Find people');
            }}
        >
            Set model and question
        </button>
        <button
            disabled={props.text2gql.sharedConfig.loading}
            onClick={() => props.text2gql.generate({asyncTask: props.executeMode === 'task'})}
        >
            Generate
        </button>
        <button onClick={() => props.text2gql.setQuestion('New question')}>Edit question</button>
    </div>
));
jest.mock('../QueryResult/Home', () => ({
    queryResult,
    queryProgress,
    asyncTaskResult,
    isQueryMode,
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
        <output data-testid='query-result'>{JSON.stringify(queryResult)}</output>
        <span data-testid='query-status'>{queryStatus}</span>
        <output data-testid='result-mode'>{isQueryMode ? 'query' : 'task'}</output>
        <output data-testid='query-progress'>{queryProgress?.phase || ''}</output>
        <output data-testid='async-task'>{!isQueryMode ? asyncTaskResult ?? '' : ''}</output>
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
        <button
            disabled={!props.executionLogsData.records?.[0]}
            onClick={() => {
                const row = props.executionLogsData.records[0];
                props.onClickLoadContent(row.content, row.text);
            }}
        >
            Load history statement
        </button>
        <button
            disabled={!props.favoriteQueriesData.records?.[0]}
            onClick={() => props.onClickLoadContent(props.favoriteQueriesData.records[0].content)}
        >
            Load favorite statement
        </button>
        <span>execution page {props.pageExecute}</span>
        <span>favorite page {props.pageFavorite}</span>
        <span>execution loading {String(props.executionLogsLoading)}</span>
        <span>favorite loading {String(props.favoriteQueriesLoading)}</span>
        <span>execution total {props.executionLogsData.total ?? 'pending'}</span>
        <span>favorite total {props.favoriteQueriesData.total ?? 'pending'}</span>
        <button onClick={() => props.onFavoritePageChange(2, 10)}>Go favorite page 2</button>
        <button onClick={() => props.onExecutePageChange(2, 10)}>Go execution page 2</button>
        <button onClick={() => props.onExecutePageChange(1, 10)}>Go execution page 1</button>
        <span>{props.executionLogsData.records?.[0]?.content}</span>
        <span>{props.favoriteQueriesData.records?.[0]?.content}</span>
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
    setConfig({cypher_enabled: true});
    api.analysis.getText2GqlConfig.mockResolvedValue({status: 200, data: {available: false, reason: 'not_configured'}});
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

const historyResponse = records => ({status: 200, data: {records, total: records.length}});
const pendingResponse = () => {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return {promise, resolve};
};
const homeFor = (graph = 'hugegraph', graphSpace = 'DEFAULT') => (
    <GraphAnalysisContext.Provider value={{graphSpace, graph}}>
        <AnalysisHome />
    </GraphAnalysisContext.Provider>
);

const waitForInitialData = async () => {
    expect(await screen.findByText('execution total 0')).toBeInTheDocument();
    expect(await screen.findByText('favorite total 0')).toBeInTheDocument();
    expect(await screen.findByText('metadata ready true')).toBeInTheDocument();
    expect(await screen.findByText('properties ready true')).toBeInTheDocument();
    expect(await screen.findByText('graph counts 0 0')).toBeInTheDocument();
};

it.each([null, undefined])('waits for a graph before executing a query (%s)', async graph => {
    api.analysis.getExecutionQuery.mockResolvedValue({status: 200, data: {}});
    const {rerender} = render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );

    await act(async () => {
        fireEvent.click(screen.getByRole('button', {name: 'Run current'}));
    });
    expect(api.analysis.getExecutionQuery).not.toHaveBeenCalled();
    expect(api.analysis.getGraphData).not.toHaveBeenCalled();

    rerender(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'ready_graph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();
    await act(async () => {
        fireEvent.click(screen.getByRole('button', {name: 'Run current'}));
    });
    expect(api.analysis.getExecutionQuery).toHaveBeenCalledWith(
        'DEFAULT', 'ready_graph', 'g.V().limit(10)'
    );
});

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

it('keeps AI generation available alongside the manual query and Gremlin history', async () => {
    api.analysis.getExecutionQuery.mockResolvedValue({status: 200, data: {}});
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();
    api.analysis.getExecutionQuery.mockClear();
    expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
    expect(screen.getByTestId('query-content')).toHaveTextContent('g.V().limit(10)');
    expect(screen.getByRole('button', {name: 'Generate'})).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    expect(api.analysis.getExecutionQuery).toHaveBeenCalledWith('DEFAULT', 'hugegraph', 'g.V().limit(10)');
    expect(api.analysis.executeText2Gql).not.toHaveBeenCalled();
    expect(screen.getByText(/query result/)).toBeInTheDocument();
    expect(api.analysis.getExecutionLogs).toHaveBeenLastCalledWith(
        'DEFAULT', 'hugegraph', {page_size: 10, page_no: 1, type: '6'}
    );
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
    expect(await screen.findByTestId('query-content')).toHaveTextContent('current-b');
    await act(async () => resolveA({
        status: 200,
        data: {records: [{id: 1, content: 'stale-a'}], total: 1},
    }));
    expect(screen.getByTestId('query-content')).toHaveTextContent('current-b');
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

it.each(['resolve', 'reject'])(
    'keeps the new graph occupied when the old query completes via %s', async completion => {
        let resolveA;
        let rejectA;
        let resolveB;
        api.analysis.getExecutionQuery
            .mockImplementationOnce(() => new Promise((resolve, reject) => {
                resolveA = resolve;
                rejectA = reject;
            }))
            .mockImplementationOnce(() => new Promise(resolve => {
                resolveB = resolve;
            }))
            .mockResolvedValueOnce({status: 200, data: {}});
        const home = graph => (
            <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph}}>
                <AnalysisHome />
            </GraphAnalysisContext.Provider>
        );
        const {rerender} = render(home('graph-a'));
        await waitForInitialData();
        const run = () => screen.getByRole('button', {name: 'Run current'});
        fireEvent.click(run());
        fireEvent.click(run());
        expect(api.analysis.getExecutionQuery).toHaveBeenCalledTimes(1);

        rerender(home('graph-b'));
        await waitForInitialData();
        fireEvent.click(run());
        expect(api.analysis.getExecutionQuery).toHaveBeenCalledTimes(2);
        expect(api.analysis.getExecutionQuery).toHaveBeenLastCalledWith(
            'DEFAULT', 'graph-b', 'g.V().limit(10)'
        );
        await act(async () => {
            if (completion === 'resolve') {
                resolveA({status: 200, data: {}, message: 'stale-a'});
            }
            else {
                rejectA(new Error('stale-a'));
            }
        });
        expect(screen.getByText(/query result loading/)).toBeInTheDocument();
        expect(screen.queryByText(/stale-a/)).not.toBeInTheDocument();
        // This QueryBar fixture deliberately keeps its button clickable while loading.
        fireEvent.click(run());
        expect(api.analysis.getExecutionQuery).toHaveBeenCalledTimes(2);

        await act(async () => resolveB({status: 200, data: {}, message: 'current-b'}));
        expect(screen.getByText(/query result success/)).toHaveTextContent('current-b');
        await act(async () => fireEvent.click(run()));
        expect(api.analysis.getExecutionQuery).toHaveBeenCalledTimes(3);
    });

it.each([false, true])('ignores late counts after switching graphs (return to A: %s)', async returnToA => {
    const pending = [];
    api.analysis.getGraphData.mockImplementation((space, graph) => new Promise(resolve => {
        pending.push({graph, resolve});
    }));
    const home = graph => (
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    const {rerender, unmount} = render(home('graph-a'));
    await waitFor(() => expect(pending).toHaveLength(1));
    rerender(home('graph-b'));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(screen.getByText('graph counts -1 -1')).toBeInTheDocument();
    await act(async () => pending[1].resolve({
        status: 200, data: {vertexcount: 20, edgecount: 21},
    }));
    expect(screen.getByText('graph counts 20 21')).toBeInTheDocument();
    if (returnToA) {
        rerender(home('graph-a'));
        await waitFor(() => expect(pending).toHaveLength(3));
        expect(screen.getByText('graph counts -1 -1')).toBeInTheDocument();
        await act(async () => pending[2].resolve({
            status: 200, data: {vertexcount: 30, edgecount: 31},
        }));
    }
    await act(async () => pending[0].resolve({
        status: 200, data: {vertexcount: 10, edgecount: 11},
    }));
    expect(screen.getByText(returnToA ? 'graph counts 30 31' : 'graph counts 20 21')).toBeInTheDocument();
    unmount();
});

it('does not let an older same-graph refresh overwrite current counts', async () => {
    const pending = [];
    api.analysis.getGraphData.mockImplementation(() => new Promise(resolve => {
        pending.push(resolve);
    }));
    api.analysis.getExecutionQuery.mockResolvedValue({status: 200, data: {}});
    const {unmount} = render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'graph-a'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1]({status: 200, data: {vertexcount: 20, edgecount: 21}}));
    await act(async () => pending[0]({status: 200, data: {vertexcount: 10, edgecount: 11}}));
    expect(screen.getByText('graph counts 20 21')).toBeInTheDocument();
    // A pending post-query refresh is also detached on unmount.
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    await waitFor(() => expect(pending).toHaveLength(3));
    unmount();
    await act(async () => pending[2]({status: 200, data: {vertexcount: 40, edgecount: 41}}));
});


it('preserves generated Gremlin provenance when editing and rerunning in the shared editor', async () => {
    api.analysis.streamText2Gql.mockResolvedValue({status: 200,
        data: {valid: true, language: 'gremlin', query: 'g.V().limit(2)'}});
    api.analysis.executeText2Gql.mockResolvedValue({status: 200, data: {}});
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();
    fireEvent.click(screen.getByRole('button', {name: 'Set model and question'}));
    await waitFor(() => expect(screen.getByRole('button', {name: 'Generate'})).toBeEnabled());
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Generate'})));
    expect(api.analysis.executeText2Gql).toHaveBeenCalledWith(
        'DEFAULT', 'hugegraph', 'gremlin', {content: 'g.V().limit(2)', text: 'Find people', read_only: true},
        expect.objectContaining({signal: expect.any(Object)})
    );
    expect(screen.getByTestId('query-content')).toHaveTextContent('g.V().limit(2)');
    expect(screen.getByTestId('editor-source')).toHaveTextContent('ai');
    fireEvent.click(screen.getByRole('button', {name: 'Edit question'}));
    fireEvent.click(screen.getByRole('button', {name: 'Edit query'}));
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    expect(api.analysis.executeText2Gql).toHaveBeenLastCalledWith(
        'DEFAULT', 'hugegraph', 'gremlin', {content: 'g.E().limit(3)', text: 'Find people', read_only: true},
        expect.objectContaining({signal: expect.any(Object)})
    );
});


it('keeps hand-written statements manual alongside the AI assistant', async () => {
    api.analysis.getExecutionQuery.mockResolvedValue({status: 200, data: {}});
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();
    fireEvent.click(screen.getByRole('button', {name: 'Edit query'}));
    expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    expect(api.analysis.getExecutionQuery).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph', 'g.E().limit(3)');
    expect(api.analysis.executeText2Gql).not.toHaveBeenCalled();
});


it('preserves both text and execution provenance when switching between manual Gremlin and AI Cypher', async () => {
    api.analysis.getExecutionQuery.mockResolvedValue({status: 200, data: {}});
    const query = 'MATCH (n) RETURN n LIMIT 2';
    api.analysis.streamText2Gql.mockResolvedValue({status: 200, data: {valid: true, query, language: 'cypher'}});
    api.analysis.executeText2Gql.mockResolvedValue({status: 200, data: {}});
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();
    fireEvent.click(screen.getByRole('button', {name: 'Set model and question'}));
    fireEvent.click(screen.getByRole('button', {name: 'Edit query'}));
    fireEvent.click(screen.getByRole('button', {name: 'Generate Cypher'}));
    fireEvent.click(screen.getByRole('button', {name: 'Set model and question'}));
    expect(screen.getByTestId('query-content')).toHaveTextContent('MATCH (n) RETURN n LIMIT 10');
    expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
    await waitFor(() => expect(screen.getByRole('button', {name: 'Generate'})).toBeEnabled());
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Generate'})));
    expect(api.analysis.executeText2Gql).toHaveBeenCalledWith(
        'DEFAULT', 'hugegraph', 'cypher', {content: query, text: 'Find people', read_only: true},
        expect.objectContaining({signal: expect.any(Object)})
    );
    expect(api.analysis.getCypherExecutionQuery).not.toHaveBeenCalled();
    expect(api.analysis.getExecutionLogs).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph',
        expect.objectContaining({type: EXECUTION_LOGS_TYPE.Cypher}));
    fireEvent.click(screen.getByRole('button', {name: 'Edit question'}));
    fireEvent.click(screen.getByRole('button', {name: 'Edit Cypher'}));
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    expect(api.analysis.executeText2Gql).toHaveBeenLastCalledWith(
        'DEFAULT', 'hugegraph', 'cypher', {content: 'MATCH (n) RETURN n LIMIT 4', text: 'Find people', read_only: true},
        expect.any(Object)
    );
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Generate Gremlin'})));
    expect(screen.getByTestId('query-content')).toHaveTextContent('g.E().limit(3)');
    expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    expect(api.analysis.getExecutionQuery).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph', 'g.E().limit(3)');
    expect(api.analysis.executeText2Gql).toHaveBeenCalledTimes(2);
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Generate Cypher'})));
    expect(screen.getByTestId('query-content')).toHaveTextContent('MATCH (n) RETURN n LIMIT 4');
    expect(screen.getByTestId('editor-source')).toHaveTextContent('ai');
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    expect(api.analysis.executeText2Gql).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph', 'cypher',
        {content: 'MATCH (n) RETURN n LIMIT 4', text: 'Find people', read_only: true}, expect.any(Object));
    expect(window.localStorage.getItem('hubble.query.alice.DEFAULT.hugegraph.Gremlin')).toBe('g.E().limit(3)');
    expect(window.localStorage.getItem('hubble.query.alice.DEFAULT.hugegraph.Cypher')).toBeNull();
});


it.each([
    ['Gremlin', 'history'], ['Gremlin', 'favorite'], ['Cypher', 'history'], ['Cypher', 'favorite'],
])('loads a manual %s %s without clearing its result or restoring AI provenance', async (mode, source) => {
    const graph = {graph_view: {vertices: [{id: 'visible-result'}], edges: []}};
    api.analysis.getExecutionQuery.mockResolvedValue({status: 200, data: graph});
    api.analysis.getCypherExecutionQuery.mockResolvedValue({status: 200, data: graph});
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();
    if (mode === 'Cypher') {
        await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Cypher'})));
    }
    const content = mode === 'Gremlin' ? 'g.V().limit(5)' : 'MATCH (n) RETURN n LIMIT 5';
    const records = {status: 200, data: {records: [{content}], total: 1}};
    api.analysis.getExecutionLogs.mockResolvedValue(records);
    api.analysis.fetchFavoriteQueries.mockResolvedValue(records);
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    expect(screen.getByTestId('query-result')).toHaveTextContent(JSON.stringify(graph));
    fireEvent.click(screen.getByRole('button', {name: `Load ${source} statement`}));
    expect(screen.getByTestId('query-content')).toHaveTextContent(content);
    expect(window.localStorage.getItem(`hubble.query.alice.DEFAULT.hugegraph.${mode}`)).toBe(content);
    expect(screen.getByTestId('query-result')).toHaveTextContent(JSON.stringify(graph));
    expect(screen.getByTestId('query-status')).toHaveTextContent('success');
    expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
    expect(screen.getByTestId('source-question')).toBeEmptyDOMElement();
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    if (mode === 'Gremlin') {
        expect(api.analysis.getExecutionQuery).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph', content);
    }
    else {
        expect(api.analysis.getCypherExecutionQuery).toHaveBeenLastCalledWith(
            'DEFAULT', 'hugegraph', {cypher: content}
        );
    }
    expect(api.analysis.executeText2Gql).not.toHaveBeenCalled();
});

it.each([
    ['query', 'history'], ['query', 'favorite'], ['task', 'history'], ['task', 'favorite'],
])('resets an in-flight generated %s when loading a manual %s and allows another run', async (mode, source) => {
    const generation = pendingResponse();
    const generatedRun = pendingResponse();
    const generatedGraph = {graph_view: {vertices: [{id: 'late-generated-result'}], edges: []}};
    const manualGraph = {graph_view: {vertices: [{id: 'manual-result'}], edges: []}};
    const manualContent = source === 'history' ? 'g.V().limit(11)' : 'g.V().limit(12)';
    const intervalSpy = jest.spyOn(global, 'setInterval');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    let view;

    try {
        api.analysis.getExecutionLogs.mockResolvedValue(historyResponse([{content: manualContent}]));
        api.analysis.fetchFavoriteQueries.mockResolvedValue(historyResponse([{content: manualContent}]));
        api.analysis.streamText2Gql.mockReturnValueOnce(generation.promise);
        if (mode === 'query') {
            api.analysis.executeText2Gql.mockReturnValueOnce(generatedRun.promise);
            api.analysis.getExecutionQuery.mockResolvedValue({status: 200, data: manualGraph});
        }
        else {
            api.analysis.getExecutionTask.mockReturnValueOnce(generatedRun.promise)
                .mockResolvedValueOnce({status: 200, data: {task_id: 43}});
        }

        view = render(homeFor());
        await waitFor(() => {
            expect(screen.getByText('execution total 1')).toBeInTheDocument();
            expect(screen.getByText('favorite total 1')).toBeInTheDocument();
            expect(screen.getByText('metadata ready true')).toBeInTheDocument();
            expect(screen.getByText('properties ready true')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', {name: 'Set model and question'}));
        if (mode === 'task') {
            fireEvent.click(screen.getByRole('button', {name: 'Use async'}));
        }
        await waitFor(() => expect(screen.getByRole('button', {name: 'Generate'})).toBeEnabled());
        await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Generate'})));
        await act(async () => generation.resolve({status: 200, data: {
            valid: true, language: 'gremlin', query: 'g.V().limit(2)',
        }}));

        if (mode === 'query') {
            await waitFor(() => expect(api.analysis.executeText2Gql).toHaveBeenCalledTimes(1));
            expect(screen.getByTestId('execution-duration')).toHaveTextContent('0');
        }
        else {
            await waitFor(() => expect(api.analysis.getExecutionTask).toHaveBeenCalledTimes(1));
        }
        expect(screen.getByTestId('query-status')).toHaveTextContent('loading');

        const queryTimer = mode === 'query' ? intervalSpy.mock.results.at(-1)?.value : undefined;
        fireEvent.click(screen.getByRole('button', {name: `Load ${source} statement`}));
        expect(screen.getByTestId('query-status')).toHaveTextContent('standby');
        expect(screen.getByTestId('execution-duration')).toBeEmptyDOMElement();
        expect(screen.getByTestId('query-progress')).toBeEmptyDOMElement();
        expect(screen.getByTestId('result-mode')).toHaveTextContent('query');
        expect(screen.getByTestId('query-result')).toHaveTextContent('{}');
        expect(screen.getByTestId('query-content')).toHaveTextContent(manualContent);
        expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
        if (mode === 'query') {
            expect(queryTimer).toBeDefined();
            expect(clearIntervalSpy).toHaveBeenCalledWith(queryTimer);
        }

        await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
        if (mode === 'query') {
            expect(api.analysis.getExecutionQuery).toHaveBeenCalledWith(
                'DEFAULT', 'hugegraph', manualContent
            );
            expect(screen.getByTestId('query-result')).toHaveTextContent(JSON.stringify(manualGraph));
            expect(screen.getByTestId('query-status')).toHaveTextContent('success');
            await act(async () => generatedRun.resolve({status: 200, data: generatedGraph}));
            expect(screen.getByTestId('query-result')).toHaveTextContent(JSON.stringify(manualGraph));
        }
        else {
            expect(api.analysis.getExecutionTask).toHaveBeenCalledTimes(2);
            expect(api.analysis.getExecutionTask).toHaveBeenLastCalledWith(
                'DEFAULT', 'hugegraph', {content: manualContent}
            );
            expect(screen.getByTestId('async-task')).toHaveTextContent('43');
            expect(screen.getByTestId('query-status')).toHaveTextContent('success');
            await act(async () => generatedRun.resolve({status: 200, data: {task_id: 99}}));
            expect(screen.getByTestId('async-task')).toHaveTextContent('43');
        }
        expect(screen.getByTestId('query-status')).toHaveTextContent('success');
    }
    finally {
        view?.unmount();
        clearIntervalSpy.mockRestore();
        intervalSpy.mockRestore();
    }
});

it.each(['gremlin', 'cypher'])(
    'clears Text2GQL results when loading %s statements and restores only their original question', async language => {
        const graph = {graph_view: {vertices: [{id: 'old-generated-result'}], edges: []}};
        api.analysis.executeText2Gql.mockResolvedValue({status: 200, data: graph});
        api.analysis.getExecutionQuery.mockResolvedValue({status: 200, data: graph});
        api.analysis.getCypherExecutionQuery.mockResolvedValue({status: 200, data: graph});
        render(
            <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
                <AnalysisHome />
            </GraphAnalysisContext.Provider>
        );
        await waitForInitialData();
        if (language === 'cypher') {
            await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Generate Cypher'})));
            fireEvent.click(screen.getByRole('button', {name: 'Edit Cypher'}));
        }
        else {
            fireEvent.click(screen.getByRole('button', {name: 'Edit query'}));
        }
        const content = language === 'gremlin' ? 'g.V().limit(5)' : 'MATCH (n) RETURN n LIMIT 5';
        const history = {content, text: 'Original historical question'};
        api.analysis.getExecutionLogs.mockResolvedValue({status: 200, data: {records: [history], total: 1}});
        api.analysis.fetchFavoriteQueries.mockResolvedValue({status: 200, data: {records: [{content}], total: 1}});
        await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
        expect(screen.getByTestId('query-result')).toHaveTextContent(JSON.stringify(graph));
        const draftKey = `hubble.query.alice.DEFAULT.hugegraph.${language === 'gremlin' ? 'Gremlin' : 'Cypher'}`;
        const manualDraft = window.localStorage.getItem(draftKey);
        fireEvent.click(screen.getByRole('button', {name: 'Load history statement'}));
        expect(window.localStorage.getItem(draftKey)).toBe(manualDraft);
        expect(screen.getByTestId('query-result')).toHaveTextContent('{}');
        expect(screen.getByTestId('query-content')).toHaveTextContent(content);
        expect(screen.getByTestId('source-question')).toHaveTextContent(history.text);
        expect(screen.getByTestId('editor-source')).toHaveTextContent('ai');
        expect(screen.getByTestId('query-language')).toHaveTextContent(language);
        fireEvent.click(screen.getByRole('button', {name: 'Edit question'}));
        await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
        expect(api.analysis.executeText2Gql).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph', language,
            {content, text: history.text, read_only: true}, expect.any(Object));
        expect(screen.getByTestId('query-result')).toHaveTextContent(JSON.stringify(graph));
        fireEvent.click(screen.getByRole('button', {name: 'Load favorite statement'}));
        expect(window.localStorage.getItem(draftKey)).toBe(content);
        expect(screen.getByTestId('query-result')).toHaveTextContent(JSON.stringify(graph));
        expect(screen.getByTestId('source-question')).toBeEmptyDOMElement();
        expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
        expect(screen.getByTestId('query-language')).toHaveTextContent(language);
        await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
        expect(api.analysis.executeText2Gql).toHaveBeenCalledTimes(1);
        if (language === 'gremlin') {
            expect(api.analysis.getExecutionQuery).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph', content);
        }
        else {
            expect(api.analysis.getCypherExecutionQuery).toHaveBeenLastCalledWith(
                'DEFAULT', 'hugegraph', {cypher: content}
            );
        }
    }
);


it.each(['gremlin', 'cypher'])(
    'repairs a %s execution failure once and keeps failed manual edits intact', async language => {
        const query = language === 'gremlin' ? "g.V().limit('three')" : 'MATCH (n) RETRN n';
        const fixed = language === 'gremlin' ? 'g.V().limit(3)' : 'MATCH (n) RETURN n LIMIT 3';
        const diagnostic = '非法的 Gremlin 语句，详细信息: No signature of method: GraphTraversal.limit(String)';
        api.analysis.streamText2Gql.mockResolvedValueOnce({status: 200, data: {query, language, valid: true}})
            .mockResolvedValueOnce({status: 200, data: {query: fixed, language, valid: true}});
        const failure = {response: {status: 400, data: {status: 460, message: diagnostic}}};
        // Exercise both a rejected HTTP response and a resolved business failure.
        if (language === 'gremlin') {
            api.analysis.executeText2Gql.mockRejectedValueOnce(failure);
        }
        else {
            api.analysis.executeText2Gql.mockResolvedValueOnce(failure.response.data);
        }
        api.analysis.executeText2Gql.mockResolvedValueOnce({status: 200, data: {}})
            .mockRejectedValueOnce(failure);
        render(
            <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
                <AnalysisHome />
            </GraphAnalysisContext.Provider>
        );
        await waitForInitialData();
        fireEvent.click(screen.getByRole('button', {name: 'Set model and question'}));
        if (language === 'cypher') {
            fireEvent.click(screen.getByRole('button', {name: 'Generate Cypher'}));
            fireEvent.click(screen.getByRole('button', {name: 'Set model and question'}));
        }
        await waitFor(() => expect(screen.getByRole('button', {name: 'Generate'})).toBeEnabled());
        await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Generate'})));
        expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(2);
        expect(api.analysis.streamText2Gql).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph',
            expect.objectContaining({language, question: 'Find people', repair: {query, error: diagnostic}}),
            expect.any(Object));
        expect(screen.getByTestId('query-content')).toHaveTextContent(fixed);
        expect(screen.getByTestId('query-status')).toHaveTextContent('success');
        fireEvent.click(screen.getByRole('button', {name: 'Edit query'}));
        await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
        expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId('query-content')).toHaveTextContent('g.E().limit(3)');
        expect(screen.getByTestId('query-status')).toHaveTextContent('failed');
        expect(screen.getByText(/query result failed/)).toHaveTextContent(diagnostic);
    }
);

it('keeps AI language drafts in memory while restoring only manual drafts after remount', async () => {
    const saved = "g.V().has('saved', true)";
    window.localStorage.setItem('hubble.query.alice.DEFAULT.hugegraph.Gremlin', saved);
    api.analysis.streamText2Gql.mockResolvedValue({status: 200,
        data: {valid: true, language: 'gremlin', query: 'g.V().limit(2)'}});
    api.analysis.executeText2Gql.mockResolvedValue({status: 200, data: {}});
    const workspace = (
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    const {unmount} = render(workspace);
    await waitForInitialData();
    fireEvent.click(screen.getByRole('button', {name: 'Set model and question'}));
    await waitFor(() => expect(screen.getByRole('button', {name: 'Generate'})).toBeEnabled());
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Generate'})));
    fireEvent.click(screen.getByRole('button', {name: 'Edit query'}));
    expect(screen.getByTestId('editor-source')).toHaveTextContent('ai');
    expect(window.localStorage.getItem('hubble.query.alice.DEFAULT.hugegraph.Gremlin')).toBe(saved);
    fireEvent.click(screen.getByRole('button', {name: 'Generate Cypher'}));
    fireEvent.click(screen.getByRole('button', {name: 'Edit Cypher'}));
    expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
    fireEvent.click(screen.getByRole('button', {name: 'Generate Gremlin'}));
    expect(screen.getByTestId('query-content')).toHaveTextContent('g.E().limit(3)');
    expect(screen.getByTestId('editor-source')).toHaveTextContent('ai');
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    expect(api.analysis.executeText2Gql).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph', 'gremlin',
        {content: 'g.E().limit(3)', text: 'Find people', read_only: true}, expect.any(Object));
    unmount();
    render(workspace);
    await waitForInitialData();
    expect(screen.getByTestId('query-content')).toHaveTextContent(saved);
    expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
    expect(window.localStorage.getItem('hubble.query.alice.DEFAULT.hugegraph.Cypher'))
        .toBe('MATCH (n) RETURN n LIMIT 4');
});

it('explicitly clears AI provenance before hand-written queries use the manual execution API', async () => {
    api.analysis.streamText2Gql.mockResolvedValue({status: 200,
        data: {valid: true, language: 'gremlin', query: 'g.V().limit(2)'}});
    api.analysis.executeText2Gql.mockResolvedValue({status: 200, data: {}});
    api.analysis.getExecutionQuery.mockResolvedValue({status: 200, data: {}});
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();
    fireEvent.click(screen.getByRole('button', {name: 'Set model and question'}));
    await waitFor(() => expect(screen.getByRole('button', {name: 'Generate'})).toBeEnabled());
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Generate'})));
    expect(screen.getByTestId('editor-source')).toHaveTextContent('ai');
    fireEvent.click(screen.getByRole('button', {name: 'Clear query'}));
    expect(screen.getByTestId('query-content')).toBeEmptyDOMElement();
    expect(screen.getByTestId('source-question')).toBeEmptyDOMElement();
    expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
    fireEvent.click(screen.getByRole('button', {name: 'Edit query'}));
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    expect(api.analysis.getExecutionQuery).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph', 'g.E().limit(3)');
    expect(api.analysis.executeText2Gql).toHaveBeenCalledTimes(1);
    expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('hubble.query.alice.DEFAULT.hugegraph.Gremlin')).toBe('g.E().limit(3)');
});

it('preserves manual content and provenance when switching model sources or configuration', async () => {
    api.analysis.getText2GqlConfig.mockResolvedValue({status: 200,
        data: {available: true, custom_available: true, model: 'company-model'}});
    api.analysis.getExecutionQuery.mockResolvedValue({status: 200, data: {}});
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();
    await waitFor(() => expect(screen.getByTestId('model-source')).toHaveTextContent('shared'));
    fireEvent.click(screen.getByRole('button', {name: 'Edit query'}));
    fireEvent.click(screen.getByRole('button', {name: 'Use custom model'}));
    expect(screen.getByTestId('model-source')).toHaveTextContent('custom');
    fireEvent.click(screen.getByRole('button', {name: 'Set model and question'}));
    expect(screen.getByTestId('query-content')).toHaveTextContent('g.E().limit(3)');
    expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
    fireEvent.click(screen.getByRole('button', {name: 'Use shared model'}));
    expect(screen.getByTestId('model-source')).toHaveTextContent('shared');
    expect(screen.getByTestId('query-content')).toHaveTextContent('g.E().limit(3)');
    expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    expect(api.analysis.getExecutionQuery).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph', 'g.E().limit(3)');
    expect(api.analysis.executeText2Gql).not.toHaveBeenCalled();
    expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
});

it.each(['rows', 'errors', 'late resolve', 'late reject'])(
    'clears account-scoped history and favorites on the same mounted graph (%s)', async previousState => {
        const pending = {execution: [], favorite: []};
        const load = source => (space, graph, params) => new Promise((resolve, reject) => {
            pending[source].push({
                user: JSON.parse(sessionStorage.getItem('user_')).user_name,
                params, resolve, reject,
            });
        });
        const records = content => ({status: 200, data: {records: [{content}], total: 20}});
        api.analysis.getExecutionLogs.mockImplementation(load('execution'));
        api.analysis.fetchFavoriteQueries.mockImplementation(load('favorite'));
        render(
            <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
                <AnalysisHome />
            </GraphAnalysisContext.Provider>
        );
        await waitFor(() => {
            expect(pending.execution).toHaveLength(1);
            expect(pending.favorite).toHaveLength(1);
        });
        await act(async () => {
            pending.execution[0].resolve(records('alice-first-history'));
            pending.favorite[0].resolve(records('alice-first-favorite'));
        });
        fireEvent.click(screen.getByRole('button', {name: 'Edit query'}));
        fireEvent.click(screen.getByRole('button', {name: 'Go execution page 2'}));
        fireEvent.click(screen.getByRole('button', {name: 'Go favorite page 2'}));
        await waitFor(() => {
            expect(pending.execution[pending.execution.length - 1].params.page_no).toBe(2);
            expect(pending.favorite[pending.favorite.length - 1].params.page_no).toBe(2);
        });
        const alice = {
            execution: pending.execution[pending.execution.length - 1],
            favorite: pending.favorite[pending.favorite.length - 1],
        };
        if (previousState === 'rows') {
            await act(async () => {
                alice.execution.resolve(records('alice-private-history'));
                alice.favorite.resolve(records('alice-private-favorite'));
            });
            expect(screen.getByText('alice-private-history')).toBeInTheDocument();
            expect(screen.getByText('alice-private-favorite')).toBeInTheDocument();
        }
        else if (previousState === 'errors') {
            await act(async () => {
                alice.execution.reject(new Error('alice history offline'));
                alice.favorite.reject(new Error('alice favorites offline'));
            });
            expect(screen.getByRole('button', {name: 'Retry records'})).toBeInTheDocument();
            expect(screen.getByRole('button', {name: 'Retry favorites'})).toBeInTheDocument();
        }
        await act(async () => setUser({id: 'bob', user_name: 'bob'}));
        await waitFor(() => {
            expect(pending.execution.some(request => request.user === 'bob')).toBe(true);
            expect(pending.favorite.some(request => request.user === 'bob')).toBe(true);
        });
        const bob = {
            execution: pending.execution[pending.execution.length - 1],
            favorite: pending.favorite[pending.favorite.length - 1],
        };
        expect(bob.execution).toMatchObject({user: 'bob', params: {page_no: 1, page_size: 10}});
        expect(bob.favorite).toMatchObject({user: 'bob', params: {page_no: 1, page_size: 10}});
        expect(screen.getByText('execution page 1')).toBeInTheDocument();
        expect(screen.getByText('favorite page 1')).toBeInTheDocument();
        expect(screen.queryByText('alice-private-history')).not.toBeInTheDocument();
        expect(screen.queryByText('alice-private-favorite')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Retry records'})).not.toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Retry favorites'})).not.toBeInTheDocument();
        expect(screen.getByTestId('query-content')).toBeEmptyDOMElement();
        expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
        expect(window.localStorage.getItem('hubble.query.bob.DEFAULT.hugegraph.Gremlin')).toBeNull();
        if (previousState.startsWith('late')) {
            await act(async () => {
                for (const source of ['execution', 'favorite']) {
                    if (previousState === 'late resolve') {
                        alice[source].resolve(records(`alice-late-${source}`));
                    }
                    else {
                        alice[source].reject(new Error(`alice late ${source} failed`));
                    }
                }
            });
            expect(screen.queryByText('alice-late-execution')).not.toBeInTheDocument();
            expect(screen.queryByText('alice-late-favorite')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', {name: 'Retry records'})).not.toBeInTheDocument();
            expect(screen.queryByRole('button', {name: 'Retry favorites'})).not.toBeInTheDocument();
        }
        expect(screen.getByText('execution loading true')).toBeInTheDocument();
        expect(screen.getByText('favorite loading true')).toBeInTheDocument();
        await act(async () => {
            bob.execution.resolve(records('bob-current-history'));
            bob.favorite.resolve(records('bob-current-favorite'));
        });
        expect(screen.getByTestId('query-content')).toHaveTextContent('bob-current-history');
        expect(screen.getByText('bob-current-favorite')).toBeInTheDocument();
        expect(screen.getByText('execution loading false')).toBeInTheDocument();
        expect(screen.getByText('favorite loading false')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Load favorite statement'}));
        expect(window.localStorage.getItem('hubble.query.bob.DEFAULT.hugegraph.Gremlin')).toBe('bob-current-favorite');
        expect(window.localStorage.getItem('hubble.query.alice.DEFAULT.hugegraph.Gremlin')).toBe('g.E().limit(3)');
    }
);


it.each(['gremlin', 'cypher'])('updates and freezes %s timing, clearing on graph changes', async language => {
    let resolveQuery;
    const request = new Promise(resolve => {
        resolveQuery = resolve;
    });
    const apiCall = language === 'gremlin' ? api.analysis.getExecutionQuery : api.analysis.getCypherExecutionQuery;
    apiCall.mockReturnValueOnce(request);
    const workspace = graph => (
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    const {rerender} = render(workspace('hugegraph'));
    await waitForInitialData();
    if (language === 'cypher') {
        fireEvent.click(screen.getByRole('button', {name: 'Cypher'}));
    }
    jest.useFakeTimers();
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
        fireEvent.click(screen.getByRole('button', {name: 'Run current'}));
        expect(screen.getByTestId('execution-duration')).toHaveTextContent('0');
        now.mockReturnValue(1280);
        act(() => jest.advanceTimersByTime(250));
        expect(screen.getByTestId('execution-duration')).toHaveTextContent('280');
        now.mockReturnValue(1590);
        await act(async () => resolveQuery({status: 200, data: {}}));
        expect(screen.getByTestId('execution-duration')).toHaveTextContent('590');
        now.mockReturnValue(2590);
        act(() => jest.advanceTimersByTime(1000));
        expect(screen.getByTestId('execution-duration')).toHaveTextContent('590');
        await act(async () => rerender(workspace('other-graph')));
        expect(screen.getByTestId('execution-duration')).toBeEmptyDOMElement();
    }
    finally {
        now.mockRestore();
        jest.useRealTimers();
    }
});

it('does not include LLM generation in database execution timing or accept stale completion', async () => {
    let resolveModel;
    let resolveQuery;
    api.analysis.streamText2Gql.mockReturnValueOnce(new Promise(resolve => {
        resolveModel = resolve;
    }));
    api.analysis.executeText2Gql.mockReturnValueOnce(new Promise(resolve => {
        resolveQuery = resolve;
    }));
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <AnalysisHome />
        </GraphAnalysisContext.Provider>
    );
    await waitForInitialData();
    fireEvent.click(screen.getByRole('button', {name: 'Set model and question'}));
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
        fireEvent.click(screen.getByRole('button', {name: 'Generate'}));
        expect(screen.getByTestId('execution-duration')).toBeEmptyDOMElement();
        now.mockReturnValue(4000);
        await act(async () => resolveModel({status: 200,
            data: {valid: true, language: 'gremlin', query: 'g.V().limit(2)'}}));
        expect(screen.getByTestId('execution-duration')).toHaveTextContent('0');
        fireEvent.click(screen.getByRole('button', {name: 'Clear query'}));
        now.mockReturnValue(4500);
        await act(async () => resolveQuery({status: 200, data: {}}));
        expect(screen.getByTestId('execution-duration')).toBeEmptyDOMElement();
    }
    finally {
        now.mockRestore();
    }
});


it('restores the latest execution statement and its own question without executing or generating', async () => {
    const metadata = pendingResponse();
    api.analysis.getText2GqlConfig.mockReturnValueOnce(metadata.promise);
    api.analysis.getExecutionLogs.mockResolvedValue(historyResponse([
        {content: 'g.V().limit(7)', text: 'Latest question'},
        {content: 'g.E()', text: 'Older unrelated question'},
    ]));
    render(homeFor());
    await waitFor(() => expect(screen.getByTestId('query-content')).toHaveTextContent('g.V().limit(7)'));
    expect(screen.getByTestId('source-question')).toHaveTextContent('Latest question');
    expect(screen.getByTestId('editor-source')).toHaveTextContent('ai');
    expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
    expect(api.analysis.executeText2Gql).not.toHaveBeenCalled();
    expect(api.analysis.getExecutionQuery).not.toHaveBeenCalled();
    expect(api.analysis.getCypherExecutionQuery).not.toHaveBeenCalled();
    await act(async () => metadata.resolve({status: 200, data: {available: true, model: 'shared'}}));
    expect(screen.getByTestId('source-question')).toHaveTextContent('Latest question');
    expect(screen.getByTestId('editor-source')).toHaveTextContent('ai');
    api.analysis.executeText2Gql.mockResolvedValue({status: 200, data: {}});
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    expect(api.analysis.executeText2Gql).toHaveBeenCalledWith('DEFAULT', 'hugegraph', 'gremlin',
        {content: 'g.V().limit(7)', text: 'Latest question', read_only: true}, expect.any(Object));
});

it('restores a manual latest statement with an empty question, ignoring older natural-language records', async () => {
    api.analysis.getExecutionLogs.mockResolvedValue(historyResponse([
        {content: 'g.E().limit(8)'},
        {content: 'g.V()', text: 'Must not be borrowed'},
    ]));
    render(homeFor());
    await waitFor(() => expect(screen.getByTestId('query-content')).toHaveTextContent('g.E().limit(8)'));
    expect(screen.getByTestId('source-question')).toBeEmptyDOMElement();
    expect(screen.getByTestId('editor-source')).toHaveTextContent('manual');
    expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
});

it('restores each language once and preserves its edited question and statement after switching back', async () => {
    api.analysis.getExecutionLogs.mockImplementation((space, graph, params) => Promise.resolve(historyResponse([
        params.type === EXECUTION_LOGS_TYPE.Cypher
            ? {content: 'MATCH (n) RETURN n LIMIT 8', text: 'Cypher history question'}
            : {content: 'g.V().limit(8)', text: 'Gremlin history question'},
    ])));
    render(homeFor());
    await waitFor(() => expect(screen.getByTestId('source-question')).toHaveTextContent('Gremlin history question'));
    fireEvent.click(screen.getByRole('button', {name: 'Edit question'}));
    fireEvent.click(screen.getByRole('button', {name: 'Edit query'}));
    fireEvent.click(screen.getByRole('button', {name: 'Cypher'}));
    await waitFor(() => expect(screen.getByTestId('source-question')).toHaveTextContent('Cypher history question'));
    expect(screen.getByTestId('query-content')).toHaveTextContent('MATCH (n) RETURN n LIMIT 8');
    fireEvent.click(screen.getByRole('button', {name: 'Edit Cypher'}));
    fireEvent.click(screen.getByRole('button', {name: 'Generate Gremlin'}));
    await waitFor(() => expect(screen.getByText('execution loading false')).toBeInTheDocument());
    expect(screen.getByTestId('query-content')).toHaveTextContent('g.E().limit(3)');
    expect(screen.getByTestId('source-question')).toHaveTextContent('New question');
    fireEvent.click(screen.getByRole('button', {name: 'Cypher'}));
    await waitFor(() => expect(screen.getByText('execution loading false')).toBeInTheDocument());
    expect(screen.getByTestId('query-content')).toHaveTextContent('MATCH (n) RETURN n LIMIT 4');
    expect(screen.getByTestId('source-question')).toHaveTextContent('Cypher history question');
    expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
});

it('isolates automatic history restoration by graph space, graph and account', async () => {
    api.analysis.getExecutionLogs.mockImplementation((space, graph) => {
        const user = JSON.parse(sessionStorage.getItem('user_')).user_name;
        return Promise.resolve(historyResponse([{content: `${user}/${space}/${graph}`, text: `${user} ${graph}`}]));
    });
    const view = render(homeFor('one'));
    await waitFor(() => expect(screen.getByTestId('query-content')).toHaveTextContent('alice/DEFAULT/one'));
    view.rerender(homeFor('two'));
    await waitFor(() => expect(screen.getByTestId('query-content')).toHaveTextContent('alice/DEFAULT/two'));
    expect(screen.getByTestId('source-question')).toHaveTextContent('alice two');
    view.rerender(homeFor('two', 'another-space'));
    await waitFor(() => expect(screen.getByTestId('query-content')).toHaveTextContent('alice/another-space/two'));
    await act(async () => setUser({user_name: 'bob'}));
    await waitFor(() => expect(screen.getByTestId('query-content')).toHaveTextContent('bob/another-space/two'));
    expect(screen.getByTestId('source-question')).toHaveTextContent('bob two');
});

it.each(['statement', 'question', 'clear', 'run', 'favorite'])(
    'does not overwrite an editor changed by %s while initial history is pending', async interaction => {
        const history = pendingResponse();
        api.analysis.getExecutionLogs.mockReturnValue(history.promise);
        api.analysis.fetchFavoriteQueries.mockResolvedValue(historyResponse([{content: 'g.V().limit(99)'}]));
        api.analysis.getExecutionQuery.mockResolvedValue({status: 200, data: {}});
        render(homeFor());
        await waitFor(() => expect(screen.getByRole('button', {name: 'Load favorite statement'})).toBeEnabled());
        const actions = {statement: 'Edit query', question: 'Edit question', clear: 'Clear query',
            run: 'Run current', favorite: 'Load favorite statement'};
        await act(async () => fireEvent.click(screen.getByRole('button', {name: actions[interaction]})));
        const statement = screen.getByTestId('query-content').textContent;
        const question = screen.getByTestId('source-question').textContent;
        await act(async () => history.resolve(historyResponse([{content: 'late statement', text: 'late question'}])));
        expect(screen.getByTestId('query-content').textContent).toBe(statement);
        expect(screen.getByTestId('source-question').textContent).toBe(question);
        expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
        expect(api.analysis.getExecutionQuery).toHaveBeenCalledTimes(interaction === 'run' ? 1 : 0);
    }
);

it('never restores records again during pagination or result refreshes', async () => {
    let revision = 0;
    api.analysis.getExecutionLogs.mockImplementation((space, graph, params) => Promise.resolve(historyResponse([
        {content: `history page ${params.page_no} revision ${revision++}`, text: 'Historical question'},
    ])));
    api.analysis.executeText2Gql.mockResolvedValue({status: 200, data: {}});
    render(homeFor());
    await waitFor(() => expect(screen.getByTestId('query-content')).toHaveTextContent('history page 1 revision 0'));
    fireEvent.click(screen.getByRole('button', {name: 'Go execution page 2'}));
    await waitFor(() => expect(screen.getByText('execution loading false')).toBeInTheDocument());
    expect(screen.getByTestId('query-content')).toHaveTextContent('history page 1 revision 0');
    fireEvent.click(screen.getByRole('button', {name: 'Go execution page 1'}));
    await waitFor(() => expect(screen.getByText('execution loading false')).toBeInTheDocument());
    expect(screen.getByTestId('query-content')).toHaveTextContent('history page 1 revision 0');
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    expect(screen.getByTestId('query-content')).toHaveTextContent('history page 1 revision 0');
    expect(screen.getByTestId('source-question')).toHaveTextContent('Historical question');
});

it.each([false, true])('keeps a failed history fallback until retry or user editing (%s)', async edited => {
    localStorage.setItem('hubble.query.alice.DEFAULT.hugegraph.Gremlin', 'g.V().limit(77)');
    api.analysis.getExecutionLogs.mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(historyResponse([{content: 'retry record', text: 'retry question'}]));
    render(homeFor());
    await screen.findByRole('button', {name: 'Retry records'});
    expect(screen.getByTestId('query-content')).toHaveTextContent('g.V().limit(77)');
    if (edited) {
        fireEvent.click(screen.getByRole('button', {name: 'Edit query'}));
    }
    fireEvent.click(screen.getByRole('button', {name: 'Retry records'}));
    await waitFor(() => expect(screen.getByText('execution loading false')).toBeInTheDocument());
    expect(screen.getByTestId('query-content')).toHaveTextContent(edited ? 'g.E().limit(3)' : 'retry record');
    expect(screen.getByTestId('source-question').textContent).toBe(edited ? '' : 'retry question');
});


it('restores an untouched language after switching away and back before its initial history returns', async () => {
    const requests = [];
    api.analysis.getExecutionLogs.mockImplementation((space, graph, params) => {
        const response = pendingResponse();
        requests.push({...response, type: params.type});
        return response.promise;
    });
    render(homeFor());
    await act(async () => Promise.resolve());
    await waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Cypher'})));
    await waitFor(() => expect(requests).toHaveLength(2));
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Generate Gremlin'})));
    await waitFor(() => expect(requests).toHaveLength(3));
    await act(async () => {
        requests[0].resolve(historyResponse([{content: 'obsolete Gremlin', text: 'obsolete question'}]));
        requests[1].resolve(historyResponse([{content: 'obsolete Cypher', text: 'another question'}]));
    });
    expect(screen.getByTestId('query-content')).toHaveTextContent('g.V().limit(10)');
    expect(screen.getByTestId('source-question')).toBeEmptyDOMElement();
    await act(async () => requests[2].resolve(historyResponse([
        {content: 'g.V().limit(42)', text: 'Current Gremlin question'},
    ])));
    expect(screen.getByTestId('query-content')).toHaveTextContent('g.V().limit(42)');
    expect(screen.getByTestId('source-question')).toHaveTextContent('Current Gremlin question');
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Cypher'})));
    await waitFor(() => expect(requests).toHaveLength(4));
    await act(async () => requests[3].resolve(historyResponse([
        {content: 'MATCH (n) RETURN n LIMIT 42', text: 'Current Cypher question'},
    ])));
    expect(screen.getByTestId('query-content')).toHaveTextContent('MATCH (n) RETURN n LIMIT 42');
    expect(screen.getByTestId('source-question')).toHaveTextContent('Current Cypher question');
});


it.each([
    ['gremlin', 'ai'], ['cypher', 'ai'], ['gremlin', 'manual'], ['cypher', 'manual'],
])('submits %s %s statements asynchronously while preserving execution provenance', async (language, source) => {
    api.analysis.getExecutionLogs.mockImplementation((space, graph, params) => Promise.resolve(historyResponse([
        {content: params.type === EXECUTION_LOGS_TYPE.Cypher ? 'MATCH (n) RETURN n' : 'g.V()',
            text: source === 'ai' ? `Original ${params.type} question` : undefined},
    ])));
    const submit = language === 'gremlin' ? api.analysis.getExecutionTask : api.analysis.getCypherTask;
    submit.mockResolvedValue({status: 200, data: {task_id: 42}});
    render(homeFor());
    await waitFor(() => expect(screen.getByText('execution loading false')).toBeInTheDocument());
    if (language === 'cypher') {
        await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Cypher'})));
    }
    const historyType = EXECUTION_LOGS_TYPE[language === 'gremlin' ? 'Gremlin' : 'Cypher'];
    const original = source === 'ai' ? `Original ${historyType}`
        + ' question' : '';
    await waitFor(() => expect(screen.getByTestId('source-question').textContent).toBe(original));
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Use async'})));
    fireEvent.click(screen.getByRole('button', {name: 'Edit question'}));
    fireEvent.click(screen.getByRole('button', {name: language === 'gremlin' ? 'Edit query' : 'Edit Cypher'}));
    const content = screen.getByTestId('query-content').textContent;
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    if (source === 'ai') {
        expect(submit).toHaveBeenCalledWith('DEFAULT', 'hugegraph',
            {content, text: original, read_only: true}, {signal: expect.any(Object)});
    }
    else {
        expect(submit).toHaveBeenCalledWith('DEFAULT', 'hugegraph', {content});
    }
    expect(screen.getByTestId('editor-source')).toHaveTextContent(source);
    expect(screen.getByTestId('async-task')).toHaveTextContent('42');
    expect(screen.getByTestId('result-mode')).toHaveTextContent('task');
    expect(screen.getByTestId('query-status')).toHaveTextContent('success');
    expect(screen.getByTestId('execution-duration')).toBeEmptyDOMElement();
    expect(screen.getByTestId('query-content').textContent).toBe(content);
    expect(screen.getByTestId('source-question')).toHaveTextContent('New question');
    expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
    expect(api.analysis.executeText2Gql).not.toHaveBeenCalled();
});

it.each(['rejected request', 'business failure'])(
    'does not generate or repair an AI asynchronous task after %s', async mode => {
        api.analysis.getExecutionLogs.mockResolvedValue(historyResponse([
            {content: 'g.V()', text: 'Original question'},
        ]));
        if (mode === 'rejected request') {
            api.analysis.getExecutionTask.mockRejectedValue(new Error('Read-only submission rejected'));
        }
        else {
            api.analysis.getExecutionTask.mockResolvedValue({status: 460, message: 'Read-only submission rejected'});
        }
        render(homeFor());
        await waitFor(() => expect(screen.getByTestId('editor-source')).toHaveTextContent('ai'));
        await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Use async'})));
        await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
        expect(screen.getByTestId('query-status')).toHaveTextContent('failed');
        expect(screen.getByTestId('editor-source')).toHaveTextContent('ai');
        expect(screen.getByTestId('execution-duration')).toBeEmptyDOMElement();
        expect(api.analysis.getExecutionTask).toHaveBeenCalledTimes(1);
        expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
    }
);

it.each(['cancel', 'graph', 'language', 'account'])(
    'ignores an AI task response and its history refresh after %s', async change => {
        const task = pendingResponse();
        api.analysis.getExecutionLogs.mockResolvedValue(historyResponse([{content: 'g.V()', text: 'Task question'}]));
        api.analysis.getExecutionTask.mockReturnValue(task.promise);
        const view = render(homeFor());
        await waitFor(() => expect(screen.getByTestId('editor-source')).toHaveTextContent('ai'));
        await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Use async'})));
        fireEvent.click(screen.getByRole('button', {name: 'Run current'}));
        const signal = api.analysis.getExecutionTask.mock.calls[0][3].signal;
        expect(screen.getByTestId('result-mode')).toHaveTextContent('task');
        expect(screen.getByTestId('query-status')).toHaveTextContent('loading');
        expect(screen.getByTestId('query-progress')).toBeEmptyDOMElement();
        if (change === 'graph') {
            view.rerender(homeFor('another-graph'));
        }
        else if (change === 'account') {
            await act(async () => setUser({user_name: 'bob'}));
        }
        else {
            await act(async () => fireEvent.click(screen.getByRole('button', {
                name: change === 'language' ? 'Cypher' : 'Cancel generation',
            })));
        }
        await act(async () => Promise.resolve());
        expect(signal.aborted).toBe(true);
        const historyCalls = api.analysis.getExecutionLogs.mock.calls.length;
        await act(async () => task.resolve({status: 200, data: {task_id: 42}}));
        expect(screen.getByTestId('async-task')).toBeEmptyDOMElement();
        expect(screen.getByTestId('query-status')).toHaveTextContent('standby');
        expect(api.analysis.getExecutionLogs).toHaveBeenCalledTimes(historyCalls);
        expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
    }
);

it.each([false, true])('generates and executes using the chosen asynchronous mode (%s)', async asyncTask => {
    api.analysis.streamText2Gql.mockResolvedValue({status: 200,
        data: {valid: true, language: 'gremlin', query: 'g.V()'}});
    api.analysis.executeText2Gql.mockResolvedValue({status: 200, data: {}});
    api.analysis.getExecutionTask.mockResolvedValue({status: 200, data: {task_id: 42}});
    render(homeFor());
    await waitForInitialData();
    fireEvent.click(screen.getByRole('button', {name: 'Set model and question'}));
    if (asyncTask) {
        fireEvent.click(screen.getByRole('button', {name: 'Use async'}));
    }
    await waitFor(() => expect(screen.getByRole('button', {name: 'Generate'})).toBeEnabled());
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Generate'})));
    if (asyncTask) {
        expect(api.analysis.getExecutionTask).toHaveBeenCalledWith('DEFAULT', 'hugegraph',
            {content: 'g.V()', text: 'Find people', read_only: true}, {signal: expect.any(Object)});
        expect(api.analysis.executeText2Gql).not.toHaveBeenCalled();
        expect(screen.getByTestId('async-task')).toHaveTextContent('42');
        expect(screen.getByTestId('execution-duration')).toBeEmptyDOMElement();
    }
    else {
        expect(api.analysis.executeText2Gql).toHaveBeenCalledTimes(1);
        expect(api.analysis.getExecutionTask).not.toHaveBeenCalled();
    }
    expect(api.analysis.getCypherTask).not.toHaveBeenCalled();
    expect(screen.getByTestId('result-mode')).toHaveTextContent(asyncTask ? 'task' : 'query');
});

it('does not treat a controlled editor echo as editing before latest history loads', async () => {
    const history = pendingResponse();
    api.analysis.getExecutionLogs.mockReturnValue(history.promise);
    render(homeFor());
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole('button', {name: 'Echo current query'}));
    await act(async () => history.resolve(historyResponse([{content: 'g.V().limit(19)', text: 'Saved question'}])));
    expect(screen.getByTestId('query-content')).toHaveTextContent('g.V().limit(19)');
    expect(screen.getByTestId('source-question')).toHaveTextContent('Saved question');
});


it('shows model generation progress after a previous task while hiding it during submission', async () => {
    const generation = pendingResponse();
    const submission = pendingResponse();
    api.analysis.getExecutionLogs.mockResolvedValue(historyResponse([{content: 'g.V()', text: 'Task question'}]));
    api.analysis.getExecutionTask.mockResolvedValueOnce({status: 200, data: {task_id: 42}})
        .mockReturnValueOnce(submission.promise);
    api.analysis.streamText2Gql.mockReturnValue(generation.promise);
    render(homeFor());
    await waitFor(() => expect(screen.getByTestId('editor-source')).toHaveTextContent('ai'));
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Use async'})));
    await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Run current'})));
    expect(screen.getByTestId('async-task')).toHaveTextContent('42');
    fireEvent.click(screen.getByRole('button', {name: 'Set model and question'}));
    fireEvent.click(screen.getByRole('button', {name: 'Generate'}));
    expect(screen.getByTestId('query-progress')).toHaveTextContent('waiting');
    expect(screen.getByTestId('result-mode')).toHaveTextContent('query');
    await act(async () => generation.resolve({status: 200,
        data: {valid: true, language: 'gremlin', query: 'g.V().limit(2)'}}));
    expect(screen.getByTestId('query-progress')).toBeEmptyDOMElement();
    expect(screen.getByTestId('result-mode')).toHaveTextContent('task');
    await act(async () => submission.resolve({status: 200, data: {task_id: 43}}));
    expect(screen.getByTestId('async-task')).toHaveTextContent('43');
});


it.each([
    ['gremlin', '6', 'GREMLIN_ASYNC'],
    ['cypher', '7', 'CYPHER_ASYNC'],
])('restores the latest %s asynchronous record from combined execution history', async (language, type, asyncType) => {
    const content = language === 'gremlin' ? 'g.V().limit(99)' : 'MATCH (n) RETURN n LIMIT 99';
    api.analysis.getExecutionLogs.mockImplementation((space, graph, params) => Promise.resolve(params.type === type
        ? historyResponse([
            {id: 2, content, text: 'Latest asynchronous question', type: asyncType, status: 'ASYNC_TASK_SUCCESS'},
            {id: 1, content: 'Older synchronous statement', text: 'Older synchronous question', status: 'SUCCESS'},
        ]) : okList));
    render(homeFor());
    if (language === 'cypher') {
        await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Cypher'})));
    }
    await waitFor(() => expect(screen.getByTestId('query-content')).toHaveTextContent(content));
    expect(api.analysis.getExecutionLogs).toHaveBeenLastCalledWith('DEFAULT', 'hugegraph',
        {page_size: 10, page_no: 1, type});
    expect(screen.getByTestId('source-question')).toHaveTextContent('Latest asynchronous question');
    expect(screen.getByTestId('editor-source')).toHaveTextContent('ai');
    expect(screen.getByTestId('query-language')).toHaveTextContent(language);
    expect(screen.getByTestId('query-status')).toHaveTextContent('standby');
    expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
    expect(api.analysis.executeText2Gql).not.toHaveBeenCalled();
    expect(api.analysis.getExecutionQuery).not.toHaveBeenCalled();
    expect(api.analysis.getCypherExecutionQuery).not.toHaveBeenCalled();
    expect(api.analysis.getExecutionTask).not.toHaveBeenCalled();
    expect(api.analysis.getCypherTask).not.toHaveBeenCalled();
});
