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

import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import App from './App';
import * as api from './api';

jest.mock('./api', () => ({
    config: {
        getConfig: jest.fn(),
    },
}));

jest.mock('./routes', () => ({element}) => {
    const {status, retrying, retry} = jest.requireActual('./utils/ConfigConnectionContext')
        .useConfigConnection();
    return (
    <div
        data-testid="app-route"
        data-connection-status={status}
        data-retrying={String(retrying)}
        data-auth-enabled={String(
            jest.requireActual('./utils/config').isAuthEnabled()
        )}
    >
        {element}
        <input aria-label="unsaved draft" />
        <button type='button' onClick={retry}>Retry connection</button>
    </div>
    );
});

jest.mock('react-i18next', () => ({useTranslation: () => ({t: key => key,
    i18n: {changeLanguage: jest.fn()}})}));

beforeEach(() => {
    api.config.getConfig.mockReset();
    sessionStorage.clear();
    window.matchMedia = jest.fn(() => ({matches: false,
        addListener: jest.fn(), removeListener: jest.fn()}));
});
afterEach(() => jest.useRealTimers());

jest.mock('./layout.ant', () => () => <div>Hubble layout</div>);
jest.mock('./auth/AuthContext', () => ({
    AuthContextProvider: ({children}) => children,
}));

test('wires the Hubble layout into the application router', async () => {
    sessionStorage.clear();
    api.config.getConfig.mockResolvedValue({
        status: 200,
        data: {pd_enabled: false, auth_enabled: false},
    });
    render(
        <MemoryRouter
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <App />
        </MemoryRouter>
    );
    expect(await screen.findByTestId('app-route')).toBeInTheDocument();
    expect(screen.getByText('Hubble layout')).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem('hubble_config_'))).toEqual({pd_enabled: false, auth_enabled: false});
});

test('shows a retry surface when configuration bootstrap fails', async () => {
    api.config.getConfig.mockRejectedValue(new Error('offline'));

    render(
        <MemoryRouter
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <App />
        </MemoryRouter>
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
        'login.connection.unavailable_title'
    );
    expect(screen.getByRole('button', {name: 'login.connection.retry'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'login.submit'})).toBeDisabled();
});

test('revalidates fail-closed server capabilities until verified', async () => {
    jest.useFakeTimers();
    sessionStorage.setItem('user_', JSON.stringify({user_name: 'admin'}));
    localStorage.setItem('user', 'admin');
    api.config.getConfig
        .mockResolvedValueOnce({
            status: 200,
            data: {
                pd_enabled: false,
                auth_enabled: true,
                server_capabilities_verified: false,
            },
        })
        .mockResolvedValueOnce({
            status: 200,
            data: {
                pd_enabled: false,
                auth_enabled: false,
                server_capabilities_verified: true,
            },
        });

    render(
        <MemoryRouter
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <App />
        </MemoryRouter>
    );
    expect(await screen.findByTestId('app-route')).toBeInTheDocument();
    expect(screen.getByTestId('app-route'))
        .toHaveAttribute('data-auth-enabled', 'true');

    await act(async () => {
        jest.advanceTimersByTime(2000);
    });
    await waitFor(() => expect(api.config.getConfig).toHaveBeenCalledTimes(2));
    expect(JSON.parse(sessionStorage.getItem('hubble_config_')))
        .toMatchObject({
            auth_enabled: false,
            server_capabilities_verified: true,
        });
    expect(screen.getByTestId('app-route'))
        .toHaveAttribute('data-auth-enabled', 'false');
    expect(sessionStorage.getItem('user_')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    jest.useRealTimers();
});

test('continues revalidation after a transient retry failure', async () => {
    jest.useFakeTimers();
    api.config.getConfig
        .mockResolvedValueOnce({
            status: 200,
            data: {
                pd_enabled: true,
                auth_enabled: true,
                server_capabilities_verified: false,
            },
        })
        .mockRejectedValueOnce(new Error('temporarily unavailable'))
        .mockResolvedValueOnce({
            status: 200,
            data: {
                pd_enabled: true,
                auth_enabled: false,
                server_capabilities_verified: true,
            },
        });

    render(
        <MemoryRouter
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <App />
        </MemoryRouter>
    );
    expect(await screen.findByTestId('app-route')).toHaveAttribute(
        'data-auth-enabled', 'true'
    );

    await act(async () => {
        jest.advanceTimersByTime(2000);
    });
    await waitFor(() => expect(api.config.getConfig).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-route')).toHaveAttribute(
        'data-auth-enabled', 'true'
    );

    await act(async () => {
        jest.advanceTimersByTime(2000);
    });
    await waitFor(() => expect(api.config.getConfig).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId('app-route')).toHaveAttribute(
        'data-auth-enabled', 'false'
    );
    jest.useRealTimers();
});

test('periodically revalidates a verified authentication mode', async () => {
    jest.useFakeTimers();
    api.config.getConfig
        .mockResolvedValueOnce({
            status: 200,
            data: {
                pd_enabled: true,
                auth_enabled: false,
                server_capabilities_verified: true,
            },
        })
        .mockResolvedValueOnce({
            status: 200,
            data: {
                pd_enabled: true,
                auth_enabled: true,
                server_capabilities_verified: true,
            },
        });

    render(
        <MemoryRouter
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <App />
        </MemoryRouter>
    );
    expect(await screen.findByTestId('app-route')).toHaveAttribute(
        'data-auth-enabled', 'false'
    );

    await act(async () => {
        jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(api.config.getConfig).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('app-route')).toHaveAttribute(
        'data-auth-enabled', 'true'
    );
    jest.useRealTimers();
});

test('preserves route state when periodic configuration is unchanged', async () => {
    jest.useFakeTimers();
    const config = {
        pd_enabled: true,
        auth_enabled: true,
        graph_create_enabled: true,
        cypher_enabled: true,
        server_capabilities_verified: true,
    };
    api.config.getConfig
        .mockResolvedValueOnce({status: 200, data: config})
        .mockResolvedValueOnce({status: 200, data: {...config}});

    render(
        <MemoryRouter
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <App />
        </MemoryRouter>
    );
    const draft = await screen.findByRole('textbox', {
        name: 'unsaved draft',
    });
    fireEvent.change(draft, {target: {value: 'keep me'}});

    await act(async () => {
        jest.advanceTimersByTime(30_000);
    });
    await waitFor(() => expect(api.config.getConfig).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('textbox', {name: 'unsaved draft'}))
        .toHaveValue('keep me');
    jest.useRealTimers();
});

test.each(['manual', 'poll'])('manual verification deduplicates %s requests and preserves route drafts', async trigger => {
    jest.useFakeTimers();
    const config = {auth_enabled: true, server_capabilities_verified: false};
    let completeRetry;
    api.config.getConfig.mockResolvedValueOnce({status: 200, data: config})
        .mockImplementationOnce(() => new Promise(resolve => { completeRetry = resolve; }))
        .mockResolvedValue({status: 200, data: {...config, server_capabilities_verified: true}});
    render(<MemoryRouter><App /></MemoryRouter>);
    const route = await screen.findByTestId('app-route');
    const draft = screen.getByRole('textbox', {name: 'unsaved draft'});
    fireEvent.change(draft, {target: {value: 'keep my input'}});
    expect(route).toHaveAttribute('data-connection-status', 'unverified');
    if (trigger === 'poll') await act(async () => { jest.advanceTimersByTime(2000); });
    fireEvent.click(screen.getByRole('button', {name: 'Retry connection'}));
    fireEvent.click(screen.getByRole('button', {name: 'Retry connection'}));
    expect(api.config.getConfig).toHaveBeenCalledTimes(2);
    expect(route).toHaveAttribute('data-retrying', 'true');
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(api.config.getConfig).toHaveBeenCalledTimes(2);
    await act(async () => { completeRetry({status: 200,
        data: {...config, server_capabilities_verified: true}}); });
    expect(route).toHaveAttribute('data-connection-status', 'verified');
    expect(screen.getByRole('textbox', {name: 'unsaved draft'})).toHaveValue('keep my input');
    await act(async () => { jest.advanceTimersByTime(29_999); });
    expect(api.config.getConfig).toHaveBeenCalledTimes(2);
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(api.config.getConfig).toHaveBeenCalledTimes(3);
});

test('initial pending configuration does not flash cached anonymous routes or a connection warning', async () => {
    sessionStorage.setItem('hubble_config_', JSON.stringify({auth_enabled: false}));
    let complete;
    api.config.getConfig.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const {unmount} = render(<MemoryRouter><App /></MemoryRouter>);
    expect(screen.queryByTestId('app-route')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    unmount();
    await act(async () => { complete({status: 200,
        data: {auth_enabled: true, server_capabilities_verified: true}}); });
    expect(JSON.parse(sessionStorage.getItem('hubble_config_'))).toEqual({auth_enabled: false});
});

test('partial anonymous configuration stays fail closed until verification completes', async () => {
    api.config.getConfig.mockResolvedValue({status: 200,
        data: {auth_enabled: false, server_capabilities_verified: false}});
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(await screen.findByTestId('app-route')).toHaveAttribute('data-auth-enabled', 'true');
});
