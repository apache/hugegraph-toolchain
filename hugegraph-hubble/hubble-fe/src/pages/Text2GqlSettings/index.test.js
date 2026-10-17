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

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import Text2GqlSettings from './index';
import * as api from '../../api';
import {getModelHistory} from '../../utils/modelHistory';

let mockIdentityEpoch = 0;
let mockAuthLoading = false;
let mockCapabilities = new Set();
jest.mock('../../api', () => ({config: {
    getText2GqlSettings: jest.fn(), updateText2GqlSettings: jest.fn(), testText2GqlSettings: jest.fn(),
}}));
jest.mock('../../auth/AuthContext', () => ({useAuthContext: () => ({
    identityEpoch: mockIdentityEpoch,
    loading: mockAuthLoading,
    hasCapability: capability => mockCapabilities.has(capability),
})}));
jest.mock('react-i18next', () => ({useTranslation: () => ({
    t: (key, values) => (values ? `${key} ${JSON.stringify(values)}` : key),
})}));
const initial = {enabled: true, connection_type: 'openai', base_url: 'https://model.example/v1',
    model: 'shared-model', has_api_key: true, source: 'managed'};
const response = values => ({status: 200, data: {...initial, ...values}});
const deferred = () => {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return {promise, resolve};
};
const keyInput = () => screen.getByLabelText('analysis.model_settings.replace_key');
const saveButton = () => screen.getByRole('button', {name: /^analysis.model_settings.save(?:_test)?$/});
const testButton = () => screen.getByRole('button', {name: 'analysis.model_settings.test_saved'});

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({matches: false,
        addListener: jest.fn(), removeListener: jest.fn()}));
});
beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockIdentityEpoch = 0;
    mockAuthLoading = false;
    mockCapabilities = new Set(['model_settings_manage']);
    api.config.getText2GqlSettings.mockResolvedValue(response());
    api.config.updateText2GqlSettings.mockResolvedValue(response());
    api.config.testText2GqlSettings.mockResolvedValue({status: 200, data: {duration_ms: 1250}});
});
const load = async () => {
    const view = render(<Text2GqlSettings />);
    await screen.findByLabelText('analysis.model_settings.replace_key');
    return view;
};

test('replaces a key without persisting or reading it back and clears the input after saving', async () => {
    await load();
    expect(keyInput()).toHaveValue('');
    expect(keyInput()).toHaveAttribute('placeholder', 'analysis.model_settings.key_keep_placeholder');
    fireEvent.change(keyInput(), {target: {value: 'replacement-secret'}});
    await act(async () => fireEvent.click(saveButton()));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('analysis.model_settings.saved_tested'));
    expect(api.config.updateText2GqlSettings).toHaveBeenCalledWith({
        enabled: true, connection_type: 'openai', base_url: initial.base_url,
        model: 'shared-model', api_key: 'replacement-secret',
    }, expect.any(Object));
    expect(keyInput()).toHaveValue('');
    expect(JSON.stringify({...sessionStorage, ...localStorage})).not.toContain('replacement-secret');
    expect(getModelHistory(initial.base_url)).toEqual([initial.model]);
});

test('keeps the saved key when only the model changes and the new key is blank', async () => {
    api.config.updateText2GqlSettings.mockResolvedValue(response({model: 'new-model'}));
    await load();
    fireEvent.change(screen.getByLabelText('analysis.query.model_name'), {target: {value: 'new-model'}});
    await act(async () => fireEvent.click(saveButton()));
    await waitFor(() => expect(api.config.updateText2GqlSettings).toHaveBeenCalledTimes(1));
    const params = api.config.updateText2GqlSettings.mock.calls[0][0];
    expect(params).toMatchObject({model: 'new-model', base_url: initial.base_url});
    expect(params).not.toHaveProperty('api_key');
    expect(params).not.toHaveProperty('clear_api_key');
    await waitFor(() => expect(getModelHistory(initial.base_url)).toEqual(['new-model']));
});

test('requires a replacement key after changing the OpenAI-compatible endpoint', async () => {
    await load();
    fireEvent.change(screen.getByLabelText('Base URL'), {target: {value: 'https://different.example/v1'}});
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('analysis.model_settings.key_endpoint_changed');
    await act(async () => fireEvent.click(saveButton()));
    expect(api.config.updateText2GqlSettings).not.toHaveBeenCalled();
    fireEvent.change(keyInput(), {target: {value: 'new-endpoint-secret'}});
    expect(saveButton()).toBeEnabled();
});

test.each(['openai', 'ollama'])('preserves the saved key when only URL trailing slashes change (%s)', async type => {
    api.config.getText2GqlSettings.mockResolvedValue(response({connection_type: type}));
    await load();
    fireEvent.change(screen.getByLabelText('Base URL'), {target: {value: `${initial.base_url}/`}});
    expect(saveButton()).toBeEnabled();
    await act(async () => fireEvent.click(saveButton()));
    const params = api.config.updateText2GqlSettings.mock.calls[0][0];
    expect(params).not.toHaveProperty('api_key');
    expect(params).not.toHaveProperty('clear_api_key');
});

test('makes clearing a configured key explicit and mutually exclusive with replacement', async () => {
    await load();
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('checkbox', {name: 'analysis.model_settings.clear_key'}));
    expect(keyInput()).toBeDisabled();
    await act(async () => fireEvent.click(saveButton()));
    await waitFor(() => expect(api.config.updateText2GqlSettings).toHaveBeenCalledTimes(1));
    const params = api.config.updateText2GqlSettings.mock.calls[0][0];
    expect(params).toMatchObject({enabled: false, clear_api_key: true});
    expect(params).not.toHaveProperty('api_key');
});

test('does not forward a previously configured cloud key to a new Ollama endpoint', async () => {
    await load();
    fireEvent.mouseDown(screen.getByRole('combobox', {name: 'analysis.query.connection_type'}));
    fireEvent.click(screen.getByText('analysis.query.connection_ollama'));
    fireEvent.change(screen.getByLabelText('analysis.query.model_name'), {target: {value: 'local-model'}});
    expect(saveButton()).toBeEnabled();
    await act(async () => fireEvent.click(saveButton()));
    await waitFor(() => expect(api.config.updateText2GqlSettings).toHaveBeenCalledTimes(1));
    expect(api.config.updateText2GqlSettings.mock.calls[0][0]).toEqual({
        enabled: true, connection_type: 'ollama', base_url: 'http://localhost:11434/v1',
        model: 'local-model', clear_api_key: true,
    });
});

test('ignores an old-account save response and clears the pending key on identity change', async () => {
    const pending = deferred();
    api.config.updateText2GqlSettings.mockReturnValue(pending.promise);
    const view = await load();
    fireEvent.change(keyInput(), {target: {value: 'old-account-secret'}});
    await act(async () => fireEvent.click(saveButton()));
    const signal = api.config.updateText2GqlSettings.mock.calls[0][1].signal;
    mockIdentityEpoch = 1;
    api.config.getText2GqlSettings.mockResolvedValue(response({model: 'new-account-model'}));
    view.rerender(<Text2GqlSettings />);
    expect(signal.aborted).toBe(true);
    await screen.findByDisplayValue('new-account-model');
    expect(keyInput()).toHaveValue('');
    await act(async () => pending.resolve(response({model: 'old-account-model'})));
    expect(screen.queryByDisplayValue('old-account-model')).not.toBeInTheDocument();
    expect(screen.queryByText('analysis.model_settings.saved')).not.toBeInTheDocument();
});


test('does not retain the existing key across an endpoint change even when the model is disabled', async () => {
    await load();
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.change(screen.getByLabelText('Base URL'), {target: {value: 'https://new-endpoint.example/v1'}});
    expect(saveButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', {name: 'analysis.model_settings.clear_key'}));
    expect(saveButton()).toBeEnabled();
    await act(async () => fireEvent.click(saveButton()));
    await waitFor(() => expect(api.config.updateText2GqlSettings).toHaveBeenCalledTimes(1));
    expect(api.config.updateText2GqlSettings.mock.calls[0][0]).toMatchObject({
        enabled: false, base_url: 'https://new-endpoint.example/v1', clear_api_key: true,
    });
});


test('marks enabled model fields as required and explains empty fields visually and accessibly', async () => {
    await load();
    const model = screen.getByLabelText('analysis.query.model_name');
    const url = screen.getByLabelText('Base URL');
    expect(model).toHaveAttribute('aria-required', 'true');
    expect(url).toHaveAttribute('aria-required', 'true');
    expect(model.labels[0]).toHaveClass('requiredLabel');
    fireEvent.change(model, {target: {value: ''}});
    expect(model).toHaveAttribute('aria-invalid', 'true');
    expect(model.closest('.ant-select')).toHaveClass('ant-select-status-error');
    expect(saveButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('switch'));
    expect(model).toHaveAttribute('aria-required', 'false');
    expect(model).toHaveAttribute('aria-invalid', 'false');
});


test.each([
    [true, ['model_settings_manage']],
    [false, ['accounts_manage']],
    [false, []],
])('does not load settings before management access is established (%s, %j)', (loading, capabilities) => {
    mockAuthLoading = loading;
    mockCapabilities = new Set(capabilities);
    render(<Text2GqlSettings />);
    expect(api.config.getText2GqlSettings).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('analysis.model_settings.replace_key')).not.toBeInTheDocument();
});

test('cancels a pending save and clears the in-memory key when management access is revoked', async () => {
    const pending = deferred();
    api.config.updateText2GqlSettings.mockReturnValue(pending.promise);
    const view = await load();
    fireEvent.change(keyInput(), {target: {value: 'revoked-secret'}});
    await act(async () => fireEvent.click(saveButton()));
    const signal = api.config.updateText2GqlSettings.mock.calls[0][1].signal;
    mockCapabilities.clear();
    view.rerender(<Text2GqlSettings />);
    expect(signal.aborted).toBe(true);
    expect(screen.queryByLabelText('analysis.model_settings.replace_key')).not.toBeInTheDocument();
    await act(async () => pending.resolve(response({model: 'stale-model'})));
    mockCapabilities.add('model_settings_manage');
    view.rerender(<Text2GqlSettings />);
    await screen.findByLabelText('analysis.model_settings.replace_key');
    expect(keyInput()).toHaveValue('');
    expect(screen.queryByDisplayValue('stale-model')).not.toBeInTheDocument();
});

test('automatically tests enabled settings only after a successful save', async () => {
    const saving = deferred();
    api.config.updateText2GqlSettings.mockReturnValue(saving.promise);
    await load();
    await act(async () => fireEvent.click(saveButton()));
    expect(api.config.testText2GqlSettings).not.toHaveBeenCalled();
    await act(async () => saving.resolve(response()));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('analysis.model_settings.saved_tested'));
    expect(api.config.testText2GqlSettings).toHaveBeenCalledTimes(1);
    expect(api.config.testText2GqlSettings.mock.calls[0][0]).toEqual({signal: expect.any(AbortSignal)});
    expect(screen.getByRole('alert')).toHaveTextContent('1.3');
});

test('manual test never saves and edits to fields or keys clear previous results', async () => {
    await load();
    await act(async () => fireEvent.click(testButton()));
    expect(api.config.updateText2GqlSettings).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('analysis.model_settings.test_success');
    fireEvent.change(screen.getByLabelText('analysis.query.model_name'), {target: {value: 'other'}});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(testButton()).toBeDisabled();
    expect(screen.getByText('analysis.model_settings.test_save_first')).toBeInTheDocument();
    await act(async () => fireEvent.click(testButton()));
    expect(api.config.testText2GqlSettings).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('analysis.query.model_name'), {target: {value: initial.model}});
    await act(async () => fireEvent.click(testButton()));
    fireEvent.change(keyInput(), {target: {value: 'replacement-secret'}});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(testButton()).toBeDisabled();
});

test('keeps the saved configuration and clears the key when the subsequent test fails', async () => {
    api.config.testText2GqlSettings.mockRejectedValue({response: {data: {message: 'Invalid replacement-secret'}}});
    await load();
    fireEvent.change(keyInput(), {target: {value: 'replacement-secret'}});
    await act(async () => fireEvent.click(saveButton()));
    expect(screen.getByRole('alert')).toHaveTextContent('analysis.model_settings.saved_test_failed');
    expect(getModelHistory(initial.base_url)).toEqual([]);
    expect(screen.getByRole('alert')).not.toHaveTextContent('replacement-secret');
    expect(screen.getByRole('alert')).not.toHaveTextContent('analysis.model_settings.save_failed');
    expect(keyInput()).toHaveValue('');
    expect(testButton()).toBeEnabled();
    expect(api.config.updateText2GqlSettings).toHaveBeenCalledTimes(1);
});

test('does not test disabled settings or after a failed save', async () => {
    await load();
    fireEvent.click(screen.getByRole('switch'));
    api.config.updateText2GqlSettings.mockResolvedValue(response({enabled: false}));
    await act(async () => fireEvent.click(saveButton()));
    expect(api.config.testText2GqlSettings).not.toHaveBeenCalled();
    expect(testButton()).toBeDisabled();
    expect(screen.getByText('analysis.model_settings.test_disabled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));
    api.config.updateText2GqlSettings.mockRejectedValue(new Error('save failed'));
    await act(async () => fireEvent.click(saveButton()));
    expect(api.config.testText2GqlSettings).not.toHaveBeenCalled();
});

test('shows elapsed seconds, prevents duplicate requests, and cancels without accepting late results', async () => {
    await load();
    jest.useFakeTimers();
    const interval = jest.spyOn(window, 'setInterval');
    const clearInterval = jest.spyOn(window, 'clearInterval');
    try {
        const pending = deferred();
        api.config.testText2GqlSettings.mockReturnValue(pending.promise);
        await act(async () => {
            fireEvent.click(testButton());
            fireEvent.click(testButton());
        });
        expect(api.config.testText2GqlSettings).toHaveBeenCalledTimes(1);
        expect(saveButton()).toBeDisabled();
        expect(keyInput()).toBeDisabled();
        act(() => jest.advanceTimersByTime(3000));
        expect(screen.getByRole('status')).toHaveTextContent('"seconds":3');
        const signal = api.config.testText2GqlSettings.mock.calls[0][0].signal;
        fireEvent.click(screen.getByRole('button', {name: 'analysis.model_settings.cancel_test'}));
        expect(signal.aborted).toBe(true);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(clearInterval).toHaveBeenCalledWith(interval.mock.results[0].value);
        await act(async () => pending.resolve({status: 200, data: {duration_ms: 9000}}));
        expect(screen.getByRole('alert')).toHaveTextContent('analysis.model_settings.test_cancelled');
        expect(testButton()).toBeEnabled();
    }
    finally {
        interval.mockRestore();
        clearInterval.mockRestore();
        jest.useRealTimers();
    }
});

test.each(['identity', 'permission', 'unmount'])('aborts testing on %s change and ignores late results', async mode => {
    const pending = deferred();
    api.config.testText2GqlSettings.mockReturnValue(pending.promise);
    const view = await load();
    await act(async () => fireEvent.click(testButton()));
    const signal = api.config.testText2GqlSettings.mock.calls[0][0].signal;
    if (mode === 'identity') {
        mockIdentityEpoch++;
        view.rerender(<Text2GqlSettings />);
        await screen.findByLabelText('analysis.model_settings.replace_key');
    }
    else if (mode === 'permission') {
        mockCapabilities.clear();
        view.rerender(<Text2GqlSettings />);
    }
    else {
        view.unmount();
    }
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({status: 200, data: {duration_ms: 1000}}));
    expect(screen.queryByText(/analysis.model_settings.test_success/)).not.toBeInTheDocument();
});


test.each(['openai', 'ollama'])('explains the empty Key field for an unconfigured %s connection', async type => {
    api.config.getText2GqlSettings.mockResolvedValue(response({has_api_key: false, connection_type: type}));
    await load();
    expect(keyInput()).toHaveAttribute('placeholder', type === 'ollama'
        ? 'analysis.model_settings.key_optional_placeholder' : 'analysis.model_settings.key_placeholder');
    expect(keyInput()).toHaveValue('');
});

const templates = {gremlin: 'shared Gremlin examples', cypher: 'shared Cypher examples'};
const builtIn = {gremlin: 'default Gremlin examples', cypher: 'default Cypher examples'};

test('applies shared Prompt drafts to the form and persists them only with Save', async () => {
    api.config.getText2GqlSettings.mockResolvedValue(response({prompts: templates, default_prompts: builtIn}));
    api.config.updateText2GqlSettings.mockResolvedValue(response({prompts: {...templates, gremlin: 'few-shot'},
        default_prompts: builtIn}));
    await load();
    const promptButton = screen.getByRole('button', {name: 'analysis.prompt.title'});
    const heading = screen.getByRole('heading', {name: 'analysis.model_settings.title'});
    expect(heading.parentElement).toContainElement(promptButton);
    expect(promptButton.closest('header')).toBeInTheDocument();
    expect(promptButton).toHaveClass('ant-btn-text', 'ant-btn-sm');
    expect(screen.queryByText('analysis.prompt.shared_hint')).not.toBeInTheDocument();
    fireEvent.click(promptButton);
    fireEvent.change(screen.getByRole('textbox', {name: /^analysis.prompt.template/}), {target: {value: 'few-shot'}});
    fireEvent.click(screen.getByRole('button', {name: 'analysis.prompt.apply'}));
    expect(api.config.updateText2GqlSettings).not.toHaveBeenCalled();
    expect(testButton()).toBeDisabled();
    await act(async () => fireEvent.click(saveButton()));
    expect(api.config.updateText2GqlSettings.mock.calls[0][0].prompts).toEqual({...templates, gremlin: 'few-shot'});
});

test('cancels Prompt edits and restores only a chosen language as a form draft', async () => {
    api.config.getText2GqlSettings.mockResolvedValue(response({prompts: templates, default_prompts: builtIn}));
    await load();
    fireEvent.click(screen.getByRole('button', {name: 'analysis.prompt.title'}));
    fireEvent.change(screen.getByRole('textbox', {name: /^analysis.prompt.template/}), {target: {value: 'discard'}});
    fireEvent.click(screen.getByRole('button', {name: 'analysis.prompt.cancel'}));
    expect(testButton()).toBeEnabled();
    fireEvent.click(screen.getByRole('button', {name: 'analysis.prompt.title'}));
    expect(screen.getByRole('textbox', {name: /^analysis.prompt.template/})).toHaveValue(templates.gremlin);
    fireEvent.click(screen.getByRole('tab', {name: 'Cypher'}));
    fireEvent.click(screen.getByRole('button', {name: 'analysis.prompt.reset_default'}));
    fireEvent.click(screen.getByRole('button', {name: 'analysis.prompt.apply'}));
    await act(async () => fireEvent.click(saveButton()));
    expect(api.config.updateText2GqlSettings.mock.calls[0][0].prompts).toEqual({...templates, cypher: builtIn.cypher});
});

test('old settings responses keep model saving compatible without empty Prompt writes', async () => {
    await load();
    expect(screen.getByRole('button', {name: 'analysis.prompt.title'})).toBeDisabled();
    await act(async () => fireEvent.click(saveButton()));
    expect(api.config.updateText2GqlSettings.mock.calls[0][0]).not.toHaveProperty('prompts');
});
