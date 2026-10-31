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
import {scopedStorageKey, USER_CHANGE_EVENT} from '../../../utils/user';
import {sanitizePublicError} from '../../../utils/publicError';
import {canRepairQuery, queryFailure} from '../../../utils/queryFailure';
import {rememberModel} from '../../../utils/modelHistory';
import * as api from '../../../api';
import {DEFAULT_QUERY_LANGUAGE, MODEL_PROVIDERS, supportsQueryLanguage} from '../../../utils/text2gql';

const restoreConfig = identity => {
    try {
        const saved = JSON.parse(sessionStorage.getItem(identity) || '{}');
        // Previous DeepSeek and GLM presets use the same OpenAI-compatible protocol.
        const provider = saved.provider === 'ollama' ? 'ollama' : 'openai';
        return {
            provider,
            baseUrl: typeof saved.baseUrl === 'string' ? saved.baseUrl : MODEL_PROVIDERS[provider],
            model: typeof saved.model === 'string' ? saved.model : '',
            apiKey: '',
        };
    }
    catch {
        return {provider: 'openai', baseUrl: MODEL_PROVIDERS.openai, model: '', apiKey: ''};
    }
};

export default function useText2Gql({scope, active, ready, execute, clearResult, clearEditor, onGeneratedDraft, t,
    language = DEFAULT_QUERY_LANGUAGE, cypherEnabled = false, onLanguageChange, vertexLabels}) {
    const [identity, setIdentity] = useState(() => scopedStorageKey('hubble.text2gql'));
    const [identityVersion, setIdentityVersion] = useState(0);
    const [source, setSource] = useState('custom');
    const [sharedMetadata, setSharedMetadata] = useState({
        scope: null, loading: false, available: false, customAvailable: false,
    });
    const metadataRequest = useRef(null);
    const [config, setConfig] = useState(() => restoreConfig(identity));
    const [question, setQuestionState] = useState('');
    const touchedQuestions = useRef({});
    const populatedExamples = useRef({});
    const [sourceQuestion, setSourceQuestion] = useState('');
    const [pending, setPending] = useState(false);
    const [repairing, setRepairing] = useState(false);
    const [phase, setPhase] = useState('');
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [generationDurationMs, setGenerationDurationMs] = useState(null);
    const startedAt = useRef(0);
    const [modelSlow, setModelSlow] = useState(false);
    const [error, setError] = useState('');
    const [errorType, setErrorType] = useState('error');
    const [errorStage, setErrorStage] = useState('');
    const requestRef = useRef(null);
    const languageDrafts = useRef({});
    const connectionScope = JSON.stringify([identity, identityVersion, scope.graphSpace, scope.graph,
        scope.routeGraphSpace, scope.routeGraph, active]);
    const baseScopeRef = useRef(connectionScope);
    baseScopeRef.current = connectionScope;
    const currentScope = JSON.stringify([connectionScope, source, language,
        supportsQueryLanguage(language, cypherEnabled)]);
    const sharedConfig = sharedMetadata.scope === connectionScope ? sharedMetadata
        : {loading: active && ready, available: false, customAvailable: false};
    const scopeRef = useRef(currentScope);
    scopeRef.current = currentScope;

    const invalidate = useCallback(() => {
        requestRef.current?.controller.abort();
        clearInterval(requestRef.current?.generationTimer);
        requestRef.current = null;
        setPending(false);
        setRepairing(false);
        setPhase('');
        setElapsedSeconds(0);
        setGenerationDurationMs(null);
    }, []);

    useEffect(() => {
        if (!pending) {
            return undefined;
        }
        const timer = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, [pending]);

    useEffect(() => {
        setModelSlow(false);
        if (!pending || !['waiting', 'repair_waiting'].includes(phase)) {
            return undefined;
        }
        const timer = setTimeout(() => setModelSlow(true), 15000);
        return () => clearTimeout(timer);
    }, [pending, phase]);

    useEffect(() => {
        if (supportsQueryLanguage(language, cypherEnabled)) {
            return;
        }
        invalidate();
        languageDrafts.current = {};
        setSourceQuestion('');
        clearEditor('');
        clearResult();
        setError('');
        setErrorStage('');
        onLanguageChange?.(DEFAULT_QUERY_LANGUAGE);
    }, [clearEditor, clearResult, cypherEnabled, invalidate, language, onLanguageChange]);

    useEffect(() => {
        const onIdentityChange = () => {
            // Invalidate synchronously, before the identity change re-renders.
            invalidate();
            metadataRequest.current?.controller.abort();
            metadataRequest.current = null;
            setIdentityVersion(previous => previous + 1);
            setSharedMetadata({scope: null, loading: false, available: false, customAvailable: false});
            setSource('custom');
            languageDrafts.current = {};
            setConfig(restoreConfig(scopedStorageKey('hubble.text2gql')));
            setIdentity(scopedStorageKey('hubble.text2gql'));
            clearEditor('');
            setQuestionState('');
            setSourceQuestion('');
            setError('');
            setErrorStage('');
            clearResult();
        };
        window.addEventListener(USER_CHANGE_EVENT, onIdentityChange);
        return () => window.removeEventListener(USER_CHANGE_EVENT, onIdentityChange);
    }, [clearEditor, clearResult, invalidate]);

    useEffect(() => {
        invalidate();
        languageDrafts.current = {};
        touchedQuestions.current = {};
        populatedExamples.current = {};
        setQuestionState('');
        setSourceQuestion('');
        setError('');
        setErrorStage('');
        return () => {
            requestRef.current?.controller.abort();
            clearInterval(requestRef.current?.generationTimer);
            requestRef.current = null;
        };
    }, [connectionScope, invalidate]);

    // Use only an observed label from this graph. Never replace an edit or an
    // intentionally cleared input when asynchronous schema metadata arrives.
    const label = Array.isArray(vertexLabels) ? vertexLabels.find(item =>
        typeof item?.name === 'string' && item.name.trim() && item.name.length <= 120
        && Array.from(item.name).every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127))?.name : undefined;
    const example = label ? t('analysis.query.text2gql_schema_example', {label: JSON.stringify(label)}) : '';
    useEffect(() => {
        if (!active || !ready || !example || touchedQuestions.current[language]
            || populatedExamples.current[language]) return;
        populatedExamples.current[language] = true;
        setQuestionState(example);
    }, [active, ready, example, language]);

    useEffect(() => {
        if (!active || !ready) {
            return undefined;
        }
        const request = {controller: new AbortController(), scope: connectionScope};
        metadataRequest.current = request;
        const isCurrent = () => metadataRequest.current === request
            && baseScopeRef.current === request.scope;
        setSharedMetadata({scope: connectionScope, loading: true, available: false, customAvailable: false});
        api.analysis.getText2GqlConfig(scope.graphSpace, scope.graph, {signal: request.controller.signal})
            .then(response => {
                if (!isCurrent()) {
                    return;
                }
                const data = response?.data;
                const valid = response?.status === 200 && typeof data?.available === 'boolean';
                const available = valid && data.available;
                // Older successful metadata responses predate the separate custom capability.
                const customAvailable = valid
                    && (data.custom_available === true || data.custom_available === undefined);
                setSharedMetadata({scope: connectionScope, loading: false, available, customAvailable,
                    model: available && typeof data.model === 'string' ? data.model : '',
                    reason: available ? undefined : data?.reason || 'unavailable'});
                if (available) {
                    invalidate();
                }
                setSource(available ? 'shared' : 'custom');
            })
            .catch(() => {
                if (isCurrent()) {
                    setSharedMetadata({scope: connectionScope, loading: false,
                        available: false, customAvailable: false, reason: 'unavailable'});
                    setSource('custom');
                }
            });
        return () => {
            request.controller.abort();
            if (metadataRequest.current === request) {
                metadataRequest.current = null;
            }
        };
    }, [active, connectionScope, invalidate, ready, scope.graph, scope.graphSpace]);

    const changeSource = useCallback(value => {
        if (!((value === 'custom' && sharedConfig.customAvailable)
            || (value === 'shared' && sharedConfig.available))) {
            return;
        }
        invalidate();
        setSource(value);
        setError('');
        setErrorStage('');
        clearResult();
    }, [clearResult, invalidate, sharedConfig.available, sharedConfig.customAvailable]);

    const changeLanguage = useCallback(value => {
        if (!supportsQueryLanguage(value, cypherEnabled) || value === language) {
            return;
        }
        invalidate();
        languageDrafts.current[language] = {question, sourceQuestion};
        setQuestionState(languageDrafts.current[value]?.question ?? '');
        setSourceQuestion(languageDrafts.current[value]?.sourceQuestion || '');
        clearResult();
        setError('');
        setErrorStage('');
        onLanguageChange?.(value);
    }, [clearResult, cypherEnabled, invalidate, language,
        onLanguageChange, question, sourceQuestion]);

    const updateConfig = useCallback((field, value) => {
        invalidate();
        clearResult();
        setError('');
        setErrorStage('');
        setConfig(previous => {
            const next = {...previous, [field]: value};
            if (field === 'provider') {
                next.baseUrl = MODEL_PROVIDERS[value];
                next.model = '';
                next.apiKey = '';
            }
            try {
                // Never serialize credentials, even to sessionStorage.
                const {provider, baseUrl, model} = next;
                sessionStorage.setItem(identity, JSON.stringify({provider, baseUrl, model}));
            }
            catch {
                // Model calls also work when browser storage is unavailable.
            }
            return next;
        });
    }, [clearResult, identity, invalidate]);

    const run = useCallback(async (content, text, {asyncTask = false} = {}) => {
        if (!supportsQueryLanguage(language, cypherEnabled) || !ready || !active || requestRef.current
            || (content !== undefined && !content.trim())) {
            return;
        }
        if (content === undefined && (sharedConfig.loading
            || (source === 'shared' ? !sharedConfig.available : !sharedConfig.customAvailable))) {
            return;
        }
        const request = {controller: new AbortController(), scope: currentScope};
        requestRef.current = request;
        const isCurrent = () => requestRef.current === request && scopeRef.current === request.scope;
        startedAt.current = Date.now();
        setElapsedSeconds(0);
        setPending(true);
        const enterPhase = value => {
            setPhase(value);
        };
        setError('');
        setErrorStage('');
        setErrorType('error');
        const automatic = content === undefined;
        let generationDuration = 0;
        if (automatic) {
            setGenerationDurationMs(null);
        }
        const writeGeneratedDraft = onGeneratedDraft || clearEditor;
        const sanitizeError = (message, fallback = t('analysis.query.text2gql_failed')) => {
            const redacted = config.apiKey && typeof message === 'string'
                ? message.split(config.apiKey).join('[redacted]') : message;
            return sanitizePublicError(redacted, fallback);
        };
        let stage = automatic ? 'generation' : 'execution';
        let repaired = false;
        const params = source === 'shared' ? {question: text, source: 'shared', language} : {
            question: text, source: 'custom', language, base_url: config.baseUrl.trim(),
            api_key: config.apiKey, model: config.model.trim(),
        };
        let repair;
        try {
            let query = content;
            if (automatic) {
                clearResult();
            }
            while (isCurrent()) {
                if (automatic) {
                    stage = 'generation';
                    const isRepair = Boolean(repair);
                    enterPhase(isRepair ? 'repair_waiting' : 'waiting');
                    let draft = '';
                    if (!repair) {
                        writeGeneratedDraft('');
                    }
                    const previousGenerationDuration = generationDuration;
                    let generationStartedAt = null;
                    const generationElapsed = () => Math.max(0, Date.now() - generationStartedAt);
                    let response;
                    let streamFailure;
                    try {
                        response = await api.analysis.streamText2Gql(scope.graphSpace, scope.graph,
                            repair ? {...params, repair} : params, {
                                signal: request.controller.signal,
                                onWaiting: () => {
                                    if (!isCurrent() || generationStartedAt !== null) {
                                        return;
                                    }
                                    // The server finishes Schema preparation before emitting waiting.
                                    generationStartedAt = Date.now();
                                    if (previousGenerationDuration === null) {
                                        return;
                                    }
                                    setGenerationDurationMs(previousGenerationDuration);
                                    request.generationTimer = setInterval(() => {
                                        if (isCurrent()) {
                                            setGenerationDurationMs(previousGenerationDuration + generationElapsed());
                                        }
                                    }, 250);
                                },
                                onDelta: chunk => {
                                    if (!isCurrent()) {
                                        return;
                                    }
                                    draft += chunk;
                                    setPhase(isRepair ? 'repair_streaming' : 'streaming');
                                    writeGeneratedDraft(draft.replace(/^```[^\n]*\n/, '').replace(/\n?```$/, ''));
                                    setSourceQuestion(text);
                                },
                            });
                    }
                    catch (failure) {
                        streamFailure = failure;
                        throw failure;
                    }
                    finally {
                        clearInterval(request.generationTimer);
                        request.generationTimer = undefined;
                        if (isCurrent()) {
                            const duration = response?.data?.duration_ms ?? streamFailure?.response?.data?.duration_ms;
                            // SSE delivery may be buffered; only server timing is authoritative after completion.
                            generationDuration = previousGenerationDuration === null
                                || !Number.isFinite(duration) || duration < 0
                                ? null : previousGenerationDuration + duration;
                            setGenerationDurationMs(generationDuration);
                        }
                    }
                    if (!isCurrent()) {
                        return;
                    }
                    query = response?.data?.query;
                    if (response?.status !== 200 || response?.data?.language !== language
                        || typeof query !== 'string') {
                        throw new Error(response?.message || t('analysis.query.text2gql_failed'));
                    }
                    // Show each draft before validation or execution, including an empty invalid response.
                    writeGeneratedDraft(query);
                    setSourceQuestion(text);
                    if (response.data.valid !== true || !query.trim()) {
                        stage = 'validation';
                        const message = t('analysis.query.invalid_generated_query');
                        if (repaired) {
                            throw new Error(message);
                        }
                        repaired = true;
                        repair = {query: query.slice(0, 10000), error: sanitizeError(message)};
                        setRepairing(true);
                        continue;
                    }
                    if (params.source === 'custom') {
                        rememberModel(params.base_url, params.model);
                    }
                }
                stage = 'execution';
                enterPhase(asyncTask ? 'submission' : 'execution');
                let result;
                try {
                    result = await execute(query, text, {
                        signal: request.controller.signal, isCurrent, language, sanitizeError,
                        asyncTask,
                    });
                }
                catch (failure) {
                    result = queryFailure(failure, t('analysis.query.text2gql_failed'), sanitizeError);
                }
                if (!isCurrent()) {
                    return;
                }
                if (result?.ok !== false) {
                    return;
                }
                if (!automatic || asyncTask || repaired || !canRepairQuery(result)) {
                    throw new Error(result.message);
                }
                repaired = true;
                repair = {query: query.slice(0, 10000), error: sanitizeError(result.message)};
                setRepairing(true);
                clearResult();
            }
        }
        catch (failure) {
            if (isCurrent()) {
                const message = sanitizeError(failure?.response?.data?.message || failure?.message);
                setErrorStage(stage);
                setError(`${message}\n${t('analysis.query.edit_query_retry')}`);
            }
        }
        finally {
            if (isCurrent()) {
                requestRef.current = null;
                setPending(false);
                setRepairing(false);
                setPhase('');
            }
        }
    }, [active, clearEditor, clearResult, config, currentScope, cypherEnabled, execute, onGeneratedDraft, ready, scope,
        sharedConfig.available, sharedConfig.customAvailable, sharedConfig.loading, source, language, t]);

    const cancel = useCallback(() => {
        invalidate();
        clearResult();
        setErrorStage('');
        setErrorType('info');
        setError(t('analysis.query.text2gql_cancelled'));
    }, [clearResult, invalidate, t]);

    return {
        config, updateConfig, question,
        setQuestion: value => { touchedQuestions.current[language] = true; setQuestionState(value); },
        pending, repairing, phase, elapsedSeconds, generationDurationMs,
        modelSlow: pending && ['waiting', 'repair_waiting'].includes(phase) && modelSlow,
        error, errorType, errorStage,
        source, changeSource, sharedConfig, language, changeLanguage,
        generate: options => run(undefined, question.trim(), options),
        rerun: (content, options) => run(content, sourceQuestion, options),
        cancel,
        loadSource: (text, {preserveResult = false} = {}) => {
            invalidate();
            if (!preserveResult) {
                clearResult();
            }
            setError('');
            setErrorStage('');
            const source = typeof text === 'string' ? text : '';
            setSourceQuestion(source);
            touchedQuestions.current[language] = true;
            setQuestionState(source);
        },
    };
}
