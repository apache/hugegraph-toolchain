/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {fireEvent, render, screen} from '@testing-library/react';

import AlgorithmExecuteLog from './algorithm/LogsDetail/ExecuteLog';
import AlgorithmFavorite from './algorithm/LogsDetail/Favorite';
import AnalysisExecuteLog from './analysis/LogsDetail/ExecuteLog';
import AnalysisFavorite from './analysis/LogsDetail/Favorite';

jest.mock('react-i18next', () => ({
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({t: key => key}),
}));
jest.mock('../components/ExecutionContent', () => () => <div />);

beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

const executeRecord = {
    id: 1,
    content: 'g.V()',
    status: 'SUCCESS',
    type: 'GREMLIN',
};
const favoriteRecord = {
    id: 1,
    name: 'valid_name',
    content: 'g.V()',
};

const assertInvalidNameDisablesConfirm = async (actionName, confirmName) => {
    fireEvent.click(screen.getByRole('button', {name: actionName}));
    const input = await screen.findByPlaceholderText(
        'analysis.logs.favorite_name_placeholder'
    );
    fireEvent.change(input, {target: {value: 'invalid-name'}});
    const confirm = screen.getAllByRole('button', {name: confirmName})
        .find(button => button.disabled);
    expect(confirm).toBeDefined();
};

test.each([
    ['analysis', AnalysisExecuteLog, {
        executeLogsDataRecords: [executeRecord],
        executeLogsDataTotal: 1,
        onLoadContent: jest.fn(),
    }],
    ['algorithm', AlgorithmExecuteLog, {
        executionLogsDataRecords: [executeRecord],
        executionLogsDataTotal: 1,
    }],
])('%s execution log rejects invalid favorite names', async (_, Component, dataProps) => {
    render(<Component
        {...dataProps}
        pageExecute={1}
        pageSize={10}
        onExecutePageChange={jest.fn()}
        onAddCollection={jest.fn()}
    />);

    await assertInvalidNameDisablesConfirm(
        'analysis.logs.action.favorite',
        'analysis.logs.action.favorite'
    );
});

test.each([
    ['analysis', AnalysisFavorite, {
        onChangeSearchValue: jest.fn(),
        onLoadContent: jest.fn(),
    }],
    ['algorithm', AlgorithmFavorite, {
        onChangeFavorSearch: jest.fn(),
    }],
])('%s favorite editor rejects invalid renamed favorites', async (_, Component, dataProps) => {
    render(<Component
        {...dataProps}
        favoriteQueriesDataRecords={[favoriteRecord]}
        favoriteQueriesDataTotal={1}
        pageFavorite={1}
        pageSize={10}
        onFavoritePageChange={jest.fn()}
        onSortChange={jest.fn()}
        onEditCollection={jest.fn()}
        onDel={jest.fn()}
    />);

    await assertInvalidNameDisablesConfirm(
        'analysis.logs.action.edit_name',
        'analysis.logs.action.save'
    );
});
