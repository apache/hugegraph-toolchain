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
import QueryBar from './index';

jest.mock('../../../../components/CodeEditor', () => props => (
    <div
        className='cm-editor'
        data-testid={`editor-${props.lang}`}
        data-placeholder={props.placeholder}
        data-meta-enter-newline={props.metaEnterNewline ? 'true' : 'false'}
        data-execution-shortcut={props.onExecutionShortcut ? 'true' : 'false'}
        onKeyDown={event => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                props.onExecutionShortcut?.();
            }
        }}
    >
        editor
    </div>
));
jest.mock('../ContentCommon', () => ({
    SecondaryActions: ({
        favoriteCardVisible,
        setFavoriteCardVisible,
        isEmptyQuery,
        shortcutHint,
    }) => (
        <div data-testid='secondary-query-actions'>
            <button>Clear</button>
            <button onClick={() => setFavoriteCardVisible(true)}>Favorite</button>
            <span>{favoriteCardVisible ? 'favorite open' : 'favorite closed'}</span>
            <span>{isEmptyQuery ? 'query empty' : 'query ready'}</span>
            <span>{shortcutHint}</span>
        </div>
    ),
    PrimaryActions: ({onExecute, activeTab}) => (
        <button onClick={() => onExecute(activeTab)}>Run Query</button>
    ),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'analysis.query.gremlin_tab': 'Gremlin',
        'analysis.query.gremlin_placeholder': 'For example: g.V().limit(10)',
        'analysis.query.cypher_tab': 'Cypher',
        'analysis.query.cypher_placeholder': 'For example: MATCH (n) RETURN n LIMIT 10',
        'analysis.query.shortcut_hint': 'Ctrl / Command + Enter to run',
        'analysis.query.text2gql_tab': 'Natural language',
        'analysis.query.text2gql_title': 'Natural-language graph query',
        'analysis.query.text2gql_description': 'This preview is not connected.',
        'analysis.query.text2gql_placeholder': 'Describe the graph question',
        'analysis.query.text2gql_badge': 'Coming soon',
        'analysis.query.text2gql_privacy': 'Nothing is sent or executed.',
        'analysis.query.collapse': 'Collapse',
        'analysis.query.expand': 'Expand',
    })[key] || key}),
}));

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

it('shows a same-level Text2GQL preview with no executable control', () => {
    const onTabsChange = jest.fn();
    const {rerender} = render(
        <QueryBar
            activeTab='Gremlin'
            onTabsChange={onTabsChange}
            codeEditorContent=''
            setCodeEditorContent={jest.fn()}
        />
    );

    fireEvent.click(screen.getByRole('tab', {name: /Natural language/}));
    expect(onTabsChange).toHaveBeenCalledWith('Text2GQL');

    rerender(
        <QueryBar
            activeTab='Text2GQL'
            onTabsChange={onTabsChange}
            codeEditorContent=''
            setCodeEditorContent={jest.fn()}
        />
    );
    expect(screen.getByRole('textbox', {
        name: 'Natural-language graph query',
    })).toBeDisabled();
    expect(screen.getByText('Nothing is sent or executed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /run|execute/i})).not.toBeInTheDocument();
});

it('does not transfer an open favorite popover when query tabs change', () => {
    const ControlledQueryBar = () => {
        const [activeTab, setActiveTab] = useState('Gremlin');
        return (
            <QueryBar
                activeTab={activeTab}
                onTabsChange={setActiveTab}
                codeEditorContent='g.V()'
                setCodeEditorContent={jest.fn()}
            />
        );
    };

    render(<ControlledQueryBar />);
    expect(screen.getByText('query ready')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Favorite'}));
    expect(screen.getByText('favorite open')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', {name: 'Cypher'}));
    expect(screen.getByText('favorite closed')).toBeInTheDocument();
});

it('matches the editor placeholder to the active query language without promotional help', () => {
    const ControlledQueryBar = () => {
        const [activeTab, setActiveTab] = useState('Gremlin');
        return (
            <QueryBar
                activeTab={activeTab}
                onTabsChange={setActiveTab}
                codeEditorContent=''
                setCodeEditorContent={jest.fn()}
            />
        );
    };

    render(<ControlledQueryBar />);
    expect(screen.getByTestId('editor-gremlin')).toHaveAttribute(
        'data-placeholder',
        'For example: g.V().limit(10)'
    );
    expect(screen.queryByText(/safe example/i)).not.toBeInTheDocument();
    expect(screen.getByText('Ctrl / Command + Enter to run')).toBeInTheDocument();
    expect(screen.getByText('Ctrl / Command + Enter to run').parentElement)
        .toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('editor-gremlin')).toHaveAttribute(
        'data-meta-enter-newline', 'false'
    );
    expect(screen.getByTestId('editor-gremlin')).toHaveAttribute(
        'data-execution-shortcut', 'true'
    );

    fireEvent.click(screen.getByRole('tab', {name: 'Cypher'}));
    expect(screen.getByTestId('editor-cypher')).toHaveAttribute(
        'data-placeholder',
        'For example: MATCH (n) RETURN n LIMIT 10'
    );
    expect(screen.queryByText(/safe example/i)).not.toBeInTheDocument();
});

it('shows one combined Ctrl and Command shortcut hint on every platform', () => {
    render(
        <QueryBar
            activeTab='Gremlin'
            onTabsChange={jest.fn()}
            onExecute={jest.fn()}
            codeEditorContent='g.V()'
            setCodeEditorContent={jest.fn()}
        />
    );

    expect(screen.getByText('Ctrl / Command + Enter to run')).toBeInTheDocument();
});

it('keeps query actions, language tabs, and Text2GQL in one navigation row', () => {
    render(
        <QueryBar
            activeTab='Gremlin'
            onTabsChange={jest.fn()}
            onExecute={jest.fn()}
            codeEditorContent='g.V()'
            setCodeEditorContent={jest.fn()}
        />
    );

    const navigation = screen.getByRole('tablist').closest('.ant-tabs-nav');
    expect(navigation).toContainElement(screen.getByTestId('secondary-query-actions'));
    expect(navigation).toContainElement(screen.getByRole('tab', {
        name: /Natural language/,
    }));
    expect(navigation).toContainElement(screen.getByRole('button', {name: 'Run Query'}));

    const text2gqlTab = screen.getByRole('tab', {name: /Natural language/});
    const clearButton = screen.getByRole('button', {name: 'Clear'});
    const favoriteButton = screen.getByRole('button', {name: 'Favorite'});
    expect(text2gqlTab.compareDocumentPosition(clearButton))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(clearButton.compareDocumentPosition(favoriteButton))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

it('keeps collapse as a keyboard-accessible editor control', () => {
    render(
        <QueryBar
            activeTab='Gremlin'
            onTabsChange={jest.fn()}
            onExecute={jest.fn()}
            codeEditorContent='g.V()'
            setCodeEditorContent={jest.fn()}
        />
    );

    const collapse = screen.getByRole('button', {name: /Collapse/});
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(collapse);
    expect(screen.queryByTestId('editor-gremlin')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Expand/})).toHaveAttribute(
        'aria-expanded', 'false'
    );
});

it('executes with Ctrl+Enter and Command+Enter inside the editor', () => {
    const onExecute = jest.fn();
    render(
        <QueryBar
            activeTab='Gremlin'
            onTabsChange={jest.fn()}
            onExecute={onExecute}
            codeEditorContent='g.V()'
            setCodeEditorContent={jest.fn()}
        />
    );

    const editor = screen.getByTestId('editor-gremlin');
    fireEvent.keyDown(editor, {key: 'Enter', metaKey: true});
    expect(onExecute).toHaveBeenCalledWith('Gremlin');
    fireEvent.keyDown(editor, {key: 'Enter', ctrlKey: true});
    expect(onExecute).toHaveBeenCalledTimes(2);
});
