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
 * @file  ClearGraph 清空画布
 */

import React, {useCallback, useContext, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Tooltip, Modal} from 'antd';
import {CopyrightOutlined} from '@ant-design/icons';
import {GraphContext} from '../Context';

const ClearGraph = props => {
    const {t} = useTranslation();
    const {enable, onChange} = props;
    const {graph} = useContext(GraphContext);
    const [clearModalVisible, setClearModalVisible] = useState(false);

    const handleClear = useCallback(
        () => {
            setClearModalVisible(true);
        },
        []
    );

    const handleClearModalOk = useCallback(
        () => {
            graph?.clear();
            setClearModalVisible(false);
            onChange();
        },
        [graph, onChange]
    );

    const handleClearModalCancel = useCallback(
        () => {
            setClearModalVisible(false);
        },
        []
    );

    return (
        <>
            <Tooltip title={t('analysis.canvas.toolbar.clear_canvas')} placement='bottom'>
                <Button
                    disabled={!enable}
                    type="text"
                    aria-label={t('analysis.canvas.toolbar.clear_canvas')}
                    onClick={handleClear}
                    icon={<CopyrightOutlined />}
                />
            </Tooltip>
            <Modal
                width={600}
                title={t('analysis.canvas.clear_graph.title')}
                open={clearModalVisible}
                onOk={handleClearModalOk}
                onCancel={handleClearModalCancel}
                okText={t('analysis.canvas.clear_graph.ok')}
                cancelText={t('analysis.canvas.clear_graph.cancel')}
            >
                <div>{t('analysis.canvas.clear_graph.description')}</div>
            </Modal>
        </>
    );
};

export default ClearGraph;
