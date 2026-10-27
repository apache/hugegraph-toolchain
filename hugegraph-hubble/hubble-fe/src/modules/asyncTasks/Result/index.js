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
 * @file 异步任务结果
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {Alert, Button, Empty, Spin, Typography} from 'antd';
import {useTranslation} from 'react-i18next';
import * as api from '../../../api/index';
import JsonViewer from '../../../components/JsonViewer';
import convertStringToJSON from '../../../utils/convertStringToJSON';
import {isCypherEnabled} from '../../../utils/config';
import {supportsQueryLanguage} from '../../../utils/text2gql';
import c from './index.module.scss';

const isUnavailableVermeerResult = (status, type, result) => status === 'success'
    && type === 'vermeer-task:compute'
    && (result === null || (typeof result === 'string' && result.trim() === 'null'));

export const AsyncTaskResultContent = ({
    graphspace,
    graph,
    taskId,
    compact = false,
}) => {
    const {t} = useTranslation();
    const [asyncTaskResultJson, setAsyncTaskResultJson] = useState();
    const [taskStatus, setTaskStatus] = useState();
    const [taskType, setTaskType] = useState();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const requestRef = useRef(null);
    const context = JSON.stringify([graphspace, graph, taskId]);
    const [page, setPage] = useState({context, cursors: [0]});
    const cursors = page.context === context ? page.cursors : [0];
    const cursor = cursors[cursors.length - 1];

    const getResult = useCallback(
        async () => {
            const request = Symbol('async-result');
            requestRef.current = request;
            setLoading(true);
            setError(false);
            setAsyncTaskResultJson();
            setTaskStatus();
            setTaskType();
            try {
                const response = cursor === 0
                    ? await api.analysis.fetchAsyncTaskResult(graphspace, graph, taskId)
                    : await api.analysis.fetchVermeerTaskValues(graphspace, graph, taskId, cursor);
                if (requestRef.current !== request) {
                    return;
                }
                if (response?.status !== 200) {
                    if (cursor > 0 && taskId < 0 && response?.status === 400) {
                        // Confirm unavailable values through the existing task contract,
                        // rather than inferring retention from an error-message string.
                        const task = await api.analysis.fetchAsyncTaskResult(graphspace, graph, taskId);
                        if (requestRef.current !== request) return;
                        if (task?.status === 200 && isUnavailableVermeerResult(
                            task.data?.task_status, task.data?.task_type, task.data?.task_result
                        )) {
                            setAsyncTaskResultJson(task.data.task_result);
                            setTaskStatus(task.data.task_status);
                            setTaskType(task.data.task_type);
                            return;
                        }
                    }
                    throw new Error('task result unavailable');
                }
                setAsyncTaskResultJson(cursor === 0
                    ? response.data?.task_result : JSON.stringify(response.data));
                setTaskStatus(cursor === 0 ? response.data?.task_status : 'success');
                setTaskType(cursor === 0 ? response.data?.task_type : undefined);
            }
            catch {
                if (requestRef.current === request) {
                    setError(true);
                }
            }
            finally {
                if (requestRef.current === request) {
                    setLoading(false);
                }
            }
        },
        [cursor, graph, graphspace, taskId]
    );

    useEffect(
        () => {
            getResult();
            return () => {
                requestRef.current = null;
            };
        },
        [getResult, graph, graphspace, taskId]
    );
    const resultForJSON = convertStringToJSON(asyncTaskResultJson);
    const hasResult = asyncTaskResultJson !== undefined
                      && asyncTaskResultJson !== null
                      && asyncTaskResultJson !== 'null';
    const failed = taskStatus === 'failed';
    const opaqueVermeerFailure = failed
        && ['vermeer-task:load', 'vermeer-task:compute'].includes(taskType)
        && typeof asyncTaskResultJson === 'string'
        && /\brpc error:\s*code\s*=\s*Unknown\s+desc\s*=\s*$/i.test(asyncTaskResultJson);
    const unavailableVermeerResult = isUnavailableVermeerResult(taskStatus, taskType, asyncTaskResultJson);
    const resultSizeLimit = failed && typeof asyncTaskResultJson === 'string'
        ? asyncTaskResultJson.match(/Task result size (\d+) exceeded limit (\d+) bytes/)
        : null;
    const queryLanguage = supportsQueryLanguage(taskType, isCypherEnabled()) ? taskType : null;

    return (
        <div className={compact ? c.inlineResultBody : c.resultBody}>
            {error && (
                <Alert
                    showIcon
                    type='error'
                    title={t('analysis.async_task.result_load_failed')}
                    action={(
                        <Button size='small' onClick={getResult}>
                            {t('analysis.async_task.retry_result')}
                        </Button>
                    )}
                />
            )}
            {loading && <Spin description={t('analysis.async_task.result_loading')} />}
            {!loading && !error && failed && (
                <Alert
                    showIcon
                    type='error'
                    title={t(resultSizeLimit
                        ? 'analysis.async_task.result_size_limit_title'
                        : opaqueVermeerFailure
                            ? 'analysis.async_task.vermeer_failure_unknown_title'
                        : 'analysis.async_task.result_failure_title')}
                    description={resultSizeLimit ? t('analysis.async_task.result_size_limit_description', {
                        size: (Number(resultSizeLimit[1]) / 1024 / 1024).toFixed(2),
                        limit: (Number(resultSizeLimit[2]) / 1024 / 1024).toFixed(2),
                    }) : opaqueVermeerFailure && (
                        <div className={c.failureGuidance}>
                            <p>{t('analysis.async_task.vermeer_failure_unknown_description')}</p>
                            <ul>
                                <li>{t('analysis.async_task.vermeer_failure_logs_hint')}</li>
                                <li>{t('analysis.async_task.vermeer_failure_connection_hint')}</li>
                                <li>{t('analysis.async_task.vermeer_failure_namespace_hint')}</li>
                            </ul>
                            <p>{t('analysis.async_task.vermeer_failure_up_hint')}</p>
                        </div>
                    )}
                    action={resultSizeLimit && queryLanguage && (
                        <Button
                            size='small'
                            href={`/gremlin/${encodeURIComponent(graphspace)}/${encodeURIComponent(graph)}?language=${queryLanguage}`}
                        >
                            {t('analysis.async_task.refine_query')}
                        </Button>
                    )}
                />
            )}
            {!loading && !error && (
                !hasResult || unavailableVermeerResult ? (
                    !failed && (unavailableVermeerResult ? (
                        <Empty description={t('analysis.async_task.vermeer_result_unavailable_title')}>
                            <p>{t('analysis.async_task.vermeer_result_unavailable_description')}</p>
                            <Button href={`/algorithms/${encodeURIComponent(graphspace)}/${encodeURIComponent(graph)}`}>
                                {t('analysis.async_task.result_open_algorithms')}
                            </Button>
                        </Empty>
                    ) : <Empty description={t('analysis.async_task.no_result')} />)
                ) : resultForJSON === null ? (
                    opaqueVermeerFailure ? (
                        <div className={c.rawFailure}>
                            <Typography.Text type='secondary'>
                                {t('analysis.async_task.raw_error')}
                            </Typography.Text>
                            <Typography.Paragraph copyable={{text: asyncTaskResultJson}}>
                                {asyncTaskResultJson}
                            </Typography.Paragraph>
                        </div>
                    ) : asyncTaskResultJson
                ) : (
                    <JsonViewer
                        value={resultForJSON}
                    />
                )
            )}
            {taskId < 0 && !loading && !error && !failed && hasResult && (
                <div>
                    {cursors.length > 1 && (
                        <Button onClick={() => setPage({context, cursors: cursors.slice(0, -1)})}>
                            {t('analysis.async_task.result_previous')}
                        </Button>
                    )}
                    {resultForJSON?.has_more && resultForJSON.cursor > cursor && (
                        <Button onClick={() => setPage({context, cursors: [...cursors, resultForJSON.cursor]})}>
                            {t('analysis.async_task.result_next')}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};

const AsyncTaskResult = () => {
    const {t} = useTranslation();
    const {
        graphspace,
        graph,
        taskId,
    } = useParams();

    return (
        <div className={c.pageCanvas}>
            <section className={c.asyncTaskResult}>
                <header className={c.resultHeader}>
                    <div>
                        <h2>{t('analysis.async_task.result_title')}</h2>
                        <p>
                            {t('analysis.async_task.result_context', {
                                graphspace,
                                graph,
                                taskId,
                            })}
                        </p>
                    </div>
                    <Link to={`/asyncTasks/${graphspace}/${graph}`}>
                        {t('analysis.async_task.result_back')}
                    </Link>
                </header>
                <AsyncTaskResultContent
                    graphspace={graphspace}
                    graph={graph}
                    taskId={taskId}
                />
            </section>
        </div>
    );
};

export default AsyncTaskResult;
