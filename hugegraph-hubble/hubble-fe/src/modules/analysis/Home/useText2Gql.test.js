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

import {useState} from 'react';
import {act, renderHook, waitFor} from '@testing-library/react';
import useText2Gql from './useText2Gql';
import * as api from '../../../api';
import {setUser} from '../../../utils/user';
import {getModelHistory} from '../../../utils/modelHistory';

jest.mock('../../../api', () => ({analysis: {streamText2Gql: jest.fn(), getText2GqlConfig: jest.fn()}}));
const deferred = () => {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return {promise, resolve};
};
let props;
beforeEach(() => {
    jest.clearAllMocks();
    api.analysis.getText2GqlConfig.mockResolvedValue({status: 200, data: {available: false, reason: 'not_configured'}});
    sessionStorage.clear();
    localStorage.clear();
    setUser({user_name: 'alice'});
    props = {
        scope: {graphSpace: 'DEFAULT', graph: 'one', routeGraphSpace: 'DEFAULT', routeGraph: 'one'},
        active: true, ready: true, cypherEnabled: true, execute: jest.fn().mockResolvedValue(),
        clearResult: jest.fn(), clearEditor: jest.fn(), t: key => key,
    };
});
const configure = async result => {
    await waitFor(() => expect(result.current.sharedConfig.loading).toBe(false));
    act(() => {
        result.current.updateConfig('provider', 'ollama');
        result.current.updateConfig('model', 'test-model');
        result.current.updateConfig('apiKey', 'private-key');
        result.current.setQuestion('Find people');
    });
};

test('fills an editable example from the current graph label without replacing user input', async () => {
    const translate = (_key, values) => `Show up to 10 vertices with label ${values.label}`;
    const initial = {...props, t: translate};
    const {result, rerender} = renderHook(value => useText2Gql(value), {initialProps: initial});
    await waitFor(() => expect(result.current.sharedConfig.loading).toBe(false));
    expect(result.current.question).toBe('');
    rerender({...initial, vertexLabels: [{name: 'person'}]});
    expect(result.current.question).toBe('Show up to 10 vertices with label "person"');
    act(() => result.current.setQuestion(''));
    rerender({...initial, vertexLabels: [{name: 'company'}]});
    expect(result.current.question).toBe('');
    act(() => result.current.setQuestion('My question'));
    rerender({...initial, vertexLabels: [{name: 'other'}]});
    expect(result.current.question).toBe('My question');
});

test('uses new graph schema only after a graph switch and ignores unusable labels', async () => {
    const translate = (_key, values) => `label ${values.label}`;
    const initial = {...props, t: translate, vertexLabels: [{name: 'person'}]};
    const {result, rerender} = renderHook(value => useText2Gql(value), {initialProps: initial});
    await waitFor(() => expect(result.current.sharedConfig.loading).toBe(false));
    expect(result.current.question).toBe('label "person"');
    const switched = {...initial, scope: {...initial.scope, graph: 'two', routeGraph: 'two'}, vertexLabels: undefined};
    rerender(switched);
    await waitFor(() => expect(result.current.sharedConfig.loading).toBe(false));
    expect(result.current.question).toBe('');
    rerender({...switched, vertexLabels: [{name: 'bad\nlabel'}, {name: 'company'}]});
    expect(result.current.question).toBe('label "company"');
});

test('automatically executes the returned Gremlin and keeps its original question when rerunning edits', async () => {
    api.analysis.streamText2Gql.mockResolvedValue({status: 200,
        data: {valid: true, language: 'gremlin', query: 'g.V().limit(2)'}});
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    await act(async () => result.current.generate());
    expect(getModelHistory(result.current.config.baseUrl)).toEqual(['test-model']);
    expect(JSON.stringify({...sessionStorage, ...localStorage})).not.toContain('private-key');
    expect(props.execute).toHaveBeenCalledWith('g.V().limit(2)', 'Find people', expect.objectContaining({
        isCurrent: expect.any(Function), signal: expect.any(Object),
    }));
    act(() => result.current.setQuestion('A new question'));
    await act(async () => result.current.rerun('g.V().count()'));
    expect(props.execute).toHaveBeenLastCalledWith('g.V().count()', 'Find people', expect.any(Object));
});

test.each(['graph', 'routeGraph', 'active'])('discards generation after %s changes', async field => {
    const delayed = deferred();
    api.analysis.streamText2Gql.mockReturnValue(delayed.promise);
    const {result, rerender} = renderHook(value => useText2Gql(value), {initialProps: props});
    await configure(result);
    let pending;
    act(() => {
        pending = result.current.generate();
    });
    const signal = api.analysis.streamText2Gql.mock.calls[0][3].signal;
    rerender(field === 'active' ? {...props, active: false}
        : {...props, scope: {...props.scope, [field]: 'two'}});
    expect(signal.aborted).toBe(true);
    await act(async () => {
        delayed.resolve({status: 200, data: {valid: true, language: 'gremlin', query: 'g.V()'}});
        await pending;
    });
    expect(props.execute).not.toHaveBeenCalled();
    expect(result.current.config.apiKey).toBe('private-key');
    expect(JSON.stringify({...sessionStorage, ...localStorage})).not.toContain('private-key');
});

test('cancel aborts and prevents subsequent automatic execution', async () => {
    const delayed = deferred();
    api.analysis.streamText2Gql.mockReturnValue(delayed.promise);
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    let pending;
    act(() => {
        pending = result.current.generate();
    });
    act(() => result.current.cancel());
    await act(async () => {
        delayed.resolve({status: 200, data: {valid: true, language: 'gremlin', query: 'g.V()'}});
        await pending;
    });
    expect(props.execute).not.toHaveBeenCalled();
    expect(result.current.error).toBe('analysis.query.text2gql_cancelled');
    expect(result.current.errorType).toBe('info');
});

test('stores only non-secret config and clears key and pending on identity change', async () => {
    const delayed = deferred();
    api.analysis.streamText2Gql.mockReturnValue(delayed.promise);
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    expect(sessionStorage.getItem('hubble.text2gql.alice')).toBe(JSON.stringify({
        provider: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'test-model',
    }));
    expect(JSON.stringify({...sessionStorage, ...localStorage})).not.toContain('private-key');
    let pending;
    act(() => {
        pending = result.current.generate();
    });
    act(() => setUser({user_name: 'bob'}));
    expect(result.current.config.apiKey).toBe('');
    expect(result.current.pending).toBe(false);
    expect(props.clearEditor).toHaveBeenCalledWith('');
    await act(async () => {
        delayed.resolve({status: 200, data: {valid: true, language: 'gremlin', query: 'g.V()'}});
        await pending;
    });
    expect(props.execute).not.toHaveBeenCalled();
});

test('model edits invalidate a pending generation and redact echoed keys from generation errors', async () => {
    const delayed = deferred();
    api.analysis.streamText2Gql.mockReturnValueOnce(delayed.promise);
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    let pending;
    act(() => {
        pending = result.current.generate();
    });
    act(() => result.current.updateConfig('model', 'another-model'));
    await act(async () => {
        delayed.resolve({status: 200, data: {valid: true, language: 'gremlin', query: 'g.V()'}});
        await pending;
    });
    expect(props.execute).not.toHaveBeenCalled();
    api.analysis.streamText2Gql.mockRejectedValue(new Error('invalid private-key'));
    await act(async () => result.current.generate());
    expect(result.current.error).not.toContain('private-key');
    expect(result.current.errorStage).toBe('generation');
});

test('loading a historical question binds edited reruns to it and loading a favorite clears it', async () => {
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    act(() => result.current.loadSource('Historical question'));
    expect(result.current.question).toBe('Historical question');
    await act(async () => result.current.rerun('g.V().limit(3)'));
    expect(props.execute).toHaveBeenLastCalledWith('g.V().limit(3)', 'Historical question', expect.any(Object));
    act(() => result.current.loadSource());
    expect(result.current.question).toBe('');
    await act(async () => result.current.rerun('g.V().count()'));
    expect(props.execute).toHaveBeenLastCalledWith('g.V().count()', '', expect.any(Object));
});


test.each([
    ['deepseek', 'https://api.deepseek.com/v1'],
    ['glm', 'https://open.bigmodel.cn/api/paas/v4'],
    ['openai', 'https://custom-model.example/v1'],
])('restores a legacy %s preset as OpenAI-compatible without losing URL or model', async (provider, baseUrl) => {
    sessionStorage.setItem('hubble.text2gql.alice', JSON.stringify({provider, baseUrl, model: 'saved-model'}));
    api.analysis.streamText2Gql.mockResolvedValue({status: 200,
        data: {valid: true, language: 'gremlin', query: 'g.V().count()'}});
    const {result} = renderHook(() => useText2Gql(props));
    expect(result.current.config).toEqual({provider: 'openai', baseUrl, model: 'saved-model', apiKey: ''});
    act(() => {
        result.current.updateConfig('apiKey', 'private-key');
        result.current.setQuestion('Count vertices');
    });
    await waitFor(() => expect(result.current.sharedConfig.loading).toBe(false));
    await act(async () => result.current.generate());
    expect(api.analysis.streamText2Gql).toHaveBeenCalledWith('DEFAULT', 'one', {
        question: 'Count vertices', source: 'custom', language: 'gremlin', base_url: baseUrl,
        model: 'saved-model', api_key: 'private-key',
    }, expect.any(Object));
    expect(JSON.parse(sessionStorage.getItem('hubble.text2gql.alice'))).toEqual({
        provider: 'openai', baseUrl, model: 'saved-model',
    });
});


test('defaults to the available shared model and sends no temporary URL, model or key', async () => {
    api.analysis.getText2GqlConfig.mockResolvedValue({status: 200, data: {available: true, model: 'shared-model'}});
    api.analysis.streamText2Gql.mockResolvedValue({status: 200,
        data: {valid: true, language: 'gremlin', query: 'g.V().count()'}});
    const {result} = renderHook(() => useText2Gql(props));
    await waitFor(() => expect(result.current.source).toBe('shared'));
    await configure(result);
    await act(async () => result.current.generate());
    expect(api.analysis.streamText2Gql).toHaveBeenCalledWith('DEFAULT', 'one', {
        question: 'Find people', source: 'shared', language: 'gremlin',
    }, expect.any(Object));
    expect(result.current.sharedConfig.model).toBe('shared-model');
    expect(props.execute).toHaveBeenCalledWith('g.V().count()', 'Find people', expect.any(Object));
});

test('switching model source aborts the old generation and keeps shared and custom credentials separate', async () => {
    const pending = deferred();
    api.analysis.getText2GqlConfig.mockResolvedValue({status: 200, data: {available: true, model: 'shared-model'}});
    api.analysis.streamText2Gql.mockReturnValueOnce(pending.promise);
    const {result} = renderHook(() => useText2Gql(props));
    await waitFor(() => expect(result.current.source).toBe('shared'));
    await configure(result);
    let generation;
    act(() => {
        generation = result.current.generate();
    });
    const signal = api.analysis.streamText2Gql.mock.calls[0][3].signal;
    act(() => result.current.changeSource('custom'));
    expect(signal.aborted).toBe(true);
    await act(async () => {
        pending.resolve({status: 200, data: {valid: true, language: 'gremlin', query: 'g.V()'}});
        await generation;
    });
    expect(props.execute).not.toHaveBeenCalled();
    api.analysis.streamText2Gql.mockResolvedValue({status: 200,
        data: {valid: true, language: 'gremlin', query: 'g.E()'}});
    await act(async () => result.current.generate());
    expect(api.analysis.streamText2Gql).toHaveBeenLastCalledWith('DEFAULT', 'one', {
        question: 'Find people', source: 'custom', language: 'gremlin', base_url: 'http://localhost:11434/v1',
        model: 'test-model', api_key: 'private-key',
    }, expect.any(Object));
});

test('discards metadata from the previous graph before it can select a shared model', async () => {
    const oldMetadata = deferred();
    api.analysis.getText2GqlConfig.mockReturnValueOnce(oldMetadata.promise)
        .mockResolvedValue({status: 200, data: {available: false, reason: 'not_configured'}});
    const {result, rerender} = renderHook(value => useText2Gql(value), {initialProps: props});
    const signal = api.analysis.getText2GqlConfig.mock.calls[0][2].signal;
    rerender({...props, scope: {...props.scope, graph: 'two', routeGraph: 'two'}});
    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(result.current.sharedConfig.loading).toBe(false));
    await act(async () => oldMetadata.resolve({status: 200, data: {available: true, model: 'old-model'}}));
    expect(result.current.source).toBe('custom');
    expect(result.current.sharedConfig.available).toBe(false);
    expect(result.current.sharedConfig.model).not.toBe('old-model');
});

test('switching model source preserves the current editor and original question for edited execution', async () => {
    api.analysis.getText2GqlConfig.mockResolvedValue({status: 200, data: {
        available: true, custom_available: true, model: 'shared-model',
    }});
    const {result} = renderHook(() => useText2Gql(props));
    await waitFor(() => expect(result.current.source).toBe('shared'));
    act(() => result.current.loadSource('Original generated question'));
    props.clearEditor.mockClear();
    act(() => result.current.changeSource('custom'));
    expect(result.current.source).toBe('custom');
    expect(props.clearEditor).not.toHaveBeenCalled();
    await act(async () => result.current.rerun('g.V().limit(4)'));
    expect(props.execute).toHaveBeenLastCalledWith('g.V().limit(4)', 'Original generated question',
        expect.objectContaining({language: 'gremlin'}));
    act(() => result.current.changeSource('shared'));
    expect(props.clearEditor).not.toHaveBeenCalled();
    await act(async () => result.current.rerun('g.V().count()'));
    expect(props.execute).toHaveBeenLastCalledWith('g.V().count()', 'Original generated question', expect.any(Object));
});

test('language changes leave editor restoration to the workspace and preserve only per-language question provenance',
    async () => {
        const {result} = renderHook(() => {
            const [language, setLanguage] = useState('gremlin');
            const [content, setContent] = useState('g.V().limit(4)');
            const hook = useText2Gql({...props, language, onLanguageChange: next => {
                setLanguage(next);
                setContent(next === 'cypher' ? 'MATCH (n) RETURN n' : 'g.V().limit(4)');
            }});
            return {...hook, content};
        });
        await configure(result);
        act(() => result.current.loadSource('Gremlin question'));
        props.clearEditor.mockClear();
        act(() => result.current.changeLanguage('cypher'));
        expect(result.current.content).toBe('MATCH (n) RETURN n');
        expect(props.clearEditor).not.toHaveBeenCalled();
        act(() => result.current.loadSource('Cypher question'));
        act(() => result.current.changeLanguage('gremlin'));
        expect(result.current.content).toBe('g.V().limit(4)');
        await act(async () => result.current.rerun(result.current.content));
        expect(props.execute).toHaveBeenLastCalledWith('g.V().limit(4)', 'Gremlin question', expect.any(Object));
        act(() => result.current.changeLanguage('cypher'));
        await act(async () => result.current.rerun(result.current.content));
        expect(props.execute).toHaveBeenLastCalledWith('MATCH (n) RETURN n', 'Cypher question', expect.any(Object));
        expect(props.clearEditor).not.toHaveBeenCalled();
    });


test('aborts and discards shared metadata when the signed-in account changes', async () => {
    const oldMetadata = deferred();
    api.analysis.getText2GqlConfig.mockReturnValueOnce(oldMetadata.promise)
        .mockResolvedValue({status: 200, data: {available: false, reason: 'not_configured'}});
    const {result} = renderHook(() => useText2Gql(props));
    const signal = api.analysis.getText2GqlConfig.mock.calls[0][2].signal;
    act(() => setUser({user_name: 'bob'}));
    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(result.current.sharedConfig.loading).toBe(false));
    await act(async () => oldMetadata.resolve({status: 200, data: {available: true, model: 'old-model'}}));
    expect(result.current.source).toBe('custom');
    expect(result.current.sharedConfig.available).toBe(false);
});


test('does not call generation when the backend denies temporary custom access', async () => {
    api.analysis.getText2GqlConfig.mockResolvedValue({status: 200, data: {
        available: false, custom_available: false, reason: 'authentication_required',
    }});
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    expect(result.current.sharedConfig.customAvailable).toBe(false);
    await act(async () => result.current.generate());
    expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
    expect(props.execute).not.toHaveBeenCalled();
});

test('allows the shared model while custom access is disabled and refuses switching to custom', async () => {
    api.analysis.getText2GqlConfig.mockResolvedValue({status: 200, data: {
        available: true, custom_available: false, model: 'shared-model',
    }});
    api.analysis.streamText2Gql.mockResolvedValue({status: 200,
        data: {valid: true, language: 'gremlin', query: 'g.V()'}});
    const {result} = renderHook(() => useText2Gql(props));
    await waitFor(() => expect(result.current.source).toBe('shared'));
    act(() => {
        result.current.changeSource('custom');
        result.current.setQuestion('Find vertices');
    });
    expect(result.current.source).toBe('shared');
    await act(async () => result.current.generate());
    expect(api.analysis.streamText2Gql).toHaveBeenCalledWith('DEFAULT', 'one', {
        source: 'shared', language: 'gremlin', question: 'Find vertices',
    }, expect.any(Object));
});

test('honors explicit custom access from deployments that allow it', async () => {
    api.analysis.getText2GqlConfig.mockResolvedValue({status: 200, data: {
        available: false, custom_available: true, reason: 'not_configured',
    }});
    api.analysis.streamText2Gql.mockResolvedValue({status: 200,
        data: {valid: true, language: 'gremlin', query: 'g.E()'}});
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    await act(async () => result.current.generate());
    expect(api.analysis.streamText2Gql).toHaveBeenCalledWith('DEFAULT', 'one', {
        source: 'custom', language: 'gremlin', question: 'Find people', base_url: 'http://localhost:11434/v1',
        model: 'test-model', api_key: 'private-key',
    }, expect.any(Object));
});

test.each(['loading', 'failure', 'invalid'])(
    'keeps custom generation unavailable without valid capability metadata (%s)', async mode => {
        const pending = deferred();
        if (mode === 'loading') {
            api.analysis.getText2GqlConfig.mockReturnValue(pending.promise);
        }
        else if (mode === 'failure') {
            api.analysis.getText2GqlConfig.mockRejectedValue(new Error('unavailable'));
        }
        else {
            api.analysis.getText2GqlConfig.mockResolvedValue({status: 503, data: {available: false}});
        }
        const {result} = renderHook(() => useText2Gql(props));
        if (mode !== 'loading') {
            await waitFor(() => expect(result.current.sharedConfig.loading).toBe(false));
        }
        act(() => result.current.setQuestion('Find vertices'));
        await act(async () => result.current.generate());
        expect(result.current.sharedConfig.customAvailable).toBe(false);
        expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
    }
);


test('switching language cancels generation and preserves each language question, provenance and config', async () => {
    const delayed = deferred();
    api.analysis.streamText2Gql.mockReturnValueOnce(delayed.promise);
    const {result} = renderHook(() => {
        const [language, setLanguage] = useState('gremlin');
        return useText2Gql({...props, language, onLanguageChange: setLanguage});
    });
    await configure(result);
    act(() => result.current.loadSource('Original question'));
    let pending;
    act(() => {
        pending = result.current.generate();
    });
    const signal = api.analysis.streamText2Gql.mock.calls[0][3].signal;
    act(() => result.current.setQuestion('Edited Gremlin question'));
    act(() => result.current.changeLanguage('cypher'));
    expect(signal.aborted).toBe(true);
    expect(result.current.language).toBe('cypher');
    expect(result.current.question).toBe('');
    expect(result.current.config.apiKey).toBe('private-key');
    await act(async () => {
        delayed.resolve({status: 200, data: {valid: true, query: 'g.V()', language: 'gremlin'}});
        await pending;
    });
    expect(props.execute).not.toHaveBeenCalled();
    act(() => result.current.setQuestion('Cypher question'));
    act(() => result.current.changeLanguage('gremlin'));
    expect(result.current.question).toBe('Edited Gremlin question');
    await act(async () => result.current.rerun('g.V().limit(4)'));
    expect(props.execute).toHaveBeenLastCalledWith('g.V().limit(4)', 'Original question',
        expect.objectContaining({language: 'gremlin'}));
});

test('generates and executes Cypher through the same flow and refuses a mismatched dialect response', async () => {
    const query = 'MATCH (n) RETURN n LIMIT 3';
    props.language = 'cypher';
    api.analysis.streamText2Gql.mockResolvedValue({status: 200, data: {valid: true, query, language: 'cypher'}});
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    await act(async () => result.current.generate());
    expect(api.analysis.streamText2Gql).toHaveBeenCalledWith('DEFAULT', 'one', expect.objectContaining({
        question: 'Find people', language: 'cypher',
    }), expect.any(Object));
    expect(props.execute).toHaveBeenCalledWith(query, 'Find people', expect.objectContaining({language: 'cypher'}));
    props.execute.mockClear();
    api.analysis.streamText2Gql.mockResolvedValue({status: 200,
        data: {valid: true, query: 'g.V()', language: 'gremlin'}});
    await act(async () => result.current.generate());
    expect(props.execute).not.toHaveBeenCalled();
    expect(result.current.error).toContain('analysis.query.text2gql_failed');
});


test('refuses Cypher switching and generation without server capability', async () => {
    props.cypherEnabled = false;
    props.onLanguageChange = jest.fn();
    const {result, rerender} = renderHook(value => useText2Gql(value), {initialProps: props});
    await configure(result);
    act(() => result.current.changeLanguage('cypher'));
    expect(props.onLanguageChange).not.toHaveBeenCalled();
    rerender({...props, language: 'cypher'});
    expect(props.onLanguageChange).toHaveBeenCalledWith('gremlin');
    await act(async () => result.current.generate());
    await act(async () => result.current.rerun('MATCH (n) RETURN n'));
    expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
    expect(props.execute).not.toHaveBeenCalled();
});

test('revoking Cypher aborts generation and clears stale execution context before reverting to Gremlin', async () => {
    const delayed = deferred();
    api.analysis.streamText2Gql.mockReturnValueOnce(delayed.promise);
    const {result, rerender} = renderHook(({cypherEnabled}) => {
        const [language, setLanguage] = useState('gremlin');
        return useText2Gql({...props, language, cypherEnabled, onLanguageChange: setLanguage});
    }, {initialProps: {cypherEnabled: false}});
    await configure(result);
    act(() => result.current.changeLanguage('cypher'));
    expect(result.current.language).toBe('gremlin');
    rerender({cypherEnabled: true});
    act(() => result.current.changeLanguage('cypher'));
    expect(result.current.language).toBe('cypher');
    act(() => result.current.loadSource('Old Cypher question'));
    let pending;
    act(() => {
        pending = result.current.generate();
    });
    const signal = api.analysis.streamText2Gql.mock.calls[0][3].signal;
    props.clearResult.mockClear();
    rerender({cypherEnabled: false});
    expect(signal.aborted).toBe(true);
    expect(result.current.pending).toBe(false);
    expect(result.current.language).toBe('gremlin');
    expect(props.clearResult).toHaveBeenCalled();
    await act(async () => {
        delayed.resolve({status: 200, data: {valid: true, query: 'MATCH (n) RETURN n', language: 'cypher'}});
        await pending;
    });
    expect(props.execute).not.toHaveBeenCalled();
    await act(async () => result.current.rerun('g.V().limit(1)'));
    expect(props.execute).toHaveBeenCalledWith('g.V().limit(1)', '',
        expect.objectContaining({language: 'gremlin'}));
});

test('keeps a valid Gremlin request current when only Cypher capability changes', async () => {
    const delayed = deferred();
    api.analysis.streamText2Gql.mockReturnValueOnce(delayed.promise);
    const {result, rerender} = renderHook(value => useText2Gql(value), {initialProps: props});
    await configure(result);
    let pending;
    act(() => {
        pending = result.current.generate();
    });
    rerender({...props, cypherEnabled: false});
    await act(async () => {
        delayed.resolve({status: 200, data: {valid: true, query: 'g.V()', language: 'gremlin'}});
        await pending;
    });
    expect(props.execute).toHaveBeenCalledWith('g.V()', 'Find people',
        expect.objectContaining({language: 'gremlin'}));
    expect(result.current.pending).toBe(false);
});


test.each(['generate', 'rerun'])('classifies %s execution failures separately from model failures', async action => {
    api.analysis.streamText2Gql.mockResolvedValue({status: 200,
        data: {valid: true, query: 'g.V()', language: 'gremlin'}});
    props.execute.mockRejectedValue(new Error('Read-only query rejected'));
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    await act(async () => {
        if (action === 'generate') {
            await result.current.generate();
        }
        else {
            await result.current.rerun('g.V()');
        }
    });
    expect(result.current.errorStage).toBe('execution');
    act(() => result.current.cancel());
    expect(result.current.errorStage).toBe('');
});


const generated = (query, valid = true, language = 'gremlin', durationMs) => ({
    status: 200, data: {query, valid, language, duration_ms: durationMs},
});
const syntaxFailure = {ok: false, status: 460, message: 'No signature of method: GraphTraversal.limit(String)'};

test.each(['gremlin', 'cypher'])('repairs invalid %s output once and executes only the displayed valid query',
    async language => {
        props.language = language;
        const query = language === 'gremlin' ? 'g.V().limit(3)' : 'MATCH (n) RETURN n LIMIT 3';
        api.analysis.streamText2Gql.mockResolvedValueOnce(generated('invalid draft', false, language))
            .mockResolvedValueOnce(generated(query, true, language));
        const {result} = renderHook(() => useText2Gql(props));
        await configure(result);
        await act(async () => result.current.generate());
        expect(props.clearEditor.mock.calls.slice(-2)).toEqual([['invalid draft'], [query]]);
        expect(props.execute).toHaveBeenCalledTimes(1);
        expect(props.execute).toHaveBeenCalledWith(query, 'Find people', expect.objectContaining({language}));
        expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(2);
        const first = api.analysis.streamText2Gql.mock.calls[0];
        const second = api.analysis.streamText2Gql.mock.calls[1];
        expect(second[2]).toEqual({...first[2], repair: {
            query: 'invalid draft', error: 'analysis.query.invalid_generated_query',
        }});
        expect(second[3].signal).toBe(first[3].signal);
        expect(result.current.error).toBe('');
        expect(result.current.repairing).toBe(false);
    }
);

test.each(['', 'still invalid'])('retains the last invalid draft (%s) without executing or making a third model call',
    async draft => {
        api.analysis.streamText2Gql.mockResolvedValueOnce(generated('first invalid', false))
            .mockResolvedValueOnce(generated(draft, false));
        const {result} = renderHook(() => useText2Gql(props));
        await configure(result);
        await act(async () => result.current.generate());
        expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(2);
        expect(props.execute).not.toHaveBeenCalled();
        expect(props.clearEditor).toHaveBeenLastCalledWith(draft);
        expect(result.current.question).toBe('Find people');
        expect(result.current.error).toContain('analysis.query.invalid_generated_query');
        expect(result.current.error).toContain('analysis.query.edit_query_retry');
        expect(result.current.errorStage).toBe('validation');
    }
);

test('repairs execution errors once using bounded sanitized feedback and the original question', async () => {
    api.analysis.getText2GqlConfig.mockResolvedValue({status: 200, data: {available: true}});
    api.analysis.streamText2Gql.mockResolvedValueOnce(generated("g.V().limit('three')"))
        .mockResolvedValueOnce(generated('g.V().limit(3)'));
    props.execute.mockResolvedValueOnce({...syntaxFailure,
        message: syntaxFailure.message + ' private-key password=secret ' + 'x'.repeat(3000),
    }).mockResolvedValueOnce({ok: true});
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    await act(async () => result.current.generate());
    expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(2);
    const repair = api.analysis.streamText2Gql.mock.calls[1][2];
    expect(repair).toEqual({source: 'shared', question: 'Find people', language: 'gremlin', repair: {
        query: "g.V().limit('three')", error: expect.any(String),
    }});
    expect(repair.repair.error.length).toBeLessThanOrEqual(2048);
    expect(repair.repair.error).not.toContain('private-key');
    expect(repair.repair.error).not.toContain('password=secret');
    expect(props.execute).toHaveBeenCalledTimes(2);
    expect(props.execute).toHaveBeenLastCalledWith('g.V().limit(3)', 'Find people', expect.any(Object));
});

test.each(['invalid output', 'execution error'])(
    'shares the one-repair budget across invalid output and execution errors (%s)', async trigger => {
        api.analysis.streamText2Gql.mockResolvedValueOnce(generated('first draft', trigger !== 'invalid output'))
            .mockResolvedValueOnce(generated('second draft'));
        props.execute.mockResolvedValue(syntaxFailure);
        const {result} = renderHook(() => useText2Gql(props));
        await configure(result);
        await act(async () => result.current.generate());
        expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(2);
        expect(props.execute).toHaveBeenCalledTimes(trigger === 'invalid output' ? 1 : 2);
        expect(props.clearEditor).toHaveBeenLastCalledWith('second draft');
        expect(result.current.errorStage).toBe('execution');
        expect(result.current.error).toContain('No signature of method');
    }
);

test.each([
    {ok: false, status: 403, message: 'Syntax error'},
    {ok: false, status: 500, message: 'Internal server error'},
    {ok: false, message: 'Network error'},
    {ok: false, code: 'ECONNABORTED', message: 'Syntax error'},
    {ok: false, message: 'Unknown failure'},
    {ok: true},
])('does not repair infrastructure failures, unknown errors or successful empty results (%j)', async execution => {
    api.analysis.streamText2Gql.mockResolvedValue(generated('g.V()'));
    props.execute.mockResolvedValue(execution);
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    await act(async () => result.current.generate());
    expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(1);
    expect(props.execute).toHaveBeenCalledTimes(1);
});

test('never calls the model or replaces manual edits when a manual rerun has a syntax error', async () => {
    props.execute.mockResolvedValue(syntaxFailure);
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    props.clearEditor.mockClear();
    await act(async () => result.current.rerun('user edited draft'));
    expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
    expect(props.clearEditor).not.toHaveBeenCalled();
    expect(result.current.error).toContain('No signature of method');
});

test.each(['cancel', 'graph', 'language', 'identity'])(
    'invalidates the repair request on %s without replacing the visible draft or executing', async change => {
        const delayed = deferred();
        api.analysis.streamText2Gql.mockResolvedValueOnce(generated('invalid draft', false))
            .mockReturnValueOnce(delayed.promise);
        const {result, rerender} = renderHook(value => useText2Gql(value), {initialProps: props});
        await configure(result);
        let pending;
        act(() => {
            pending = result.current.generate();
        });
        await waitFor(() => expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(2));
        expect(result.current.repairing).toBe(true);
        const signal = api.analysis.streamText2Gql.mock.calls[1][3].signal;
        if (change === 'graph') {
            rerender({...props, scope: {...props.scope, graph: 'two'}});
        }
        else {
            act(() => {
                if (change === 'cancel') {
                    result.current.cancel();
                }
                else if (change === 'language') {
                    result.current.changeLanguage('cypher');
                }
                else {
                    setUser({user_name: 'bob'});
                }
            });
        }
        expect(signal.aborted).toBe(true);
        props.clearEditor.mockClear();
        await act(async () => {
            delayed.resolve(generated('stale repaired query'));
            await pending;
        });
        expect(props.clearEditor).not.toHaveBeenCalled();
        expect(props.execute).not.toHaveBeenCalled();
        expect(result.current.pending).toBe(false);
        expect(result.current.repairing).toBe(false);
    }
);

test('cancellation during repaired execution prevents stale failure from starting another repair or showing an error',
    async () => {
        const delayed = deferred();
        api.analysis.streamText2Gql.mockResolvedValueOnce(generated('bad', false))
            .mockResolvedValueOnce(generated('g.V()'));
        props.execute.mockReturnValue(delayed.promise);
        const {result} = renderHook(() => useText2Gql(props));
        await configure(result);
        let pending;
        act(() => {
            pending = result.current.generate();
        });
        await waitFor(() => expect(props.execute).toHaveBeenCalledTimes(1));
        const options = props.execute.mock.calls[0][2];
        act(() => result.current.cancel());
        expect(options.signal.aborted).toBe(true);
        expect(options.isCurrent()).toBe(false);
        await act(async () => {
            delayed.resolve(syntaxFailure);
            await pending;
        });
        expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(2);
        expect(result.current.errorType).toBe('info');
        expect(result.current.error).toBe('analysis.query.text2gql_cancelled');
    }
);


test.each([401, 403, 408, 429, 503])('does not retry a model transport failure (%s)', async status => {
    api.analysis.streamText2Gql.mockRejectedValue({response: {status, data: {message: 'Model request failed'}}});
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    await act(async () => result.current.generate());
    expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(1);
    expect(props.execute).not.toHaveBeenCalled();
    expect(result.current.errorStage).toBe('generation');
});


test('classifies a failed repair connection as generation rather than output validation', async () => {
    api.analysis.streamText2Gql.mockResolvedValueOnce(generated('invalid draft', false))
        .mockRejectedValueOnce(new Error('Connection refused'));
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    await act(async () => result.current.generate());
    expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(2);
    expect(result.current.errorStage).toBe('generation');
    expect(result.current.error).toContain('Connection refused');
    expect(props.clearEditor).toHaveBeenLastCalledWith('invalid draft');
    expect(props.execute).not.toHaveBeenCalled();
});


test('counts total elapsed time across generation, repair and execution without repeating requests', async () => {
    const generation = deferred();
    const repair = deferred();
    const execution = deferred();
    api.analysis.streamText2Gql.mockReturnValueOnce(generation.promise).mockReturnValueOnce(repair.promise);
    props.execute.mockReturnValue(execution.promise);
    const {result, unmount} = renderHook(() => useText2Gql(props));
    await configure(result);
    jest.useFakeTimers();
    try {
        let pending;
        act(() => {
            pending = result.current.generate();
        });
        expect(result.current.phase).toBe('waiting');
        expect(result.current.elapsedSeconds).toBe(0);
        expect(result.current.generationDurationMs).toBeNull();
        act(() => api.analysis.streamText2Gql.mock.calls[0][3].onWaiting());
        expect(result.current.generationDurationMs).toBe(0);
        act(() => jest.advanceTimersByTime(14999));
        expect(result.current.elapsedSeconds).toBe(14);
        expect(result.current.modelSlow).toBe(false);
        act(() => jest.advanceTimersByTime(1));
        expect(result.current.elapsedSeconds).toBe(15);
        expect(result.current.generationDurationMs).toBe(15000);
        expect(result.current.modelSlow).toBe(true);
        await act(async () => result.current.generate());
        expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(1);
        await act(async () => generation.resolve(generated('invalid', false, 'gremlin', 15000)));
        expect(result.current.phase).toBe('repair_waiting');
        act(() => api.analysis.streamText2Gql.mock.calls[1][3].onWaiting());
        expect(result.current.elapsedSeconds).toBe(15);
        expect(result.current.modelSlow).toBe(false);
        act(() => jest.advanceTimersByTime(15000));
        expect(result.current.elapsedSeconds).toBe(30);
        expect(result.current.modelSlow).toBe(true);
        expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(2);
        await act(async () => repair.resolve(generated('g.V()', true, 'gremlin', 15000)));
        expect(result.current.phase).toBe('execution');
        expect(result.current.generationDurationMs).toBe(30000);
        expect(result.current.elapsedSeconds).toBe(30);
        expect(result.current.modelSlow).toBe(false);
        act(() => jest.advanceTimersByTime(5000));
        expect(result.current.elapsedSeconds).toBe(35);
        expect(result.current.generationDurationMs).toBe(30000);
        expect(props.execute).toHaveBeenCalledTimes(1);
        await act(async () => {
            execution.resolve({ok: true});
            await pending;
        });
        expect(result.current.pending).toBe(false);
        expect(result.current.phase).toBe('');
        expect(jest.getTimerCount()).toBe(0);
        act(() => jest.advanceTimersByTime(5000));
        expect(result.current.elapsedSeconds).toBe(35);
    }
    finally {
        unmount();
        jest.useRealTimers();
    }
});

test.each(['cancel', 'graph', 'identity', 'model', 'source', 'language', 'unmount'])(
    'clears timers and generation duration and rejects stale model completion on %s', async change => {
        const delayed = deferred();
        api.analysis.getText2GqlConfig.mockResolvedValue({status: 200, data: {available: true}});
        api.analysis.streamText2Gql.mockReturnValueOnce(delayed.promise);
        const {result, rerender, unmount} = renderHook(value => useText2Gql(value), {initialProps: props});
        await configure(result);
        jest.useFakeTimers();
        try {
            let pending;
            act(() => {
                pending = result.current.generate();
            });
            act(() => api.analysis.streamText2Gql.mock.calls[0][3].onWaiting());
            act(() => jest.advanceTimersByTime(16000));
            expect(result.current.elapsedSeconds).toBe(16);
            expect(result.current.generationDurationMs).toBe(16000);
            const signal = api.analysis.streamText2Gql.mock.calls[0][3].signal;
            if (change === 'unmount') {
                unmount();
            }
            else if (change === 'graph') {
                rerender({...props, scope: {...props.scope, graph: 'two'}});
            }
            else {
                act(() => {
                    if (change === 'cancel') {
                        result.current.cancel();
                    }
                    else if (change === 'model') {
                        result.current.updateConfig('model', 'another-model');
                    }
                    else if (change === 'source') {
                        result.current.changeSource('custom');
                    }
                    else if (change === 'language') {
                        result.current.changeLanguage('cypher');
                    }
                    else {
                        setUser({user_name: 'bob'});
                    }
                });
            }
            expect(signal.aborted).toBe(true);
            if (change !== 'unmount') {
                expect(result.current.generationDurationMs).toBeNull();
            }
            expect(jest.getTimerCount()).toBe(0);
            act(() => jest.advanceTimersByTime(20000));
            act(() => api.analysis.streamText2Gql.mock.calls[0][3].onWaiting());
            expect(jest.getTimerCount()).toBe(0);
            await act(async () => {
                delayed.resolve(generated('stale query'));
                await pending;
            });
            expect(props.execute).not.toHaveBeenCalled();
            expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(1);
            if (change !== 'unmount') {
                expect(result.current.generationDurationMs).toBeNull();
            }
        }
        finally {
            unmount();
            jest.useRealTimers();
        }
    }
);


test('renders real partial text immediately but waits for a valid terminal result before execution', async () => {
    const delayed = deferred();
    api.analysis.streamText2Gql.mockReturnValueOnce(delayed.promise);
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    let pending;
    act(() => {
        pending = result.current.generate();
    });
    expect(result.current.phase).toBe('waiting');
    const {onDelta} = api.analysis.streamText2Gql.mock.calls[0][3];
    act(() => onDelta('g.V()'));
    expect(props.clearEditor).toHaveBeenLastCalledWith('g.V()');
    expect(result.current.phase).toBe('streaming');
    expect(props.execute).not.toHaveBeenCalled();
    act(() => onDelta('.limit(3)'));
    expect(props.clearEditor).toHaveBeenLastCalledWith('g.V().limit(3)');
    await act(async () => {
        delayed.resolve(generated('g.V().limit(3)'));
        await pending;
    });
    expect(props.execute).toHaveBeenCalledTimes(1);
    expect(props.execute).toHaveBeenCalledWith('g.V().limit(3)', 'Find people', expect.any(Object));
});

test('routes initial, streamed and final generated drafts through the workspace provenance callback', async () => {
    props.onGeneratedDraft = jest.fn();
    api.analysis.streamText2Gql
        .mockImplementationOnce((graphSpace, graph, params, {onDelta}) => {
            onDelta('```gremlin\ng.V(');
            return Promise.resolve(generated('g.V(', false));
        })
        .mockImplementationOnce((graphSpace, graph, params, {onDelta}) => {
            onDelta('g.V()');
            onDelta('.limit(3)');
            return Promise.resolve(generated('g.V().limit(3)'));
        });
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    props.clearEditor.mockClear();
    await act(async () => result.current.generate());
    expect(props.onGeneratedDraft.mock.calls).toEqual([
        [''], ['g.V('], ['g.V('], ['g.V()'], ['g.V().limit(3)'], ['g.V().limit(3)'],
    ]);
    expect(props.clearEditor).not.toHaveBeenCalled();
    expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(2);
    expect(props.execute).toHaveBeenCalledWith('g.V().limit(3)', 'Find people', expect.any(Object));
});

test('does not send stale streamed or terminal drafts to the workspace callback after cancellation', async () => {
    props.onGeneratedDraft = jest.fn();
    const delayed = deferred();
    api.analysis.streamText2Gql.mockReturnValueOnce(delayed.promise);
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    let pending;
    act(() => {
        pending = result.current.generate();
    });
    const {onDelta} = api.analysis.streamText2Gql.mock.calls[0][3];
    act(() => onDelta('g.V('));
    act(() => result.current.cancel());
    props.onGeneratedDraft.mockClear();
    await act(async () => {
        onDelta('stale delta');
        delayed.resolve(generated('g.V()'));
        await pending;
    });
    expect(props.onGeneratedDraft).not.toHaveBeenCalled();
    expect(props.execute).not.toHaveBeenCalled();
});

test('preserves streamed text on failure and ignores further deltas after cancellation', async () => {
    let reject;
    api.analysis.streamText2Gql.mockReturnValueOnce(new Promise((resolve, fail) => {
        reject = fail;
    }));
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    let pending;
    act(() => {
        pending = result.current.generate();
    });
    const {onDelta} = api.analysis.streamText2Gql.mock.calls[0][3];
    act(() => onDelta('g.V().has('));
    await act(async () => {
        reject(new Error('stream disconnected'));
        await pending;
    });
    expect(props.clearEditor).toHaveBeenLastCalledWith('g.V().has(');
    expect(result.current.error).toContain('stream disconnected');
    expect(props.execute).not.toHaveBeenCalled();
    act(() => result.current.cancel());
    props.clearEditor.mockClear();
    act(() => onDelta('stale text'));
    expect(props.clearEditor).not.toHaveBeenCalled();
});

const promptMetadata = {available: true, custom_available: true, model: 'shared-model',
    prompts: {gremlin: 'shared Gremlin', cypher: 'shared Cypher'},
    default_prompts: {gremlin: 'default Gremlin', cypher: 'default Cypher'}};

test.each(['gremlin', 'cypher'])(
    'lets the server select the shared %s Prompt for both model sources', async language => {
        api.analysis.getText2GqlConfig.mockResolvedValue({status: 200, data: promptMetadata});
        api.analysis.streamText2Gql.mockResolvedValue({status: 200,
            data: {valid: true, language, query: language === 'gremlin' ? 'g.V()' : 'MATCH (n) RETURN n'}});
        const {result} = renderHook(() => useText2Gql({...props, language}));
        await configure(result);
        await act(async () => result.current.generate());
        const sharedRequest = api.analysis.streamText2Gql.mock.calls[0][2];
        expect(sharedRequest).toMatchObject({source: 'shared', language});
        expect(sharedRequest).not.toHaveProperty('prompt');
        act(() => result.current.changeSource('custom'));
        await act(async () => result.current.generate());
        const customRequest = api.analysis.streamText2Gql.mock.calls[1][2];
        expect(customRequest).toMatchObject({source: 'custom', language});
        expect(customRequest).not.toHaveProperty('prompt');
    }
);

test.each([true, false])(
    'inherits the server Prompt for a custom model when shared model availability is %s', async available => {
        api.analysis.getText2GqlConfig.mockResolvedValue({status: 200, data: {...promptMetadata, available}});
        api.analysis.streamText2Gql.mockResolvedValue({status: 200,
            data: {valid: true, language: 'gremlin', query: 'g.V()'}});
        const {result} = renderHook(() => useText2Gql(props));
        await configure(result);
        if (available) {
            act(() => result.current.changeSource('custom'));
        }
        await act(async () => result.current.generate());
        const params = api.analysis.streamText2Gql.mock.calls[0][2];
        expect(params).toMatchObject({source: 'custom', language: 'gremlin'});
        expect(params).not.toHaveProperty('prompt');
        expect(props.execute).toHaveBeenCalledTimes(1);
    }
);

test('older metadata without Prompt templates keeps custom generation compatible', async () => {
    api.analysis.streamText2Gql.mockResolvedValue({status: 200,
        data: {valid: true, language: 'gremlin', query: 'g.V()'}});
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    await act(async () => result.current.generate());
    expect(api.analysis.streamText2Gql.mock.calls[0][2]).not.toHaveProperty('prompt');
    expect(props.execute).toHaveBeenCalledTimes(1);
});


test('updates generation duration every 250ms, preserves it for reruns and freezes model failures', async () => {
    const generation = deferred();
    const rerun = deferred();
    const failed = deferred();
    api.analysis.streamText2Gql.mockReturnValueOnce(generation.promise).mockReturnValueOnce(failed.promise);
    props.execute.mockResolvedValueOnce({ok: true}).mockReturnValueOnce(rerun.promise);
    const {result, unmount} = renderHook(() => useText2Gql(props));
    await configure(result);
    expect(result.current.generationDurationMs).toBeNull();
    jest.useFakeTimers();
    try {
        let pending;
        act(() => {
            pending = result.current.generate();
        });
        act(() => jest.advanceTimersByTime(3000));
        expect(result.current.generationDurationMs).toBeNull();
        act(() => api.analysis.streamText2Gql.mock.calls[0][3].onWaiting());
        act(() => jest.advanceTimersByTime(249));
        expect(result.current.generationDurationMs).toBe(0);
        act(() => jest.advanceTimersByTime(1));
        expect(result.current.generationDurationMs).toBe(250);
        act(() => api.analysis.streamText2Gql.mock.calls[0][3].onWaiting());
        expect(result.current.generationDurationMs).toBe(250);
        // Total elapsed ticker, model duration ticker and the bounded slow-model timeout.
        expect(jest.getTimerCount()).toBe(3);
        act(() => jest.advanceTimersByTime(875));
        await act(async () => {
            generation.resolve(generated('g.V()', true, 'gremlin', 1125));
            await pending;
        });
        expect(result.current.generationDurationMs).toBe(1125);
        act(() => {
            pending = result.current.rerun('g.V().limit(2)');
        });
        act(() => jest.advanceTimersByTime(5000));
        expect(result.current.generationDurationMs).toBe(1125);
        await act(async () => {
            rerun.resolve({ok: true});
            await pending;
        });
        act(() => {
            pending = result.current.generate();
        });
        expect(result.current.generationDurationMs).toBeNull();
        act(() => jest.advanceTimersByTime(5000));
        expect(result.current.generationDurationMs).toBeNull();
        act(() => api.analysis.streamText2Gql.mock.calls[1][3].onWaiting());
        act(() => jest.advanceTimersByTime(1375));
        await act(async () => {
            failed.resolve(Promise.reject(Object.assign(new Error('model failed'), {
                response: {data: {duration_ms: 1375}},
            })));
            await pending;
        });
        expect(result.current.errorStage).toBe('generation');
        expect(result.current.generationDurationMs).toBe(1375);
        expect(jest.getTimerCount()).toBe(0);
        act(() => jest.advanceTimersByTime(5000));
        expect(result.current.generationDurationMs).toBe(1375);
    }
    finally {
        unmount();
        jest.useRealTimers();
    }
});

test('adds repaired model duration while excluding the failed database execution between calls', async () => {
    const first = deferred();
    const second = deferred();
    const execution = deferred();
    api.analysis.streamText2Gql.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    props.execute.mockReturnValueOnce(execution.promise).mockResolvedValueOnce({ok: true});
    const {result, unmount} = renderHook(() => useText2Gql(props));
    await configure(result);
    jest.useFakeTimers();
    try {
        let pending;
        act(() => {
            pending = result.current.generate();
        });
        act(() => jest.advanceTimersByTime(2000));
        expect(result.current.generationDurationMs).toBeNull();
        act(() => api.analysis.streamText2Gql.mock.calls[0][3].onWaiting());
        act(() => jest.advanceTimersByTime(750));
        await act(async () => first.resolve(generated('g.V()', true, 'gremlin', 750)));
        expect(result.current.generationDurationMs).toBe(750);
        act(() => jest.advanceTimersByTime(6000));
        expect(result.current.generationDurationMs).toBe(750);
        await act(async () => execution.resolve(syntaxFailure));
        expect(result.current.phase).toBe('repair_waiting');
        act(() => jest.advanceTimersByTime(4000));
        expect(result.current.generationDurationMs).toBe(750);
        act(() => api.analysis.streamText2Gql.mock.calls[1][3].onWaiting());
        act(() => jest.advanceTimersByTime(900));
        await act(async () => {
            second.resolve(generated('g.V().limit(3)', true, 'gremlin', 900));
            await pending;
        });
        expect(result.current.generationDurationMs).toBe(1650);
        expect(props.execute).toHaveBeenCalledTimes(2);
        expect(jest.getTimerCount()).toBe(0);
    }
    finally {
        unmount();
        jest.useRealTimers();
    }
});


test.each(['preparation error', 'older server'])(
    'does not report model duration without server timing (%s)', async mode => {
        const delayed = deferred();
        api.analysis.streamText2Gql.mockReturnValue(delayed.promise);
        const {result, unmount} = renderHook(() => useText2Gql(props));
        await configure(result);
        jest.useFakeTimers();
        try {
            let pending;
            act(() => {
                pending = result.current.generate();
            });
            act(() => jest.advanceTimersByTime(10000));
            expect(result.current.generationDurationMs).toBeNull();
            await act(async () => {
                delayed.resolve(mode === 'preparation error' ? {status: 500, message: 'Schema unavailable'}
                    : generated('g.V()'));
                await pending;
            });
            expect(result.current.generationDurationMs).toBeNull();
            expect(jest.getTimerCount()).toBe(0);
        }
        finally {
            unmount();
            jest.useRealTimers();
        }
    }
);

test.each(['initial', 'repair'])(
    'keeps total model duration unknown when the %s response omits server timing', async missing => {
        api.analysis.streamText2Gql
            .mockImplementationOnce((graphSpace, graph, params, {onWaiting}) => {
                onWaiting();
                return Promise.resolve(generated('invalid draft', false, 'gremlin',
                    missing === 'initial' ? undefined : 125));
            })
            .mockImplementationOnce((graphSpace, graph, params, {onWaiting}) => {
                onWaiting();
                return Promise.resolve(generated('g.V()', true, 'gremlin',
                    missing === 'repair' ? undefined : 150));
            });
        const {result} = renderHook(() => useText2Gql(props));
        await configure(result);
        await act(async () => result.current.generate());
        expect(result.current.generationDurationMs).toBeNull();
        expect(props.execute).toHaveBeenCalledTimes(1);
    }
);


test.each([0, 150])('uses server duration %sms when buffered waiting and result arrive together', async duration => {
    api.analysis.streamText2Gql.mockImplementationOnce((graphSpace, graph, params, {onWaiting, onDelta}) => {
        onWaiting();
        onDelta('g.V()');
        return Promise.resolve(generated('g.V()', true, 'gremlin', duration));
    });
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    await act(async () => result.current.generate());
    expect(result.current.generationDurationMs).toBe(duration);
    expect(props.execute).toHaveBeenCalledTimes(1);
});

test.each([undefined, null, -1, NaN, Infinity, '150'])(
    'keeps final duration unknown for invalid server timing %s', async duration => {
        api.analysis.streamText2Gql.mockImplementationOnce((graphSpace, graph, params, {onWaiting}) => {
            onWaiting();
            return Promise.resolve(generated('g.V()', true, 'gremlin', duration));
        });
        const {result} = renderHook(() => useText2Gql(props));
        await configure(result);
        await act(async () => result.current.generate());
        expect(result.current.generationDurationMs).toBeNull();
    }
);


test.each(['gremlin', 'cypher'])(
    'reruns %s asynchronously with original provenance and no model repair', async language => {
        props.language = language;
        const submission = deferred();
        props.execute.mockReturnValue(submission.promise);
        const {result} = renderHook(() => useText2Gql(props));
        await configure(result);
        act(() => result.current.loadSource('Original task question'));
        act(() => result.current.setQuestion('New ungenerated question'));
        let pending;
        act(() => {
            pending = result.current.rerun('edited statement', {asyncTask: true});
        });
        expect(result.current.phase).toBe('submission');
        await act(async () => {
            submission.resolve({ok: false, status: 460, message: 'Task syntax rejected'});
            await pending;
        });
        expect(props.execute).toHaveBeenCalledWith('edited statement', 'Original task question',
            expect.objectContaining({language, asyncTask: true, signal: expect.any(Object),
                isCurrent: expect.any(Function), sanitizeError: expect.any(Function)}));
        expect(api.analysis.streamText2Gql).not.toHaveBeenCalled();
        expect(result.current.errorStage).toBe('execution');
        expect(result.current.pending).toBe(false);
    }
);


test('repairs generated validation failures before async submission without repairing submit failures', async () => {
    const submission = deferred();
    api.analysis.streamText2Gql.mockResolvedValueOnce(generated('invalid draft', false))
        .mockResolvedValueOnce(generated('g.V()'));
    props.execute.mockReturnValue(submission.promise);
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    let pending;
    await act(async () => {
        pending = result.current.generate({asyncTask: true});
    });
    expect(result.current.phase).toBe('submission');
    expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(2);
    expect(props.execute).toHaveBeenCalledWith('g.V()', 'Find people', expect.objectContaining({asyncTask: true}));
    await act(async () => {
        submission.resolve(syntaxFailure);
        await pending;
    });
    expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(2);
    expect(props.execute).toHaveBeenCalledTimes(1);
    expect(result.current.errorStage).toBe('execution');
});

test('does not spend an unused model repair budget on asynchronous submission failures', async () => {
    api.analysis.streamText2Gql.mockResolvedValue(generated('g.V()'));
    props.execute.mockResolvedValue(syntaxFailure);
    const {result} = renderHook(() => useText2Gql(props));
    await configure(result);
    await act(async () => result.current.generate({asyncTask: true}));
    expect(api.analysis.streamText2Gql).toHaveBeenCalledTimes(1);
    expect(props.execute).toHaveBeenCalledTimes(1);
    expect(result.current.errorStage).toBe('execution');
});
