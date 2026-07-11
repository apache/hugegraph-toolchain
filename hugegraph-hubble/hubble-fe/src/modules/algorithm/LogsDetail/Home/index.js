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
 * @file 图算法表格 Home
 */

import React, {useCallback, useContext} from 'react';
import {useTranslation} from 'react-i18next';
import GraphAnalysisContext from '../../../Context';
import {Alert, Button, Tabs, message} from 'antd';
import ExecuteLog from '../ExecuteLog';
import Favorite from '../Favorite';
import * as api from '../../../../api/index';
import c from './index.module.scss';

const LogsDetail = props => {
    const {t} = useTranslation();
    const {
        executionLogsLoading,
        favoriteQueriesLoading,
        executionLogsError,
        favoriteQueriesError,
        onRetryExecutionLogs,
        onRetryFavoriteQueries,
        pageExecute,
        pageFavorite,
        pageSize,
        onExecutePageChange,
        onFavoritePageChange,
        onChangeFavorSearch,
        onSortChange,
        onRefresh,
        favoriteQueriesData,
        executionLogsData,
    } = props;

    const {graphSpace: currentGraphSpace, graph: currentGraph} = useContext(GraphAnalysisContext);
    const {records: favoriteQueriesDataRecords, total: favoriteQueriesDataTotal} = favoriteQueriesData;
    const {records: executionLogsDataRecords, total: executionLogsDataTotal} = executionLogsData;

    const addItemByName = useCallback(
        (content, favoriteName) => {
            const params = {
                'content': content,
                'name': favoriteName,
                'type': 'ALGORITHM',
            };
            api.analysis.addFavoriate(currentGraphSpace, currentGraph, params)
                .then(res => {
                    const {status, message: errMsg} = res;
                    if (status === 200) {
                        message.success(t('analysis.logs.favorite_success'));
                        onRefresh();
                    }
                    else {
                        !errMsg && message.error(t('analysis.logs.favorite_failed'));
                    }
                }).catch(err => {
                    console.error(err);
                });
        }, [currentGraph, currentGraphSpace, onRefresh, t]);

    const onAddHandler = useCallback(
        (content, favoriteName) => {
            addItemByName(content, favoriteName);
        },
        [addItemByName]
    );

    const delItemByRowId = useCallback(
        favoriteId => {
            api.analysis.deleteQueryCollection(currentGraphSpace, currentGraph, favoriteId)
                .then(res => {
                    const {status, message: errMsg} = res;
                    if (status === 200) {
                        message.success(t('analysis.logs.delete_success'));
                        onRefresh();
                    }
                    else {
                        !errMsg && message.error(t('analysis.logs.delete_failed'));
                    }
                }).catch(err => {
                    console.error(err);
                });
        }, [currentGraph, currentGraphSpace, onRefresh, t]);

    const onDelHandler = useCallback(
        id => {
            delItemByRowId(id);
        },
        [delItemByRowId]
    );

    const editItemByRow =  useCallback(
        (rowData, favoriteName) => {
            const params = {
                id: rowData.id,
                content: rowData.content,
                name: favoriteName,
                'type': 'ALGORITHM',
            };
            api.analysis.editQueryCollection(currentGraphSpace, currentGraph, params)
                .then(res => {
                    const {status, message: errMsg} = res;
                    if (status === 200) {
                        message.success(t('analysis.logs.edit_success'));
                        onRefresh();
                    }
                    else {
                        !errMsg && message.error(t('analysis.logs.edit_failed'));
                    }
                }).catch(err => {
                    console.error(err);
                });
        }, [currentGraph, currentGraphSpace, onRefresh, t]);

    const onEditHandler = useCallback(
        (rowData, favoriteName) => {
            editItemByRow(rowData, favoriteName);
        },
        [editItemByRow]
    );

    const tabItems = [
        {
            label: t('analysis.logs.execute_tab'),
            key: 'excutes',
            children: (
                <>
                    {executionLogsError && (
                        <Alert
                            showIcon
                            type='error'
                            message={t('analysis.logs.execution_load_failed')}
                            action={(
                                <Button size='small' onClick={onRetryExecutionLogs}>
                                    {t('analysis.logs.retry_execution')}
                                </Button>
                            )}
                        />
                    )}
                    <ExecuteLog
                        isLoading={executionLogsLoading}
                        pageExecute={pageExecute}
                        pageSize={pageSize}
                        onExecutePageChange={onExecutePageChange}
                        onAddCollection={onAddHandler}
                        executionLogsDataRecords={executionLogsDataRecords}
                        executionLogsDataTotal={executionLogsDataTotal}
                    />
                </>
            ),
        },
        {
            label: t('analysis.logs.favorite_tab'),
            key: 'favorites',
            children: (
                <>
                    {favoriteQueriesError && (
                        <Alert
                            showIcon
                            type='error'
                            message={t('analysis.logs.favorite_load_failed')}
                            action={(
                                <Button size='small' onClick={onRetryFavoriteQueries}>
                                    {t('analysis.logs.retry_favorites')}
                                </Button>
                            )}
                        />
                    )}
                    <Favorite
                        isLoading={favoriteQueriesLoading}
                        pageFavorite={pageFavorite}
                        pageSize={pageSize}
                        onFavoritePageChange={onFavoritePageChange}
                        onChangeFavorSearch={onChangeFavorSearch}
                        onSortChange={onSortChange}
                        onDel={onDelHandler}
                        onEditCollection={onEditHandler}
                        favoriteQueriesDataRecords={favoriteQueriesDataRecords}
                        favoriteQueriesDataTotal={favoriteQueriesDataTotal}
                    />
                </>
            ),
        },
    ];

    return (
        <div className={c.footerTabs}>
            <Tabs type='card' items={tabItems} />
        </div>
    );
};

export default LogsDetail;
