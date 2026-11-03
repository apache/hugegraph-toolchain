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

import {useCallback, useState, useEffect, useContext, useRef, useMemo, useLayoutEffect} from 'react';
import {useTranslation} from 'react-i18next';
import AlgorithmFormHome from '../algorithmsForm/Home';
import GraphResult from '../GraphResult/Home';
import LogsDetail from '../LogsDetail/Home';
import GraphAnalysisContext from '../../Context';
import {GRAPH_STATUS, PANEL_TYPE, GRAPH_RENDER_MODE, getAlgorithmDisplayName} from '../../../utils/constants';
import * as api from '../../../api';
import {clearOlapTasks, consumeOlapFailure, getLatestOlapTask, useOlapTasks, usePendingOlapTasks} from '../olapTaskRegistry';
import {toGraphCounts} from '../../../utils/graphStatistics';
import {USER_CHANGE_EVENT} from '../../../utils/user';
import _ from 'lodash';
import c from './index.module.scss';

const ALGORITHM_MODE = {OLTP: 'oltp', OLAP: 'olap'};
const formatOlapFailure = (algorithm, message, t) => {
    const detail = message || t('analysis.query_result.run_failed');
    return algorithm ? `${getAlgorithmDisplayName(algorithm, t)}: ${detail}` : detail;
};

const AlgorithmHome = ({engine = 'oltp', onEngineChange}) => {
    const {STANDBY, LOADING, SUCCESS, FAILED} = GRAPH_STATUS;
    const {t} = useTranslation();
    const {CLOSED} = PANEL_TYPE;
    const {OLTP, OLAP} = ALGORITHM_MODE;
    const {CANVAS2D} = GRAPH_RENDER_MODE;
    const defaultPageParams = {page: 1, pageSize: 10};
    const TYPE  = {GREMLIN: '0', ALGORITHM: '1', CYPHER: '2'};

    const {graphSpace, graph, isVermeer, vermeerReady} = useContext(GraphAnalysisContext);

    const [metaDataState, setMetaDataState] = useState();
    const [propertyKeysState, setPropertyKeysState] = useState();
    const [graphNums, setGraphNums] = useState({vertexCount: -1, edgeCount: -1});
    const [identityVersion, setIdentityVersion] = useState(0);
    const [algorithmMode, setAlgorithmMode] = useState();
    const [queryStatus, setQueryStatus] = useState(STANDBY);
    const [queryMessage, setQueryMessage] = useState();
    const [queryResult, setQueryResult] = useState();
    const [asyncTaskResult, setAsyncTaskResult] = useState();
    const asyncTaskOwner = useRef(null);
    const visibleOlapTask = useRef();
    const userSelectedOlapTask = useRef(false);
    const [graphOptions, setGraphOptions] = useState();
    const [panelType, setPanelType] = useState(CLOSED);
    const [algorithmOnCanvas, setAlgorithmOnCanvas] = useState();
    const recentOlapTasks = useOlapTasks(graphSpace, graph);
    const pendingOlapTasks = usePendingOlapTasks(graphSpace, graph);
    const restoreEligible = useRef(true);
    const restoringPending = useRef(false);
    const restoringAlgorithm = useRef();
    const [restoredOlapTask, setRestoredOlapTask] = useState(false);
    const [olapResultAlgorithm, setOlapResultAlgorithm] = useState();
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
    const algorithmRequest = useRef(null);
    const olapSubmissionGroup = useRef(null);
    const graphNumsScope = useMemo(() => ({graphSpace, graph, identityVersion}), [graphSpace, graph, identityVersion]);
    const metaData = metaDataState?.owner === graphNumsScope ? metaDataState.data : undefined;
    const propertyKeysRecords = propertyKeysState?.owner === graphNumsScope ? propertyKeysState.records : undefined;
    const [computerProbeAttempt, setComputerProbeAttempt] = useState(0);
    const [computerCapability, setComputerCapability] = useState(null);
    const computerScope = useMemo(() => ({graphNumsScope, isVermeer, vermeerReady, computerProbeAttempt}),
        [graphNumsScope, isVermeer, vermeerReady, computerProbeAttempt]);
    const hasComputerCapability = computerCapability?.owner === computerScope;
    const computerStatus = !graphSpace || !graph ? 'select-graph'
        : vermeerReady !== true ? 'unconfirmed'
            : isVermeer ? 'not-needed'
                : hasComputerCapability ? computerCapability.status : 'checking';
    const retryComputerCapability = useCallback(() => setComputerProbeAttempt(value => value + 1), []);

    useEffect(() => {
        if (engine !== 'olap' || vermeerReady !== true || isVermeer || !graphSpace || !graph
            || hasComputerCapability) return undefined;
        let cancelled = false;
        api.analysis.getOlapCapability(graphSpace, graph, {suppressBusinessErrorToast: true})
            .then(response => {
                if (cancelled) return;
                const available = response?.data?.available;
                const status = response?.status === 200 && typeof available === 'boolean'
                    ? available ? 'available' : 'unavailable' : 'error';
                setComputerCapability({owner: computerScope, status});
            }).catch(() => {
                if (!cancelled) setComputerCapability({owner: computerScope, status: 'error'});
            });
        return () => { cancelled = true; };
    }, [computerScope, engine, graph, graphSpace, hasComputerCapability, isVermeer, vermeerReady]);

    const metaDataRequest = useRef(null);
    const propertyKeysRequest = useRef(null);
    const graphNumsOwner = useRef(null);
    useLayoutEffect(() => {
        graphNumsOwner.current = graphNumsScope;
        metaDataRequest.current = null;
        propertyKeysRequest.current = null;
        algorithmRequest.current = null;
        olapSubmissionGroup.current = null;
        return () => {
            graphNumsOwner.current = null;
            metaDataRequest.current = null;
            propertyKeysRequest.current = null;
            algorithmRequest.current = null;
            olapSubmissionGroup.current = null;
        };
    }, [graphNumsScope]);

    useEffect(() => {
        const resetIdentity = () => {
            graphNumsRequest.current = null;
            graphNumsOwner.current = null;
            metaDataRequest.current = null;
            propertyKeysRequest.current = null;
            algorithmRequest.current = null;
            olapSubmissionGroup.current = null;
            asyncTaskOwner.current = null;
            visibleOlapTask.current = undefined;
            userSelectedOlapTask.current = false;
            clearOlapTasks();
            setQueryStatus(STANDBY);
            setQueryMessage();
            setQueryResult({});
            setAsyncTaskResult();
            setPanelType(CLOSED);
            setGraphNums({vertexCount: -1, edgeCount: -1});
            setIdentityVersion(previous => previous + 1);
        };
        window.addEventListener(USER_CHANGE_EVENT, resetIdentity);
        return () => window.removeEventListener(USER_CHANGE_EVENT, resetIdentity);
    }, [CLOSED, STANDBY]);

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

    const previousScope = useRef(graphNumsScope);
    useLayoutEffect(() => {
        if (previousScope.current === graphNumsScope) return;
        previousScope.current = graphNumsScope;
        algorithmRequest.current = null;
        olapSubmissionGroup.current = null;
        asyncTaskOwner.current = null;
        visibleOlapTask.current = undefined;
        userSelectedOlapTask.current = false;
        restoreEligible.current = true;
        restoringPending.current = false;
        restoringAlgorithm.current = undefined;
        setRestoredOlapTask(false);
        setAsyncTaskResult();
        setAlgorithmMode();
        setAlgorithmOnCanvas();
        initQueryResult();
    }, [graphNumsScope, initQueryResult]);

    const previousEngine = useRef(engine);
    useLayoutEffect(() => {
        if (previousEngine.current === engine) return;
        previousEngine.current = engine;
        restoreEligible.current = engine === 'olap';
        restoringPending.current = false;
        restoringAlgorithm.current = undefined;
        setRestoredOlapTask(false);
        // An OLAP submission belongs to its own view, not the newly selected engine.
        algorithmRequest.current = null;
        olapSubmissionGroup.current = null;
        asyncTaskOwner.current = null;
        visibleOlapTask.current = undefined;
        userSelectedOlapTask.current = false;
        setAlgorithmMode();
        setAsyncTaskResult();
        setAlgorithmOnCanvas();
        initQueryResult();
    }, [engine, initQueryResult]);

    const getMetaData = useCallback(
        async () => {
            if (graphNumsOwner.current !== graphNumsScope || !graphSpace || !graph) return;
            const request = Symbol('schema-metadata');
            metaDataRequest.current = request;
            const isCurrent = () => graphNumsOwner.current === graphNumsScope && metaDataRequest.current === request;
            try {
                const edgeResponse = await api.manage.getMetaEdgeList(graphSpace, graph, {page_size: -1});
                if (!isCurrent()) return;
                const vertexResponse = await api.manage.getMetaVertexList(graphSpace, graph, {page_size: -1});
                if (!isCurrent()) return;
                setMetaDataState({
                    owner: graphNumsScope,
                    data: {
                        edgeMeta: edgeResponse?.status === 200 ? edgeResponse.data?.records : undefined,
                        vertexMeta: vertexResponse?.status === 200 ? vertexResponse.data?.records : undefined,
                    },
                });
            } catch {
                if (isCurrent()) setMetaDataState();
            }
        },
        [graph, graphSpace, graphNumsScope]
    );

    const getPropertykeys = useCallback(
        async () => {
            if (graphNumsOwner.current !== graphNumsScope || !graphSpace || !graph) return;
            const request = Symbol('schema-property-keys');
            propertyKeysRequest.current = request;
            const isCurrent = () => graphNumsOwner.current === graphNumsScope && propertyKeysRequest.current === request;
            try {
                const response = await api.manage.getMetaPropertyList(graphSpace, graph, {page_size: -1});
                if (!isCurrent()) return;
                setPropertyKeysState(response?.status === 200 ? {
                    owner: graphNumsScope,
                    records: response.data?.records ?? [],
                } : undefined);
            } catch {
                if (isCurrent()) setPropertyKeysState();
            }
        },
        [graph, graphSpace, graphNumsScope]
    );

    const getGraphNumsInfo = useCallback(
        async () => {
            if (graphNumsOwner.current !== graphNumsScope || !graphSpace || !graph) return {status: 'disposed'};
            const request = Symbol('algorithm-graph-counts');
            graphNumsRequest.current = request;
            let response;
            try {
                response = await api.analysis.getGraphData(graphSpace, graph, {suppressBusinessErrorToast: true});
            } catch {
                response = null;
            }
            if (graphNumsOwner.current !== graphNumsScope || graphNumsRequest.current !== request) {
                return {status: 'superseded'};
            }
            if (response?.status !== 200) {
                setGraphNums({vertexCount: null, edgeCount: null});
                return {status: 'unavailable'};
            }
            setGraphNums(toGraphCounts(response.data));
            return {status: 'refreshed'};
        },
        [graph, graphSpace, graphNumsScope]
    );

    useEffect(() => {
        graphNumsRequest.current = null;
        setGraphNums({vertexCount: -1, edgeCount: -1});
        void getGraphNumsInfo();
    }, [getGraphNumsInfo]);

    const getFavoriteQueriesList = useCallback(
        async () => {
            if (!graphSpace || !graph) {
                favoriteQueriesRequest.current = null;
                setFavoriteQueriesLoading(false);
                setFavoriteQueriesError(false);
                setFavoriteQueriesData({});
                return;
            }
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
                    page: pageFavorite,
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
            if (!graphSpace || !graph) {
                executionLogsRequest.current = null;
                setExecutionLogsLoading(false);
                setExecutionLogsError(false);
                setExecutionLogsData({});
                return;
            }
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
                && favoriteQueriesData.page === pageFavorite
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

    const onResetPage = useCallback(
        () => {
            setExecutePage(defaultPageParams.page);
            setFavoritePage(defaultPageParams.page);
        }, [defaultPageParams.page]
    );

    useEffect(() => {
        if (graphSpace && graph) {
            getMetaData();
            getPropertykeys();
        }
        initQueryResult();
        onResetPage();
    }, [graph, graphSpace, identityVersion, getMetaData, getPropertykeys, initQueryResult, onResetPage]);


    const showRecentTask = useCallback((task, preserveWarning = false) => {
        if (!task || graphNumsOwner.current !== graphNumsScope || engine !== 'olap') return;
        asyncTaskOwner.current = graphNumsScope;
        visibleOlapTask.current = task.id;
        setRestoredOlapTask(true);
        setAsyncTaskResult(task.id);
        setAlgorithmMode(OLAP);
        setAlgorithmOnCanvas(task.algorithm);
        setOlapResultAlgorithm(task.algorithm);
        setQueryResult({});
        if (!preserveWarning) setQueryMessage();
        setQueryStatus(SUCCESS);
    }, [OLAP, SUCCESS, engine, graphNumsScope]);

    // This registry is deliberately session-only: a graph can be deleted and
    // recreated with the same name, so server history alone cannot prove scope.
    useEffect(() => {
        if (engine !== 'olap' || !isVermeer || !restoreEligible.current) return;
        const algorithm = restoringAlgorithm.current;
        const pending = algorithm ? pendingOlapTasks.filter(item => item.algorithm === algorithm) : pendingOlapTasks;
        const failure = consumeOlapFailure(graphSpace, graph, algorithm);
        const task = algorithm ? getLatestOlapTask(graphSpace, graph, algorithm) : recentOlapTasks[0];
        if (task) {
            // A sibling request must not hide an available result. Keep listening
            // until the relevant requests settle, without erasing earlier failures.
            if (!userSelectedOlapTask.current &&
                (algorithm || visibleOlapTask.current === undefined || asyncTaskOwner.current !== graphNumsScope) &&
                (visibleOlapTask.current !== task.id || asyncTaskOwner.current !== graphNumsScope)) {
                showRecentTask(task, true);
            }
            if (failure) setQueryMessage(formatOlapFailure(failure.algorithm, failure.message, t));
            restoringPending.current = pending.length > 0;
            restoreEligible.current = pending.length > 0;
            return;
        }
        if (pending.length) {
            restoringPending.current = true;
            setAlgorithmMode(OLAP);
            setAlgorithmOnCanvas(algorithm || pending[pending.length - 1].algorithm);
            setQueryStatus(LOADING);
            if (failure) setQueryMessage(formatOlapFailure(failure.algorithm, failure.message, t));
            return;
        }
        if (restoringPending.current || failure) {
            restoringPending.current = false;
            restoreEligible.current = false;
            if (failure) setQueryMessage(formatOlapFailure(failure.algorithm, failure.message, t));
            else setQueryMessage(previous => previous || t('analysis.query_result.run_failed'));
            setQueryStatus(FAILED);
        }
    }, [engine, isVermeer, graphSpace, graph, graphNumsScope, recentOlapTasks, pendingOlapTasks, showRecentTask,
        LOADING, OLAP, FAILED, t]);

    const handleSelectOlapAlgorithm = useCallback(algorithm => {
        userSelectedOlapTask.current = false;
        const pending = pendingOlapTasks.some(item => item.algorithm === algorithm);
        restoreEligible.current = pending;
        restoringPending.current = pending;
        restoringAlgorithm.current = pending ? algorithm : undefined;
        const task = getLatestOlapTask(graphSpace, graph, algorithm);
        const failure = pending ? undefined : consumeOlapFailure(graphSpace, graph, algorithm);
        if (task) {
            showRecentTask(task);
            if (failure) setQueryMessage(formatOlapFailure(failure.algorithm, failure.message, t));
        } else {
            asyncTaskOwner.current = null;
            visibleOlapTask.current = undefined;
            setRestoredOlapTask(false);
            setAsyncTaskResult();
            setAlgorithmOnCanvas(algorithm);
            setAlgorithmMode(OLAP);
            setQueryResult({});
            setQueryMessage(failure ? formatOlapFailure(failure.algorithm, failure.message, t) : undefined);
            setQueryStatus(pending ? LOADING : failure ? FAILED : STANDBY);
        }
    }, [graphSpace, graph, pendingOlapTasks, showRecentTask, OLAP, LOADING, FAILED, STANDBY, t]);

    const handleSelectOlapTask = useCallback(taskId => {
        if (graphNumsOwner.current !== graphNumsScope || engine !== 'olap') return;
        userSelectedOlapTask.current = true;
        visibleOlapTask.current = taskId;
        asyncTaskOwner.current = graphNumsScope;
        setAsyncTaskResult(taskId);
        setRestoredOlapTask(false);
    }, [engine, graphNumsScope]);

    const handleUpdateCurrentAlgorithm = useCallback(value => {
        setAlgorithmOnCanvas(value);
    }, []);

    const beginSubmission = useCallback((applyResult, latestOnly = true) => {
        userSelectedOlapTask.current = false;
        restoreEligible.current = false;
        restoringPending.current = false;
        restoringAlgorithm.current = undefined;
        setRestoredOlapTask(false);
        if (graphNumsOwner.current !== graphNumsScope) return () => false;
        const submissionEngine = engine;
        const request = latestOnly ? Symbol('algorithm-execution')
            : olapSubmissionGroup.current || {pending: 0};
        let settled = false;
        if (latestOnly) {
            olapSubmissionGroup.current = null;
            algorithmRequest.current = request;
        } else {
            algorithmRequest.current = null;
            request.pending += 1;
            olapSubmissionGroup.current = request;
        }
        const complete = (...args) => {
            const sameContext = graphNumsOwner.current === graphNumsScope &&
                                previousEngine.current === submissionEngine;
            const currentRequest = latestOnly ? algorithmRequest.current === request
                : olapSubmissionGroup.current === request;
            if (!sameContext || !currentRequest || (!latestOnly && settled)) return false;
            const status = args[0];
            if (!latestOnly && status !== LOADING) {
                settled = true;
                request.pending = Math.max(0, request.pending - 1);
            }
            if (latestOnly) applyResult(...args);
            else applyResult(args[0], args[1], args[2], {pending: request.pending});
            return true;
        };
        return complete;
    }, [LOADING, engine, graphNumsScope]);

    const handleOltpFormSubmit = useCallback(
        () => beginSubmission((status, data, message, options) => {
            setPanelType(CLOSED);
            setGraphRenderMode(CANVAS2D);
            setAlgorithmMode(OLTP);
            setAsyncTaskResult();
            setQueryStatus(status);
            setQueryResult(data);
            setQueryMessage(message);
            options && setGraphOptions(options);
            getExecutionLogsList();
        }),
        [CANVAS2D, CLOSED, OLTP, beginSubmission, getExecutionLogsList]
    );

    const handleOlapFormSubmit = useCallback(
        algorithm => beginSubmission((status, data, message, {pending = 0} = {}) => {
            const hasVisibleTask = visibleOlapTask.current !== undefined &&
                                   asyncTaskOwner.current === graphNumsScope;
            if (status === LOADING) {
                setQueryMessage();
                if (hasVisibleTask) return;
            }
            if (status === SUCCESS && hasVisibleTask && userSelectedOlapTask.current) {
                getExecutionLogsList();
                return;
            }
            if (status === FAILED && hasVisibleTask) {
                setQueryMessage(formatOlapFailure(algorithm, message, t));
                getExecutionLogsList();
                return;
            }
            if (status === FAILED && pending > 0) {
                setQueryMessage(formatOlapFailure(algorithm, message, t));
                getExecutionLogsList();
                return;
            }
            setPanelType(CLOSED);
            setAlgorithmMode(OLAP);
            setQueryResult({});
            setQueryStatus(status);
            asyncTaskOwner.current = graphNumsScope;
            if (status === SUCCESS) {
                visibleOlapTask.current = data;
                setOlapResultAlgorithm(algorithm);
            }
            if (status === FAILED) visibleOlapTask.current = undefined;
            setAsyncTaskResult(data);
            // A sibling may have failed while this submission was pending.
            // Keep that warning visible until a new submission starts.
            if (status !== SUCCESS) setQueryMessage(status === FAILED ? formatOlapFailure(algorithm, message, t) : message || '');
            if (status === SUCCESS || status === FAILED) getExecutionLogsList();
        }, false),
        [CLOSED, FAILED, LOADING, OLAP, SUCCESS, beginSubmission, getExecutionLogsList, graphNumsScope, t]
    );

    const resetGraphStatus = useCallback(
        (status, message, data) => {
            algorithmRequest.current = null;
            olapSubmissionGroup.current = null;
            asyncTaskOwner.current = null;
            visibleOlapTask.current = undefined;
            userSelectedOlapTask.current = false;
            setAsyncTaskResult();
            setPanelType(CLOSED);
            setAlgorithmMode(OLTP);
            setAlgorithmOnCanvas();
            setGraphOptions();
            status && setQueryStatus(status);
            setQueryMessage(message);
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
                    key={JSON.stringify([graphSpace, graph, identityVersion])}
                    engine={engine}
                    onEngineChange={onEngineChange}
                    handleOltpFormSubmit={handleOltpFormSubmit}
                    handleOlapFormSubmit={handleOlapFormSubmit}
                    onSelectOlapAlgorithm={handleSelectOlapAlgorithm}
                    currentAlgorithm={algorithmOnCanvas}
                    updateCurrentAlgorithm={handleUpdateCurrentAlgorithm}
                    graphNums={graphNums}
                    computerStatus={computerStatus}
                    metaData={metaData}
                    graphSpace={graphSpace}
                    graph={graph}
                />
                <GraphResult
                    engine={engine}
                    computerStatus={computerStatus}
                    onRetryComputerCapability={retryComputerCapability}
                    data={queryResult}
                    metaData={metaData}
                    options={graphOptions}
                    restoredOlapTask={restoredOlapTask}
                    onSelectOlapTask={handleSelectOlapTask}
                    asyncTaskId={asyncTaskOwner.current === graphNumsScope ? asyncTaskResult : undefined}
                    queryStatus={asyncTaskResult && asyncTaskOwner.current !== graphNumsScope ? STANDBY : queryStatus}
                    queryMessage={queryMessage}
                    isQueryMode={algorithmMode === OLTP}
                    algorithm={algorithmMode === OLAP ? olapResultAlgorithm : algorithmOnCanvas}
                    panelType={panelType}
                    graphNums={graphNums}
                    onRefreshGraphNums={getGraphNumsInfo}
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
