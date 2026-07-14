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

import React, {useState, useCallback, useEffect} from 'react';
import {PageHeader, message} from 'antd';
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
            setOlapModeLoading(true);
            const response = await api.analysis.switchOlapMode(graphSpace, graph, open ? 0 : 1);
            if (response.status === 200) {
                setCurrentOlapMode(open);
            }
            setOlapModeLoading(false);
        },
        [context]
    );

    const getCurrentOlapMode = useCallback(
        async (graphSpace, graph) => {
            setOlapModeLoading(true);
            const response = await api.analysis.getOlapMode(graphSpace, graph);
            const {status, data} = response;
            if (status === 200) {
                const {status: currentOlapStatus} = data;
                setCurrentOlapMode(currentOlapStatus === '0');
            }
            setOlapModeLoading(false);
        },
        []
    );

    const onGraphInfoChange = useCallback(
        (graphSpace, graph) => {
            const {name: currentGraph, last_load_time, status} = graph;
            if (graphSpace && !_.isEmpty(graph)) {
                getCurrentOlapMode(graphSpace, currentGraph);
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

    useEffect(
        () => {
            (async () => {
                const response = await api.auth.getVermeer();
                const {status, data, message: errMsg} = response || {};
                const {enable} = data || {};
                if (status === 200) {
                    setContext(context => (
                        {
                            ...context,
                            isVermeer: enable || false,
                        }
                    ));
                }
                else {
                    !errMsg && message.error(t('analysis.topbar.get_vermeer_failed'));
                }
            })();
        },
        [t]
    );

    return (
        <GraphAnalysisContext.Provider value={context}>
            <PageHeader
                className='graphAnalysisHeader'
                ghost={false}
                onBack={false}
                title={t(pageHeaderNameKeys[moduleName])}
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
            {renderModule()}
        </GraphAnalysisContext.Provider>
    );
};

export default GraphAnalysisHome;
