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
import GraphStatusView from './index';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'analysis.query_result.query_failed_title': 'Query failed',
        'analysis.query_result.retry_action': 'Review the details and try again.',
        'analysis.query_result.copy_error': 'Copy details',
        'analysis.query_result.copy_error_success': 'Copied',
        'analysis.query_result.copy_error_failed': 'Copy failed',
    })[key] || key}),
}));
jest.mock('antd', () => ({
    ...jest.requireActual('antd'),
    message: {success: jest.fn(), error: jest.fn()},
}));

test('shows a readable multiline query error with a copy action', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {writeText},
    });
    render(
        <GraphStatusView
            status='failed'
            message={'Syntax error\nline 2: unexpected token'}
        />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Query failed');
    const detail = document.querySelector('pre');
    expect(detail).toHaveTextContent('Syntax error line 2: unexpected token');
    expect(detail.textContent).toBe('Syntax error\nline 2: unexpected token');
    expect(detail).toHaveClass('failureMessage');
    expect(screen.getByText('Review the details and try again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Copy details'}));
    expect(writeText).toHaveBeenCalledWith('Syntax error\nline 2: unexpected token');
});


it('accepts data-driven loading details while keeping the loading image label textual', () => {
    const {rerender} = render(<GraphStatusView
        status='loading'
        message='Waiting for first character'
        details={<span aria-live='off'>Total elapsed 5 s</span>}
    />);
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for first character');
    expect(screen.getByText('Total elapsed 5 s')).toHaveAttribute('aria-live', 'off');
    expect(screen.getAllByAltText('Waiting for first character')).toHaveLength(2);
    expect(screen.getByRole('status').closest('div')).toHaveClass('loadingDetails');
    rerender(<GraphStatusView status='loading' message='Ordinary loading' />);
    expect(screen.getByText('Ordinary loading').closest('div')).not.toHaveClass('loadingDetails');
});
