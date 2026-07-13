/*
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

import {Descriptions, Modal, Typography} from 'antd';
import {useCallback, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';

export const isEditableShortcutTarget = target => {
    if (!(target instanceof Element)) {
        return false;
    }

    return Boolean(target.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"], '
        + '[role="textbox"], .CodeMirror'
    ));
};

const ShortcutHelp = () => {
    const {t} = useTranslation();
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);

    useEffect(() => {
        const openFromVisibleTrigger = () => setOpen(true);
        const handleKeyDown = event => {
            if (event.key !== '?' || event.defaultPrevented || event.isComposing
                || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey
                || isEditableShortcutTarget(event.target)) {
                return;
            }

            event.preventDefault();
            setOpen(value => !value);
        };

        window.addEventListener('hubble:shortcut-help', openFromVisibleTrigger);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('hubble:shortcut-help', openFromVisibleTrigger);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    return (
        <Modal
            open={open}
            title={t('workbench.shortcuts.title')}
            onCancel={close}
            onOk={close}
            cancelButtonProps={{style: {display: 'none'}}}
        >
            <Typography.Paragraph type='secondary'>
                {t('workbench.shortcuts.description')}
            </Typography.Paragraph>
            <Descriptions column={1} size='small' bordered>
                <Descriptions.Item label={<kbd>?</kbd>}>
                    {t('workbench.shortcuts.open_help')}
                </Descriptions.Item>
                <Descriptions.Item label={<kbd>Ctrl/⌘ + Enter</kbd>}>
                    {t('workbench.shortcuts.run_query')}
                </Descriptions.Item>
                <Descriptions.Item label={<kbd>F</kbd>}>
                    {t('workbench.shortcuts.fullscreen_graph')}
                </Descriptions.Item>
            </Descriptions>
        </Modal>
    );
};

export default ShortcutHelp;
