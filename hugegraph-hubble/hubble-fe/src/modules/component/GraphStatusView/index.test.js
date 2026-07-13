/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import {fireEvent, render, screen} from '@testing-library/react';
import GraphStatusView from './index';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => ({
        'analysis.query_result.query_failed_title': 'Query failed',
        'analysis.query_result.retry_action': 'Check the statement and try again.',
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
    expect(screen.getByText('Check the statement and try again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Copy details'}));
    expect(writeText).toHaveBeenCalledWith('Syntax error\nline 2: unexpected token');
});
