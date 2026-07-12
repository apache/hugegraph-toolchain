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
 * @file  FullScreen 全屏
 */

import React, {useCallback, useContext, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Tooltip} from 'antd';
import {CompressOutlined} from '@ant-design/icons';
import screenfull from 'screenfull';
import {GraphContext} from '../Context';

const FullScreen = props => {
    const {t} = useTranslation();
    const {onChange} = props;
    const {graph} = useContext(GraphContext);
    const handleFullScreenState = useCallback(
        () => {
            onChange();
        },
        [onChange]
    );

    useEffect(
        () => {
            document.addEventListener('fullscreenchange', handleFullScreenState, false);
            return () => {
                document.removeEventListener('fullscreenchange', handleFullScreenState, false);
            };
        },
        [handleFullScreenState]
    );

    const handleFullScreen = useCallback(
        () => {
            const container = graph?.getContainer?.();
            if (screenfull.isEnabled) {
                if (screenfull.isFullscreen) {
                    screenfull.exit();
                }
                else {
                    screenfull.request(container);
                }
            }
        },
        [graph]
    );

    useEffect(
        () => {
            const container = graph?.getContainer?.();
            if (!container) {
                return undefined;
            }
            const handleShortcut = event => {
                const target = event.target;
                if (event.key?.toLowerCase() !== 'f' || event.metaKey || event.ctrlKey
                    || event.altKey || event.isComposing
                    || target.closest?.('input, textarea, select, button, [contenteditable="true"]')) {
                    return;
                }
                event.preventDefault();
                handleFullScreen();
            };
            container.addEventListener('keydown', handleShortcut);
            return () => container.removeEventListener('keydown', handleShortcut);
        },
        [graph, handleFullScreen]
    );

    const shortcutLabel = t('analysis.canvas.toolbar.full_screen_shortcut');

    return (
        <Tooltip title={shortcutLabel} placement='bottom'>
            <Button
                type="text"
                aria-label={shortcutLabel}
                onClick={handleFullScreen}
                icon={<CompressOutlined />}
            />
        </Tooltip>
    );
};

export default FullScreen;
