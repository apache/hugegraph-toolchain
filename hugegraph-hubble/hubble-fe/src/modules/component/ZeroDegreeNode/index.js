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
 * @file  孤立点检测
 */

import React, {useCallback, useContext, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Tooltip} from 'antd';
import {UngroupOutlined} from '@ant-design/icons';
import {GraphContext} from '../Context';

const ZeroDegreeNodeSearch = props => {
    const {t} = useTranslation();
    const {graph} = useContext(GraphContext);

    const [isolatedNodesMode, setIsolatedNodesMode] = useState(false);

    const handleSearchZeroDegreeNodes = useCallback(
        () => {
            graph.getNodes().forEach(item => {
                const {degree} = graph.getNodeDegree(item, 'all', true);
                if (degree !== 0) {
                    if (!isolatedNodesMode) {
                        graph.hideItem(item, false);
                    }
                    else {
                        graph.showItem(item, false);
                    }
                }
            });
            graph.refresh();
            setIsolatedNodesMode(pre => !pre);
        },
        [graph, isolatedNodesMode]
    );

    return (
        <Tooltip title={t('analysis.canvas.toolbar.isolated_nodes')} placement='bottom'>
            <Button
                type="text"
                aria-label={t('analysis.canvas.toolbar.isolated_nodes')}
                onClick={handleSearchZeroDegreeNodes}
                icon={<UngroupOutlined />}
            />
        </Tooltip>
    );
};

export default ZeroDegreeNodeSearch;
