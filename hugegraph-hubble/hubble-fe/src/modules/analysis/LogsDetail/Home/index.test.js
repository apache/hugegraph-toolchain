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
import LogsDetail from './index';
import GraphAnalysisContext from '../../../Context';

jest.mock('../ExecuteLog', () => () => <div>records table</div>);
jest.mock('../Favorite', () => () => <div>favorites table</div>);
jest.mock('../../../../api/index', () => ({analysis: {}}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'analysis.logs.execute_tab': 'Execution records',
        'analysis.logs.favorite_tab': 'Favorite queries',
        'analysis.logs.execution_load_failed': 'Could not load execution records.',
        'analysis.logs.retry_execution': 'Retry records',
        'analysis.logs.favorite_load_failed': 'Could not load favorite queries.',
        'analysis.logs.retry_favorites': 'Retry favorites',
    })[key] || key}),
}));

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

const baseProps = {
    executionLogsData: {},
    favoriteQueriesData: {},
    pageExecute: 1,
    pageFavorite: 1,
    pageSize: 10,
    analysisMode: 'Gremlin',
    onExecutePageChange: jest.fn(),
    onFavoritePageChange: jest.fn(),
    onChangeSearchValue: jest.fn(),
    onSortChange: jest.fn(),
    onRefresh: jest.fn(),
    onClickLoadContent: jest.fn(),
};

it('shows source-specific recovery without replacing the other tab', () => {
    const retryExecution = jest.fn();
    const retryFavorites = jest.fn();
    render(
        <GraphAnalysisContext.Provider value={{graphSpace: 'DEFAULT', graph: 'hugegraph'}}>
            <LogsDetail
                {...baseProps}
                executionLogsError
                favoriteQueriesError
                onRetryExecutionLogs={retryExecution}
                onRetryFavoriteQueries={retryFavorites}
            />
        </GraphAnalysisContext.Provider>
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not load execution records.'
    );
    fireEvent.click(screen.getByRole('button', {name: 'Retry records'}));
    expect(retryExecution).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('tab', {name: 'Favorite queries'}));
    expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not load favorite queries.'
    );
    fireEvent.click(screen.getByRole('button', {name: 'Retry favorites'}));
    expect(retryFavorites).toHaveBeenCalledTimes(1);
});
