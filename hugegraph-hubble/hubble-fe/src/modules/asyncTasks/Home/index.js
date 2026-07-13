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
 * @file 任务管理 首页
 */

import React, {useCallback, useContext, useEffect, useRef, useState} from 'react';
import GraphAnalysisContext from '../../Context';
import {useParams} from 'react-router-dom';
import {Alert, Button, Empty, Input, Space} from 'antd';
import AsyncTaskDetail from '../Detail';
import * as api from '../../../api/index';
import {useTranslation} from 'react-i18next';
import c from './index.module.scss';

const defaultPageParams = {page: 1, pageSize: 10};

const AsyncTaskHome = () => {
    const {t} = useTranslation();
    const {taskId} = useParams();
    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const [page, setPage] = useState(defaultPageParams.page);
    const [pageSize, setPageSize] = useState(defaultPageParams.pageSize);
    const [searchCache, setSearchCache] = useState(taskId);
    const [search, setSearch] = useState(taskId);
    const [filters, setFilters] = useState({});
    const [asyncManageTaskData, setAsyncManageTaskData] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    let timer  = useRef();
    const listRequest = useRef(null);
    const listPending = useRef(false);
    const listFailed = useRef(false);

    const onPageChange = useCallback(
        (pagination, filters) => {
            setFilters(filters);
            setPage(pagination.current);
            setPageSize(pagination.pageSize);
        }, []
    );

    const getAsynTaskList = useCallback(
        async ({background = false} = {}) => {
            const request = Symbol('async-task-list');
            listRequest.current = request;
            listPending.current = true;
            if (!background) {
                setLoading(true);
                setLoadError(false);
                setAsyncManageTaskData({});
            }
            const {task_type, task_status} = filters;
            const params = {
                'page_size': pageSize,
                'page_no': page,
                content: search,
                status: task_status && task_status[0].toUpperCase(),
                type: task_type && task_type[0],
            };
            try {
                const response = await api.analysis.fetchManageTaskList(
                    graphSpace, graph, params
                );
                if (listRequest.current !== request) {
                    return;
                }
                const {status, data} = response || {};
                if (status !== 200) {
                    throw new Error('async task list unavailable');
                }
                setAsyncManageTaskData({records: data.records, total: data.total});
                listFailed.current = false;
            }
            catch {
                if (listRequest.current === request) {
                    listFailed.current = true;
                    setLoadError(true);
                }
            }
            finally {
                if (listRequest.current === request) {
                    listPending.current = false;
                    setLoading(false);
                }
            }
        },
        [filters, pageSize, page, search, graphSpace, graph]
    );

    useEffect(
        () => {
            setAsyncManageTaskData({});
            if (graphSpace && graph) {
                getAsynTaskList();
            }
        },
        [getAsynTaskList, graph, graphSpace]
    );

    useEffect(() => {
        if (graphSpace && graph) {
            timer.current = setInterval(() => {
                if (!listPending.current && !listFailed.current) {
                    getAsynTaskList({background: true});
                }
            }, 5000);
        }
        return () => clearInterval(timer.current);
    }, [getAsynTaskList, graph, graphSpace]);

    useEffect(() => () => {
        listRequest.current = null;
        listPending.current = false;
    }, []);

    const retryList = useCallback(() => {
        listFailed.current = false;
        getAsynTaskList();
    }, [getAsynTaskList]);

    const onSearchChange = useCallback(
        e => {
            const value = e.target.value;
            setSearchCache(value);
            if (!value) {
                setSearch(value);
            }
        },
        []
    );

    const onSearch = useCallback(
        () => {
            if (searchCache !== search) {
                setSearch(searchCache);
            }
        },
        [search, searchCache]
    );

    const clearFilters = useCallback(() => {
        setSearchCache('');
        setSearch('');
        setFilters({});
        setPage(defaultPageParams.page);
    }, []);

    const hasActiveFilters = Boolean(search) || Object.values(filters).some(value => (
        Array.isArray(value) ? value.length > 0 : Boolean(value)
    ));

    useEffect(
        () => {
            if (page > 1 && asyncManageTaskData?.records?.length === 0) {
                setPage(defaultPageParams.page);
            }
        },
        [asyncManageTaskData, page]
    );

    useEffect(
        () => {
            setPage(defaultPageParams.page);
        },
        [graphSpace, graph]
    );

    return (
        <div className={c.gremlinAsyncTask}>
            <div className={c.content}>
                <section
                    className={c.help}
                    aria-label={t('analysis.async_task.help_title')}
                >
                    <strong>{t('analysis.async_task.help_title')}</strong>
                    <p>{t('analysis.async_task.help_description')}</p>
                </section>
                {loadError && (
                    <Alert
                        showIcon
                        type='error'
                        message={t('analysis.async_task.get_failed')}
                        action={(
                            <Button size='small' onClick={retryList}>
                                {t('analysis.async_task.retry_list')}
                            </Button>
                        )}
                    />
                )}
                <div className={c.queryBar}>
                    <Input.Search
                        value={searchCache}
                        onChange={onSearchChange}
                        onSearch={onSearch}
                        placeholder={t('analysis.async_task.search_placeholder')}
                        allowClear
                        style={{width: '215px'}}
                    />
                </div>
                {!loading && !loadError && asyncManageTaskData.total === 0 ? (
                    <Empty
                        className={c.emptyJourney}
                        description={(
                            <div>
                                <strong>{t(hasActiveFilters
                                    ? 'analysis.async_task.no_matches_title'
                                    : 'analysis.async_task.empty_title')}
                                </strong>
                                <p>{t(hasActiveFilters
                                    ? 'analysis.async_task.no_matches_description'
                                    : 'analysis.async_task.empty_description')}
                                </p>
                            </div>
                        )}
                    >
                        {hasActiveFilters ? (
                            <Button type='primary' onClick={clearFilters}>
                                {t('analysis.async_task.clear_filters')}
                            </Button>
                        ) : (
                            <Space wrap>
                                <Button type='primary' href={`/gremlin/${graphSpace}/${graph}`}>
                                    {t('analysis.async_task.start_query')}
                                </Button>
                                <Button href={`/algorithms/${graphSpace}/${graph}`}>
                                    {t('analysis.async_task.open_algorithms')}
                                </Button>
                            </Space>
                        )}
                    </Empty>
                ) : (
                    <AsyncTaskDetail
                        onPageChange={onPageChange}
                        asyncManageTaskData={asyncManageTaskData}
                        getAsynTaskList={getAsynTaskList}
                        page={page}
                        pageSize={pageSize}
                        loading={loading}
                    />
                )}
            </div>
        </div>
    );
};

export default AsyncTaskHome;
