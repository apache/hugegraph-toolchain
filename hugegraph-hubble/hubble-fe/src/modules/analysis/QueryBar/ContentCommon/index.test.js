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
import ContentCommon from './index';
import GraphAnalysisContext from '../../../Context';

jest.mock('react-i18next', () => ({
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({t: key => ({
        'analysis.query.execute_query': 'Run Query',
        'analysis.query.execute_task': 'Run Task',
        'analysis.query.execute_shortcut': 'Run Query (Ctrl/Command + Enter)',
    })[key] || key}),
}));
jest.mock('../../../../api/index', () => ({analysis: {addFavoriate: jest.fn()}}));

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
            <ContentCommon {...props}>
                <div className='cm-editor'><textarea aria-label='query editor' /></div>
            </ContentCommon>
        </GraphAnalysisContext.Provider>
    );
    return props;
};

it('runs the active Gremlin or Cypher query once with Mod+Enter', () => {
    const props = renderContent({activeTab: 'Cypher'});

    fireEvent.keyDown(screen.getByLabelText('query editor'), {
        key: 'Enter', ctrlKey: true,
    });

    expect(props.onExecute).toHaveBeenCalledTimes(1);
    expect(props.onExecute).toHaveBeenCalledWith('Cypher');
    expect(screen.getByRole('button', {name: /Run Query/})).toHaveAttribute(
        'title', 'Run Query (Ctrl/Command + Enter)'
    );
});

it('does not run for plain Enter, IME composition, or a pending request', () => {
    const props = renderContent({isExecuting: true});
    const editor = screen.getByLabelText('query editor');

    fireEvent.keyDown(editor, {key: 'Enter'});
    fireEvent.keyDown(editor, {key: 'Enter', metaKey: true, isComposing: true});
    fireEvent.keyDown(editor, {key: 'Enter', metaKey: true});

    expect(props.onExecute).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {name: /Run Query/})).toBeDisabled();
});
