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

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {Alert, Button, Empty, Spin} from 'antd';
import {useTranslation} from 'react-i18next';
import * as api from '../../../api/index';
import ReactJsonView from 'react-json-view';
import convertStringToJSON from '../../../utils/convertStringToJSON';
import c from './index.module.scss';

const AsyncTaskResult = () => {
    const {t} = useTranslation();
    const {
        graphspace,
        graph,
        taskId,
    } = useParams();

    const [asyncTaskResultJson, setAsyncTaskResultJson] = useState();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const requestRef = useRef(null);

    const getResult = useCallback(
        async () => {
            const request = Symbol('async-result');
            requestRef.current = request;
            setLoading(true);
            setError(false);
            setAsyncTaskResultJson();
            try {
                const response = await api.analysis.fetchAsyncTaskResult(
                    graphspace, graph, taskId
                );
                if (requestRef.current !== request) {
                    return;
                }
                if (response?.status !== 200) {
                    throw new Error('task result unavailable');
                }
                setAsyncTaskResultJson(response.data?.task_result);
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
        [graph, graphspace, taskId]
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
                <div className={c.resultBody}>
                    {error && (
                        <Alert
                            showIcon
                            type='error'
                            message={t('analysis.async_task.result_load_failed')}
                            action={(
                                <Button size='small' onClick={getResult}>
                                    {t('analysis.async_task.retry_result')}
                                </Button>
                            )}
                        />
                    )}
                    {loading && <Spin tip={t('analysis.async_task.result_loading')} />}
                    {!loading && !error && (
                        !hasResult ? (
                            <Empty description={t('analysis.async_task.no_result')} />
                        ) : resultForJSON === null ? (
                            asyncTaskResultJson
                        ) : (
                            <ReactJsonView
                                src={resultForJSON}
                                name={false}
                                displayObjectSize={false}
                                displayDataTypes={false}
                                groupArraysAfterLength={50}
                            />
                        )
                    )}
                </div>
            </section>
        </div>
    );
};

export default AsyncTaskResult;
