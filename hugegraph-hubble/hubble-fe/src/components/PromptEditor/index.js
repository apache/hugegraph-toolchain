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

import {useCallback, useState} from 'react';
import {Button, Input, Modal, Tabs} from 'antd';
import {useTranslation} from 'react-i18next';
import {DEFAULT_QUERY_LANGUAGE, MAX_PROMPT_LENGTH, QUERY_LANGUAGES} from '../../utils/text2gql';
import c from './index.module.scss';

// The modal owns a draft so Cancel never changes the caller's applied templates.
const PromptEditor = ({values, defaults, language = DEFAULT_QUERY_LANGUAGE, temporary = false,
    disabled = false, onApply, onCancel}) => {
    const {t} = useTranslation();
    const [draft, setDraft] = useState(() => ({...values}));
    const [activeLanguage, setActiveLanguage] = useState(language);
    const valid = Object.keys(QUERY_LANGUAGES).every(value => draft[value]?.trim()
        && draft[value].length <= MAX_PROMPT_LENGTH);
    const update = useCallback(event => {
        const value = event.target.value;
        setDraft(previous => ({...previous, [activeLanguage]: value}));
    }, [activeLanguage]);
    const reset = useCallback(() => {
        setDraft(previous => ({...previous, [activeLanguage]: defaults[activeLanguage]}));
    }, [activeLanguage, defaults]);
    const apply = useCallback(() => {
        if (!disabled && valid) {
            onApply(draft);
        }
    }, [disabled, draft, onApply, valid]);
    return (
        <Modal
            open
            title={t('analysis.prompt.title')}
            width={1120}
            centered
            className={c.modal}
            wrapClassName={c.overlay}
            onCancel={onCancel}
            onOk={apply}
            okText={t('analysis.prompt.apply')}
            cancelText={t('analysis.prompt.cancel')}
            okButtonProps={{disabled: disabled || !valid}}
        >
            <Tabs
                activeKey={activeLanguage}
                onChange={setActiveLanguage}
                items={Object.entries(QUERY_LANGUAGES).map(([key, {label}]) => ({key, label}))}
            />
            <label htmlFor='text2gql-prompt-editor' className={c.label}>
                {t('analysis.prompt.template', {language: QUERY_LANGUAGES[activeLanguage].label})}
            </label>
            <Input.TextArea
                id='text2gql-prompt-editor'
                className={c.editor}
                value={draft[activeLanguage]}
                onChange={update}
                disabled={disabled}
                rows={22}
                aria-describedby='text2gql-prompt-help'
                maxLength={MAX_PROMPT_LENGTH}
                showCount
                aria-invalid={!draft[activeLanguage]?.trim()}
            />
            <div className={c.help} id='text2gql-prompt-help'>
                <Button onClick={reset} disabled={disabled || !defaults?.[activeLanguage]}>
                    {t(temporary ? 'analysis.prompt.reset_shared' : 'analysis.prompt.reset_default')}
                </Button>
                <div className={c.description}>
                    <p>{t(temporary ? 'analysis.prompt.temporary_hint' : 'analysis.prompt.shared_hint')}</p>
                    <p>{t('analysis.prompt.schema_hint')}</p>
                </div>
            </div>
        </Modal>
    );
};

export default PromptEditor;
