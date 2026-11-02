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

import {useCallback, useContext, useEffect, useRef, useState} from 'react';
import GraphAnalysisContext from '../../Context';
import {useParams, useSearchParams} from 'react-router-dom';
import {Alert, Button, Empty, Input, Space} from 'antd';
import AsyncTaskDetail from '../Detail';
import {displayTaskIdentity} from '../taskIdentity';
import * as api from '../../../api/index';
import {Trans, useTranslation} from 'react-i18next';
import c from './index.module.scss';

const defaultPageParams = {page: 1, pageSize: 10};

const AsyncTaskHome = () => {
    const {t} = useTranslation();
    const {taskId: legacyTaskId} = useParams();
    const [searchParams] = useSearchParams();
    const taskId = searchParams.get('taskId') || legacyTaskId || '';
    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const [page, setPage] = useState(defaultPageParams.page);
    const [pageSize, setPageSize] = useState(defaultPageParams.pageSize);
    const [searchCache, setSearchCache] = useState(taskId ? displayTaskIdentity(taskId) : '');
    const [search, setSearch] = useState(taskId ? displayTaskIdentity(taskId) : '');
    const [filters, setFilters] = useState({});
    const [asyncManageTaskData, setAsyncManageTaskData] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    let timer  = useRef();
    const listRequest = useRef(null);
    const listPending = useRef(false);
    const listFailed = useRef(false);
    const routeTaskId = useRef(taskId);
    const submissionAttempts = useRef(0);
    const submissionDiscovered = useRef(false);
    const [submissionState, setSubmissionState] = useState('pending');
    const hasActiveFilters = Boolean(search) || Object.values(filters).some(value => (
        Array.isArray(value) ? value.length > 0 : Boolean(value)
    ));
    const submittedTask = searchParams.get('submitted') === '1' && taskId !== ''
        && search === displayTaskIdentity(taskId)
        && !Object.values(filters).some(value => value?.length);

    useEffect(() => {
        submissionAttempts.current = 0;
        submissionDiscovered.current = false;
        setSubmissionState('pending');
    }, [graphSpace, graph, taskId, submittedTask]);

    useEffect(() => {
        if (routeTaskId.current === taskId) {
            return;
        }
        routeTaskId.current = taskId;
        setSearchCache(taskId ? displayTaskIdentity(taskId) : '');
        setSearch(taskId ? displayTaskIdentity(taskId) : '');
        setFilters({});
        setPage(defaultPageParams.page);
    }, [taskId]);

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
                status: task_status?.[0]?.toUpperCase(),
                type: task_type?.[0],
            };
            try {
                const response = submittedTask
                    ? await api.analysis.fetchManageTaskById(graphSpace, graph, taskId)
                    : await api.analysis.fetchManageTaskList(graphSpace, graph, params);
                if (listRequest.current !== request) {
                    return;
                }
                const {status, data} = response || {};
                if (submittedTask && status === 200 && Array.isArray(data)) {
                    const records = data.filter(task => String(task.id) === taskId);
                    setAsyncManageTaskData({records, total: records.length});
                    if (records.length > 0) {
                        submissionDiscovered.current = true;
                        setSubmissionState('found');
                        listFailed.current = false;
                    }
                    else if (submissionDiscovered.current) {
                        setSubmissionState('missing');
                        listFailed.current = true;
                    }
                    else {
                        submissionAttempts.current += 1;
                        const delayed = submissionAttempts.current >= 30;
                        setSubmissionState(delayed ? 'delayed' : 'pending');
                        listFailed.current = delayed;
                    }
                    return;
                }
                if (status !== 200 || submittedTask) {
                    throw new Error('async task list unavailable');
                }
                setAsyncManageTaskData(data);
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
        [filters, pageSize, page, search, graphSpace, graph, submittedTask, taskId]
    );

    useEffect(
        () => {
            setAsyncManageTaskData({});
            if (graphSpace && graph) {
                getAsynTaskList();
            }
            return () => {
                listRequest.current = null;
                listPending.current = false;
            };
        },
        [getAsynTaskList, graph, graphSpace]
    );

    useEffect(() => {
        if (graphSpace && graph) {
            timer.current = setInterval(() => {
                if (!listPending.current && !listFailed.current) {
                    getAsynTaskList({background: true});
                }
            }, submittedTask && submissionState === 'pending' ? 1000 : 5000);
        }
        return () => clearInterval(timer.current);
    }, [getAsynTaskList, graph, graphSpace, submittedTask, submissionState]);

    useEffect(() => () => {
        listRequest.current = null;
        listPending.current = false;
    }, []);

    const retryList = useCallback(() => {
        submissionAttempts.current = 0;
        setSubmissionState('pending');
        listFailed.current = false;
        getAsynTaskList();
    }, [getAsynTaskList]);

    const onSearchChange = useCallback(
        e => {
            const value = e.target.value;
            setSearchCache(value);
            if (!value) {
                setSearch(value);
                setPage(defaultPageParams.page);
            }
        },
        []
    );

    const onSearch = useCallback(
        () => {
            const value = searchCache.trim();
            setSearchCache(value);
            if (value !== search) {
                setSearch(value);
                setPage(defaultPageParams.page);
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

    const showSubmittedPending = submittedTask
        && (submissionState === 'pending' || submissionState === 'delayed') && !loadError;

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
                    <p><Trans i18nKey='analysis.async_task.help_description'
                              components={{strong: <strong />, nowrap: <span className={c.refreshHint} />}} /></p>
                </section>
                {loadError && (
                    <Alert
                        showIcon
                        type='error'
                        title={t('analysis.async_task.get_failed')}
                        action={(
                            <Button size='small' onClick={retryList}>
                                {t('analysis.async_task.retry_list')}
                            </Button>
                        )}
                    />
                )}
                {asyncManageTaskData.vermeerUnavailable && (
                    <Alert
                        showIcon
                        type='warning'
                        title={t('analysis.async_task.vermeer_unavailable')}
                        action={<Button size='small' onClick={retryList}>{t('common.action.retry')}</Button>}
                    />
                )}
                {showSubmittedPending && (
                    <Alert
                        showIcon
                        type={submissionState === 'delayed' ? 'warning' : 'info'}
                        title={t('analysis.async_task.submitted_pending', {taskId: displayTaskIdentity(taskId)})}
                        description={t(submissionState === 'delayed'
                            ? 'analysis.async_task.submitted_delayed'
                            : 'analysis.async_task.submitted_discovering')}
                        action={submissionState === 'delayed' && (
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
                {showSubmittedPending ? null : !loading && !loadError && asyncManageTaskData.total === 0 ? (
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
