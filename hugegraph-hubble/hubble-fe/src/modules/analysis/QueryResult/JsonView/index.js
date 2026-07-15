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
 * @file Gremlin语法分析 JsonView
 */

import React, {useCallback, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import ReactJsonView from 'react-json-view';
import GraphStatusView from '../../../component/GraphStatusView';
import TaskNavigateView from '../../../component/TaskNavigateView';
import {GRAPH_STATUS} from '../../../../utils/constants';
import _ from 'lodash';
import c from './index.module.scss';
import {getQueryResultStandbyMessage} from '../Home/utils';

const {
    STANDBY,
    LOADING,
    SUCCESS,
    FAILED,
    UPLOAD_FAILED,
} = GRAPH_STATUS;


const JsonView = props => {
    const {t} = useTranslation();
    const {
        jsonViewContent,
        queryStatus,
        isQueryMode,
        queryMessage,
        asyncTaskId,
    } = props;

    const renderSuccessView = useCallback(
        () => {
            if (isQueryMode) {
                if (_.isEmpty(jsonViewContent)) {
                    return (
                        <GraphStatusView status={SUCCESS} message={t('analysis.query_result.no_json_result')} />
                    );
                }
                return (
                    <div className={c.jsonWrapper}>
                        <ReactJsonView
                            src={jsonViewContent}
                            name={false}
                            displayObjectSize={false}
                            displayDataTypes={false}
                            groupArraysAfterLength={50}
                        />
                    </div>
                );
            }
            return <TaskNavigateView message={t('analysis.query_result.submit_success')} taskId={asyncTaskId} />;
        },
        [asyncTaskId, isQueryMode, jsonViewContent, t]
    );

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

export default React.memo(JsonView);
