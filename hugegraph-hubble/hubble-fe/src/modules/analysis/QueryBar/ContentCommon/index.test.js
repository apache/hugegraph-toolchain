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

import {fireEvent, render, screen} from '@testing-library/react';

import * as api from '../../../../api/index';
import GraphAnalysisContext from '../../../Context';
import ContentCommon from './index';

jest.mock('../../../../api/index', () => ({
    analysis: {addFavoriate: jest.fn().mockResolvedValue({status: 200})},
}));
jest.mock('antd', () => ({
    ...jest.requireActual('antd'),
    message: {success: jest.fn(), error: jest.fn()},
}));
jest.mock('react-i18next', () => ({
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({t: key => key}),
}));

const renderContent = () => render(
    <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
        <ContentCommon
            codeEditorContent='g.V()'
            setCodeEditorContent={jest.fn()}
            executeMode='QUERY'
            onExecuteModeChange={jest.fn()}
            activeTab='Gremlin'
            onExecute={jest.fn()}
            onRefresh={jest.fn()}
            isEmptyQuery={false}
            favoriteCardVisible
            setFavoriteCardVisible={jest.fn()}
        />
    </GraphAnalysisContext.Provider>
);

beforeEach(() => {
    api.analysis.addFavoriate.mockResolvedValue({status: 200});
});

test('keeps favorite submission disabled until the name is backend-compatible', () => {
    renderContent();
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
