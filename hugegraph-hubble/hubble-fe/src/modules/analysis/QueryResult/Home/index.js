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
 * @file Gremlin语法分析 查询结果
 */

import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Alert, Tabs} from 'antd';
import JsonView from '../JsonView';
import GraphResult from '../GraphResult/Home';
import TableView from '../TableView';
import {
    GRAPH_EDGE_LIMIT,
    GRAPH_NODE_LIMIT,
    getGraphViewLimitStatus,
    getJsonViewContent,
} from './utils';
import c from './index.module.scss';

const QueryResult = props => {
    const {t} = useTranslation();
    const {
        queryResult,
        asyncTaskResult,
        queryStatus,
        queryMessage,
        isQueryMode,
        ...args
    } = props;

    const {
        graph_view: queryResultGraph = {},
        json_view: queryResultJson = {},
        table_view: queryResultTable = {},
    } = queryResult || {};

    const jsonViewContent = useMemo(
        () => getJsonViewContent(queryResultJson),
        [queryResultJson]
    );
    const graphLimit = useMemo(
        () => getGraphViewLimitStatus(queryResultGraph),
        [queryResultGraph]
    );
    const [activeView, setActiveView] = useState(graphLimit.exceeded ? 2 : 1);
    useEffect(() => {
        setActiveView(graphLimit.exceeded ? 2 : 1);
    }, [graphLimit.exceeded, queryResultGraph]);

    const GRAPH_VIEW = t('analysis.query_result.graph');
    const TABLE_VIEW = t('analysis.query_result.table');
    const JSON_VIEW = 'JSON';
    const renderTab = type => {
        let iconClassName = '';
        switch (type) {
            case GRAPH_VIEW:
                iconClassName = c.graphIcon;
                break;
            case TABLE_VIEW:
                iconClassName = c.tableIcon;
                break;
            case JSON_VIEW:
                iconClassName = c.jsonIcon;
                break;
        }
        return (
            <div className={c.tab}>
                <i className={iconClassName} />
                <span>{type}</span>
            </div>
        );
    };

    const graphView = graphLimit.exceeded ? (
        <Alert
            showIcon
            type="warning"
            message={t('analysis.query_result.graph_limit_title')}
            description={t('analysis.query_result.graph_limit_description', {
                nodes: graphLimit.nodeCount,
                edges: graphLimit.edgeCount,
                nodeLimit: GRAPH_NODE_LIMIT,
                edgeLimit: GRAPH_EDGE_LIMIT,
            })}
        />
    ) : (
        <GraphResult
            data={queryResultGraph}
            isQueryMode={isQueryMode}
            queryStatus={queryStatus}
            queryMessage={queryMessage}
            asyncTaskId={asyncTaskResult}
            {...args}
        />
    );

    return (
        <div className={c.queryResult}>
            <Tabs
                tabPosition="left"
                className={c.queryResultTabs}
                activeKey={activeView}
                onChange={setActiveView}
                items={[
                    {
                        label: renderTab(GRAPH_VIEW),
                        key: 1,
                        children: graphView,
                    },
                    {
                        label: renderTab(TABLE_VIEW),
                        key: 2,
                        children: <TableView
                            queryResultTable={queryResultTable}
                            queryStatus={queryStatus}
                            isQueryMode={isQueryMode}
                            queryMessage={queryMessage}
                            asyncTaskId={asyncTaskResult}
                        />,
                    },
                    {
                        label: renderTab(JSON_VIEW),
                        key: 3,
                        children: <JsonView
                            jsonViewContent={jsonViewContent}
                            queryStatus={queryStatus}
                            isQueryMode={isQueryMode}
                            queryMessage={queryMessage}
                            asyncTaskId={asyncTaskResult}
                        />,
                    },
                ]}
            />
        </div>
    );
};

export default QueryResult;
