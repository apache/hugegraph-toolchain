/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {message} from 'antd';
import ExecuteLog, {failureReasonDescription} from './index';

jest.mock('antd', () => ({
    ...jest.requireActual('antd'),
    message: {success: jest.fn(), error: jest.fn()},
}));

jest.mock('react-i18next', () => ({
    initReactI18next: {type: '3rdParty', init: jest.fn()},
    useTranslation: () => ({t: key => ({
        'analysis.logs.column.time': 'Time',
        'analysis.logs.column.content': 'Statement',
        'analysis.logs.column.status': 'Status',
        'analysis.logs.column.duration': 'Duration',
        'analysis.logs.column.action': 'Actions',
        'analysis.logs.column.type': 'Type',
        'analysis.logs.column_settings.title': 'Columns',
        'analysis.logs.column_settings.move_up': 'Move up',
        'analysis.logs.column_settings.move_down': 'Move down',
        'analysis.logs.column_settings.reset': 'Reset',
        'analysis.logs.type.GREMLIN': 'Gremlin',
        'analysis.logs.status.SUCCESS': 'Success',
        'analysis.logs.action.load_statement': 'Load',
        'analysis.logs.action.copy_statement': 'Copy',
        'analysis.logs.action.favorite': 'Favorite',
        'analysis.logs.click_to_copy': 'Click to copy',
        'analysis.logs.copy_success': 'Query copied',
        'analysis.logs.copy_failed': 'Copy failed',
    })[key] || key}),
}));

beforeAll(() => {
    window.matchMedia = window.matchMedia || (() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
});

beforeEach(() => {
    window.localStorage.clear();
    message.success.mockClear();
    message.error.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {writeText: jest.fn().mockResolvedValue(undefined)},
    });
});

describe('Gremlin execution history failure reason', () => {
    const t = key => ({
        'analysis.logs.failure_reason.GREMLIN_EXECUTION_FAILED':
            'Query failed. Review the statement and try again.',
    })[key];

    test('maps a controlled reason code to actionable localized text', () => {
        expect(failureReasonDescription(
            {status: 'FAILED', failure_reason: 'GREMLIN_EXECUTION_FAILED'}, t
        )).toBe('Query failed. Review the statement and try again.');
    });

    test('does not show a reason for successful history', () => {
        expect(failureReasonDescription(
            {status: 'SUCCESS', failure_reason: 'GREMLIN_EXECUTION_FAILED'}, t
        )).toBeNull();
    });

    test('does not expose unknown backend values', () => {
        expect(failureReasonDescription(
            {status: 'FAILED', failure_reason: 'raw Groovy signature'}, t
        )).toBeNull();
    });
});

test('hides the redundant Type column by default for a mode-filtered history', () => {
    const {container} = render(
        <ExecuteLog
            executeLogsDataRecords={[{
                id: 1,
                create_time: '2026-07-13',
                content: 'g.V()',
                status: 'SUCCESS',
                duration: 1,
                type: 'GREMLIN',
            }]}
            executeLogsDataTotal={1}
            pageExecute={1}
            pageSize={10}
            onExecutePageChange={jest.fn()}
            onAddCollection={jest.fn()}
            onLoadContent={jest.fn()}
        />
    );

    expect([...container.querySelectorAll('thead th')].map(cell => cell.textContent))
        .toEqual(['Time', 'Statement', 'Status', 'Duration', 'Actions']);
    expect(container.querySelector('.ant-table-title')).toBeNull();
    expect(container.querySelector('thead button[aria-label="Columns"]')).not.toBeNull();
    expect(screen.queryByText('Gremlin')).not.toBeInTheDocument();
});

test('copies a history statement from its animated hover target', async () => {
    render(
        <ExecuteLog
            executeLogsDataRecords={[{
                id: 1,
                create_time: '2026-07-13',
                content: 'g.V()',
                status: 'SUCCESS',
                duration: 1,
                type: 'GREMLIN',
            }]}
            executeLogsDataTotal={1}
            pageExecute={1}
            pageSize={10}
            onExecutePageChange={jest.fn()}
            onAddCollection={jest.fn()}
            onLoadContent={jest.fn()}
        />
    );

    const statement = screen.getByRole('button', {name: /Click to copy/});
    fireEvent.mouseEnter(statement);
    expect(await screen.findByText('Click to copy')).toBeInTheDocument();
    fireEvent.click(statement);

    await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('g.V()');
        expect(message.success).toHaveBeenCalledWith('Query copied');
    });
});

test('reports clipboard failures from the history statement', async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    render(
        <ExecuteLog
            executeLogsDataRecords={[{
                id: 1,
                create_time: '2026-07-13',
                content: 'g.V()',
                status: 'SUCCESS',
                duration: 1,
                type: 'GREMLIN',
            }]}
            executeLogsDataTotal={1}
            pageExecute={1}
            pageSize={10}
            onExecutePageChange={jest.fn()}
            onAddCollection={jest.fn()}
            onLoadContent={jest.fn()}
        />
    );

    fireEvent.click(screen.getByRole('button', {name: /Click to copy/}));

    await waitFor(() => {
        expect(message.error).toHaveBeenCalledWith('Copy failed');
    });
});
