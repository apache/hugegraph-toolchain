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

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';

import * as api from '../../../api';
import ConsoleItem from './index';

const mockMessageError = jest.fn();

jest.mock('../../../api', () => ({
    auth: {
        getDashboard: jest.fn(),
    },
}));
jest.mock('antd', () => ({
    ...jest.requireActual('antd'),
    message: {error: (...args) => mockMessageError(...args)},
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));

beforeEach(() => {
    jest.clearAllMocks();
    window.fetch = jest.fn().mockResolvedValue({});
    window.open = jest.fn().mockReturnValue({
        close: jest.fn(),
        location: {replace: jest.fn()},
    });
    api.auth.getDashboard.mockResolvedValue({
        status: 200,
        data: {
            configured: true,
            address: '127.0.0.1:8092',
            protocol: 'http',
        },
    });
});

const renderConsole = () => render(
    <MemoryRouter
        future={{
            v7_relativeSplatPath: true,
            v7_startTransition: true,
        }}
    >
        <ConsoleItem />
    </MemoryRouter>
);

test('opens a configured and healthy Dashboard capability', async () => {
    renderConsole();

    const monitor = await screen.findByRole('button', {
        name: 'navigation_page.monitor_manage',
    });
    await waitFor(() => expect(monitor).toBeEnabled());
    fireEvent.click(monitor);

    await waitFor(() => expect(window.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8092/monitor/machine',
        expect.objectContaining({mode: 'no-cors'})
    ));
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
    await waitFor(() => expect(window.open.mock.results[0].value.location.replace)
        .toHaveBeenCalledWith('http://127.0.0.1:8092/monitor/machine'));
});

test('labels an unconfigured Dashboard instead of Coming Soon', async () => {
    api.auth.getDashboard.mockResolvedValue({
        status: 200,
        data: {configured: false},
    });
    renderConsole();

    const monitor = await screen.findByRole('button', {
        name: 'navigation_page.monitor_manage',
    });
    await waitFor(() => expect(monitor).toHaveAttribute(
        'title', 'navigation_page.dashboard_unconfigured'
    ));
    expect(screen.getAllByText('navigation_page.not_configured')).toHaveLength(4);
    expect(screen.queryByText('navigation_page.coming_soon')).not.toBeInTheDocument();
});

test('keeps a configured capability retryable after a health probe fails', async () => {
    window.fetch.mockRejectedValue(new Error('offline'));
    const popup = window.open();
    window.open.mockClear();
    renderConsole();

    const monitor = await screen.findByRole('button', {
        name: 'navigation_page.monitor_manage',
    });
    await waitFor(() => expect(monitor).toBeEnabled());
    fireEvent.click(monitor);

    await waitFor(() => expect(mockMessageError).toHaveBeenCalledWith(
        'navigation_page.dashboard_unavailable'
    ));
    expect(popup.close).toHaveBeenCalled();
    await waitFor(() => expect(monitor).toBeEnabled());
});

test('shows a diagnostic state when Dashboard configuration cannot be read', async () => {
    api.auth.getDashboard.mockRejectedValue(new Error('backend unavailable'));
    await act(async () => {
        renderConsole();
        await Promise.resolve();
    });

    const monitor = await screen.findByRole('button', {
        name: 'navigation_page.monitor_manage',
    });
    await waitFor(() => expect(monitor).toHaveAttribute(
        'title', 'navigation_page.dashboard_unavailable'
    ));
});
