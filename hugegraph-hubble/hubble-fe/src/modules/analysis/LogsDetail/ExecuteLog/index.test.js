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
        'analysis.logs.column.text': 'Natural language',
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
        'analysis.logs.type.CYPHER_ASYNC': 'CYPHER Task',
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
        .toEqual(['Time', 'Natural language', 'Statement', 'Status', 'Duration', 'Actions']);
    expect(container.querySelector('.ant-table-title')).toBeNull();
    expect(container.querySelector('thead button[aria-label="Columns"]')).not.toBeNull();
    expect(screen.queryByText('Gremlin')).not.toBeInTheDocument();
});

const historyProps = records => ({
    executeLogsDataRecords: records,
    executeLogsDataTotal: records.length,
    pageExecute: 1,
    pageSize: 10,
    onExecutePageChange: jest.fn(),
    onAddCollection: jest.fn(),
    onLoadContent: jest.fn(),
});

test('renders natural language beside its generated statement and exposes long questions in a tooltip', async () => {
    const question = 'Find all people who know another person in the same city and return their names. '.repeat(5);
    const props = historyProps([{
        id: 1, text: question, content: 'g.V()', status: 'SUCCESS', type: 'GREMLIN',
    }]);
    const {container} = render(<ExecuteLog {...props} />);
    const questionCell = container.querySelector('tbody .questionCell');
    expect(questionCell).toHaveTextContent(question.trim());
    expect(questionCell.closest('td')).toHaveClass('ant-table-cell-ellipsis');
    expect(screen.getByRole('button', {name: 'Load'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Copy'})).toBeInTheDocument();
    fireEvent.focus(questionCell);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(question.trim());
});

test.each([undefined, null, '', '  '])('shows a dash for history without a natural-language question (%s)', text => {
    const props = historyProps([{
        id: 1, text, content: 'g.V()', status: 'SUCCESS', type: 'GREMLIN',
    }]);
    const {container} = render(<ExecuteLog {...props} />);
    expect(container.querySelectorAll('tbody tr.ant-table-row td')[1]).toHaveTextContent('—');
    expect(container.querySelector('.questionCell')).toBeNull();
});

test('keeps old customized columns while showing the new question column', () => {
    window.localStorage.setItem('hubble.analysis.execution-log.columns.v2', JSON.stringify({
        order: ['content', 'time', 'status', 'duration', 'action', 'type'],
        hidden: ['duration', 'type'],
    }));
    const {container} = render(<ExecuteLog {...historyProps([])} />);
    expect([...container.querySelectorAll('thead th')].map(cell => cell.textContent))
        .toEqual(['Statement', 'Time', 'Status', 'Actions', 'Natural language']);
});

test('lets users hide the natural-language column and preserves their preference', () => {
    const first = render(<ExecuteLog {...historyProps([])} />);
    fireEvent.click(screen.getByRole('button', {name: 'Columns'}));
    fireEvent.click(screen.getByRole('checkbox', {name: 'Natural language'}));
    expect(first.container.querySelector('thead')).not.toHaveTextContent('Natural language');
    expect(JSON.parse(window.localStorage.getItem('hubble.analysis.execution-log.columns.v2')).hidden)
        .toContain('text');
    first.unmount();
    const next = render(<ExecuteLog {...historyProps([])} />);
    expect(next.container.querySelector('thead')).not.toHaveTextContent('Natural language');
});

test.each([
    ['all columns', []],
    ['default columns', ['type']],
    ['custom hidden columns', ['text', 'duration', 'type']],
])('allocates 100% to the actual visible %s while reserving 15% for actions', (name, hidden) => {
    window.localStorage.setItem('hubble.analysis.execution-log.columns.v2', JSON.stringify({hidden}));
    const props = historyProps([{id: 1, content: 'g.V()', status: 'SUCCESS', type: 'ALGORITHM'}]);
    const {container} = render(<ExecuteLog {...props} compact />);
    const headers = [...container.querySelectorAll('thead th')].map(cell => cell.textContent);
    const widths = [...container.querySelectorAll('col')].map(column => parseFloat(column.style.width));
    expect(widths.reduce((total, width) => total + width, 0)).toBeCloseTo(100, 8);
    expect(widths[headers.indexOf('Actions')]).toBe(15);
});

test('gives the action column the full width when users hide every optional column', () => {
    window.localStorage.setItem('hubble.analysis.execution-log.columns.v2', JSON.stringify({
        hidden: ['time', 'text', 'content', 'status', 'duration', 'type'],
    }));
    const props = historyProps([{id: 1, content: 'g.V()', status: 'SUCCESS', type: 'GREMLIN'}]);
    const {container} = render(<ExecuteLog {...props} compact />);
    expect([...container.querySelectorAll('thead th')].map(cell => cell.textContent)).toEqual(['Actions']);
    expect(container.querySelector('col')).toHaveStyle({width: '100%'});
    expect(screen.getByRole('button', {name: 'Load'})).toBeEnabled();
});

test('labels asynchronous Cypher records when the optional Type column is visible', () => {
    window.localStorage.setItem('hubble.analysis.execution-log.columns.v2', JSON.stringify({hidden: []}));
    const props = historyProps([{
        id: 1, content: 'MATCH (n) RETURN n', status: 'ASYNC_TASK_SUCCESS', type: 'CYPHER_ASYNC',
    }]);
    render(<ExecuteLog {...props} compact />);
    expect(screen.getByRole('cell', {name: 'CYPHER Task'})).toBeInTheDocument();
    expect(screen.queryByText('CYPHER_ASYNC')).not.toBeInTheDocument();
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

test.each(['Original question', undefined])('loads a history statement and optional question (%s)', text => {
    const queryBar = document.createElement('div');
    queryBar.id = 'queryBar';
    document.body.appendChild(queryBar);
    const scroll = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const onLoadContent = jest.fn();
    render(
        <ExecuteLog
            executeLogsDataRecords={[{
                id: 1, content: 'g.V()', text, status: 'SUCCESS', type: 'GREMLIN',
            }]}
            executeLogsDataTotal={1}
            pageExecute={1}
            pageSize={10}
            onExecutePageChange={jest.fn()}
            onAddCollection={jest.fn()}
            onLoadContent={onLoadContent}
        />
    );
    fireEvent.click(screen.getByRole('button', {name: 'Load'}));
    expect(onLoadContent).toHaveBeenCalledWith(...(text === undefined ? ['g.V()'] : ['g.V()', text]));
    scroll.mockRestore();
    queryBar.remove();
});

test('avoids an inner table scroller in the query workspace while preserving the legacy table', () => {
    const props = {
        executeLogsDataRecords: [],
        executeLogsDataTotal: 0,
        pageExecute: 1,
        pageSize: 10,
    };
    const view = render(<ExecuteLog {...props} />);
    expect(view.container.querySelector('.ant-table-body')).not.toBeNull();
    view.rerender(<ExecuteLog {...props} compact />);
    expect(view.container.querySelector('.ant-table-body')).toBeNull();
    expect(view.container.querySelector('.ant-table-small')).not.toBeNull();
});
