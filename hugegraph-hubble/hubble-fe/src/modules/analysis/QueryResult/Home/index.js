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

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Alert, Button, Tabs} from 'antd';
import JsonView from '../JsonView';
import GraphResult from '../GraphResult/Home';
import TableView from '../TableView';
import {
    GRAPH_EDGE_LIMIT,
    GRAPH_NODE_LIMIT,
    getGraphViewLimitStatus,
    getJsonViewContent,
    projectJsonValue,
} from './utils';
import c from './index.module.scss';
import {GRAPH_STATUS} from '../../../../utils/constants';

const PREVIEW_ITEM_LIMIT = 3;
const PREVIEW_CHAR_LIMIT = 1200;

const getPreviewContent = (tableView, jsonViewContent) => {
    const rows = Array.isArray(tableView?.rows) ? tableView.rows : [];
    const content = rows.length > 0 ? projectJsonValue(rows) : jsonViewContent;
    if (Array.isArray(content)) {
        return {
            content: content.slice(0, PREVIEW_ITEM_LIMIT),
            truncated: content.length > PREVIEW_ITEM_LIMIT,
        };
    }
    if (content && typeof content === 'object') {
        const entries = Object.entries(content);
        return {
            content: Object.fromEntries(entries.slice(0, PREVIEW_ITEM_LIMIT)),
            truncated: entries.length > PREVIEW_ITEM_LIMIT,
        };
    }
    return {content, truncated: false};
};

const serializePreview = preview => {
    const text = JSON.stringify(preview.content, null, 2) ?? '';
    if (text.length <= PREVIEW_CHAR_LIMIT) {
        return {text, truncated: preview.truncated};
    }
    return {
        text: `${text.slice(0, PREVIEW_CHAR_LIMIT)}\n…`,
        truncated: true,
    };
};

const hasPreviewContent = content => {
    if (Array.isArray(content)) {
        return content.length > 0;
    }
    if (content && typeof content === 'object') {
        return Object.keys(content).length > 0;
    }
    return content !== undefined && content !== null;
};

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
    const handleViewFullJson = useCallback(() => setActiveView(3), []);
    useEffect(() => {
        setActiveView(graphLimit.exceeded ? 2 : 1);
    }, [graphLimit.exceeded, queryResultGraph]);

    const GRAPH_VIEW = t('analysis.query_result.graph');
    const TABLE_VIEW = t('analysis.query_result.table');
    const JSON_VIEW = 'JSON';
    const preview = useMemo(
        () => getPreviewContent(queryResultTable, jsonViewContent),
        [jsonViewContent, queryResultTable]
    );
    const serializedPreview = useMemo(() => serializePreview(preview), [preview]);
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

    const nonGraphResult = queryStatus === GRAPH_STATUS.SUCCESS
        && isQueryMode
        && graphLimit.nodeCount === 0
        && graphLimit.edgeCount === 0;
    const nonGraphPreview = (
        <div className={c.nonGraphPreview}>
            <Alert
                showIcon
                type="success"
                message={hasPreviewContent(preview.content)
                    ? t('analysis.query_result.non_graph_title')
                    : t('analysis.query_result.empty_success')}
                description={hasPreviewContent(preview.content) ? (
                    <>
                        <p>{t('analysis.query_result.non_graph_description')}</p>
                        <pre className={c.previewContent}>
                            {serializedPreview.text}
                        </pre>
                        {serializedPreview.truncated && (
                            <p className={c.previewHint}>
                                {t('analysis.query_result.preview_truncated')}
                            </p>
                        )}
                        <Button type="link" onClick={handleViewFullJson}>
                            {t('analysis.query_result.view_full_json')}
                        </Button>
                    </>
                ) : t('analysis.query_result.empty_success_description')}
            />
        </div>
    );
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
    ) : nonGraphResult ? nonGraphPreview : (
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
