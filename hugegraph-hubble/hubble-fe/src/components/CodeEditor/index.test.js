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

import {act, fireEvent, render} from '@testing-library/react';
import {EditorView} from 'codemirror';
import {Transaction} from '@codemirror/state';
import {undo} from '@codemirror/commands';
import CodeEditor from './index';

// CRA's Jest resolver ignores these packages' CommonJS export conditions.
jest.mock('@marijn/find-cluster-break', () => jest.requireActual('@marijn/find-cluster-break/dist/index.cjs'));
jest.mock('@codemirror/legacy-modes/mode/groovy', () => (
    jest.requireActual('@codemirror/legacy-modes/mode/groovy.cjs')
));

jest.mock('react-i18next', () => {
    const translate = key => key;
    return {useTranslation: () => ({t: translate})};
});

it('keeps focus when controlled callbacks change after input', () => {
    const firstExecution = jest.fn();
    const nextExecution = jest.fn();
    const firstChange = jest.fn();
    const nextChange = jest.fn();
    const {container, rerender} = render(
        <CodeEditor
            value=''
            onChange={firstChange}
            onExecutionShortcut={firstExecution}
        />
    );
    const originalEditor = container.querySelector('.cm-editor');
    const content = container.querySelector('.cm-content');
    content.focus();

    rerender(
        <CodeEditor
            value='x'
            onChange={nextChange}
            onExecutionShortcut={nextExecution}
        />
    );

    expect(container.querySelector('.cm-editor')).toBe(originalEditor);
    expect(document.activeElement).toBe(content);
    expect(firstChange).not.toHaveBeenCalled();
    expect(nextChange).not.toHaveBeenCalled();

    fireEvent.keyDown(content, {key: 'Enter', ctrlKey: true});
    expect(firstExecution).not.toHaveBeenCalled();
    expect(nextExecution).toHaveBeenCalledTimes(1);
});


it('preserves the generated controlled value through pending read-only transitions', () => {
    const onChange = jest.fn();
    const {container, rerender} = render(<CodeEditor value='' onChange={onChange} />);
    const gremlin = 'g.V().hasLabel("person").limit(3)';
    rerender(<CodeEditor value={gremlin} readOnly onChange={onChange} />);
    expect(container.querySelector('.cm-content')).toHaveTextContent(gremlin);
    rerender(<CodeEditor value={gremlin} readOnly={false} onChange={onChange} />);
    expect(container.querySelector('.cm-content')).toHaveTextContent(gremlin);
    fireEvent.focus(container.querySelector('.cm-content'));
    expect(onChange).not.toHaveBeenCalled();
});

it('does not turn focus and layout updates into document changes', () => {
    const onChange = jest.fn();
    const {container} = render(<CodeEditor value='g.V()' onChange={onChange} />);
    fireEvent.focus(container.querySelector('.cm-content'));
    expect(onChange).not.toHaveBeenCalled();
});

it('synchronizes external history and generated values without echoing them as user edits', () => {
    const onChange = jest.fn();
    const {container, rerender} = render(<CodeEditor value='g.V()' onChange={onChange} />);
    const view = EditorView.findFromDOM(container.querySelector('.cm-editor'));
    rerender(<CodeEditor value='g.E()' onChange={onChange} />);
    expect(view.state.doc.toString()).toBe('g.E()');
    rerender(<CodeEditor value='' onChange={onChange} />);
    expect(view.state.doc.toString()).toBe('');
    expect(onChange).not.toHaveBeenCalled();
    expect(undo(view)).toBe(false);
});

it.each(['input.type', 'input.paste'])(
    'emits real CodeMirror %s edits and undo after an external value sync', userEvent => {
        const onChange = jest.fn();
        const {container, rerender} = render(<CodeEditor value='' onChange={onChange} />);
        rerender(<CodeEditor value='g.V()' onChange={onChange} />);
        const view = EditorView.findFromDOM(container.querySelector('.cm-editor'));
        act(() => view.dispatch({
            changes: {from: 5, insert: '.limit(3)'},
            annotations: Transaction.userEvent.of(userEvent),
        }));
        expect(onChange).toHaveBeenNthCalledWith(1, 'g.V().limit(3)');
        act(() => {
            expect(undo(view)).toBe(true);
        });
        expect(onChange).toHaveBeenNthCalledWith(2, 'g.V()');
    }
);


it.each([
    ['gremlin', "g.V().hasLabel('person').has('name', '" + 'a'.repeat(200) + "').limit(10)"],
    ['cypher', "MATCH (n:person) WHERE n.name = '" + 'a'.repeat(200) + "' RETURN n LIMIT 10"],
])('keeps editing, undo and execution intact with %s soft-wrapping', (lang, value) => {
    const onChange = jest.fn();
    const execute = jest.fn();
    const {container} = render(
        <CodeEditor value={value} lang={lang} lineWrapping onChange={onChange} onExecutionShortcut={execute} />
    );
    const view = EditorView.findFromDOM(container.querySelector('.cm-editor'));
    expect(view.lineWrapping).toBe(true);
    expect(view.state.doc.lines).toBe(1);
    expect(view.state.doc.toString()).toBe(value);
    const limitStart = value.lastIndexOf('10');
    act(() => view.dispatch({
        changes: {from: limitStart, to: limitStart + 2, insert: '25'},
        annotations: Transaction.userEvent.of('input.type'),
    }));
    const edited = value.slice(0, limitStart) + '25' + value.slice(limitStart + 2);
    expect(onChange).toHaveBeenLastCalledWith(edited);
    expect(view.state.doc.lines).toBe(1);
    act(() => {
        expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(value);
    expect(onChange).toHaveBeenLastCalledWith(value);
    onChange.mockClear();
    fireEvent.keyDown(container.querySelector('.cm-content'), {key: 'Enter', ctrlKey: true});
    expect(execute).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
});
