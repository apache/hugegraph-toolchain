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
 * @file 图分析 Home
 */

import {useState, useCallback, useEffect, useContext, useRef, useMemo, useLayoutEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {useParams, useSearchParams} from 'react-router-dom';
import {message} from 'antd';
import GraphAnalysisContext from '../../Context';
import QueryBar from '../QueryBar/Home';
import useText2Gql from './useText2Gql';
import {hasLargeExplicitReadLimit} from './queryLimits';
import {DEFAULT_QUERY_LANGUAGE, QUERY_LANGUAGES, supportsQueryLanguage} from '../../../utils/text2gql';
import QueryResult from '../QueryResult/Home';
import {GRAPH_NODE_LIMIT} from '../QueryResult/Home/utils';
import LogsDetail from '../LogsDetail/Home';
import ResultsLayout from '../ResultsLayout';
import {GREMLIN_EXECUTES_MODE, ANALYSIS_TYPE, GRAPH_STATUS, PANEL_TYPE,
    FAVORITE_TYPE, EXECUTION_LOGS_TYPE, GRAPH_RENDER_MODE} from '../../../utils/constants';
import * as api from '../../../api';
import {toGraphCounts} from '../../../utils/graphStatistics';
import _ from 'lodash';
import {scopedStorageKey, USER_CHANGE_EVENT} from '../../../utils/user';
import {queryFailure} from '../../../utils/queryFailure';
import {sanitizePublicError} from '../../../utils/publicError';
import {isCypherEnabled} from '../../../utils/config';

const {STANDBY, LOADING, SUCCESS, FAILED} = GRAPH_STATUS;
const {QUERY} = GREMLIN_EXECUTES_MODE;
const {GREMLIN, CYPHER, TEXT2GQL} = ANALYSIS_TYPE;
const {CLOSED} = PANEL_TYPE;
const {CANVAS2D} = GRAPH_RENDER_MODE;
const defaultPageParams = {page: 1, pageSize: 10};
const DEFAULT_QUERIES = {
    [GREMLIN]: 'g.V().limit(10)',
    [CYPHER]: 'MATCH (n) RETURN n LIMIT 10',
};

const queryDraftKey = (graphSpace, graph, mode) =>
    `${scopedStorageKey('hubble.query')}.${encodeURIComponent(graphSpace || 'DEFAULT')}`
    + `.${encodeURIComponent(graph || 'unknown')}.${encodeURIComponent(mode)}`;

const restoreQuery = (graphSpace, graph, mode) => {
    try {
        const saved = window.localStorage.getItem(queryDraftKey(graphSpace, graph, mode));
        return saved?.trim() ? saved : DEFAULT_QUERIES[mode];
    }
    catch {
        return DEFAULT_QUERIES[mode];
    }
};

export const extractQueryErrorMessage = (error, fallback) => {
    const backendMessage = error?.response?.data?.message;
    if (typeof backendMessage === 'string' && backendMessage.trim()) {
        return sanitizePublicError(backendMessage, fallback);
    }
    if (typeof error?.message === 'string' && error.message.trim()) {
        return sanitizePublicError(error.message, fallback);
    }
    return fallback;
};

const AnalysisHome = ({toolbarExtra}) => {
    const {t} = useTranslation();
    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const {graphSpace: routeGraphSpace, graph: routeGraph} = useParams();
    const isGraphReady = Boolean(graphSpace && graph)
        && (!routeGraphSpace || routeGraphSpace === graphSpace)
        && (!routeGraph || routeGraph === graph);
    const cypherEnabled = isCypherEnabled();
    const [searchParams] = useSearchParams();
    const requestedLanguage = searchParams.get('language');
    const initialLanguage = supportsQueryLanguage(requestedLanguage, cypherEnabled)
        ? requestedLanguage : DEFAULT_QUERY_LANGUAGE;
    const [queryStatus, setQueryStatus] = useState(STANDBY);
    const [executionDurationMs, setExecutionDurationMs] = useState(null);
    const [queryMessage, setQueryMessage] = useState();
    const [isQueryMode, setQueryMode] = useState(true);
    const [queryResult, setQueryResult] = useState();
    const [asyncTaskResult, setAsyncTaskResult] = useState();
    const [metaDataState, setMetaDataState] = useState();
    const [propertyKeysState, setPropertyKeysState] = useState();
    const [graphNums, setGraphNums] = useState({vertexCount: -1, edgeCount: -1});
    const [executeMode, setExecuteMode] = useState(QUERY);
    const [queryLanguage, setQueryLanguage] = useState(initialLanguage);
    const analysisMode = QUERY_LANGUAGES[queryLanguage].analysisType;
    const historyMode = analysisMode;
    const [identityVersion, setIdentityVersion] = useState(0);
    const [editorSource, setEditorSource] = useState('manual');
    const languageDrafts = useRef({});
    const [panelType, setPanelType] = useState(CLOSED);
    const [executionLogsLoading, setExecutionLogsLoading] = useState(false);
    const [favoriteQueriesLoading, setFavoriteQueriesLoading] = useState(false);
    const [executionLogsError, setExecutionLogsError] = useState(false);
    const [favoriteQueriesError, setFavoriteQueriesError] = useState(false);
    const [favoriteQueriesData, setFavoriteQueriesData] = useState({});
    const [executionLogsData, setExecutionLogsData] = useState({});
    const [codeEditorContent, setCodeEditorContent] = useState(
        () => restoreQuery(graphSpace, graph, QUERY_LANGUAGES[initialLanguage].analysisType)
    );
    const [pageExecute, setExecutePage] = useState(defaultPageParams.page);
    const [pageFavorite, setFavoritePage] = useState(defaultPageParams.page);
    const [pageSize, setPageSize] = useState(defaultPageParams.pageSize);
    const [search, setSearch] = useState();
    const [sortMode, setSortMode] = useState();
    const [graphRenderMode, setGraphRenderMode] = useState(CANVAS2D);
    const queryRequest = useRef(null);
    const executionTimer = useRef(null);
    const graphNumsRequest = useRef(null);
    const graphNumsScope = useMemo(() => ({graphSpace, graph, identityVersion}), [graphSpace, graph, identityVersion]);
    const metaData = metaDataState?.owner === graphNumsScope ? metaDataState.data : undefined;
    const propertyKeysRecords = propertyKeysState?.owner === graphNumsScope ? propertyKeysState.records : undefined;
    const metaDataRequest = useRef(null);
    const propertyKeysRequest = useRef(null);
    const graphNumsOwner = useRef(null);
    useLayoutEffect(() => {
        graphNumsOwner.current = graphNumsScope;
        metaDataRequest.current = null;
        propertyKeysRequest.current = null;
        return () => {
            graphNumsOwner.current = null;
            metaDataRequest.current = null;
            propertyKeysRequest.current = null;
        };
    }, [graphNumsScope]);
    const executionInFlight = useRef(null);
    const executionLogsRequest = useRef(null);
    const favoriteQueriesRequest = useRef(null);
    const historyScope = JSON.stringify([identityVersion, graphSpace, graph, queryLanguage]);
    const rememberDraft = useCallback((content = codeEditorContent, source = editorSource) => {
        languageDrafts.current[queryLanguage] = {content, source};
    }, [codeEditorContent, editorSource, queryLanguage]);

    const stopExecutionTimer = useCallback(() => {
        clearInterval(executionTimer.current);
        executionTimer.current = null;
    }, []);

    useEffect(() => () => {
        stopExecutionTimer();
        queryRequest.current = null;
        graphNumsRequest.current = null;
        executionInFlight.current = null;
        executionLogsRequest.current = null;
        favoriteQueriesRequest.current = null;
    }, [stopExecutionTimer]);

    const getExecutionLogsList = useCallback(
        async () => {
            if (!graphSpace || !graph) {
                executionLogsRequest.current = null;
                setExecutionLogsLoading(false);
                setExecutionLogsError(false);
                setExecutionLogsData({});
                return;
            }
            const request = Symbol(`execution-logs:${identityVersion}:${analysisMode}`);
            executionLogsRequest.current = request;
            const params = {page_size: pageSize, page_no: pageExecute,
                type: EXECUTION_LOGS_TYPE[historyMode]};
            setExecutionLogsLoading(true);
            setExecutionLogsError(false);
            setExecutionLogsData({scope: historyScope, page: pageExecute});
            try {
                const response = await api.analysis.getExecutionLogs(
                    graphSpace, graph, params
                );
                if (executionLogsRequest.current !== request) {
                    return;
                }
                const {status, data = {}} = response || {};
                if (status !== 200) {
                    throw new Error('execution logs unavailable');
                }
                setExecutionLogsData({scope: historyScope, page: pageExecute,
                    records: Array.isArray(data.records) ? data.records : [], total: data.total});
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
        [graphSpace, graph, pageSize, pageExecute, analysisMode, historyMode, historyScope, identityVersion]
    );

    const getFavoriteQueriesList = useCallback(
        async () => {
            if (!graphSpace || !graph) {
                favoriteQueriesRequest.current = null;
                setFavoriteQueriesLoading(false);
                setFavoriteQueriesError(false);
                setFavoriteQueriesData({});
                return;
            }
            const request = Symbol(`favorite-queries:${identityVersion}:${analysisMode}`);
            favoriteQueriesRequest.current = request;
            const params = {
                page_size: pageSize,
                page_no: pageFavorite,
                content: search,
                time_order: sortMode,
                type: FAVORITE_TYPE[historyMode],
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
                const {status, data = {}} = response || {};
                if (status !== 200) {
                    throw new Error('favorite queries unavailable');
                }
                setFavoriteQueriesData({page: pageFavorite, records: data.records, total: data.total});
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
        [graphSpace, graph, pageSize, pageFavorite, search, sortMode, analysisMode, historyMode, identityVersion]
    );

    const onFavoriteRefresh = useCallback(
        () => {
            getFavoriteQueriesList();
        },
        [getFavoriteQueriesList]
    );

    const onExeLogsRefresh = useCallback(
        () => {
            getExecutionLogsList();
        },
        [getExecutionLogsList]
    );

    const retryExecutionLogs = useCallback(() => {
        getExecutionLogsList();
    }, [getExecutionLogsList]);

    const retryFavoriteQueries = useCallback(() => {
        getFavoriteQueriesList();
    }, [getFavoriteQueriesList]);

    const initQueryResult = useCallback(
        () => {
            setQueryStatus(STANDBY);
            stopExecutionTimer();
            setExecutionDurationMs(null);
            setQueryMessage();
            setQueryResult({});
            setPanelType(CLOSED);
        },
        [stopExecutionTimer]
    );

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
            const request = Symbol('graph-counts');
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

    const onResetPage = useCallback(
        () => {
            setExecutePage(defaultPageParams.page);
            setFavoritePage(defaultPageParams.page);
        }, []);

    const onLanguageChange = useCallback(language => {
        const draft = languageDrafts.current[language];
        queryRequest.current = null;
        executionInFlight.current = null;
        executionLogsRequest.current = null;
        favoriteQueriesRequest.current = null;
        setCodeEditorContent(draft?.content ?? restoreQuery(
            graphSpace, graph, QUERY_LANGUAGES[language].analysisType
        ));
        setEditorSource(draft?.source || 'manual');
        setQueryLanguage(language);
        initQueryResult();
        setExecutionLogsData({});
        setFavoriteQueriesData({});
        setExecutionLogsError(false);
        setFavoriteQueriesError(false);
        setExecutionLogsLoading(false);
        setFavoriteQueriesLoading(false);
        onResetPage();
    }, [graph, graphSpace, initQueryResult, onResetPage]);

    const resetGraphInfo = useCallback(
        () => {
            getMetaData();
            getPropertykeys();
            getGraphNumsInfo();
        },
        [getGraphNumsInfo, getMetaData, getPropertykeys]
    );

    useEffect(() => {
        if (graphSpace && graph) {
            void getMetaData();
            void getPropertykeys();
        }
    }, [graph, graphSpace, getMetaData, getPropertykeys]);

    useEffect(() => {
        queryRequest.current = null;
        executionInFlight.current = null;
        setQueryLanguage(initialLanguage);
        languageDrafts.current = {};
        setEditorSource('manual');
        setCodeEditorContent(restoreQuery(graphSpace, graph, QUERY_LANGUAGES[initialLanguage].analysisType));
        initQueryResult();
        onResetPage();
    }, [graph, graphSpace, initialLanguage, initQueryResult, onResetPage]);

    const onExecuteModeChange = useCallback(
        mode => {
            initQueryResult();
            setExecuteMode(mode);
        },
        [initQueryResult]
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

    const onExecuteQuery = useCallback(
        async (tabKey, generated) => {
            const content = generated?.content ?? codeEditorContent;
            const language = generated?.language ?? (tabKey === CYPHER ? 'cypher' : 'gremlin');
            if (hasLargeExplicitReadLimit(content, language)) {
                message.info(t('analysis.query_result.large_query_preview', {limit: GRAPH_NODE_LIMIT}));
            }
            const request = Symbol('query');
            const startedAt = Date.now();
            const isCurrent = () => queryRequest.current === request
                && (!generated || generated.isCurrent());
            queryRequest.current = request;
            stopExecutionTimer();
            setExecutionDurationMs(0);
            executionTimer.current = setInterval(() => {
                if (isCurrent()) {
                    setExecutionDurationMs(Math.max(0, Date.now() - startedAt));
                }
            }, 250);
            setQueryMode(true);
            setQueryStatus(LOADING);
            setPanelType(CLOSED);
            const previousGraph = queryResult?.graph_view;
            if (_.isEmpty(previousGraph?.vertices) && _.isEmpty(previousGraph?.edges)) {
                setGraphRenderMode(CANVAS2D);
            }
            try {
                let response;
                if (generated) {
                    response = await api.analysis.executeText2Gql(graphSpace, graph, generated.language,
                        {content: generated.content, text: generated.text, read_only: true},
                        {signal: generated.signal});
                }
                else if (tabKey === GREMLIN) {
                    response = await api.analysis.getExecutionQuery(graphSpace, graph, codeEditorContent);
                }
                else {
                    response = await api.analysis.getCypherExecutionQuery(
                        graphSpace, graph, {cypher: codeEditorContent}
                    );
                }
                if (!isCurrent()) {
                    return;
                }
                const {status, data, message} = response || {};
                setQueryResult(data);
                setAsyncTaskResult();
                if (status === 200) {
                    setQueryMessage(message);
                    setQueryStatus(SUCCESS);
                }
                else {
                    setQueryMessage(generated
                        ? generated.sanitizeError(message, t('analysis.query_result.run_failed_action'))
                        : message || t('analysis.query_result.run_failed_action'));
                    setQueryStatus(FAILED);
                }
                onExeLogsRefresh();
                onFavoriteRefresh();
                resetGraphInfo();
                if (generated) {
                    return status === 200 ? {ok: true}
                        : queryFailure(response, t('analysis.query_result.run_failed_action'), generated.sanitizeError);
                }
            }
            catch (error) {
                if (!isCurrent()) {
                    return;
                }
                setQueryResult();
                setAsyncTaskResult();
                const failure = queryFailure(error, t('analysis.query_result.run_failed_action'),
                    generated?.sanitizeError);
                setQueryMessage(failure.message);
                setQueryStatus(FAILED);
                if (generated) {
                    return failure;
                }
            }
            finally {
                if (isCurrent()) {
                    stopExecutionTimer();
                    setExecutionDurationMs(Math.max(0, Date.now() - startedAt));
                }
            }
        },
        [graph, graphSpace, codeEditorContent, onExeLogsRefresh, onFavoriteRefresh,
            queryResult, resetGraphInfo, stopExecutionTimer, t]
    );

    const onExecuteTask = useCallback(
        async (tabKey, generated) => {
            const request = Symbol('task');
            const isCurrent = () => queryRequest.current === request
                && (!generated || generated.isCurrent());
            queryRequest.current = request;
            stopExecutionTimer();
            setExecutionDurationMs(null);
            setQueryMode(false);
            setQueryStatus(LOADING);
            setPanelType(CLOSED);
            try {
                const params = generated
                    ? {content: generated.content, text: generated.text, read_only: true}
                    : {content: codeEditorContent};
                const submit = tabKey === GREMLIN ? api.analysis.getExecutionTask : api.analysis.getCypherTask;
                const response = generated
                    ? await submit(graphSpace, graph, params, {signal: generated.signal})
                    : await submit(graphSpace, graph, params);
                if (!isCurrent()) {
                    return;
                }
                const {status, message, data} = response || {};
                setQueryMessage(generated && status !== 200
                    ? generated.sanitizeError(message, t('analysis.query_result.submit_failed')) : message);
                if (status === 200) {
                    setQueryStatus(SUCCESS);
                    setAsyncTaskResult(data?.task_id || 0);
                    setQueryResult();
                    onExeLogsRefresh();
                    onFavoriteRefresh();
                }
                else {
                    setQueryStatus(FAILED);
                }
                if (generated) {
                    return status === 200 ? {ok: true}
                        : queryFailure(response, t('analysis.query_result.submit_failed'), generated.sanitizeError);
                }
            }
            catch (error) {
                if (!isCurrent()) {
                    return;
                }
                const failure = queryFailure(error, t('analysis.query_result.submit_failed'), generated?.sanitizeError);
                setQueryMessage(failure.message);
                setQueryStatus(FAILED);
                if (generated) {
                    return failure;
                }
            }
        },
        [codeEditorContent, graph, graphSpace, onExeLogsRefresh, onFavoriteRefresh, stopExecutionTimer, t]
    );

    const executeGenerated = useCallback((content, text, options) => {
        if (!options.isCurrent()) {
            return;
        }
        setCodeEditorContent(content);
        return options.asyncTask
            ? onExecuteTask(QUERY_LANGUAGES[options.language].analysisType, {content, text, ...options})
            : onExecuteQuery(TEXT2GQL, {content, text, ...options});
    }, [onExecuteQuery, onExecuteTask]);

    const writeGeneratedDraft = useCallback(content => {
        languageDrafts.current[queryLanguage] = {content, source: 'ai'};
        setQueryMode(true);
        setEditorSource('ai');
        setCodeEditorContent(content);
    }, [queryLanguage]);

    const resetEditor = useCallback(content => {
        languageDrafts.current = {};
        setEditorSource('manual');
        setCodeEditorContent(content);
    }, []);

    useEffect(() => {
        const resetIdentity = () => {
            queryRequest.current = null;
            graphNumsRequest.current = null;
            graphNumsOwner.current = null;
            metaDataRequest.current = null;
            propertyKeysRequest.current = null;
            setGraphNums({vertexCount: -1, edgeCount: -1});
            executionInFlight.current = null;
            executionLogsRequest.current = null;
            favoriteQueriesRequest.current = null;
            setQueryLanguage(DEFAULT_QUERY_LANGUAGE);
            resetEditor('');
            setExecutionLogsData({});
            setFavoriteQueriesData({});
            setExecutionLogsLoading(false);
            setFavoriteQueriesLoading(false);
            setExecutionLogsError(false);
            setFavoriteQueriesError(false);
            onResetPage();
            setPageSize(defaultPageParams.pageSize);
            setSearch();
            setSortMode();
            setIdentityVersion(previous => previous + 1);
        };
        window.addEventListener(USER_CHANGE_EVENT, resetIdentity);
        return () => window.removeEventListener(USER_CHANGE_EVENT, resetIdentity);
    }, [onResetPage, resetEditor]);

    const text2gql = useText2Gql({
        scope: {graphSpace, graph, routeGraphSpace, routeGraph},
        active: true,
        ready: isGraphReady,
        vertexLabels: metaData?.vertexMeta,
        execute: executeGenerated,
        clearResult: initQueryResult,
        clearEditor: resetEditor,
        onGeneratedDraft: writeGeneratedDraft,
        language: queryLanguage,
        cypherEnabled,
        onLanguageChange,
        t,
    });

    const onExecute = useCallback(
        tabKey => {
            rememberDraft();
            if (text2gql.pending) {
                return;
            }
            if (editorSource === 'ai') {
                text2gql.rerun(codeEditorContent, {asyncTask: executeMode !== QUERY});
                return;
            }
            if (!isGraphReady || (tabKey !== GREMLIN && tabKey !== CYPHER)) {
                return;
            }
            if (executionInFlight.current) {
                return;
            }
            const request = Symbol('execution');
            executionInFlight.current = request;
            let execution;
            if (executeMode === QUERY) {
                execution = onExecuteQuery(tabKey);
            }
            else {
                execution = onExecuteTask(tabKey);
            }
            execution.finally(() => {
                if (executionInFlight.current === request) {
                    executionInFlight.current = null;
                }
            });
        },
        [codeEditorContent, editorSource, executeMode, isGraphReady, onExecuteQuery,
            onExecuteTask, rememberDraft, text2gql]
    );

    useEffect(
        () => {
            getExecutionLogsList();
            getFavoriteQueriesList();
        },
        [getExecutionLogsList, getFavoriteQueriesList]
    );

    const resetGraphStatus = useCallback(
        (status, message, data) => {
            setPanelType(CLOSED);
            setQueryMode(true);
            status && setQueryStatus(status);
            message && setQueryMessage(message);
            data && setQueryResult(data);
        },
        []
    );

    const resetCodeEditorContent = useCallback(
        content => {
            if (content === codeEditorContent) {
                return;
            }
            rememberDraft(content);
            setCodeEditorContent(content);
            if (editorSource === 'manual') {
                try {
                    window.localStorage.setItem(
                        queryDraftKey(graphSpace, graph, analysisMode), content
                    );
                }
                catch {
                    // Keep editing available when browser storage is blocked.
                }
            }
        },
        [analysisMode, codeEditorContent, editorSource, graph, graphSpace, rememberDraft]
    );

    const updatePanelType = useCallback(
        type => {
            setPanelType(type);
        },
        []
    );

    const onExecutePageChange = useCallback(
        (page, pageSize) => {
            rememberDraft();
            setExecutePage(page);
            setPageSize(pageSize);
        },
        [rememberDraft]
    );

    const onFavoritePageChange = useCallback(
        (page, pageSize) => {
            rememberDraft();
            setFavoritePage(page);
            setPageSize(pageSize);
        },
        [rememberDraft]
    );

    const onChangeFavorSearch = useCallback(
        values => {
            setSearch(values);
        },
        []
    );

    const onSortChange = useCallback((pagination, filters, sort) => {
        setSortMode(sort.order === 'ascend' ? 'asc' : 'desc');
    }, []);

    const handleClickLoadContent = useCallback((content, text) => {
        const isAi = typeof text === 'string' && Boolean(text.trim());
        const isExecuting = queryStatus === LOADING;
        if (isExecuting) {
            // A history selection detaches any in-flight query before its response can update the view.
            queryRequest.current = null;
            executionInFlight.current = null;
            setQueryMode(true);
            setAsyncTaskResult();
        }
        rememberDraft(content, isAi ? 'ai' : 'manual');
        setCodeEditorContent(content);
        setEditorSource(isAi ? 'ai' : 'manual');
        if (!isAi && typeof content === 'string') {
            try {
                window.localStorage.setItem(queryDraftKey(graphSpace, graph, analysisMode), content);
            }
            catch {
                // History remains usable when browser storage is blocked.
            }
        }
        text2gql.loadSource(text, {preserveResult: !isAi && !isExecuting});
    }, [analysisMode, graph, graphSpace, queryStatus, rememberDraft, text2gql]);

    const clearQuery = useCallback(() => {
        rememberDraft('', 'manual');
        text2gql.cancel();
        setEditorSource('manual');
        setCodeEditorContent('');
        text2gql.loadSource('');
        try {
            window.localStorage.setItem(queryDraftKey(graphSpace, graph, analysisMode), '');
        }
        catch {
            // Clearing still works when storage is blocked.
        }
    }, [analysisMode, graph, graphSpace, rememberDraft, text2gql]);

    const changeQuestion = useCallback(value => {
        rememberDraft();
        text2gql.setQuestion(value);
    }, [rememberDraft, text2gql]);

    useEffect(() => {
        if (!isGraphReady || pageExecute !== 1 || executionLogsLoading
            || executionLogsData.scope !== historyScope || executionLogsData.page !== 1
            || executionLogsError || languageDrafts.current[queryLanguage]) {
            return;
        }
        if (Array.isArray(executionLogsData.records)) {
            const latest = executionLogsData.records?.[0];
            if (typeof latest?.content === 'string' && latest.content.trim()) {
                handleClickLoadContent(latest.content, latest.text);
            }
            else {
                rememberDraft();
            }
        }
    }, [executionLogsData, executionLogsError, executionLogsLoading, handleClickLoadContent,
        historyScope, isGraphReady, pageExecute, queryLanguage, rememberDraft]);

    const onGraphRenderModeChange = useCallback(
        value => {
            setGraphRenderMode(value);
        },
        []
    );

    const renderQueryResult = useCallback(height => (
        <QueryResult
            height={height}
            queryProgress={text2gql.pending && isQueryMode ? {
                phase: text2gql.phase, elapsedSeconds: text2gql.elapsedSeconds,
                modelSlow: text2gql.modelSlow, cancel: text2gql.cancel,
            } : undefined}
            queryResult={queryResult}
            asyncTaskResult={asyncTaskResult}
            isQueryMode={isQueryMode}
            metaData={metaData}
            queryStatus={queryStatus}
            queryMessage={queryMessage}
            resetGraphStatus={resetGraphStatus}
            panelType={panelType}
            updatePanelType={updatePanelType}
            propertyKeysRecords={propertyKeysRecords}
            graphNums={graphNums}
            onRefreshGraphNums={getGraphNumsInfo}
            graphRenderMode={graphRenderMode}
            onGraphRenderModeChange={onGraphRenderModeChange}
        />
    ), [
        asyncTaskResult, getGraphNumsInfo, graphNums, graphRenderMode, isQueryMode, metaData,
        onGraphRenderModeChange, panelType, propertyKeysRecords, queryMessage,
        queryResult, queryStatus, resetGraphStatus, text2gql, updatePanelType,
    ]);

    return (
        <>
            <QueryBar
                codeEditorContent={codeEditorContent}
                setCodeEditorContent={resetCodeEditorContent}
                executeMode={executeMode}
                onExecuteModeChange={onExecuteModeChange}
                activeTab={analysisMode}
                language={queryLanguage}
                onLanguageChange={text2gql.changeLanguage}
                editorSource={editorSource}
                onClear={clearQuery}
                toolbarExtra={toolbarExtra}
                onExecute={onExecute}
                onRefresh={onFavoriteRefresh}
                isExecuting={queryStatus === LOADING}
                executionDurationMs={executionDurationMs}
                isGraphReady={isGraphReady}
                cypherEnabled={cypherEnabled}
                text2gql={{...text2gql, setQuestion: changeQuestion}}
            />
            <ResultsLayout
                renderResult={renderQueryResult}
                history={(
                    <LogsDetail
                        compact
                        executionLogsData={executionLogsData}
                        favoriteQueriesData={favoriteQueriesData}
                        pageExecute={pageExecute}
                        onClickLoadContent={handleClickLoadContent}
                        analysisMode={historyMode}
                        executionLogsLoading={executionLogsLoading}
                        favoriteQueriesLoading={favoriteQueriesLoading}
                        executionLogsError={executionLogsError}
                        favoriteQueriesError={favoriteQueriesError}
                        onRetryExecutionLogs={retryExecutionLogs}
                        onRetryFavoriteQueries={retryFavoriteQueries}
                        pageSize={pageSize}
                        pageFavorite={pageFavorite}
                        onExecutePageChange={onExecutePageChange}
                        onFavoritePageChange={onFavoritePageChange}
                        onRefresh={onFavoriteRefresh}
                        onChangeSearchValue={onChangeFavorSearch}
                        onSortChange={onSortChange}
                    />
                )}
            />
        </>
    );
};

export default AnalysisHome;
