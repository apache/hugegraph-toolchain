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

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Alert, Button, Input, Select, Tooltip} from 'antd';
import {SettingOutlined, SwapOutlined} from '@ant-design/icons';
import {DEFAULT_QUERY_LANGUAGE, MODEL_PROVIDERS, QUERY_LANGUAGES,
    supportsQueryLanguage} from '../../../../utils/text2gql';
import {GREMLIN_EXECUTES_MODE} from '../../../../utils/constants';
import CodeEditor from '../../../../components/CodeEditor';
import ModelHistoryInput from '../../../../components/ModelHistoryInput';
import ResizeHandle from '../../../../components/ResizeHandle';
import {PrimaryActions, SecondaryActions} from '../ContentCommon';
import c from './index.module.scss';

const durationInSeconds = duration => (Number.isFinite(duration) && duration >= 0
    ? (duration / 1000).toFixed(2) : null);

const QueryBar = props => {
    const {t} = useTranslation();
    const {codeEditorContent = '', setCodeEditorContent, activeTab, onExecute, onClear,
        language = DEFAULT_QUERY_LANGUAGE, onLanguageChange,
        editorSource = 'manual', isExecuting = false, isGraphReady = true,
        cypherEnabled = false, text2gql, toolbarExtra, executionDurationMs} = props;
    const [favoriteCardVisible, setFavoriteCardVisible] = useState(false);
    const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
    const [configPrompt, setConfigPrompt] = useState(false);
    const modelSettingsRef = useRef(null);
    const busy = Boolean(text2gql?.pending || isExecuting);
    const generating = Boolean(text2gql?.pending
        && text2gql.phase !== 'execution' && text2gql.phase !== 'submission');
    const isEmptyQuery = !codeEditorContent.trim();
    const aiSource = editorSource === 'ai';
    const asyncTask = props.executeMode === GREMLIN_EXECUTES_MODE.TASK;
    const dialect = QUERY_LANGUAGES[language];
    const generationSeconds = durationInSeconds(text2gql?.generationDurationMs);
    const executionSeconds = durationInSeconds(executionDurationMs);
    const languageEnabled = supportsQueryLanguage(language, cypherEnabled);
    const nextLanguage = Object.keys(QUERY_LANGUAGES).find(value => (
        value !== language && supportsQueryLanguage(value, cypherEnabled)
    ));
    const toggleLanguage = useCallback(() => {
        if (nextLanguage) {
            onLanguageChange(nextLanguage);
        }
    }, [nextLanguage, onLanguageChange]);
    const onExecution = useCallback(() => {
        if (isGraphReady && languageEnabled && !isEmptyQuery && !busy) {
            onExecute(activeTab);
        }
    }, [activeTab, busy, isEmptyQuery, isGraphReady, languageEnabled, onExecute]);
    const handleEditorChange = useCallback(value => {
        setCodeEditorContent(value);
        if (!value.trim()) {
            setFavoriteCardVisible(false);
        }
    }, [setCodeEditorContent]);
    useEffect(() => setFavoriteCardVisible(false), [language]);

    const source = text2gql?.source || 'custom';
    useEffect(() => {
        setModelSettingsOpen(source === 'custom');
    }, [source]);
    const sharedConfig = text2gql?.sharedConfig || {available: false, loading: false};
    const customAvailable = sharedConfig.customAvailable !== false;
    const nextSource = source === 'shared' ? 'custom' : 'shared';
    const sourceLabel = value => t(`analysis.query.source_${value}`);
    const canSwitchSource = !sharedConfig.loading && (
        nextSource === 'shared' ? sharedConfig.available : customAvailable
    );
    const sourceSwitchHint = sharedConfig.loading ? t('analysis.query.shared_loading')
        : canSwitchSource ? t('analysis.query.switch_to', {name: sourceLabel(nextSource)})
            : t(nextSource === 'custom' ? 'analysis.query.custom_unavailable'
                : sharedConfig.reason === 'authentication_required' ? 'analysis.query.shared_auth_required'
                    : sharedConfig.reason === 'not_configured' ? 'analysis.query.shared_not_configured'
                        : 'analysis.query.shared_unavailable');
    const toggleSource = useCallback(() => {
        if (canSwitchSource) {
            setConfigPrompt(false);
            text2gql.changeSource(nextSource);
        }
    }, [canSwitchSource, nextSource, text2gql]);
    const onProviderChange = useCallback(value => text2gql.updateConfig('provider', value), [text2gql]);
    const onBaseUrlChange = useCallback(event => text2gql.updateConfig('baseUrl', event.target.value), [text2gql]);
    const onModelChange = useCallback(event => text2gql.updateConfig('model', event.target.value), [text2gql]);
    const onApiKeyChange = useCallback(event => text2gql.updateConfig('apiKey', event.target.value), [text2gql]);
    const onQuestionChange = useCallback(event => text2gql.setQuestion(event.target.value), [text2gql]);
    const missingUrl = !text2gql?.config.baseUrl.trim();
    const missingModel = !text2gql?.config.model.trim();
    const missingKey = text2gql?.config.provider !== 'ollama' && !text2gql?.config.apiKey.trim();
    const missingCustomConfig = source === 'custom' && (missingUrl || missingModel || missingKey);
    const canGenerate = Boolean(text2gql && languageEnabled && !busy && !sharedConfig.loading && isGraphReady
        && text2gql.question.trim() && (source === 'shared' ? sharedConfig.available : customAvailable));
    const onGenerate = useCallback(() => {
        if (!canGenerate) {
            return;
        }
        if (missingCustomConfig) {
            setModelSettingsOpen(true);
            setConfigPrompt(true);
            return;
        }
        setConfigPrompt(false);
        text2gql.generate({asyncTask});
    }, [asyncTask, canGenerate, missingCustomConfig, text2gql]);
    const onQuestionKeyDown = useCallback(event => {
        if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)
            || event.altKey || event.shiftKey || event.repeat
            || event.nativeEvent.isComposing || event.keyCode === 229) {
            return;
        }
        event.preventDefault();
        onGenerate();
    }, [onGenerate]);
    const toggleModelSettings = useCallback(event => {
        event.preventDefault();
        setModelSettingsOpen(open => !open);
    }, []);
    const inspectModelSettings = useCallback(() => {
        setModelSettingsOpen(true);
        setConfigPrompt(true);
    }, []);
    useEffect(() => {
        if (modelSettingsOpen && configPrompt) {
            const field = modelSettingsRef.current?.querySelector('input[aria-invalid="true"]')
                || modelSettingsRef.current?.querySelector('#text2gql-base-url');
            field?.focus();
        }
    }, [configPrompt, modelSettingsOpen]);
    const minimumHeight = 140;
    const viewportMaximum = () => Math.max(minimumHeight, Math.floor(window.innerHeight * 0.6));
    const [maximumHeight, setMaximumHeight] = useState(viewportMaximum);
    const [inputHeight, setInputHeight] = useState(() => Math.min(160, viewportMaximum()));
    useEffect(() => {
        const updateBounds = () => {
            const maximum = Math.max(140, Math.floor(window.innerHeight * 0.6));
            setMaximumHeight(maximum);
            setInputHeight(height => Math.min(maximum, height));
        };
        window.addEventListener('resize', updateBounds);
        return () => window.removeEventListener('resize', updateBounds);
    }, []);
    const commonActionProps = {...props, isEmptyQuery, isExecuting: busy || !languageEnabled,
        favoriteCardVisible, setFavoriteCardVisible, allowAsync: true, allowFavorite: !aiSource, onClear};

    return (
        <div
            className={c.queryBar}
            id='queryBar'
            aria-busy={busy}
            style={{'--query-input-height': `${inputHeight}px`}}
        >
            <div className={c.toolbar} role='toolbar' aria-label={t('analysis.query.query_toolbar')}>
                <h2 className={c.toolIdentity}><span aria-hidden='true'>🤖</span> Text2GQL</h2>
                <Tooltip
                    trigger={['hover', 'focus']}
                    title={nextLanguage
                        ? t('analysis.query.switch_to', {name: QUERY_LANGUAGES[nextLanguage].label})
                        : t('analysis.query.cypher_unavailable')}
                >
                    <Button
                        size='small'
                        icon={<SwapOutlined aria-hidden='true' />}
                        aria-label={`${t('analysis.query.query_language')}: ${dialect.label}`}
                        disabled={!nextLanguage}
                        onClick={toggleLanguage}
                    >
                        {dialect.label}
                    </Button>
                </Tooltip>
                <div className={c.queryActions}>
                    <SecondaryActions {...commonActionProps} />
                </div>
                {toolbarExtra && <div className={c.toolbarExtra}>{toolbarExtra}</div>}
            </div>
            {text2gql && source === 'custom' && customAvailable && !sharedConfig.loading && (
                <details className={c.modelSettings} open={modelSettingsOpen} ref={modelSettingsRef}>
                    <summary hidden>
                        <strong>{t('analysis.query.model_settings')}</strong>
                        {text2gql.config.model && (
                            <span className={c.selectedModel}> · {text2gql.config.model}</span>
                        )}
                    </summary>
                    {configPrompt && missingCustomConfig && (
                        <Alert showIcon type='warning' message={t('analysis.query.complete_model_config')} />
                    )}
                    <div className={c.modelConfig}>
                        <div className={c.modelField}>
                            <label htmlFor='text2gql-provider'>{t('analysis.query.temporary_api_type')}</label>
                            <Tooltip
                                title={text2gql.config.provider === 'openai'
                                    ? t('analysis.query.connection_openai_hint') : undefined}
                            >
                                <Select
                                    id='text2gql-provider'
                                    aria-label={t('analysis.query.temporary_api_type')}
                                    value={text2gql.config.provider}
                                    onChange={onProviderChange}
                                    options={Object.keys(MODEL_PROVIDERS).map(value => ({
                                        value, label: t(value === 'ollama' ? 'analysis.query.connection_ollama'
                                            : 'analysis.query.connection_openai'),
                                    }))}
                                />
                            </Tooltip>
                        </div>
                        <div className={c.modelField}>
                            <label htmlFor='text2gql-base-url'>
                                Base URL
                            </label>
                            <ModelHistoryInput
                                field='baseUrl'
                                id='text2gql-base-url'
                                aria-required='true'
                                title={t('analysis.query.local_url_hint')}
                                placeholder={t('analysis.query.base_url_placeholder')}
                                status={configPrompt && missingUrl ? 'error' : undefined}
                                aria-invalid={configPrompt && missingUrl}
                                value={text2gql.config.baseUrl}
                                maxLength={2048}
                                onChange={onBaseUrlChange}
                            />
                        </div>
                        <div className={c.modelField}>
                            <label htmlFor='text2gql-model'>
                                {t('analysis.query.model_name')}
                            </label>
                            <ModelHistoryInput
                                baseUrl={text2gql.config.baseUrl}
                                id='text2gql-model'
                                aria-label={t('analysis.query.model_name')}
                                aria-required='true'
                                placeholder={t('analysis.query.model_name_placeholder')}
                                status={configPrompt && missingModel ? 'error' : undefined}
                                aria-invalid={configPrompt && missingModel}
                                value={text2gql.config.model}
                                maxLength={256}
                                onChange={onModelChange}
                            />
                        </div>
                        <div className={c.modelField}>
                            <label htmlFor='text2gql-api-key'>
                                {t('analysis.query.temporary_api_key')} {text2gql.config.provider === 'ollama' && (
                                    <span className={c.fieldHint}>{t('analysis.query.optional_field')}</span>
                                )}
                            </label>
                            <Input.Password
                                id='text2gql-api-key'
                                aria-label={t('analysis.query.temporary_api_key')}
                                aria-required={text2gql.config.provider !== 'ollama'}
                                autoComplete='new-password'
                                placeholder={t('analysis.query.api_key_hint')}
                                status={configPrompt && missingKey ? 'error' : undefined}
                                aria-invalid={configPrompt && missingKey}
                                value={text2gql.config.apiKey}
                                maxLength={4096}
                                onChange={onApiKeyChange}
                            />
                        </div>
                    </div>
                </details>
            )}
            {text2gql?.error && <Alert
                className={c.queryError}
                showIcon
                type={text2gql.errorType || 'error'}
                message={text2gql.error}
                action={source === 'custom' && customAvailable && text2gql.errorStage === 'generation'
                    && text2gql.errorType !== 'info' && (
                    <Button size='small' onClick={inspectModelSettings}>
                        {t('analysis.query.inspect_model_settings')}
                    </Button>
                )}
            />}
            <div className={c.queryWorkspace} id='query-inputs'>
                <section aria-labelledby='text2gql-question-label' className={c.querySection}>
                    <div className={c.panelHeading}>
                        <label id='text2gql-question-label' htmlFor='text2gql-question'>
                            {t('analysis.query.question_label')}
                        </label>
                        {text2gql && (
                            <div className={c.modelControls}>
                                <Tooltip trigger={['hover', 'focus']} title={sourceSwitchHint}>
                                    <Button
                                        type='text'
                                        size='small'
                                        icon={<SwapOutlined aria-hidden='true' />}
                                        aria-label={`${t('analysis.query.model_source')}: ${sourceLabel(source)}`}
                                        disabled={!canSwitchSource}
                                        onClick={toggleSource}
                                    >
                                        {sourceLabel(source)}
                                    </Button>
                                </Tooltip>
                                <span className={c.modelStatus} role='status'>
                                    {sharedConfig.loading ? t('analysis.query.shared_loading')
                                        : source === 'shared' ? sharedConfig.model || t('analysis.query.shared_ready')
                                            : !customAvailable ? t('analysis.query.custom_unavailable')
                                                : text2gql.config.model}
                                </span>
                                {source === 'custom' && customAvailable && !sharedConfig.loading && (
                                    <Button
                                        type='text'
                                        size='small'
                                        icon={<SettingOutlined aria-hidden='true' />}
                                        onClick={toggleModelSettings}
                                        aria-label={t('analysis.query.model_settings')}
                                        aria-expanded={modelSettingsOpen}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                    <div className={c.inputFrame}>
                        <Input.TextArea
                            id='text2gql-question'
                            disabled={busy || !text2gql}
                            aria-required='true'
                            aria-describedby='text2gql-prompt-hint'
                            placeholder={t('analysis.query.text2gql_placeholder')}
                            value={text2gql?.question || ''}
                            onChange={onQuestionChange}
                            onKeyDown={onQuestionKeyDown}
                            maxLength={4000}
                        />
                        <div className={c.inputFooter}>
                            <div className={c.footerInfo}>
                                <p id='text2gql-prompt-hint' className={c.fieldHint}>
                                    {t('analysis.query.prompt_settings_hint')}
                                </p>
                                {generationSeconds !== null && (
                                    <span className={c.duration}>
                                        {t('analysis.query.generation_duration', {seconds: generationSeconds})}
                                    </span>
                                )}
                            </div>
                            <Button
                                className={c.generateButton}
                                type='primary'
                                loading={generating}
                                disabled={!canGenerate}
                                onClick={onGenerate}
                                title={t('analysis.query.shortcut_hint')}
                            >
                                {t(generating
                                    ? text2gql.repairing ? 'analysis.query.repairing' : 'analysis.query.generating'
                                    : asyncTask ? 'analysis.query.generate_task' : 'analysis.query.generate_query')}
                            </Button>
                        </div>
                    </div>
                </section>
                <section aria-labelledby='query-statement-label' className={c.querySection}>
                    <div className={c.panelHeading}>
                        <span id='query-statement-label'>{t('analysis.query.statement_label')}</span>
                        {aiSource && <span className={c.fieldHint}>{t('analysis.query.read_only_hint')}</span>}
                    </div>
                    <div className={c.inputFrame}>
                        <div className={c.editorShell}>
                            <CodeEditor
                                value={codeEditorContent}
                                onChange={handleEditorChange}
                                onExecutionShortcut={onExecution}
                                lang={language}
                                lineWrapping
                                ariaLabel={t(`analysis.query.${language}_editor`)}
                                readOnly={Boolean(text2gql?.pending)}
                                placeholder={t(`analysis.query.${language}_placeholder`)}
                            />
                        </div>
                        <div className={c.inputFooter}>
                            <div className={c.footerInfo}>
                                {executionSeconds !== null ? (
                                    <span className={c.duration}>
                                        {t('analysis.query.execution_duration', {
                                            language: dialect.label, seconds: executionSeconds,
                                        })}
                                    </span>
                                ) : (
                                    <span className={c.fieldHint} aria-hidden='true'>
                                        {t('analysis.query.shortcut_hint')}
                                    </span>
                                )}
                            </div>
                            <div className={c.executeActions}>
                                <PrimaryActions {...commonActionProps} />
                                {text2gql?.pending && text2gql.phase !== 'submission' && (
                                    <Button size='small' onClick={text2gql.cancel}>
                                        {t('analysis.query.cancel_generation')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
            <ResizeHandle
                className={c.resizeHandle}
                label={t('analysis.query.resize_inputs')}
                controls='query-inputs'
                min={minimumHeight}
                max={maximumHeight}
                value={inputHeight}
                onChange={setInputHeight}
                title={t('analysis.query.resize_inputs_hint')}
            />
        </div>
    );
};

export default QueryBar;
