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

import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, Button, Checkbox, Input, Select, Spin, Switch, Tooltip} from 'antd';
import {EditOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import {useAuthContext} from '../../auth/AuthContext';
import * as api from '../../api';
import {MODEL_PROVIDERS, readPromptTemplates} from '../../utils/text2gql';
import {sanitizePublicError} from '../../utils/publicError';
import {rememberModel} from '../../utils/modelHistory';
import ModelHistoryInput from '../../components/ModelHistoryInput';
import PromptEditor from '../../components/PromptEditor';
import c from './index.module.scss';

const safeSettings = data => ({
    enabled: data.enabled === true,
    connection_type: data.connection_type === 'ollama' ? 'ollama' : 'openai',
    base_url: typeof data.base_url === 'string' ? data.base_url : MODEL_PROVIDERS.openai,
    model: typeof data.model === 'string' ? data.model : '',
    has_api_key: data.has_api_key === true,
    source: data.source === 'managed' ? 'managed' : 'deployment',
    prompts: readPromptTemplates(data.prompts),
    defaultPrompts: readPromptTemplates(data.default_prompts),
});

const Text2GqlSettingsForm = () => {
    const {t} = useTranslation();
    const {identityEpoch} = useAuthContext();
    const translateRef = useRef(t);
    translateRef.current = t;
    const [settings, setSettings] = useState();
    const [saved, setSaved] = useState();
    const [apiKey, setApiKey] = useState('');
    const [clearKey, setClearKey] = useState(false);
    const [promptEditorOpen, setPromptEditorOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testOrigin, setTestOrigin] = useState();
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [feedback, setFeedback] = useState();
    const [revision, setRevision] = useState(0);
    const requestRef = useRef(null);
    const savePendingRef = useRef(false);
    const epochRef = useRef(identityEpoch);
    epochRef.current = identityEpoch;

    useEffect(() => {
        const request = {controller: new AbortController(), epoch: identityEpoch};
        requestRef.current = request;
        const current = () => requestRef.current === request && epochRef.current === request.epoch
            && !request.controller.signal.aborted;
        setLoading(true);
        setSaving(false);
        setTestOrigin();
        savePendingRef.current = false;
        setSettings();
        setSaved();
        setApiKey('');
        setClearKey(false);
        setPromptEditorOpen(false);
        setFeedback();
        api.config.getText2GqlSettings({signal: request.controller.signal})
            .then(response => {
                if (!current()) {
                    return;
                }
                if (response?.status !== 200 || !response.data) {
                    throw new Error(translateRef.current('analysis.model_settings.load_failed'));
                }
                const next = safeSettings(response.data);
                setSettings(next);
                setSaved(next);
            })
            .catch(() => {
                if (current()) {
                    setFeedback({type: 'error', message: translateRef.current('analysis.model_settings.load_failed')});
                }
            })
            .finally(() => {
                if (current()) {
                    setLoading(false);
                }
            });
        return () => {
            requestRef.current?.controller.abort();
            requestRef.current = null;
        };
    }, [identityEpoch, revision]);

    const update = useCallback((field, value) => {
        setFeedback();
        setSettings(previous => ({...previous, [field]: value}));
    }, []);
    const onEnabled = useCallback(value => update('enabled', value), [update]);
    const onBaseUrl = useCallback(event => update('base_url', event.target.value), [update]);
    const onModel = useCallback(event => update('model', event.target.value), [update]);
    const onKey = useCallback(event => {
        setApiKey(event.target.value);
        setFeedback();
    }, []);
    const onClearKey = useCallback(event => {
        setClearKey(event.target.checked);
        setFeedback();
    }, []);
    const onConnection = useCallback(value => {
        setSettings(previous => ({...previous, connection_type: value, base_url: MODEL_PROVIDERS[value], model: ''}));
        setApiKey('');
        setClearKey(false);
        setFeedback();
    }, []);
    const reload = useCallback(() => setRevision(previous => previous + 1), []);

    const testing = Boolean(testOrigin);
    const busy = saving || testing;
    const openPromptEditor = useCallback(() => setPromptEditorOpen(true), []);
    const closePromptEditor = useCallback(() => setPromptEditorOpen(false), []);
    const applyPrompts = useCallback(prompts => {
        if (!busy) {
            update('prompts', prompts);
            setPromptEditorOpen(false);
        }
    }, [busy, update]);
    useEffect(() => {
        if (!testing) {
            return undefined;
        }
        const started = Date.now();
        setElapsedSeconds(0);
        const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
        return () => window.clearInterval(timer);
    }, [testing]);

    const dirty = Boolean(settings && saved && (apiKey || clearKey
        || ['enabled', 'connection_type', 'base_url', 'model'].some(field => settings[field] !== saved[field])
        || JSON.stringify(settings.prompts) !== JSON.stringify(saved.prompts)));
    const cannotTest = busy || loading || !saved?.enabled || dirty;
    const testHint = dirty ? t('analysis.model_settings.test_save_first')
        : !saved?.enabled ? t('analysis.model_settings.test_disabled') : undefined;
    const urlChanged = settings?.base_url.trim().replace(/\/+$/, '')
        !== saved?.base_url.trim().replace(/\/+$/, '');
    const endpointNeedsKey = saved?.has_api_key && urlChanged && !clearKey && !apiKey.trim()
        && settings?.connection_type !== 'ollama';
    const requiresKey = endpointNeedsKey || (settings?.enabled && settings.connection_type !== 'ollama'
        && (!saved?.has_api_key || urlChanged || clearKey) && !apiKey.trim());
    const cannotSave = busy || loading || !settings || requiresKey || (settings.enabled
        && (!settings.base_url.trim() || !settings.model.trim()));

    const runTest = useCallback(async (request, afterSave, configuration, secret = '') => {
        const current = () => requestRef.current === request && epochRef.current === request.epoch
            && !request.controller.signal.aborted;
        setTestOrigin(afterSave ? 'saved' : 'manual');
        setFeedback();
        try {
            const response = await api.config.testText2GqlSettings({signal: request.controller.signal});
            if (!current()) {
                return;
            }
            if (response?.status !== 200 || !Number.isFinite(response.data?.duration_ms)) {
                throw new Error(response?.message || t('analysis.model_settings.test_failed'));
            }
            rememberModel(configuration.base_url, configuration.model);
            setFeedback({type: 'success', message: t(afterSave
                ? 'analysis.model_settings.saved_tested' : 'analysis.model_settings.test_success',
            {seconds: (Math.max(0, response.data.duration_ms) / 1000).toFixed(1)})});
        }
        catch (failure) {
            if (current()) {
                const detail = failure?.response?.data?.message || failure?.message;
                const redacted = secret && typeof detail === 'string'
                    ? detail.split(secret).join('[redacted]') : detail;
                const message = sanitizePublicError(redacted, t('analysis.model_settings.test_failed'));
                setFeedback({type: 'error', message: t(afterSave
                    ? 'analysis.model_settings.saved_test_failed' : 'analysis.model_settings.test_error',
                {message})});
            }
        }
        finally {
            if (current()) {
                setTestOrigin();
            }
        }
    }, [t]);

    const testSaved = useCallback(async () => {
        if (cannotTest || savePendingRef.current) {
            return;
        }
        const request = {controller: new AbortController(), epoch: identityEpoch};
        requestRef.current = request;
        savePendingRef.current = true;
        try {
            await runTest(request, false, saved);
        }
        finally {
            if (requestRef.current === request && epochRef.current === request.epoch) {
                savePendingRef.current = false;
            }
        }
    }, [cannotTest, identityEpoch, runTest, saved]);

    const cancelTest = useCallback(() => {
        requestRef.current?.controller.abort();
        requestRef.current = null;
        savePendingRef.current = false;
        setFeedback({type: 'info', message: t(testOrigin === 'saved'
            ? 'analysis.model_settings.saved_test_cancelled' : 'analysis.model_settings.test_cancelled')});
        setTestOrigin();
    }, [t, testOrigin]);

    const save = useCallback(async () => {
        if (cannotSave || savePendingRef.current) {
            return;
        }
        const request = {controller: new AbortController(), epoch: identityEpoch};
        requestRef.current = request;
        const current = () => requestRef.current === request && epochRef.current === request.epoch
            && !request.controller.signal.aborted;
        const params = {
            enabled: settings.enabled, connection_type: settings.connection_type,
            base_url: settings.base_url.trim(), model: settings.model.trim(),
        };
        if (settings.prompts) {
            params.prompts = settings.prompts;
        }
        if (apiKey.trim()) {
            params.api_key = apiKey;
        }
        else if (clearKey || (urlChanged && settings.connection_type === 'ollama')) {
            params.clear_api_key = true;
        }
        savePendingRef.current = true;
        setSaving(true);
        setFeedback();
        try {
            const response = await api.config.updateText2GqlSettings(params, {signal: request.controller.signal});
            if (!current()) {
                return;
            }
            if (response?.status !== 200 || !response.data) {
                throw new Error(response?.message || t('analysis.model_settings.save_failed'));
            }
            const next = safeSettings(response.data);
            setSettings(next);
            setSaved(next);
            setApiKey('');
            setClearKey(false);
            setSaving(false);
            if (next.enabled) {
                await runTest(request, true, next, apiKey);
            }
            else {
                setFeedback({type: 'success', message: t('analysis.model_settings.saved')});
            }
        }
        catch (failure) {
            if (current()) {
                const detail = failure?.response?.data?.message || failure?.message;
                const redacted = apiKey && typeof detail === 'string'
                    ? detail.split(apiKey).join('[redacted]') : detail;
                setFeedback({type: 'error', message: sanitizePublicError(redacted,
                    t('analysis.model_settings.save_failed'))});
            }
        }
        finally {
            if (current()) {
                savePendingRef.current = false;
                setSaving(false);
            }
        }
    }, [apiKey, cannotSave, clearKey, identityEpoch, runTest, settings, t, urlChanged]);

    return (
        <main className={c.page}>
            <header>
                <div className={c.titleRow}>
                    <h2>{t('analysis.model_settings.title')}</h2>
                    {settings && (
                        <Tooltip
                            title={!settings.prompts || !settings.defaultPrompts
                                ? t('analysis.prompt.unavailable') : undefined}
                        >
                            <span className={c.promptAction}>
                                <Button
                                    type='text'
                                    size='small'
                                    icon={<EditOutlined aria-hidden='true' />}
                                    disabled={busy || !settings.prompts || !settings.defaultPrompts}
                                    onClick={openPromptEditor}
                                >
                                    {t('analysis.prompt.title')}
                                </Button>
                            </span>
                        </Tooltip>
                    )}
                </div>
                <p>{t('analysis.model_settings.description')}</p>
            </header>
            {feedback && <Alert showIcon type={feedback.type} message={feedback.message} />}
            {loading ? <Spin /> : !settings ? (
                <Button onClick={reload}>{t('analysis.model_settings.retry')}</Button>
            ) : (
                <section className={c.form} aria-label={t('analysis.model_settings.title')}>
                    <div className={c.enabledRow}>
                        <div>
                            <label htmlFor='shared-model-enabled'>{t('analysis.model_settings.enabled')}</label>
                            <p>{t('analysis.model_settings.enabled_hint')}</p>
                        </div>
                        <Switch
                            id='shared-model-enabled'
                            checked={settings.enabled}
                            disabled={busy}
                            onChange={onEnabled}
                        />
                    </div>
                    <div className={c.field}>
                        <label htmlFor='shared-model-connection'>{t('analysis.query.connection_type')}</label>
                        <Select
                            id='shared-model-connection'
                            value={settings.connection_type}
                            disabled={busy}
                            onChange={onConnection}
                            options={[
                                {value: 'openai', label: t('analysis.query.connection_openai')},
                                {value: 'ollama', label: t('analysis.query.connection_ollama')},
                            ]}
                        />
                        {settings.connection_type === 'openai' && <p>{t('analysis.query.connection_openai_hint')}</p>}
                    </div>
                    <div className={c.field}>
                        <label htmlFor='shared-model-url' className={settings.enabled ? c.requiredLabel : undefined}>
                            Base URL
                        </label>
                        <ModelHistoryInput
                            field='baseUrl'
                            id='shared-model-url'
                            placeholder={t('analysis.query.base_url_placeholder')}
                            value={settings.base_url}
                            status={settings.enabled && !settings.base_url.trim() ? 'error' : undefined}
                            aria-invalid={settings.enabled && !settings.base_url.trim()}
                            aria-required={settings.enabled}
                            maxLength={2048}
                            disabled={busy}
                            onChange={onBaseUrl}
                        />
                        <p>{t('analysis.query.local_url_hint')}</p>
                    </div>
                    <div className={c.field}>
                        <label htmlFor='shared-model-name' className={settings.enabled ? c.requiredLabel : undefined}>
                            {t('analysis.query.model_name')}
                        </label>
                        <ModelHistoryInput
                            baseUrl={settings.base_url}
                            id='shared-model-name'
                            placeholder={t('analysis.query.model_name_placeholder')}
                            value={settings.model}
                            status={settings.enabled && !settings.model.trim() ? 'error' : undefined}
                            aria-invalid={settings.enabled && !settings.model.trim()}
                            aria-required={settings.enabled}
                            maxLength={256}
                            disabled={busy}
                            onChange={onModel}
                        />
                    </div>
                    <div className={c.field}>
                        <label htmlFor='shared-model-key'>{t('analysis.model_settings.replace_key')}</label>
                        <Input.Password
                            id='shared-model-key'
                            value={apiKey}
                            placeholder={t(saved.has_api_key ? 'analysis.model_settings.key_keep_placeholder'
                                : settings.connection_type === 'ollama'
                                    ? 'analysis.model_settings.key_optional_placeholder'
                                    : 'analysis.model_settings.key_placeholder')}
                            maxLength={4096}
                            autoComplete='new-password'
                            disabled={busy || clearKey}
                            onChange={onKey}
                            aria-describedby='shared-model-key-hint'
                        />
                        <p id='shared-model-key-hint'>{t(saved.has_api_key
                            ? 'analysis.model_settings.key_configured' : 'analysis.model_settings.key_missing')}
                        </p>
                        {saved.has_api_key && (
                            <Checkbox
                                checked={clearKey}
                                disabled={busy || Boolean(apiKey.trim())}
                                onChange={onClearKey}
                            >
                                {t('analysis.model_settings.clear_key')}
                            </Checkbox>
                        )}
                        {requiresKey && (
                            <p className={c.required} role='alert'>
                                {t(endpointNeedsKey ? 'analysis.model_settings.key_endpoint_changed'
                                    : 'analysis.model_settings.key_required')}
                            </p>
                        )}
                    </div>
                    {promptEditorOpen && <PromptEditor
                        values={settings.prompts}
                        defaults={settings.defaultPrompts}
                        disabled={busy}
                        onCancel={closePromptEditor}
                        onApply={applyPrompts}
                    />}
                    <footer className={c.actions}>
                        <span className={c.source}>{t(saved.source === 'managed'
                            ? 'analysis.model_settings.source_managed' : 'analysis.model_settings.source_deployment')}
                        </span>
                        <div className={c.buttons}>
                            <Tooltip title={testHint}>
                                <span>
                                    <Button disabled={cannotTest} loading={testing} onClick={testSaved}>
                                        {t('analysis.model_settings.test_saved')}
                                    </Button>
                                </span>
                            </Tooltip>
                            <Button type='primary' disabled={cannotSave} loading={saving} onClick={save}>
                                {t(settings.enabled
                                    ? 'analysis.model_settings.save_test' : 'analysis.model_settings.save')}
                            </Button>
                        </div>
                    </footer>
                    {testing ? (
                        <div className={c.testStatus}>
                            <span role='status' aria-live='polite'>
                                {t(testOrigin === 'saved' ? 'analysis.model_settings.saved_testing'
                                    : 'analysis.model_settings.testing', {seconds: elapsedSeconds})}
                            </span>
                            <Button type='link' size='small' onClick={cancelTest}>
                                {t('analysis.model_settings.cancel_test')}
                            </Button>
                        </div>
                    ) : testHint && <p className={c.testHint}>{testHint}</p>}
                </section>
            )}
        </main>
    );
};

const Text2GqlSettings = () => {
    const {loading, hasCapability} = useAuthContext();
    if (loading) {
        return <Spin />;
    }
    return hasCapability('model_settings_manage') ? <Text2GqlSettingsForm /> : null;
};

export default Text2GqlSettings;
