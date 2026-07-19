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

/**
 * @file 图算法 Home
 */

import React, {useCallback, useState, useEffect, useContext, useRef} from 'react';
import AlgorithmFormHome from '../algorithmsForm/Home';
import GraphResult from '../GraphResult/Home';
import LogsDetail from '../LogsDetail/Home';
import GraphAnalysisContext from '../../Context';
import {GRAPH_STATUS, PANEL_TYPE, GRAPH_RENDER_MODE, useTranslatedConstants} from '../../../utils/constants';
import * as api from '../../../api';
import _ from 'lodash';
import c from './index.module.scss';



const AlgorithmHome = () => {
    const {ALGORITHM_MODE} = useTranslatedConstants();

    const {STANDBY} = GRAPH_STATUS;
    const {CLOSED} = PANEL_TYPE;
    const {OLTP, OLAP} = ALGORITHM_MODE;
    const {CANVAS2D} = GRAPH_RENDER_MODE;
    const defaultPageParams = {page: 1, pageSize: 10};
    const TYPE  = {GREMLIN: '0', ALGORITHM: '1', CYPHER: '2'};

    const {graphSpace, graph} = useContext(GraphAnalysisContext);

    const [metaData, setMetaData] = useState();
    const [propertyKeysRecords, setPropertyKeysRecords] = useState();
    const [graphNums, setGraphNums] = useState({vertexCount: -1, edgeCount: -1});
    const [algorithmMode, setAlgorithmMode] = useState();
    const [queryStatus, setQueryStatus] = useState(STANDBY);
    const [queryMessage, setQueryMessage] = useState();
    const [queryResult, setQueryResult] = useState();
    const [asyncTaskResult, setAsyncTaskResult] = useState();
    const [graphOptions, setGraphOptions] = useState();
    const [panelType, setPanelType] = useState(CLOSED);
    const [algorithmOnCanvas, setAlgorithmOnCanvas] = useState();
    const [pageExecute, setExecutePage] = useState(defaultPageParams.page);
    const [pageFavorite, setFavoritePage] = useState(defaultPageParams.page);
    const [pageSize, setPageSize] = useState(defaultPageParams.pageSize);
    const [executionLogsLoading, setExecutionLogsLoading] = useState(false);
    const [favoriteQueriesLoading, setFavoriteQueriesLoading] = useState(false);
    const [executionLogsError, setExecutionLogsError] = useState(false);
    const [favoriteQueriesError, setFavoriteQueriesError] = useState(false);
    const [favorSearch, setFavorSearch] = useState();
    const [sortMode, setSortMode] = useState();
    const [favoriteQueriesData, setFavoriteQueriesData] = useState({});
    const [executionLogsData, setExecutionLogsData] = useState({});
    const [graphRenderMode, setGraphRenderMode] = useState(CANVAS2D);
    const executionLogsRequest = useRef(null);
    const favoriteQueriesRequest = useRef(null);
    const graphNumsRequest = useRef(null);

    useEffect(() => () => {
        executionLogsRequest.current = null;
        favoriteQueriesRequest.current = null;
        graphNumsRequest.current = null;
    }, []);

    const initQueryResult = useCallback(
        () => {
            setQueryStatus(STANDBY);
            setQueryMessage();
            setQueryResult({});
            setPanelType(CLOSED);
        },
        [CLOSED, STANDBY]
    );

    const getMetaData = useCallback(
        async () => {
            let edgeMeta;
            let vertexMeta;
            const edgeMetaResponse = await api.manage.getMetaEdgeList(graphSpace, graph, {page_size: -1});
            if (edgeMetaResponse.status === 200) {
                edgeMeta = edgeMetaResponse.data.records;
            }
            const vertexMetaResponse = await api.manage.getMetaVertexList(graphSpace, graph, {page_size: -1});
            if (vertexMetaResponse.status === 200) {
                vertexMeta = vertexMetaResponse.data.records;
            }
            setMetaData({edgeMeta, vertexMeta});
        },
        [graph, graphSpace]
    );

    const getPropertykeys = useCallback(
        async () => {
            const response = await api.manage.getMetaPropertyList(graphSpace, graph, {page_size: -1});
            if (response.status === 200) {
                setPropertyKeysRecords(response?.data?.records ?? []);
            }
        },
        [graph, graphSpace]
    );

    const getGraphNumsInfo = useCallback(
        async () => {
            const request = Symbol('algorithm-graph-counts');
            graphNumsRequest.current = request;
            setGraphNums({vertexCount: -1, edgeCount: -1});
            const response = await api.analysis.getGraphData(graphSpace, graph);
            if (graphNumsRequest.current !== request) {
                return;
            }
            const {status, data} = response || {};
            if (status === 200) {
                const {vertexcount, edgecount} = data || {};
                setGraphNums({vertexCount: vertexcount, edgeCount: edgecount});
            }
        },
        [graph, graphSpace]
    );

    const getFavoriteQueriesList = useCallback(
        async () => {
            const request = Symbol('algorithm-favorites');
            favoriteQueriesRequest.current = request;
            const params = {
                'page_size': pageSize,
                'page_no': pageFavorite,
                'content': favorSearch,
                'time_order': sortMode,
                'type': 'ALGORITHM',
            };
            setFavoriteQueriesLoading(true);
            setFavoriteQueriesError(false);
            setFavoriteQueriesData({});
            try {
                const response = await api.analysis.fetchFavoriteQueries(
                    graphSpace, graph, params
                );
                if (favoriteQueriesRequest.current !== request) {
                    return;
                }
                const {status, data} = response || {};
                if (status !== 200) {
                    throw new Error('algorithm favorites unavailable');
                }
                setFavoriteQueriesData({
                    records: data?.records ?? [],
                    total: data?.total ?? 0,
                });
            }
            catch {
                if (favoriteQueriesRequest.current === request) {
                    setFavoriteQueriesError(true);
                }
            }
            finally {
                if (favoriteQueriesRequest.current === request) {
                    setFavoriteQueriesLoading(false);
                }
            }
        },
        [favorSearch, graph, graphSpace, pageFavorite, pageSize, sortMode]
    );

    const getExecutionLogsList = useCallback(
        async () => {
            const request = Symbol('algorithm-logs');
            executionLogsRequest.current = request;
            const params = {'page_size': pageSize, 'page_no': pageExecute, 'type': TYPE.ALGORITHM};
            setExecutionLogsLoading(true);
            setExecutionLogsError(false);
            setExecutionLogsData({});
            try {
                const response = await api.analysis.getExecutionLogs(
                    graphSpace, graph, params
                );
                if (executionLogsRequest.current !== request) {
                    return;
                }
                const {status, data} = response || {};
                if (status !== 200) {
                    throw new Error('algorithm logs unavailable');
                }
                setExecutionLogsData({
                    records: data?.records ?? [],
                    total: data?.total ?? 0,
                });
            }
            catch {
                if (executionLogsRequest.current === request) {
                    setExecutionLogsError(true);
                }
            }
            finally {
                if (executionLogsRequest.current === request) {
                    setExecutionLogsLoading(false);
                }
            }
        },
        [TYPE.ALGORITHM, graph, graphSpace, pageExecute, pageSize]
    );

    const onFavoriteRefresh = useCallback(() => {
        getFavoriteQueriesList();
    }, [getFavoriteQueriesList]);

    const retryExecutionLogs = useCallback(() => {
        getExecutionLogsList();
    }, [getExecutionLogsList]);

    const retryFavoriteQueries = useCallback(() => {
        getFavoriteQueriesList();
    }, [getFavoriteQueriesList]);

    useEffect(
        () => {
            getExecutionLogsList();
            getFavoriteQueriesList();
        },
        [getExecutionLogsList, getFavoriteQueriesList]
    );

    useEffect(
        () => {
            if (pageFavorite > 1
                && !favoriteQueriesLoading
                && !favoriteQueriesError
                && Array.isArray(favoriteQueriesData.records)
                && _.isEmpty(favoriteQueriesData.records)) {
                setFavoritePage(pageFavorite - 1);
            }
        },
        [favoriteQueriesData, favoriteQueriesError, favoriteQueriesLoading,
            pageFavorite, pageSize]
    );

    const resetGraphInfo = useCallback(
        () => {
            getMetaData();
            getPropertykeys();
            getGraphNumsInfo();
        },
        [getGraphNumsInfo, getMetaData, getPropertykeys]
    );

    const onResetPage = useCallback(
        () => {
            setExecutePage(defaultPageParams.page);
            setFavoritePage(defaultPageParams.page);
        }, [defaultPageParams.page]
    );

    useEffect(() => {
        if (graphSpace && graph) {
            resetGraphInfo();
        }
        initQueryResult();
        onResetPage();
    }, [graph, graphSpace, initQueryResult, onResetPage, resetGraphInfo]);


    const handleUpdateCurrentAlgorithm = useCallback(value => {
        setAlgorithmOnCanvas(value);
    }, []);

    const handleOltpFormSubmit = useCallback(
        (status, data, message, options) => {
            setPanelType(CLOSED);
            setGraphRenderMode(CANVAS2D);
            setAlgorithmMode(OLTP);
            setAsyncTaskResult();
            setQueryStatus(status);
            setQueryResult(data);
            setQueryMessage(message);
            options && setGraphOptions(options);
            getExecutionLogsList();
        },
        [CANVAS2D, CLOSED, OLTP, getExecutionLogsList]
    );

    const handleOlapFormSubmit = useCallback(
        (status, data, message) => {
            setPanelType(CLOSED);
            setAlgorithmMode(OLAP);
            setQueryResult({});
            setQueryStatus(status);
            setAsyncTaskResult(data);
            setQueryMessage(message || '');
        },
        [CLOSED, OLAP]
    );

    const resetGraphStatus = useCallback(
        (status, message, data) => {
            setPanelType(CLOSED);
            setAlgorithmMode(OLTP);
            setAlgorithmOnCanvas();
            setGraphOptions();
            status && setQueryStatus(status);
            message && setQueryMessage(message);
            data && setQueryResult(data);
        }, [CLOSED, OLTP]);

    const updatePanelType = useCallback(type => {
        setPanelType(type);
    }, []);

    const onExecutePageChange = useCallback((page, pageSize) => {
        setExecutePage(page);
        setPageSize(pageSize);
    }, []);

    const onFavoritePageChange = useCallback((page, pageSize) => {
        setFavoritePage(page);
        setPageSize(pageSize);
    }, []);

    const onChangeFavorSearch = useCallback(values => {
        setFavorSearch(values);
    }, []);

    const onSortChange = useCallback((pagination, filters, sort) => {
        setSortMode(sort.order === 'ascend' ? 'asc' : 'desc');
    }, []);

    const onGraphRenderModeChange = useCallback(
        value => {
            setGraphRenderMode(value);
        },
        []
    );

    return (
        <>
            <div className={c.algorithmContent}>
                <AlgorithmFormHome
                    handleOltpFormSubmit={handleOltpFormSubmit}
                    handleOlapFormSubmit={handleOlapFormSubmit}
                    currentAlgorithm={algorithmOnCanvas}
                    updateCurrentAlgorithm={handleUpdateCurrentAlgorithm}
                    graphNums={graphNums}
                    metaData={metaData}
                    graphSpace={graphSpace}
                    graph={graph}
                />
                <GraphResult
                    data={queryResult}
                    metaData={metaData}
                    options={graphOptions}
                    asyncTaskId={asyncTaskResult}
                    queryStatus={queryStatus}
                    queryMessage={queryMessage}
                    isQueryMode={algorithmMode === OLTP}
                    algorithm={algorithmOnCanvas}
                    panelType={panelType}
                    graphNums={graphNums}
                    propertyKeysRecords={propertyKeysRecords}
                    updatePanelType={updatePanelType}
                    resetGraphStatus={resetGraphStatus}
                    graphRenderMode={graphRenderMode}
                    onGraphRenderModeChange={onGraphRenderModeChange}
                />
            </div>
            <LogsDetail
                pageExecute={pageExecute}
                pageFavorite={pageFavorite}
                pageSize={pageSize}
                executionLogsLoading={executionLogsLoading}
                favoriteQueriesLoading={favoriteQueriesLoading}
                executionLogsError={executionLogsError}
                favoriteQueriesError={favoriteQueriesError}
                onRetryExecutionLogs={retryExecutionLogs}
                onRetryFavoriteQueries={retryFavoriteQueries}
                onExecutePageChange={onExecutePageChange}
                onFavoritePageChange={onFavoritePageChange}
                onChangeFavorSearch={onChangeFavorSearch}
                onSortChange={onSortChange}
                onRefresh={onFavoriteRefresh}
                favoriteQueriesData={favoriteQueriesData}
                executionLogsData={executionLogsData}
            />
        </>
    );
};

export default AlgorithmHome;
