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
import {fireEvent, render, screen, within} from '@testing-library/react';
import QueryBar, {isFavoritePopoverOpen} from './index';

jest.mock('../../../../components/CodeEditor', () => props => (
    <div
        data-testid={`editor-${props.lang}`}
        data-placeholder={props.placeholder}
        data-meta-enter-newline={props.metaEnterNewline ? 'true' : 'false'}
    >
        editor
    </div>
));
jest.mock('../ContentCommon', () => ({
    children,
    favoriteCardVisible,
    setFavoriteCardVisible,
    isEmptyQuery,
    shortcutHint,
}) => (
    <div>
        <button onClick={() => setFavoriteCardVisible(true)}>open favorite</button>
        <span>{favoriteCardVisible ? 'favorite open' : 'favorite closed'}</span>
        <span>{isEmptyQuery ? 'query empty' : 'query ready'}</span>
        <span>{shortcutHint}</span>
        {children}
    </div>
));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'analysis.query.gremlin_tab': 'Gremlin',
        'analysis.query.gremlin_placeholder': 'For example: g.V().limit(10)',
        'analysis.query.cypher_tab': 'Cypher',
        'analysis.query.cypher_placeholder': 'For example: MATCH (n) RETURN n LIMIT 10',
        'analysis.query.shortcut_hint_ctrl': 'Ctrl + Enter to run',
        'analysis.query.shortcut_hint_command': 'Command + Enter for a new line',
        'analysis.query.text2gql_tab': 'Natural language',
        'analysis.query.text2gql_title': 'Natural-language graph query',
        'analysis.query.text2gql_description': 'This preview is not connected.',
        'analysis.query.text2gql_placeholder': 'Describe the graph question',
        'analysis.query.text2gql_badge': 'Coming soon',
        'analysis.query.text2gql_privacy': 'Nothing is sent or executed.',
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
    expect(isFavoritePopoverOpen(true, 'Gremlin', 'Gremlin')).toBe(true);
    expect(isFavoritePopoverOpen(true, 'Cypher', 'Gremlin')).toBe(false);
    expect(isFavoritePopoverOpen(false, 'Gremlin', 'Gremlin')).toBe(false);

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
    fireEvent.click(screen.getByRole('button', {name: 'open favorite'}));
    expect(screen.getByText('favorite open')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', {name: 'Cypher'}));
    expect(within(screen.getByRole('tabpanel', {name: 'Cypher'}))
        .getByText('favorite closed')).toBeInTheDocument();
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
    expect(screen.getByText('Ctrl + Enter to run')).toBeInTheDocument();
    expect(screen.getByText('Command + Enter for a new line')).toBeInTheDocument();
    expect(screen.getByTestId('editor-gremlin')).toHaveAttribute(
        'data-meta-enter-newline', 'true'
    );

    fireEvent.click(screen.getByRole('tab', {name: 'Cypher'}));
    expect(screen.getByTestId('editor-cypher')).toHaveAttribute(
        'data-placeholder',
        'For example: MATCH (n) RETURN n LIMIT 10'
    );
    expect(screen.queryByText(/safe example/i)).not.toBeInTheDocument();
});
