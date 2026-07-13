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
 * @file GraphStatusView
 */

import React, {useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, message as antdMessage} from 'antd';
import {CopyOutlined} from '@ant-design/icons';
import {GRAPH_STATUS} from '../../../utils/constants';
import EmptyIcon from '../../../assets/ic_sousuo_empty.svg';
import LoadingBackIcon from '../../../assets/ic_loading_back.svg';
import LoadingFrontIcon from '../../../assets/ic_loading_front.svg';
import FailedIcon from '../../../assets/ic_fail.svg';
import c from './index.module.scss';

const {
    STANDBY,
    LOADING,
    FAILED,
    UPLOAD_FAILED,
    SUCCESS,
} = GRAPH_STATUS;

const GraphStatusView = props => {
    const {t} = useTranslation();
    const {
        status,
        message,
    } = props;

    const copyError = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(message);
            antdMessage.success(t('analysis.query_result.copy_error_success'));
        }
        catch {
            antdMessage.error(t('analysis.query_result.copy_error_failed'));
        }
    }, [message, t]);

    const emptyContent = message => {
        const displayMessage = message || t('analysis.query_result.no_data');
        return (
            <div className={c.noneGraphStatus}>
                <img
                    src={EmptyIcon}
                    alt={displayMessage}
                />
                <span>{displayMessage}</span>
            </div>
        );
    };

    const loadingContent = message => {
        const displayMessage = message || t('analysis.query_result.loading');
        return (
            <div className={c.noneGraphStatus}>
                <div className={c.loadingContent}>
                    <img
                        className={c.loadingBackImage}
                        src={LoadingBackIcon}
                        alt={displayMessage}
                    />
                    <img
                        className={c.loadingFrontIamge}
                        src={LoadingFrontIcon}
                        alt={displayMessage}
                    />
                </div>
                <span className={c.loadingDesc}>
                    {displayMessage}
                </span>
            </div>
        );
    };

    const failedContent = message => {
        const displayMessage = message || t('analysis.query_result.run_failed');
        return (
            <div className={`${c.noneGraphStatus} ${c.failureStatus}`} role='alert'>
                <img
                    className={c.failureIcon}
                    src={FailedIcon}
                    alt=''
                />
                <h3 className={c.failureTitle}>
                    {t('analysis.query_result.query_failed_title')}
                </h3>
                <pre className={c.failureMessage}>{displayMessage}</pre>
                <p className={c.failureAction}>
                    {t('analysis.query_result.retry_action')}
                </p>
                {message && (
                    <Button
                        aria-label={t('analysis.query_result.copy_error')}
                        icon={<CopyOutlined />}
                        onClick={copyError}
                    >
                        {t('analysis.query_result.copy_error')}
                    </Button>
                )}
            </div>
        );
    };

    const uploadFailedContent = message => {
        const displayMessage = message || t('analysis.query_result.import_failed');
        return (
            <div className={c.noneGraphStatus}>
                <img
                    src={FailedIcon}
                    alt={displayMessage}
                />
                <span>{displayMessage}</span>
            </div>
        );
    };

    const succesEmptyContent = message => {
        const displayMessage = message || t('analysis.query_result.no_graph_result');
        return (
            <div className={c.noneGraphStatus}>
                <img
                    src={EmptyIcon}
                    alt={displayMessage}
                />
                <span>{displayMessage}</span>
            </div>
        );
    };

    const renderContent = (status, message) => {
        let res;
        switch (status) {
            case STANDBY:
                res = emptyContent(message);
                break;
            case LOADING:
                res = loadingContent(message);
                break;
            case FAILED:
                res = failedContent(message);
                break;
            case UPLOAD_FAILED:
                res = uploadFailedContent(message);
                break;
            case SUCCESS:
                res = succesEmptyContent(message);
                break;
            default:
                res = emptyContent(message);
                break;
        }
        return res;
    };

    return (
        <>
            {renderContent(status, message)}
        </>
    );
};

export default GraphStatusView;
