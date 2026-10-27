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
 * @file 图分析模块Header，用于初始化当前图上下文和展示分析操作
 */

import {useCallback, useEffect, useRef, useState, useContext} from 'react';
import {Alert, Switch, Button, Tag, message, Tooltip} from 'antd';
import {SyncOutlined, QuestionCircleOutlined} from '@ant-design/icons';
import GraphAnalysisContext from '../../Context';
import * as api from '../../../api';
import {format} from 'date-fns';
import {GRAPH_LOAD_STATUS} from '../../../utils/constants';
import {useNavigate, useParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import _ from 'lodash';
import c from './index.module.scss';
import {loadGraphOptions} from '../../../utils/graphOptions';

const {
    LOADED,
    LOADING,
    CREATED,
    ERROR,
} = GRAPH_LOAD_STATUS;
const INLINE_ERROR_CONFIG = {suppressBusinessErrorToast: true};

const TopBar = props => {
    const {
        onGraphInfoChange,
        moduleName,
        showOlapSwitch,
        showNavigationButton,
        isOlapModeEnable,
        isOlapModeLoading,
        onOlapModeChange,
    } = props;

    const {t} = useTranslation();
    const navigate = useNavigate();
    const {
        graphSpace: graphSpaceFromParam,
        graph: graphFromParam,
        taskId,
    } = useParams();

    const {isVermeer} = useContext(GraphAnalysisContext);
    const [currentGraphSpace, setCurrentGraphSpace] = useState(graphSpaceFromParam);
    const [, setGraphSpaceLoading] = useState(false);
    const [graphSpaceError, setGraphSpaceError] = useState(false);
    const [currentGraph, setCurrentGraph] = useState({});
    const [, setGraphLoading] = useState(false);
    const [graphError, setGraphError] = useState(false);
    const [pendingLoads, setPendingLoads] = useState({});
    const [loadTasks, setLoadTasks] = useState({});
    const graphSpaceRequest = useRef(null);
    const graphRequest = useRef(null);
    const loadRequest = useRef(null);
    const pendingLoadRequests = useRef(new Map());

    const graphKey = JSON.stringify([currentGraphSpace, currentGraph.name]);
    const isLoadRequestLoading = Boolean(pendingLoads[graphKey]);
    const loadTask = loadTasks[graphKey];
    const {
        status: metadataGraphStatus,
        last_load_time: currentGraphLoadTime,
    } = currentGraph;
    const currentGraphStatus = loadTask === undefined ? metadataGraphStatus : LOADING;
    const showLoadFailureAction = currentGraphStatus === ERROR && !isLoadRequestLoading;

    const showVermeerGraphInfo = isVermeer && !_.isEmpty(currentGraph) &&
                                Boolean(currentGraphStatus);

    const renderLoadTime = () => {
        return format(Date.parse(currentGraphLoadTime), 'yyyy-MM-dd');
    };

    const renderStatusTag = status => {
        if (isLoadRequestLoading) {
            return <Tag icon={<SyncOutlined spin />} color="processing" />;
        }
        switch (status) {
            case LOADED:
                return <Tag color="success">{t('analysis.topbar.loaded')}</Tag>;
            case LOADING:
                return <Tag color="processing">{t('analysis.topbar.loading')}</Tag>;
            case ERROR:
                return <Tag color="error">{t('analysis.topbar.load_failed')}</Tag>;
            case CREATED:
                return <Tag color="default">{t('analysis.topbar.not_loaded')}</Tag>;
            default:
                return null;
        }
    };

    const getGraphSpaces = useCallback(
        async () => {
            const request = Symbol('graphspaces');
            graphSpaceRequest.current = request;
            setGraphSpaceLoading(true);
            setGraphSpaceError(false);
            try {
                const response = await api.analysis.getGraphSpaceList(INLINE_ERROR_CONFIG);
                if (graphSpaceRequest.current !== request) {
                    return;
                }
                const {status, data} = response || {};
                if (status !== 200 || !Array.isArray(data?.graphspaces)) {
                    throw new Error('graphspaces unavailable');
                }
                const {graphspaces} = data;
                const routeGraphSpace = graphspaces.includes(graphSpaceFromParam)
                    ? graphSpaceFromParam
                    : undefined;
                setCurrentGraphSpace(routeGraphSpace || graphspaces[0]);
            }
            catch {
                if (graphSpaceRequest.current === request) {
                    setGraphSpaceError(true);
                }
            }
            finally {
                if (graphSpaceRequest.current === request) {
                    setGraphSpaceLoading(false);
                }
            }
        },
        [graphSpaceFromParam]
    );

    const getGraphs = useCallback(
        async () => {
            const request = Symbol('graphs');
            graphRequest.current = request;
            setGraphLoading(true);
            setGraphError(false);
            try {
                const options = await loadGraphOptions(
                    currentGraphSpace, {selected: graphFromParam}, INLINE_ERROR_CONFIG
                );
                if (graphRequest.current !== request) {
                    return;
                }
                let graph = graphFromParam ? options.selected : options.records[0];
                if (graphFromParam && !graph) {
                    throw new Error('selected graph unavailable');
                }
                graph = graph || {};
                if (isVermeer && graph.name) {
                    const detail = await api.manage.getGraph(
                        currentGraphSpace, graph.name, INLINE_ERROR_CONFIG
                    );
                    if (graphRequest.current !== request) {
                        return;
                    }
                    if (detail?.status !== 200 || !detail.data ||
                        typeof detail.data !== 'object' || Array.isArray(detail.data)) {
                        throw new Error('graph details unavailable');
                    }
                    graph = {
                        ...graph, ...detail.data, name: graph.name,
                        status: detail.data.status || CREATED,
                    };
                }
                setCurrentGraph(current => (
                    _.isEmpty(graph) && _.isEmpty(current) ? current : graph
                ));
            }
            catch {
                if (graphRequest.current === request) {
                    setGraphError(true);
                    setCurrentGraph(current => (_.isEmpty(current) ? current : {}));
                }
            }
            finally {
                if (graphRequest.current === request) {
                    setGraphLoading(false);
                }
            }
        },
        [currentGraphSpace, graphFromParam, isVermeer]
    );

    useEffect(() => () => {
        graphSpaceRequest.current = null;
        graphRequest.current = null;
        loadRequest.current = null;
        pendingLoadRequests.current.clear();
    }, []);

    useEffect(() => {
        loadRequest.current = pendingLoadRequests.current.get(graphKey) || null;
    }, [graphKey]);

    useEffect(() => {
        if (!isVermeer || loadTask !== undefined || currentGraphStatus !== LOADING) {
            return;
        }
        let active = true;
        let timer;
        const refresh = async () => {
            await getGraphs();
            if (active) {
                timer = setTimeout(refresh, 2000);
            }
        };
        timer = setTimeout(refresh, 2000);
        return () => {
            active = false;
            clearTimeout(timer);
            graphRequest.current = null;
        };
    }, [currentGraphStatus, getGraphs, isVermeer, loadTask]);

    useEffect(() => {
        if (loadTask === undefined) {
            return;
        }
        let active = true;
        let timer;
        const poll = async () => {
            try {
                const response = await api.analysis.fetchAsyncTaskResult(
                    currentGraphSpace, currentGraph.name, loadTask
                );
                if (!active) {
                    return;
                }
                if (response?.status !== 200) {
                    throw new Error('load task unavailable');
                }
                setGraphError(false);
                if (['success', 'failed', 'cancelled'].includes(response.data?.task_status)) {
                    await getGraphs();
                    if (active) {
                        setLoadTasks(current => {
                            const pending = {...current};
                            delete pending[graphKey];
                            return pending;
                        });
                    }
                    return;
                }
            }
            catch {
                if (active) {
                    setGraphError(true);
                }
            }
            if (active) {
                timer = setTimeout(poll, 2000);
            }
        };
        timer = setTimeout(poll, 2000);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [currentGraph.name, currentGraphSpace, getGraphs, graphKey, loadTask]);

    useEffect(
        () => {
            if (!currentGraphSpace && _.isEmpty(currentGraph)) {
                getGraphSpaces();
            }
        },
        [currentGraph, currentGraphSpace, getGraphSpaces]
    );

    useEffect(
        () => {
            if (!currentGraphSpace || (
                graphSpaceFromParam && graphSpaceFromParam !== currentGraphSpace
            )) {
                return undefined;
            }
            setCurrentGraph(current => (
                graphFromParam && current.name && current.name !== graphFromParam
                    ? {} : current
            ));
            getGraphs();
            return () => {
                graphRequest.current = null;
            };
        },
        [currentGraphSpace, graphFromParam, graphSpaceFromParam, getGraphs]
    );

    useEffect(
        () => {
            onGraphInfoChange && onGraphInfoChange(currentGraphSpace, loadTask === undefined
                ? currentGraph : {...currentGraph, status: LOADING});
        },
        [currentGraph, currentGraphSpace, loadTask, onGraphInfoChange]
    );

    useEffect(
        () => {
            if (taskId || !moduleName || !currentGraphSpace || !currentGraph?.name) {
                return;
            }
            if (graphSpaceFromParam && graphFromParam) {
                return;
            }
            if (graphSpaceFromParam === currentGraphSpace && graphFromParam === currentGraph.name) {
                return;
            }
            navigate(`/${moduleName}/${currentGraphSpace}/${currentGraph.name}`, {replace: true});
        },
        [
            currentGraph.name,
            currentGraphSpace,
            graphFromParam,
            graphSpaceFromParam,
            moduleName,
            navigate,
            taskId,
        ]
    );

    const handleGraphSpaceChange = useCallback(
        value => {
            graphRequest.current = null;
            setCurrentGraphSpace(value);
            setCurrentGraph({});
            setGraphError(false);
        },
        []
    );

    useEffect(() => {
        if (graphSpaceFromParam
            && graphSpaceFromParam !== currentGraphSpace) {
            handleGraphSpaceChange(graphSpaceFromParam);
        }
    }, [
        currentGraphSpace,
        graphSpaceFromParam,
        handleGraphSpaceChange,
    ]);

    const handleSwitchOlapMode = useCallback(
        checked => {
            onOlapModeChange(checked);
        },
        [onOlapModeChange]
    );

    const onStatusBtnClick = useCallback(() => {
        navigate('/asyncTasks');
    }, [navigate]);

    const onLoadBtnClick = useCallback(async () => {
        if (pendingLoadRequests.current.has(graphKey) || loadTask !== undefined) {
            return;
        }
        const params = {
            graphspace: currentGraphSpace,
            graph: currentGraph.name,
            task_type: currentGraphStatus === LOADED ? 'reload' : 'load',
        };

        const request = Symbol('load-vermeer');
        loadRequest.current = request;
        pendingLoadRequests.current.set(graphKey, request);
        setPendingLoads(current => ({...current, [graphKey]: true}));
        try {
            const res = await api.analysis.loadVermeerTask(params, INLINE_ERROR_CONFIG);
            if (pendingLoadRequests.current.get(graphKey) !== request) {
                return;
            }
            if (res?.status === 200 && res.data?.task_id < 0) {
                setLoadTasks(current => ({...current, [graphKey]: res.data.task_id}));
            }
            if (loadRequest.current !== request) {
                return;
            }
            if (res?.status !== 200) {
                message.error(t('analysis.topbar.load_vermeer_failed'));
                return;
            }
            if (!(res.data?.task_id < 0)) {
                await getGraphs();
            }
        }
        catch {
            if (loadRequest.current === request) {
                message.error(t('analysis.topbar.load_vermeer_failed'));
            }
        }
        finally {
            if (pendingLoadRequests.current.get(graphKey) === request) {
                pendingLoadRequests.current.delete(graphKey);
                setPendingLoads(current => {
                    const pending = {...current};
                    delete pending[graphKey];
                    return pending;
                });
            }
        }
    }, [
        currentGraph.name,
        currentGraphSpace,
        currentGraphStatus,
        getGraphs,
        graphKey,
        loadTask,
        t,
    ]);

    const handleClickNavigate = useCallback(
        () => {
            navigate(`/graphspace/${currentGraphSpace}/graph/${currentGraph?.name}/meta`);
        },
        [currentGraph.name, currentGraphSpace, navigate]
    );

    return (
        <div className={c.pageHeader}>
            {
                showVermeerGraphInfo && (
                    <span className={c.vermeerInfo}>
                        <Button
                            type="text"
                            disabled={currentGraphStatus === CREATED}
                            onClick={onStatusBtnClick}
                        >
                            <span className={c.graphStatus}>{renderStatusTag(currentGraphStatus)}</span>
                            {showLoadFailureAction && (
                                <span className={c.loadFailureAction}>
                                    {t('analysis.async_task.action.check_reason')}
                                </span>
                            )}
                        </Button>
                        {
                            currentGraphLoadTime && (
                                <span className={c.graphLoadTime}>
                                    <span>{t('analysis.topbar.recent_load_time')}</span>
                                    <span>{renderLoadTime()}</span>
                                </span>)
                        }
                        <Button
                            size='small'
                            onClick={onLoadBtnClick}
                            loading={isLoadRequestLoading}
                            disabled={currentGraphStatus === LOADING || isLoadRequestLoading}
                        >
                            {currentGraphStatus === LOADED
                                ? t('analysis.topbar.reload_to_vermeer')
                                : t('analysis.topbar.load_to_vermeer')}
                        </Button>
                    </span>
                )
            }
            {
                showNavigationButton && (
                    <span className={c.metadataNavigation}>
                        <Button
                            size='small'
                            onClick={handleClickNavigate}
                            disabled={_.isEmpty(currentGraph)}
                        >
                            <span>{t('analysis.topbar.metadata_config')}</span>
                        </Button>
                        <Tooltip
                            placement="bottom"
                            title={t('analysis.topbar.metadata_tooltip')}
                        >
                            <QuestionCircleOutlined />
                        </Tooltip>
                    </span>
                )
            }
            {
                showOlapSwitch && (
                    <div className={c.olapSwitchButton}>
                        <span className={c.olapSwitchTitle}>{t('analysis.topbar.olap_result')}</span>
                        <Switch
                            checked={isOlapModeEnable}
                            checkedChildren={t('common.verify.yes')}
                            unCheckedChildren={t('common.verify.no')}
                            onChange={handleSwitchOlapMode}
                            loading={isOlapModeLoading}
                            disabled={!currentGraphSpace || _.isEmpty(currentGraph) || graphError}
                        />
                    </div>
                )
            }
            {graphSpaceError && (
                <Alert
                    className={c.contextError}
                    type='error'
                    showIcon
                    title={t('analysis.topbar.graph_spaces_failed')}
                    action={(
                        <Button size='small' onClick={getGraphSpaces}>
                            {t('analysis.topbar.retry_graph_spaces')}
                        </Button>
                    )}
                />
            )}
            {graphError && (
                <Alert
                    className={c.contextError}
                    type='error'
                    showIcon
                    title={t('analysis.topbar.graphs_failed')}
                    action={(
                        <Button size='small' onClick={getGraphs}>
                            {t('analysis.topbar.retry_graphs')}
                        </Button>
                    )}
                />
            )}
        </div>

    );
};

export default TopBar;
