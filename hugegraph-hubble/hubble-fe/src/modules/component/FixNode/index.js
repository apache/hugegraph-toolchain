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
 * @file  FixNode 固定节点
 */

import React, {useCallback, useContext, useState, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Tooltip} from 'antd';
import {PushpinOutlined} from '@ant-design/icons';
import {GraphContext} from '../Context';

const FixNode = () => {
    const {t} = useTranslation();
    const {graph} = useContext(GraphContext);
    const [fixState, setFixState] = useState(false);
    const [selectedNode, setSelectedNode] = useState();


    useEffect(() => {
        if (!graph) {
            return undefined;
        }
        const handleNodeClick = evt => {
            const {item} = evt;
            setFixState(true);
            setSelectedNode(item);
        };
        const clearSelection = () => {
            setSelectedNode();
            setFixState(false);
        };

        graph.on('node:click', handleNodeClick);
        graph.on('edge:click', clearSelection);
        graph.on('canvas:click', clearSelection);
        return () => {
            graph.off('node:click', handleNodeClick);
            graph.off('edge:click', clearSelection);
            graph.off('canvas:click', clearSelection);
        };
    },
    [graph]);

    const handleFixNode = useCallback(
        () => {
            const node = selectedNode || undefined;
            const hasLocked = node.hasLocked();
            if (hasLocked) {
                node.unlock();
                graph.clearItemStates(node, ['customFixed', 'customSelected']);
                graph.pushStack('unlock', node.getModel(), 'undo');
            }
            else {
                node.lock();
                graph?.clearItemStates(node, ['customSelected']);
                graph?.setItemState(node, 'customFixed', true);
                graph?.pushStack('lock', node.getModel(), 'undo');
            }
        },
        [graph, selectedNode]
    );

    return (
        <Tooltip title={t('analysis.canvas.toolbar.fix_node')} placement='bottom'>
            <Button
                disabled={!fixState}
                type="text"
                aria-label={t('analysis.canvas.toolbar.fix_node')}
                onClick={handleFixNode}
                icon={<PushpinOutlined />}
            />
        </Tooltip>
    );
};

export default FixNode;
