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

import {Alert, Input, Modal, Space, Typography} from 'antd';
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';

const ClearGraphConfirmModal = ({
    open,
    graphspace,
    graph,
    onCancel,
    onSuccess,
    onConfirm,
}) => {
    const {t} = useTranslation();
    const [confirmation, setConfirmation] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const pendingRef = useRef(false);
    const activeRequestRef = useRef(null);
    const selectionKey = JSON.stringify([open, graphspace, graph]);
    const currentSelectionRef = useRef(selectionKey);

    useLayoutEffect(() => {
        currentSelectionRef.current = selectionKey;
    }, [selectionKey]);

    useEffect(() => {
        activeRequestRef.current = null;
        pendingRef.current = false;
        if (open) {
            setConfirmation('');
            setPending(false);
            setError('');
        }
    }, [open, graphspace, graph]);

    const handleConfirm = useCallback(async () => {
        if (pendingRef.current || confirmation !== graph) {
            return;
        }

        const requestToken = Symbol('clear-graph-request');
        const requestSelectionKey = selectionKey;
        const isCurrentRequest = () => {
            return activeRequestRef.current === requestToken
                && currentSelectionRef.current === requestSelectionKey;
        };

        activeRequestRef.current = requestToken;
        pendingRef.current = true;
        setPending(true);
        setError('');

        try {
            const response = await onConfirm();
            if (!isCurrentRequest()) {
                return;
            }
            if (response == null || response.status === 200) {
                onSuccess(response);
                return;
            }
            setError(response?.message || t('graph.clear_confirm.request_failed'));
        }
        catch (requestError) {
            if (isCurrentRequest()) {
                setError(requestError?.response?.data?.message
                    || requestError?.message || t('graph.clear_confirm.request_failed'));
            }
        }
        finally {
            if (isCurrentRequest()) {
                activeRequestRef.current = null;
                pendingRef.current = false;
                setPending(false);
            }
        }
    }, [confirmation, graph, onConfirm, onSuccess, selectionKey, t]);

    const handleCancel = useCallback(() => {
        if (!pendingRef.current) {
            onCancel();
        }
    }, [onCancel]);

    const handleConfirmationChange = useCallback(event => {
        setConfirmation(event.target.value);
    }, []);

    return (
        <Modal
            open={open}
            title={t('graph.clear_confirm.title')}
            okText={t('graph.clear_confirm.confirm')}
            cancelText={t('graph.clear_confirm.cancel')}
            okButtonProps={{disabled: pending || confirmation !== graph}}
            cancelButtonProps={{disabled: pending}}
            confirmLoading={pending}
            closable={!pending}
            maskClosable={!pending}
            keyboard={!pending}
            onCancel={handleCancel}
            onOk={handleConfirm}
        >
            <Space direction='vertical' size='middle' style={{width: '100%'}}>
                <Typography.Text>
                    {t('graph.clear_confirm.graphspace', {graphspace})}
                </Typography.Text>
                <Typography.Text strong>
                    {t('graph.clear_confirm.graph', {graph})}
                </Typography.Text>
                <Alert
                    type='warning'
                    showIcon
                    message={t('graph.clear_confirm.scope')}
                    description={t('graph.clear_confirm.irreversible')}
                />
                {error && <Alert type='error' showIcon message={error} />}
                <Typography.Text>
                    {t('graph.clear_confirm.input_label')}
                </Typography.Text>
                <Input
                    value={confirmation}
                    placeholder={t('graph.clear_confirm.input_placeholder')}
                    onChange={handleConfirmationChange}
                />
            </Space>
        </Modal>
    );
};

export default ClearGraphConfirmModal;
