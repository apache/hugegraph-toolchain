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
 * @file Gremlin语法分析 TabelView
 */

import React, {useCallback, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {Alert, Table} from 'antd';
import GraphStatusView from '../../../component/GraphStatusView';
import TaskNavigateView from '../../../component/TaskNavigateView';
import {GRAPH_STATUS} from '../../../../utils/constants';
import _ from 'lodash';
import c from './index.module.scss';
import {
    getQueryResultStandbyMessage,
    isJsonBigNumber,
    projectJsonValue,
} from '../Home/utils';

const {
    STANDBY,
    LOADING,
    SUCCESS,
    FAILED,
    UPLOAD_FAILED,
} = GRAPH_STATUS;
export function tableRowKey(record, index) {
    return record.id ?? record._id ?? `result-row-${index}`;
}

export const LARGE_TABLE_RESULT_THRESHOLD = 200;

export function isLargeTableResult(rows) {
    return Array.isArray(rows) && rows.length >= LARGE_TABLE_RESULT_THRESHOLD;
}

export function renderTableCell(value) {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (isJsonBigNumber(value)) {
        return value.toString();
    }
    if (value === undefined) {
        return '';
    }
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'object') {
        return JSON.stringify(projectJsonValue(value));
    }
    return String(value);
}

const TableView = props => {
    const {t} = useTranslation();
    const {
        queryResultTable,
        queryStatus,
        isQueryMode,
        queryMessage,
        asyncTaskId,
    } = props;

    const tableColums = queryResultTable.header?.map(title => ({
        title,
        dataIndex: title,
        render(text) {
            return renderTableCell(text);
        },
    }));

    const statusMessage = useMemo(
        () => ({
            [STANDBY]: getQueryResultStandbyMessage(t, isQueryMode),
            [LOADING]: isQueryMode
                ? t('analysis.query_result.loading')
                : t('analysis.query_result.submitting_task'),
            [FAILED]: queryMessage || t('analysis.query_result.submit_failed'),
            [UPLOAD_FAILED]: queryMessage || t('analysis.query_result.import_failed'),
        }),
        [isQueryMode, queryMessage, t]
    );

    const renderSuccessView = useCallback(
        () => {
            if (isQueryMode) {
                if (_.isNull(queryResultTable?.rows)) {
                    return (
                        <GraphStatusView status={SUCCESS} message={t('analysis.query_result.no_table_result')} />
                    );
                }
                return (
                    <div className={c.tableWrapper}>
                        {isLargeTableResult(queryResultTable?.rows) && (
                            <Alert
                                className={c.largeResultNotice}
                                showIcon
                                type="info"
                                message={t('analysis.query_result.large_table_title', {
                                    count: queryResultTable.rows.length,
                                })}
                                description={t('analysis.query_result.large_table_description')}
                            />
                        )}
                        <Table
                            rowKey={tableRowKey}
                            dataSource={queryResultTable?.rows || []}
                            columns={tableColums}
                            pagination={{position: ['bottomCenter']}}
                            scroll={{
                                x: 'max-content',
                                y: 'calc(var(--analysis-result-height, 100vh) - 120px)',
                            }}
                        />
                    </div>
                );

            }
            return <TaskNavigateView message={t('analysis.query_result.submit_success')} taskId={asyncTaskId} />;
        },
        [asyncTaskId, isQueryMode, queryResultTable?.rows, tableColums, t]
    );

    const renderJsonView = () => {
        if (queryStatus === SUCCESS) {
            return renderSuccessView();
        }
        return <GraphStatusView status={queryStatus} message={statusMessage[queryStatus]} />;
    };


    return (
        renderJsonView()
    );
};

export default React.memo(TableView);
