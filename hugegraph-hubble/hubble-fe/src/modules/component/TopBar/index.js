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
 * @file 图分析模块Header，用于初始化、选择图空间和图，以及OLAP开关
 */

import React, {useCallback, useEffect, useState, useContext} from 'react';
import {Select, Switch, Button, Tag, message, Typography, Tooltip} from 'antd';
import {SyncOutlined, QuestionCircleOutlined} from '@ant-design/icons';
import GraphAnalysisContext from '../../Context';
import * as api from '../../../api';
import {format} from 'date-fns';
import {GRAPH_LOAD_STATUS} from '../../../utils/constants';
import {useNavigate, useParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import _ from 'lodash';
import c from './index.module.scss';

const {Text} = Typography;

const {
    LOADED,
    LOADING,
    CREATED,
    ERROR,
} = GRAPH_LOAD_STATUS;

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
    const [graphSpaceList, setGraphSpaceList] = useState([]);
    const [currentGraphSpace, setCurrentGraphSpace] = useState();
    const [isGraphSpaceLoading, setGraphSpaceLoading] = useState(false);
    const [graphList, setGraphList] = useState([]);
    const [currentGraph, setCurrentGraph] = useState({});
    const [isGraphLoading, setGraphLoading] = useState(false);
    const [isLoadRequestLoading, setLoadRequestLoading] = useState(false);

    const {
        status: currentGraphStatus,
        last_load_time: currentGraphLoadTime,
    } = currentGraph;

    const showVermeerGraphInfo = isVermeer && !_.isEmpty(currentGraph);

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

    const getGraphSpaceOptions = () => {
        return graphSpaceList?.map(item => ({
            value: item,
            label: item === 'DEFAULT'
                ? t('analysis.topbar.default_graph_space')
                : item,
        }));
    };

    const getGraphOptions = () => {
        return graphList?.map(item => {
            const {name, status} = item || {};
            const statusTag = renderStatusTag(status);
            return {
                value: name,
                label: (
                    <div className={c.graphOptions}>
                        <Text className={c.graphName} ellipsis={{tooltip: name}}>{name}</Text>
                        <span className={c.graphStatus}>{statusTag}</span>
                    </div>),
            };
        });
    };

    const getGraphSpaces = useCallback(
        async () => {
            setGraphSpaceLoading(true);
            const response = await api.analysis.getGraphSpaceList();
            const {status, data} = response || {};
            if (status === 200) {
                const {graphspaces} = data;
                setGraphSpaceList(graphspaces);
                if (!_.isEmpty(graphspaces)) {
                    // 如果有路由参数则为路由参数，否则为列表第一项；
                    setCurrentGraphSpace(graphSpaceFromParam || graphspaces[0]);
                }
            }
            setGraphSpaceLoading(false);
        },
        [graphSpaceFromParam]
    );

    const getGraphs = useCallback(
        async () => {
            setGraphLoading(true);
            const response = await api.analysis.getGraphList(currentGraphSpace);
            const {status, data} = response || {};
            if (status === 200) {
                const {graphs = []} = data;
                setGraphList(graphs);
                if (!_.isEmpty(graphs)) {
                    // 如果有路由参数且列表中可以找到(存在有路由参数但是切换空间)，则设置为路由参数，否则为列表第一项；
                    const graph = _.find(graphs, {name: graphFromParam}) || graphs[0];
                    setCurrentGraph(graph);
                }
            }
            setGraphLoading(false);
            setLoadRequestLoading(false);
        },
        [currentGraphSpace, graphFromParam]
    );

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
            if (currentGraphSpace && _.isEmpty(currentGraph)) {
                getGraphs();
            }
        },
        [currentGraph, currentGraphSpace, getGraphs]
    );

    useEffect(
        () => {
            onGraphInfoChange && onGraphInfoChange(currentGraphSpace, currentGraph);
        },
        [currentGraph, currentGraphSpace, onGraphInfoChange]
    );

    useEffect(
        () => {
            if (taskId || !moduleName || !currentGraphSpace || !currentGraph?.name) {
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
            setCurrentGraphSpace(value);
            setCurrentGraph({});
        },
        []
    );

    const handleGraphChange = useCallback(
        value => {
            const currentGraphInfo = _.find(graphList, {name: value});
            setCurrentGraph(currentGraphInfo);
        },
        [graphList]
    );

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
        const params = {
            graphspace: currentGraphSpace,
            graph: currentGraph.name,
            task_type: currentGraphStatus === LOADED ? 'reload' : 'load',
        };

        setLoadRequestLoading(true);
        const res = await api.analysis.loadVermeerTask(params);
        const {status, message: errMsg} = res || {};
        if (status !== 200) {
            !errMsg && message.error(t('analysis.topbar.load_vermeer_failed'));
            setLoadRequestLoading(false);
        }
        else {
            getGraphs();
        }
    }, [currentGraph.name, currentGraphSpace, currentGraphStatus, getGraphs, t]);

    const handleClickNavigate = useCallback(
        () => {
            navigate(`/graphspace/${currentGraphSpace}/graph/${currentGraph?.name}/meta`);
        },
        [currentGraph.name, currentGraphSpace, navigate]
    );

    return (
        <div className={c.pageHeader}>
            <span>{t('analysis.topbar.current_graph_space')}</span>
            <Select
                value={currentGraphSpace}
                onChange={handleGraphSpaceChange}
                options={getGraphSpaceOptions()}
                style={{width: 120}}
                bordered={false}
                loading={isGraphSpaceLoading}
            />
            <span>{t('analysis.topbar.current_graph')}</span>
            <Select
                popupClassName={c.currentGraphSelect}
                value={currentGraph.name}
                onChange={handleGraphChange}
                options={getGraphOptions()}
                style={{width: 120}}
                bordered={false}
                loading={isGraphLoading}
                placeholder={t('analysis.topbar.select')}
                optionLabelProp="value"
            />
            {
                showVermeerGraphInfo && (
                    <span className={c.vermeerInfo}>
                        <Button type="text" disabled={currentGraphStatus === CREATED} onClick={onStatusBtnClick}>
                            <span className={c.graphStatus}>{renderStatusTag(currentGraphStatus)}</span>
                        </Button>
                        {
                            currentGraphLoadTime && (
                                <span className={c.graphLoadTime}>
                                    <span>{t('analysis.topbar.recent_load_time')}</span>
                                    <span>{renderLoadTime()}</span>
                                </span>)
                        }
                        <Button size='small' onClick={onLoadBtnClick} disabled={currentGraphStatus === LOADING}>
                            {currentGraphStatus === LOADED
                                ? t('analysis.topbar.reload_to_vermeer')
                                : t('analysis.topbar.load_to_vermeer')}
                        </Button>
                    </span>
                )
            }
            {
                showNavigationButton && (
                    <>
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
                            className={c.questionCircleIcon}
                        >
                            <QuestionCircleOutlined />
                        </Tooltip>
                    </>
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
                        />
                    </div>
                )
            }
        </div>

    );
};

export default TopBar;
