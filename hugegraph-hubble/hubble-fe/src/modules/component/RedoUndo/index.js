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
 * @file  前进后退 RedoUndo
 */

import React, {useCallback, useContext, useState, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Tooltip} from 'antd';
import {ArrowLeftOutlined, ArrowRightOutlined} from '@ant-design/icons';
import {GraphContext, ToolBarContext} from '../Context';

const RedoUndo = props => {
    const {t} = useTranslation();
    const {onChange} = props;
    const {graph} = useContext(GraphContext);
    const toolBar = useContext(ToolBarContext);

    const [undoState, setUndoState] = useState(false);
    const [redoState, setRedoState] = useState(false);

    useEffect(
        () => {
            if (!graph) {
                return undefined;
            }
            const handleStackChange = evt => {
                const {undoStack, redoStack} = evt;
                const undoStackLen = undoStack.length;
                const redoStackLen = redoStack.length;
                if (undoStackLen === 1) {
                    setUndoState(false);
                }
                else {
                    setUndoState(true);
                }
                if (redoStackLen === 0) {
                    setRedoState(false);
                }
                else {
                    setRedoState(true);
                }
            };
            graph.on('stackchange', handleStackChange);
            return () => graph.off('stackchange', handleStackChange);
        },
        [graph]
    );


    const handleUndo = useCallback(
        () => {
            const {undoStack} = graph?.getStackData();
            const {action, data} = undoStack[0];
            switch (action) {
                case 'lock':
                    const {id: lockId} = data;
                    const lockNode = graph?.findById(lockId);
                    lockNode.unlock();
                    graph.clearItemStates(lockNode, ['customFixed', 'customSelected']);
                    toolBar?.undo();
                    break;
                case 'unlock':
                    const {id: unlockId} = data;
                    const unlockNode = graph?.findById(unlockId);
                    unlockNode.lock();
                    graph?.clearItemStates(unlockNode, ['customSelected']);
                    graph?.setItemState(unlockNode, 'customFixed', true);
                    toolBar?.undo();
                    break;
                case 'changedata':
                    toolBar?.undo();
                    const nodes = graph?.getNodes();
                    nodes?.forEach(item => {
                        const {type} = item.getModel();
                        const arr = ['diamond', 'triangle', 'star'];
                        if (arr.indexOf(type) === -1) {
                            graph.updateItem(item, {anchorPoints: null}, false);
                        }
                        if (item.hasLocked()) {
                            graph.setItemState(item, 'customFixed', true);
                        }
                    });
                    const {before: changedataBefore} = data;
                    onChange(action, changedataBefore);
                    break;
                default:
                    toolBar?.undo();
                    break;
            }
        },
        [graph, onChange, toolBar]
    );

    const handleRedo = useCallback(
        () => {
            const {redoStack} = graph?.getStackData();
            const {action, data} = redoStack[0];
            switch (action) {
                case 'lock':
                    const {id: toLockId} = data;
                    const toLockNode = graph?.findById(toLockId);
                    toLockNode.lock();
                    graph?.clearItemStates(toLockNode, ['customSelected']);
                    graph?.setItemState(toLockNode, 'customFixed', true);
                    toolBar?.redo();
                    break;
                case 'unlock':
                    const {id: toUnLockId} = data;
                    const toUnlockNode = graph?.findById(toUnLockId);
                    toUnlockNode.unlock();
                    graph.clearItemStates(toUnlockNode, ['customFixed', 'customSelected']);
                    toolBar?.redo();
                    break;
                case 'changedata':
                    toolBar?.redo();
                    let {after: changedDataAfter} = data;
                    const nodes = graph?.getNodes();
                    nodes?.forEach(item => {
                        const {type} = item.getModel();
                        const arr = ['diamond', 'triangle', 'star'];
                        if (arr.indexOf(type) === -1) {
                            graph.updateItem(item, {anchorPoints: null}, false);
                        }
                        if (item.hasLocked()) {
                            graph.setItemState(item, 'customFixed', true);
                        }
                    });
                    onChange(action, changedDataAfter);
                    break;
                default:
                    toolBar?.redo();
                    break;
            }
        },
        [graph, onChange, toolBar]
    );

    return (
        <>
            <Tooltip title={t('analysis.canvas.toolbar.undo')} placement='bottom'>
                <Button
                    disabled={!undoState}
                    type="text"
                    aria-label={t('analysis.canvas.toolbar.undo')}
                    onClick={handleUndo}
                    icon={<ArrowLeftOutlined />}
                />
            </Tooltip>
            <Tooltip title={t('analysis.canvas.toolbar.redo')} placement='bottom'>
                <Button
                    disabled={!redoState}
                    type="text"
                    aria-label={t('analysis.canvas.toolbar.redo')}
                    onClick={handleRedo}
                    icon={<ArrowRightOutlined />}
                />
            </Tooltip>
        </>
    );
};

export default RedoUndo;
