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
 * @file  导入数据
 */

import {useCallback, useContext, useLayoutEffect, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Modal, Tooltip, Upload, message} from 'antd';
import {UploadOutlined} from '@ant-design/icons';
import GraphAnalysisContext from '../../Context';
import {GRAPH_STATUS} from '../../../utils/constants';
import {USER_CHANGE_EVENT} from '../../../utils/user';
import * as api from '../../../api';

const {
    LOADING,
    SUCCESS,
    UPLOAD_FAILED,
} = GRAPH_STATUS;

const ImportData = props => {
    const {t} = useTranslation();
    const {
        buttonEnable,
        onUploadChange,
        tooltip,
    } = props;

    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const scope = useRef({generation: 0});
    const uploadGenerations = useRef(new Map());
    const uploadTargets = useRef(new WeakMap());
    const mounted = useRef(false);

    useLayoutEffect(() => {
        const uploads = uploadGenerations.current;
        scope.current = {graphSpace, graph, generation: scope.current.generation + 1};
        mounted.current = true;
        const invalidateIdentity = () => {
            scope.current = {...scope.current, generation: scope.current.generation + 1};
            uploads.clear();
        };
        window.addEventListener(USER_CHANGE_EVENT, invalidateIdentity);
        return () => {
            mounted.current = false;
            window.removeEventListener(USER_CHANGE_EVENT, invalidateIdentity);
            uploads.clear();
        };
    }, [graphSpace, graph]);

    const confirmImport = useCallback(file => {
        if (!graphSpace || !graph || !file?.uid) return Upload.LIST_IGNORE;
        const generation = scope.current.generation;
        return new Promise(resolve => {
            Modal.confirm({
                title: t('analysis.canvas.import_confirm_title'),
                content: t('analysis.canvas.import_confirm_warning', {graphSpace, graph}),
                okText: t('common.action.confirm'),
                cancelText: t('common.action.cancel'),
                onOk: () => {
                    if (!mounted.current) {
                        resolve(Upload.LIST_IGNORE);
                        return;
                    }
                    if (scope.current.generation !== generation) {
                        message.warning(t('analysis.canvas.import_scope_changed'));
                        resolve(Upload.LIST_IGNORE);
                        return;
                    }
                    // Only the latest confirmed upload owns the displayed status.
                    uploadGenerations.current.clear();
                    uploadGenerations.current.set(file.uid, generation);
                    // rc-upload resolves action after confirmation; bind it to the
                    // confirmed file so a later render cannot redirect the write.
                    uploadTargets.current.set(file, api.analysis.getUploadList(graphSpace, graph));
                    resolve(true);
                },
                onCancel: () => resolve(Upload.LIST_IGNORE),
            });
        });
    }, [graphSpace, graph, t]);

    const handleUploadChange = useCallback(
        info => {
            const {uid, status, response} = info.file;
            if (!mounted.current || uploadGenerations.current.get(uid) !== scope.current.generation) {
                return;
            }
            if (status === 'done' || status === 'error') {
                uploadGenerations.current.delete(uid);
            }

            if (status === 'uploading') {
                onUploadChange(LOADING);
                return;
            }

            // antd emits 'error' on HTTP/network failure. Without this branch the
            // canvas stays in LOADING forever. An error page body is not JSON, so
            // `response.message` may be missing entirely.
            if (status === 'error') {
                const failure = response?.message || t('analysis.canvas.import_failed');
                onUploadChange(UPLOAD_FAILED, failure);
                message.error(failure);
                return;
            }

            if (status === 'done') {
                if (response?.status === 200) {
                    onUploadChange(SUCCESS, t('analysis.canvas.import_success'), response.data);
                    message.success(t('analysis.canvas.import_success'));
                    return;
                }

                const failure = response?.message || t('analysis.canvas.import_failed');
                onUploadChange(UPLOAD_FAILED, failure);
            }
        },
        [onUploadChange, t]
    );

    return (
        <>
            <Upload
                action={file => uploadTargets.current.get(file)}
                beforeUpload={confirmImport}
                onChange={handleUploadChange}
                accept="application/json"
                maxCount={1}
                showUploadList={false}
                disabled={!buttonEnable}
            >
                <Tooltip placement="bottom" title={buttonEnable ? '' : tooltip}>
                    <Button
                        icon={<UploadOutlined />}
                        type={'text'}
                        disabled={!buttonEnable}
                    >
                        {t('analysis.canvas.import')}
                    </Button>
                </Tooltip>
            </Upload>
        </>
    );
};

export default ImportData;
