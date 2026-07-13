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

import {act, fireEvent, render, screen} from '@testing-library/react';
import ShortcutHelp from './index';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

test('opens the shortcut overview with question mark outside editors', () => {
    render(<ShortcutHelp />);

    fireEvent.keyDown(document.body, {key: '?'});

    expect(screen.getByText('workbench.shortcuts.title')).toBeInTheDocument();
    expect(screen.getByText('workbench.shortcuts.run_query')).toBeInTheDocument();
});

test('opens the shortcut overview from the visible topbar trigger', () => {
    render(<ShortcutHelp />);

    act(() => {
        window.dispatchEvent(new CustomEvent('hubble:shortcut-help'));
    });

    expect(screen.getByText('workbench.shortcuts.title')).toBeInTheDocument();
});

test.each([
    ['input', <input key='input' aria-label='editor' />],
    ['textarea', <textarea key='textarea' aria-label='editor' />],
    ['contenteditable', <div key='contenteditable' aria-label='editor' contentEditable />],
])('does not open from a %s editor', (_, editor) => {
    render(<><ShortcutHelp />{editor}</>);

    fireEvent.keyDown(screen.getByLabelText('editor'), {key: '?'});

    expect(screen.queryByText('workbench.shortcuts.title')).not.toBeInTheDocument();
});

test('does not open while an IME composition is active', () => {
    render(<ShortcutHelp />);

    fireEvent.keyDown(document.body, {key: '?', isComposing: true, keyCode: 229});

    expect(screen.queryByText('workbench.shortcuts.title')).not.toBeInTheDocument();
});
