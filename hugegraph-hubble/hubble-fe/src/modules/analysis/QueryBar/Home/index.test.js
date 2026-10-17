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

import {useState} from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QueryBar from './index';

jest.mock('../../../../components/CodeEditor', () => props => (
    <textarea
        data-testid='query-code-editor'
        data-language={props.lang}
        data-min-height={props.minHeight === undefined ? 'unset' : String(props.minHeight)}
        aria-label={props.ariaLabel}
        placeholder={props.placeholder}
        readOnly={props.readOnly}
        value={props.value}
        onChange={event => props.onChange(event.target.value)}
        onKeyDown={event => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                props.onExecutionShortcut?.();
            }
        }}
    />
));
jest.mock('../../../../api/index', () => ({
    analysis: {addFavoriate: jest.fn().mockResolvedValue({status: 200})},
}));
jest.mock('react-i18next', () => {
    const queryLabels = jest.requireActual('../../../../i18n/resources/en-US/modules/analysis.json').analysis.query;
    return {
        initReactI18next: {type: '3rdParty', init: jest.fn()},
        useTranslation: () => ({t: (key, values) => {
            if (key === 'analysis.query.generation_duration' || key === 'analysis.query.execution_duration') {
                return queryLabels[key.split('.').pop()].replace(/\{\{(\w+)\}\}/g, (_, name) => values[name]);
            }
            return key;
        }}),
    };
});
beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false, addListener: jest.fn(), removeListener: jest.fn(),
    }));
});

const model = () => ({
    config: {provider: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'local-model', apiKey: ''},
    question: 'Find people', pending: false, source: 'custom',
    sharedConfig: {available: true, customAvailable: true, loading: false, model: 'deployment-model'},
    updateConfig: jest.fn(), setQuestion: jest.fn(), generate: jest.fn(), cancel: jest.fn(), changeSource: jest.fn(),
});
const properties = overrides => ({
    activeTab: 'Gremlin', language: 'gremlin', cypherEnabled: true,
    codeEditorContent: 'g.V()', setCodeEditorContent: jest.fn(), editorSource: 'manual',
    executeMode: 'query', onExecuteModeChange: jest.fn(), onExecute: jest.fn(), onClear: jest.fn(),
    onLanguageChange: jest.fn(), onRefresh: jest.fn(), text2gql: model(), ...overrides,
});
const showBar = overrides => {
    const props = properties(overrides);
    return {...render(<QueryBar {...props} />), props};
};

it('keeps both panels visible, with static Text2GQL identity and each action embedded in its input frame', () => {
    showBar({toolbarExtra: <button>Metadata</button>});
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('query-code-editor')).toHaveLength(1);
    expect(screen.getByRole('textbox', {name: 'analysis.query.question_label'})).toBeEnabled();
    expect(screen.getByRole('combobox', {name: 'analysis.query.temporary_api_type'})).toBeInTheDocument();
    expect(screen.getByText('Text2GQL')).not.toHaveAttribute('role', 'button');
    expect(screen.queryByRole('button', {name: /Text2GQL|analysis.query.ai_assistance/})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {
        name: /analysis.query.collapse|analysis.query.expand/,
    })).not.toBeInTheDocument();
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toContainElement(screen.getByRole('button', {name: 'analysis.query.query_language: Gremlin'}));
    expect(toolbar).toContainElement(screen.getByRole('button', {name: 'common.action.clear'}));
    expect(toolbar).toContainElement(screen.getByRole('button', {name: 'analysis.query.favorite'}));
    expect(toolbar).toContainElement(screen.getByRole('button', {name: 'Metadata'}));
    const question = screen.getByRole('region', {name: 'analysis.query.question_label'});
    const statement = screen.getByRole('region', {name: 'analysis.query.statement_label'});
    expect(question.querySelector('.inputFrame')).toContainElement(
        screen.getByRole('button', {name: 'analysis.query.generate_query'})
    );
    expect(statement.querySelector('.inputFrame')).toContainElement(
        screen.getByRole('button', {name: 'analysis.query.execute_query'})
    );
    expect(screen.queryByText('analysis.query.read_only_hint')).not.toBeInTheDocument();
    expect(screen.queryByText('analysis.query.ai_read_only_source')).not.toBeInTheDocument();
});

it('describes the question with the short Prompt configuration hint instead of the old privacy paragraph', () => {
    showBar();
    const question = screen.getByRole('textbox', {name: 'analysis.query.question_label'});
    expect(question).toHaveAccessibleDescription('analysis.query.prompt_settings_hint');
    expect(screen.queryByText('analysis.query.text2gql_privacy')).not.toBeInTheDocument();
    expect(screen.queryByText('analysis.query.shared_privacy')).not.toBeInTheDocument();
});

it.each(['gremlin', 'cypher'])('separates generation and %s execution timing in their respective inputs', language => {
    showBar({language, text2gql: {...model(), generationDurationMs: 1234}, executionDurationMs: 5678});
    const question = screen.getByRole('region', {name: 'analysis.query.question_label'});
    const statement = screen.getByRole('region', {name: 'analysis.query.statement_label'});
    const label = language === 'gremlin' ? 'Gremlin' : 'Cypher';
    expect(question).toContainElement(screen.getByText('Generation time 1.23s'));
    expect(statement).toContainElement(screen.getByText(`${label} execution time 5.68s`));
    expect(screen.queryByText('analysis.query.shortcut_hint')).not.toBeInTheDocument();
    expect(question).toContainElement(screen.getByRole('button', {name: 'analysis.query.generate_query'}));
    expect(statement).toContainElement(screen.getByRole('button', {name: 'analysis.query.execute_query'}));
});

it('shows zero timing and retains the execution shortcut when no execution timing is available', () => {
    const {rerender, props} = showBar({text2gql: {...model(), generationDurationMs: 0}});
    expect(screen.getByText('Generation time 0.00s')).toBeInTheDocument();
    expect(screen.getByText('analysis.query.shortcut_hint')).toBeInTheDocument();
    rerender(<QueryBar {...props} executionDurationMs={0} />);
    expect(screen.getByText('Gremlin execution time 0.00s')).toBeInTheDocument();
});

it.each([undefined, null, -1, NaN, Infinity, '1000'])(
    'hides unavailable or invalid timing (%s)', duration => {
        showBar({text2gql: {...model(), generationDurationMs: duration}, executionDurationMs: duration});
        expect(screen.queryByText(/Generation time|execution time/)).not.toBeInTheDocument();
        expect(screen.getByText('analysis.query.shortcut_hint')).toBeInTheDocument();
    }
);

it('resizes both inputs with pointer capture without replacing the editor or losing content', () => {
    const original = window.PointerEvent;
    window.PointerEvent = class extends MouseEvent {
        constructor(type, options) {
            super(type, options);
            this.pointerId = options.pointerId;
        }
    };
    const base = properties();
    const Controlled = () => {
        const [content, setContent] = useState('g.V()');
        return <QueryBar {...base} codeEditorContent={content} setCodeEditorContent={setContent} />;
    };
    try {
        render(<Controlled />);
        const editor = screen.getByTestId('query-code-editor');
        fireEvent.change(editor, {target: {value: 'g.V().limit(3)'}});
        const handle = screen.getByRole('separator', {name: 'analysis.query.resize_inputs'});
        handle.setPointerCapture = jest.fn();
        const initialHeight = Number(handle.getAttribute('aria-valuenow'));
        fireEvent.pointerDown(handle, {pointerId: 1, clientY: 100, button: 0});
        fireEvent.pointerMove(handle, {pointerId: 1, clientY: 150});
        expect(handle.setPointerCapture).toHaveBeenCalledWith(1);
        expect(handle).toHaveAttribute('aria-valuenow', String(initialHeight + 50));
        expect(document.getElementById('queryBar').style.getPropertyValue('--query-input-height'))
            .toBe(`${initialHeight + 50}px`);
        expect(screen.getByTestId('query-code-editor')).toBe(editor);
        expect(editor).toHaveValue('g.V().limit(3)');
        expect(editor).toHaveAttribute('data-min-height', 'unset');
        fireEvent.pointerCancel(handle, {pointerId: 1});
        fireEvent.pointerMove(handle, {pointerId: 1, clientY: 250});
        expect(handle).toHaveAttribute('aria-valuenow', String(initialHeight + 50));
    }
    finally {
        window.PointerEvent = original;
    }
});

it('supports keyboard resize bounds and clamps to a smaller viewport', () => {
    const original = window.innerHeight;
    try {
        window.innerHeight = 900;
        showBar();
        const handle = screen.getByRole('separator', {name: 'analysis.query.resize_inputs'});
        expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
        expect(handle).toHaveAttribute('aria-valuemin', '140');
        expect(handle).toHaveAttribute('aria-valuemax', '540');
        fireEvent.keyDown(handle, {key: 'Home'});
        expect(handle).toHaveAttribute('aria-valuenow', '140');
        fireEvent.keyDown(handle, {key: 'ArrowDown'});
        expect(handle).toHaveAttribute('aria-valuenow', '156');
        fireEvent.keyDown(handle, {key: 'ArrowUp'});
        expect(handle).toHaveAttribute('aria-valuenow', '140');
        fireEvent.keyDown(handle, {key: 'End'});
        fireEvent.keyDown(handle, {key: 'ArrowDown'});
        expect(handle).toHaveAttribute('aria-valuenow', '540');
        window.innerHeight = 240;
        fireEvent(window, new Event('resize'));
        expect(handle).toHaveAttribute('aria-valuemax', '144');
        expect(handle).toHaveAttribute('aria-valuenow', '144');
    }
    finally {
        window.innerHeight = original;
    }
});

it.each(['{Enter}', ' '])('switches language in both directions with native keyboard activation (%s)', key => {
    const base = properties();
    const Controlled = () => {
        const [language, setLanguage] = useState('gremlin');
        return (
            <QueryBar
                {...base}
                language={language}
                activeTab={language === 'gremlin' ? 'Gremlin' : 'Cypher'}
                onLanguageChange={setLanguage}
            />
        );
    };
    render(<Controlled />);
    const language = screen.getByRole('button', {name: 'analysis.query.query_language: Gremlin'});
    userEvent.click(language);
    expect(screen.getByTestId('query-code-editor')).toHaveAttribute('data-language', 'cypher');
    userEvent.keyboard(key);
    expect(screen.getByTestId('query-code-editor')).toHaveAttribute('data-language', 'gremlin');
});

it('keeps Gremlin selected with an explained disabled language switch when Cypher is unsupported', async () => {
    const {props} = showBar({cypherEnabled: false});
    const language = screen.getByRole('button', {name: 'analysis.query.query_language: Gremlin'});
    expect(language).toBeDisabled();
    fireEvent.click(language);
    expect(props.onLanguageChange).not.toHaveBeenCalled();
    userEvent.hover(language.parentElement);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('analysis.query.cypher_unavailable');
});

it.each(['Gremlin', 'Cypher'])('executes %s through the same toolbar and editor keyboard shortcut', activeTab => {
    const {props} = showBar({activeTab, language: activeTab.toLowerCase()});
    userEvent.click(screen.getByRole('button', {name: 'analysis.query.execute_query'}));
    expect(props.onExecute).toHaveBeenCalledWith(activeTab);
    fireEvent.keyDown(screen.getByTestId('query-code-editor'), {key: 'Enter', ctrlKey: true});
    fireEvent.keyDown(screen.getByTestId('query-code-editor'), {key: 'Enter', metaKey: true});
    expect(props.onExecute).toHaveBeenCalledTimes(3);
});

it.each(['ctrlKey', 'metaKey'])('runs only the focused query panel with %s + Enter', modifier => {
    const {props} = showBar();
    const question = screen.getByRole('textbox', {name: 'analysis.query.question_label'});
    userEvent.click(question);
    fireEvent.keyDown(document.activeElement, {key: 'Enter', [modifier]: true});
    expect(props.text2gql.generate).toHaveBeenCalledTimes(1);
    expect(props.text2gql.generate).toHaveBeenCalledWith({asyncTask: false});
    expect(props.onExecute).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {name: 'analysis.query.generate_query'}))
        .toHaveAttribute('title', 'analysis.query.shortcut_hint');

    userEvent.click(screen.getByTestId('query-code-editor'));
    fireEvent.keyDown(document.activeElement, {key: 'Enter', [modifier]: true});
    expect(props.onExecute).toHaveBeenCalledWith('Gremlin');
    expect(props.text2gql.generate).toHaveBeenCalledTimes(1);
});

it('generates and submits in task mode through the same button and focused question shortcut', () => {
    const {props} = showBar({executeMode: 'task'});
    const generate = screen.getByRole('button', {name: 'analysis.query.generate_task'});
    userEvent.click(generate);
    expect(props.text2gql.generate).toHaveBeenNthCalledWith(1, {asyncTask: true});
    const question = screen.getByRole('textbox', {name: 'analysis.query.question_label'});
    userEvent.click(question);
    fireEvent.keyDown(document.activeElement, {key: 'Enter', metaKey: true});
    expect(props.text2gql.generate).toHaveBeenNthCalledWith(2, {asyncTask: true});
    expect(props.onExecute).not.toHaveBeenCalled();
});

it('keeps normal question editing, IME composition and modified shortcuts from generating', () => {
    const {props} = showBar();
    const question = screen.getByRole('textbox', {name: 'analysis.query.question_label'});
    [
        {key: 'Enter'},
        {key: 'Enter', ctrlKey: true, shiftKey: true},
        {key: 'Enter', metaKey: true, altKey: true},
        {key: 'Enter', ctrlKey: true, isComposing: true},
        {key: 'Enter', metaKey: true, keyCode: 229},
        {key: 'Enter', ctrlKey: true, repeat: true},
    ].forEach(event => fireEvent.keyDown(question, event));
    expect(props.text2gql.generate).not.toHaveBeenCalled();
    expect(props.onExecute).not.toHaveBeenCalled();
});

it.each([
    ['empty question', {text2gql: {...model(), question: '  '}}],
    ['pending generation', {text2gql: {...model(), pending: true}}],
    ['pending execution', {isExecuting: true}],
    ['unavailable graph', {isGraphReady: false}],
    ['unsupported language', {language: 'cypher', cypherEnabled: false}],
    ['loading model source', {text2gql: {...model(), sharedConfig: {...model().sharedConfig, loading: true}}}],
    ['unavailable shared source', {text2gql: {...model(), source: 'shared', sharedConfig: {available: false}}}],
    ['unavailable custom source', {text2gql: {...model(), sharedConfig: {customAvailable: false}}}],
])('blocks question shortcuts together with its generation button for %s', (name, overrides) => {
    const {props} = showBar(overrides);
    expect(screen.getByRole('button', {name: /analysis.query.generate_query|analysis.query.generating/}))
        .toBeDisabled();
    fireEvent.keyDown(screen.getByRole('textbox', {name: 'analysis.query.question_label'}), {
        key: 'Enter', ctrlKey: true,
    });
    expect(props.text2gql.generate).not.toHaveBeenCalled();
});

it('clears through the independent callback while normal typing only updates the editor', () => {
    const {props} = showBar();
    fireEvent.change(screen.getByTestId('query-code-editor'), {target: {value: ''}});
    expect(props.setCodeEditorContent).toHaveBeenCalledWith('');
    expect(props.onClear).not.toHaveBeenCalled();
    userEvent.click(screen.getByRole('button', {name: 'common.action.clear'}));
    expect(props.onClear).toHaveBeenCalledTimes(1);
});

it.each(['manual', 'ai'])('blocks duplicate %s execution and only locks an AI-generated editor', editorSource => {
    const text2gql = {...model(), pending: editorSource === 'ai', phase: 'streaming'};
    const {props} = showBar({editorSource, text2gql, isExecuting: editorSource === 'manual'});
    const editor = screen.getByTestId('query-code-editor');
    if (editorSource === 'ai') {
        expect(editor).toHaveAttribute('readonly');
    }
    else {
        expect(editor).not.toHaveAttribute('readonly');
    }
    expect(screen.getByRole('button', {name: 'analysis.query.execute_query'})).toBeDisabled();
    fireEvent.keyDown(screen.getByTestId('query-code-editor'), {key: 'Enter', ctrlKey: true});
    expect(props.onExecute).not.toHaveBeenCalled();
    if (editorSource === 'ai') {
        userEvent.click(screen.getByRole('button', {name: 'analysis.query.cancel_generation'}));
        expect(text2gql.cancel).toHaveBeenCalledTimes(1);
    }
});

it('keeps task submission busy without implying it can cancel a queued task or is still generating', () => {
    const text2gql = {...model(), pending: true, phase: 'submission'};
    const {rerender, props} = showBar({editorSource: 'ai', executeMode: 'task', text2gql});
    const generate = screen.getByRole('button', {name: 'analysis.query.generate_task'});
    expect(generate).toBeDisabled();
    expect(generate).not.toHaveClass('ant-btn-loading');
    expect(screen.getByRole('button', {name: 'analysis.query.execute_task'})).toBeDisabled();
    expect(screen.queryByRole('button', {name: 'analysis.query.cancel_generation'})).not.toBeInTheDocument();
    expect(screen.queryByText('analysis.query.generating')).not.toBeInTheDocument();

    rerender(<QueryBar {...props} executeMode='query' text2gql={{...text2gql, phase: 'execution'}} />);
    expect(screen.getByRole('button', {name: 'analysis.query.generate_query'})).not.toHaveClass('ant-btn-loading');
    userEvent.click(screen.getByRole('button', {name: 'analysis.query.cancel_generation'}));
    expect(text2gql.cancel).toHaveBeenCalledTimes(1);
    rerender(<QueryBar {...props} text2gql={{...text2gql, phase: 'streaming'}} />);
    expect(screen.getByRole('button', {name: /analysis.query.generating/})).toHaveClass('ant-btn-loading');
    expect(screen.getByRole('button', {name: 'analysis.query.cancel_generation'})).toBeEnabled();
});

it('preserves async execution for manual and AI statements while keeping AI favorites hidden', () => {
    const {rerender, props} = showBar({executeMode: 'task'});
    expect(screen.getByRole('button', {name: 'analysis.query.execute_task'})).toBeEnabled();
    userEvent.click(screen.getByRole('button', {name: 'analysis.query.switch_immediate_query'}));
    expect(props.onExecuteModeChange).toHaveBeenCalledWith('query');
    rerender(<QueryBar {...props} editorSource='ai' />);
    expect(screen.getByText('analysis.query.read_only_hint')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'analysis.query.execute_task'})).toBeEnabled();
    expect(screen.getByRole('button', {name: 'analysis.query.switch_immediate_query'})).toBeEnabled();
    rerender(<QueryBar {...props} editorSource='ai' executeMode='query' />);
    expect(screen.getByRole('button', {name: 'analysis.query.execute_query'})).toBeEnabled();
    userEvent.click(screen.getByRole('button', {name: 'analysis.query.switch_async_task'}));
    expect(props.onExecuteModeChange).toHaveBeenLastCalledWith('task');
    expect(screen.queryByRole('button', {name: 'analysis.query.favorite'})).not.toBeInTheDocument();
});

it('disables execution while the graph is unavailable and leaves the empty editor present', () => {
    const {props} = showBar({isGraphReady: false, codeEditorContent: ''});
    expect(screen.getByTestId('query-code-editor')).toHaveValue('');
    fireEvent.keyDown(screen.getByTestId('query-code-editor'), {key: 'Enter', ctrlKey: true});
    expect(props.onExecute).not.toHaveBeenCalled();
});

it('opens custom settings by default and lets users collapse them, revealing missing fields on generation', () => {
    const text2gql = {...model(), config: {...model().config, model: ''}};
    const {rerender, props} = showBar({text2gql});
    const settings = screen.getByText('analysis.query.model_settings').closest('details');
    expect(settings).toHaveAttribute('open');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByText('analysis.query.complete_model_config')).not.toBeInTheDocument();
    userEvent.click(screen.getByRole('button', {name: 'analysis.query.model_settings'}));
    expect(settings).not.toHaveAttribute('open');
    fireEvent.keyDown(screen.getByRole('textbox', {name: 'analysis.query.question_label'}), {
        key: 'Enter', ctrlKey: true,
    });
    expect(settings).toHaveAttribute('open');
    expect(screen.getByRole('alert')).toHaveTextContent('analysis.query.complete_model_config');
    expect(screen.getByLabelText('analysis.query.model_name')).toHaveFocus();
    expect(text2gql.generate).not.toHaveBeenCalled();
    rerender(<QueryBar {...props} text2gql={{...text2gql, config: {...text2gql.config, model: 'local'}}} />);
    userEvent.click(screen.getByRole('button', {name: 'analysis.query.generate_query'}));
    expect(text2gql.generate).toHaveBeenCalledTimes(1);
    expect(settings).toHaveAttribute('open');
});

it('shows only a shared model name alongside its source, with no temporary credential fields', () => {
    showBar({text2gql: {...model(), source: 'shared'}});
    expect(screen.getByRole('status')).toHaveTextContent('deployment-model');
    expect(screen.getByRole('status')).not.toHaveTextContent('analysis.query.shared_ready');
    expect(screen.queryByLabelText('analysis.query.temporary_api_key')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Base URL')).not.toBeInTheDocument();
});

it.each([
    ['custom', {available: false, customAvailable: true, loading: false}],
    ['shared', {available: true, customAvailable: false, loading: false}],
    ['custom', {available: true, customAvailable: true, loading: true}],
])('blocks an unavailable or loading source switch (%s, %j)', (source, sharedConfig) => {
    const text2gql = {...model(), source, sharedConfig};
    showBar({text2gql});
    const switcher = screen.getByRole('button', {name: new RegExp('analysis.query.model_source:')});
    expect(switcher).toBeDisabled();
    fireEvent.click(switcher);
    expect(text2gql.changeSource).not.toHaveBeenCalled();
});

it('switches between available model sources without changing the single editor', () => {
    const text2gql = model();
    const {rerender, props} = showBar({text2gql});
    const editor = screen.getByTestId('query-code-editor');
    userEvent.click(screen.getByRole('button', {name: /analysis.query.model_source:/}));
    expect(text2gql.changeSource).toHaveBeenCalledWith('shared');
    rerender(<QueryBar {...props} text2gql={{...text2gql, source: 'shared'}} />);
    userEvent.click(screen.getByRole('button', {name: /analysis.query.model_source:/}));
    expect(text2gql.changeSource).toHaveBeenLastCalledWith('custom');
    rerender(<QueryBar {...props} text2gql={text2gql} />);
    const toggle = screen.getByRole('button', {name: 'analysis.query.model_settings'});
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('query-code-editor')).toBe(editor);
});

it.each(['generation', 'validation', 'execution', 'cancelled'])(
    'only offers model inspection for a real generation error (%s)', errorStage => {
        const text2gql = {...model(), errorStage, error: 'Request failed',
            errorType: errorStage === 'cancelled' ? 'info' : 'error'};
        showBar({text2gql});
        const inspect = screen.queryByRole('button', {name: 'analysis.query.inspect_model_settings'});
        if (errorStage === 'generation') {
            userEvent.click(inspect);
            expect(screen.getByLabelText('Base URL')).toHaveFocus();
        }
        else {
            expect(inspect).not.toBeInTheDocument();
        }
    }
);

it('keeps Prompt template configuration out of the query workbench', () => {
    showBar();
    expect(screen.queryByRole('button', {name: 'analysis.prompt.title'})).not.toBeInTheDocument();
});
