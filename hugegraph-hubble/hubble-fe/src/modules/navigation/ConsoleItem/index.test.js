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
import itemStyle from '../Item/index.module.scss';
import {useOperationsCapabilities} from '../../../pages/Operations/capabilities';

const mockMessageError = jest.fn();

jest.mock('../../../api', () => ({
    auth: {
        getDashboard: jest.fn(),
    },
}));
jest.mock('../../../pages/Operations/capabilities', () => ({
    useOperationsCapabilities: jest.fn(),
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
            available: true,
            address: '127.0.0.1:8092',
            protocol: 'http',
        },
    });
    useOperationsCapabilities.mockReturnValue({
        loading: false,
        capabilities: [
            'operations_health_read',
            'operations_topology_read',
            'operations_metrics_read',
        ],
        error: null,
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
        name: 'navigation_page.advanced_monitoring',
    });
    await waitFor(() => expect(monitor).toBeEnabled());
    fireEvent.click(monitor);

    expect(window.open).toHaveBeenCalledWith(
        'http://127.0.0.1:8092/monitor/machine',
        '_blank',
        'noopener,noreferrer'
    );
});

test('links native operations independently of the optional Dashboard', async () => {
    api.auth.getDashboard.mockResolvedValue({
        status: 200,
        data: {configured: false},
    });
    renderConsole();

    expect(await screen.findByRole('button', {
        name: 'navigation_page.cluster_overview',
    })).toHaveAttribute('data-url', '/operations/overview');
    expect(screen.getByRole('button', {
        name: 'navigation_page.nodes',
    })).toHaveAttribute('data-url', '/operations/nodes');
    expect(screen.getByRole('button', {
        name: 'navigation_page.alert_manage',
    })).toHaveTextContent('navigation_page.coming_soon');
    expect(screen.getByRole('group', {
        name: 'navigation_page.alert_manage, navigation_page.coming_soon',
    })).toHaveAttribute('tabindex', '0');
});

test('labels an unconfigured Dashboard instead of Coming Soon', async () => {
    api.auth.getDashboard.mockResolvedValue({
        status: 200,
        data: {configured: false},
    });
    renderConsole();

    const monitor = await screen.findByRole('button', {
        name: 'navigation_page.advanced_monitoring',
    });
    await waitFor(() => expect(monitor).toHaveAttribute(
        'title', expect.stringContaining('navigation_page.dashboard_external_context')
    ));
    expect(screen.getAllByText('navigation_page.not_configured')).toHaveLength(1);
    expect(screen.getByText('navigation_page.coming_soon')).toBeInTheDocument();
});

test('describes Dashboard as an optional external monitoring entry', () => {
    const zh = require('../../../i18n/resources/zh-CN/modules/pages.json');
    const en = require('../../../i18n/resources/en-US/modules/pages.json');

    expect(zh.navigation_page.advanced_monitoring).toBe('外部高级 Dashboard');
    expect(en.navigation_page.advanced_monitoring).toBe('External Advanced Dashboard');
    expect(zh.navigation_page.dashboard_external_context).toContain('不影响');
    expect(en.navigation_page.dashboard_external_context).toContain('does not affect');
});

test('disables a configured but unavailable Dashboard capability', async () => {
    api.auth.getDashboard.mockResolvedValue({
        status: 200,
        data: {
            configured: true,
            available: false,
            address: '127.0.0.1:8092',
            protocol: 'http',
        },
    });
    renderConsole();

    const monitor = await screen.findByRole('button', {
        name: 'navigation_page.advanced_monitoring',
    });
    await waitFor(() => expect(monitor).toHaveAttribute(
        'title', expect.stringContaining('navigation_page.dashboard_external_context')
    ));
    expect(monitor).toHaveAttribute(
        'title', expect.stringContaining('navigation_page.dashboard_unavailable')
    );
    expect(monitor).toBeDisabled();
    expect(screen.getAllByText('navigation_page.unavailable')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveClass(itemStyle.reason);
    expect(screen.getByRole('status')).toHaveTextContent(
        'navigation_page.dashboard_external_context'
    );
    expect(screen.getByRole('status')).toHaveTextContent(
        'navigation_page.dashboard_unavailable'
    );
    expect(screen.getByText('navigation_page.coming_soon')).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
});

test('shows a diagnostic state when Dashboard configuration cannot be read', async () => {
    api.auth.getDashboard.mockRejectedValue(new Error('backend unavailable'));
    await act(async () => {
        renderConsole();
        await Promise.resolve();
    });

    const monitor = await screen.findByRole('button', {
        name: 'navigation_page.advanced_monitoring',
    });
    await waitFor(() => expect(monitor).toHaveAttribute(
        'title', expect.stringContaining('navigation_page.dashboard_external_context')
    ));
    expect(monitor).toHaveAttribute(
        'title', expect.stringContaining('navigation_page.dashboard_unavailable')
    );
    expect(screen.getByRole('status')).toHaveTextContent(
        'navigation_page.dashboard_external_context'
    );
    expect(screen.getByRole('status')).toHaveTextContent(
        'navigation_page.dashboard_unavailable'
    );
});
