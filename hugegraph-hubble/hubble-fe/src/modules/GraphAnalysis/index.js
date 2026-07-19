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

import React, {useState, useCallback, useEffect, useRef} from 'react';
import {Alert, Button, PageHeader, Spin} from 'antd';
import AnalysisHome from '../analysis/Home';
import AlgorithmHome from '../algorithm/Home';
import AsyncTaskHome from '../asyncTasks/Home';
import GraphAnalysisContext from '../Context';
import TopBar from '../component/TopBar';
import {GRAPH_ANALYSIS_MODULE} from '../../utils/constants';
import _ from 'lodash';
import * as api from '../../api';
import {useTranslation} from 'react-i18next';

const {GREMLIN, ALGORITHMS, ASYNCTASKS} = GRAPH_ANALYSIS_MODULE;
const INLINE_ERROR_CONFIG = {suppressBusinessErrorToast: true};

const pageHeaderNameKeys = {
    [GREMLIN]: 'analysis.query.name',
    [ALGORITHMS]: 'analysis.algorithm.name',
    [ASYNCTASKS]: 'analysis.async_task.name',
};

const GraphAnalysisHome = props => {
    const {moduleName} = props;
    const {t} = useTranslation();

    const [currentOlapMode, setCurrentOlapMode] = useState(false);
    const [isOlapModeLoading, setOlapModeLoading] = useState(false);
    const [olapError, setOlapError] = useState(false);
    const [vermeerReady, setVermeerReady] = useState(false);
    const [vermeerLoading, setVermeerLoading] = useState(true);
    const [vermeerError, setVermeerError] = useState(false);
    const olapRequest = useRef(null);
    const vermeerRequest = useRef(null);
    const [context, setContext] = useState(
        {
            graphSpace: null,
            graph: null,
            graphLoadTime: null,
            graphStatus: null,
            isVermeer: false,
        }
    );

    const renderModule = () => {
        if (moduleName !== GREMLIN && !vermeerReady) {
            return vermeerLoading ? <Spin /> : null;
        }
        switch (moduleName) {
            case GREMLIN:
                return <AnalysisHome />;
            case ALGORITHMS:
                return <AlgorithmHome />;
            case ASYNCTASKS:
                return <AsyncTaskHome />;
            default:
                break;
        }
    };

    const onOlapModeChange = useCallback(
        async open => {
            const {graphSpace, graph} = context;
            const request = Symbol('switch-olap');
            olapRequest.current = request;
            setOlapModeLoading(true);
            setOlapError(false);
            try {
                const response = await api.analysis.switchOlapMode(
                    graphSpace, graph, open ? 0 : 1, INLINE_ERROR_CONFIG
                );
                if (olapRequest.current !== request) {
                    return;
                }
                if (response?.status !== 200) {
                    throw new Error('olap update unavailable');
                }
                setCurrentOlapMode(open);
            }
            catch {
                if (olapRequest.current === request) {
                    setOlapError(true);
                }
            }
            finally {
                if (olapRequest.current === request) {
                    setOlapModeLoading(false);
                }
            }
        },
        [context]
    );

    const getCurrentOlapMode = useCallback(
        async (graphSpace, graph) => {
            if (!graphSpace || !graph) {
                olapRequest.current = null;
                setCurrentOlapMode(false);
                setOlapModeLoading(false);
                return;
            }
            const request = Symbol('get-olap');
            olapRequest.current = request;
            setOlapModeLoading(true);
            setOlapError(false);
            try {
                const response = await api.analysis.getOlapMode(
                    graphSpace, graph, INLINE_ERROR_CONFIG
                );
                if (olapRequest.current !== request) {
                    return;
                }
                const {status, data} = response || {};
                if (status !== 200 || !data) {
                    throw new Error('olap status unavailable');
                }
                const {status: currentOlapStatus} = data;
                setCurrentOlapMode(currentOlapStatus === '0');
            }
            catch {
                if (olapRequest.current === request) {
                    setOlapError(true);
                    setCurrentOlapMode(false);
                }
            }
            finally {
                if (olapRequest.current === request) {
                    setOlapModeLoading(false);
                }
            }
        },
        []
    );

    const onGraphInfoChange = useCallback(
        (graphSpace, graph) => {
            const {name: currentGraph, last_load_time, status} = graph || {};
            if (graphSpace && !_.isEmpty(graph)) {
                getCurrentOlapMode(graphSpace, currentGraph);
            }
            else {
                olapRequest.current = null;
                setCurrentOlapMode(false);
                setOlapModeLoading(false);
                setOlapError(false);
            }
            setContext(context => ({
                ...context,
                graphSpace,
                graph: currentGraph,
                graphLoadTime: last_load_time,
                graphStatus: status,
            }));
        },
        [getCurrentOlapMode]
    );

    const getVermeer = useCallback(async () => {
        const request = Symbol('get-vermeer');
        vermeerRequest.current = request;
        setVermeerLoading(true);
        setVermeerError(false);
        try {
            const response = await api.auth.getVermeer(INLINE_ERROR_CONFIG);
            if (vermeerRequest.current !== request) {
                return;
            }
            const {status, data} = response || {};
            if (status !== 200) {
                throw new Error('vermeer capability unavailable');
            }
            const {enable} = data || {};
            setContext(context => ({
                ...context,
                isVermeer: Boolean(enable),
            }));
            setVermeerReady(true);
        }
        catch {
            if (vermeerRequest.current === request) {
                setVermeerError(true);
                setVermeerReady(false);
            }
        }
        finally {
            if (vermeerRequest.current === request) {
                setVermeerLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        getVermeer();
        return () => {
            vermeerRequest.current = null;
            olapRequest.current = null;
        };
    }, [getVermeer]);

    const retryOlap = useCallback(() => {
        getCurrentOlapMode(context.graphSpace, context.graph);
    }, [context.graph, context.graphSpace, getCurrentOlapMode]);

    return (
        <GraphAnalysisContext.Provider value={context}>
            <PageHeader
                className='graphAnalysisHeader'
                ghost={false}
                onBack={false}
                title={t(pageHeaderNameKeys[moduleName])}
                subTitle={moduleName === ALGORITHMS
                    ? t('analysis.algorithm.guide')
                    : undefined}
                extra={<TopBar
                    moduleName={moduleName}
                    onGraphInfoChange={onGraphInfoChange}
                    showOlapSwitch={moduleName !== ASYNCTASKS}
                    showNavigationButton={moduleName !== ASYNCTASKS}
                    isOlapModeEnable={currentOlapMode}
                    isOlapModeLoading={isOlapModeLoading}
                    onOlapModeChange={onOlapModeChange}
                />}
            />
            {vermeerError && (
                <Alert
                    type='error'
                    showIcon
                    message={t('analysis.topbar.get_vermeer_failed')}
                    action={(
                        <Button size='small' onClick={getVermeer}>
                            {t('analysis.topbar.retry_vermeer')}
                        </Button>
                    )}
                />
            )}
            {olapError && (
                <Alert
                    type='error'
                    showIcon
                    message={t('analysis.topbar.olap_failed')}
                    action={(
                        <Button size='small' onClick={retryOlap}>
                            {t('analysis.topbar.retry_olap')}
                        </Button>
                    )}
                />
            )}
            {renderModule()}
        </GraphAnalysisContext.Provider>
    );
};

export default GraphAnalysisHome;
