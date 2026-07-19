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

import {fireEvent, render, screen} from '@testing-library/react';
import * as api from '../../../../api/index';
import ContentCommon from './index';
import GraphAnalysisContext from '../../../Context';

jest.mock('react-i18next', () => ({
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({t: key => ({
        'analysis.query.execute_query': 'Run Query',
        'analysis.query.execute_task': 'Run Task',
        'analysis.query.execute_mode_immediate': 'Immediate',
        'analysis.query.execute_mode_async': 'Async',
        'analysis.query.switch_async_task': 'Switch to Async Task',
        'analysis.query.switch_immediate_query': 'Switch to Immediate Query',
        'analysis.query.execute_shortcut': 'Run Query (Ctrl + Enter)',
    })[key] || key}),
}));
jest.mock('../../../../api/index', () => ({
    analysis: {addFavoriate: jest.fn().mockResolvedValue({status: 200})},
}));
jest.mock('antd', () => ({
    ...jest.requireActual('antd'),
    message: {success: jest.fn(), error: jest.fn()},
}));

beforeEach(() => {
    api.analysis.addFavoriate.mockResolvedValue({status: 200});
});

const renderContent = overrides => {
    const props = {
        codeEditorContent: 'g.V()',
        setCodeEditorContent: jest.fn(),
        executeMode: 'query',
        onExecuteModeChange: jest.fn(),
        activeTab: 'Gremlin',
        onExecute: jest.fn(),
        onRefresh: jest.fn(),
        isEmptyQuery: false,
        isExecuting: false,
        favoriteCardVisible: false,
        setFavoriteCardVisible: jest.fn(),
        ...overrides,
    };
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <ContentCommon {...props} />
        </GraphAnalysisContext.Provider>
    );
    return props;
};

it('presents mode selection and execution as one action group', () => {
    const props = renderContent({activeTab: 'Cypher'});
    fireEvent.click(screen.getByRole('button', {name: /Run Query/}));

    expect(props.onExecute).toHaveBeenCalledTimes(1);
    expect(props.onExecute).toHaveBeenCalledWith('Cypher');
    expect(screen.getByRole('button', {name: /Run Query/})).toHaveAttribute(
        'title', 'Run Query (Ctrl + Enter)'
    );
});

it('does not execute while a request is pending', () => {
    const props = renderContent({isExecuting: true});

    expect(props.onExecute).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {name: /Run Query/})).toBeDisabled();
});

it('switches between immediate query and async task with one compact control', () => {
    const props = renderContent();

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Switch to Async Task'}));

    expect(props.onExecuteModeChange).toHaveBeenCalledWith('task');
});

it('keeps the keyboard shortcut visible beside the secondary actions', () => {
    renderContent({shortcutHint: 'Ctrl + Enter to run'});

    expect(screen.getByText('Ctrl + Enter to run')).toBeInTheDocument();
});

it('places clear before favorite in the secondary action group', () => {
    renderContent();

    const clearButton = screen.getByRole('button', {name: 'common.action.clear'});
    const favoriteButton = screen.getByRole('button', {
        name: 'analysis.query.favorite',
    });
    expect(clearButton.compareDocumentPosition(favoriteButton))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

it('keeps favorite submission disabled until the name is backend-compatible', () => {
    renderContent({favoriteCardVisible: true});
    const input = screen.getByPlaceholderText('analysis.query.favorite_name_placeholder');
    const submit = screen.getAllByRole('button', {name: 'analysis.query.favorite'})
        .find(button => button.closest('.ant-popover'));
    expect(submit).toBeDefined();

    fireEvent.change(input, {target: {value: 'query-name'}});
    expect(submit).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
        'common.validation.favorite_name_rule'
    );
    fireEvent.click(submit);
    expect(api.analysis.addFavoriate).not.toHaveBeenCalled();

    fireEvent.change(input, {target: {value: 'query_name'}});
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(api.analysis.addFavoriate).toHaveBeenCalledTimes(1);
});
