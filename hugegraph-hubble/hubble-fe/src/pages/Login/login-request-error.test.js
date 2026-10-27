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

import {replaceBrowserLocation} from '../../utils/browserNavigation';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {message} from 'antd';
import Login from './index';
import * as api from '../../api';
import enPages from '../../i18n/resources/en-US/modules/pages.json';
import zhPages from '../../i18n/resources/zh-CN/modules/pages.json';
import {ConfigConnectionContext} from '../../utils/ConfigConnectionContext';

jest.mock('../../utils/browserNavigation', () => ({replaceBrowserLocation: jest.fn()}));

jest.mock('../../api', () => ({
    auth: {
        login: jest.fn(),
    },
    config: {
        getConfig: jest.fn(),
    },
}));

jest.mock('../../utils/user', () => ({
    setUser: jest.fn(),
}));

jest.mock('../../utils/config', () => ({
    setConfig: jest.fn(),
}));

const userUtil = require('../../utils/user');
const configUtil = require('../../utils/config');

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: key => key,
        i18n: {
            changeLanguage: jest.fn(),
        },
    }),
}));

const submitLoginForm = async (redirect = '%2Fnavigation') => {
    render(
        <MemoryRouter
            initialEntries={[`/login?redirect=${redirect}`]}
            future={{
                v7_relativeSplatPath: true,
                v7_startTransition: true,
            }}
        >
            <Login />
        </MemoryRouter>
    );

    await userEvent.type(screen.getByPlaceholderText('login.username'), 'admin');
    await userEvent.type(screen.getByPlaceholderText('login.password'), 'bad-password');
    await userEvent.click(screen.getByRole('button', {name: 'login.submit'}));
};

describe('Login request errors', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
        window.matchMedia = jest.fn().mockImplementation(query => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: jest.fn(),
            removeListener: jest.fn(),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            dispatchEvent: jest.fn(),
        }));
        window.history.replaceState(null, '', '/login');
    });

    it('labels the standalone login page and its credential fields', () => {
        render(
            <MemoryRouter future={{v7_relativeSplatPath: true, v7_startTransition: true}}>
                <Login />
            </MemoryRouter>
        );

        expect(screen.getByRole('heading', {level: 1, name: /login.title/}))
            .toBeInTheDocument();
        expect(screen.getByRole('textbox', {name: 'login.username'}))
            .toBeInTheDocument();
        expect(screen.getByLabelText('login.password')).toHaveAttribute('type', 'password');
        expect(screen.getByRole('region', {name: 'login.brand_label'}))
            .toBeInTheDocument();
        expect(screen.getByText('login.subtitle')).toBeInTheDocument();
        expect(screen.getByRole('img', {name: 'Apache HugeGraph'}))
            .toBeInTheDocument();
        expect(screen.getByText('HugeGraph')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /language_switch/}))
            .toHaveTextContent('EN');
    });

    it('uses Hubble-specific sign-in copy in both languages', () => {
        expect(zhPages.login.title).toBe('登录 Hubble');
        expect(zhPages.login.subtitle).toBe('面向图技术爱好者的一站式分析平台');
        expect(zhPages.login.form_hint).toBe('用 HugeGraph 账号探索图可视化');
        expect(enPages.login.title).toBe('Sign in to Hubble');
        expect(enPages.login.subtitle)
            .toBe('A one-stop analysis platform for graph technology enthusiasts');
        expect(enPages.login.form_hint)
            .toBe('Use your HugeGraph account to explore graph visualization');
    });

    it('explains unverified connectivity, retries without submitting and retains credentials after recovery', async () => {
        const retry = jest.fn();
        const view = value => <MemoryRouter><ConfigConnectionContext.Provider value={value}>
            <Login />
        </ConfigConnectionContext.Provider></MemoryRouter>;
        const {rerender} = render(view({status: 'verified', retrying: false, retry}));
        await userEvent.type(screen.getByLabelText('login.username'), 'admin');
        await userEvent.type(screen.getByLabelText('login.password'), 'fixture-only');
        rerender(view({status: 'unverified', retrying: false, retry}));
        expect(screen.getByRole('status')).toHaveTextContent('login.connection.unverified_title');
        expect(screen.getByRole('button', {name: 'login.submit'})).toBeEnabled();
        expect(screen.getByLabelText('login.username')).toBeEnabled();
        expect(screen.getByLabelText('login.password')).toBeEnabled();
        await userEvent.click(screen.getByRole('button', {name: 'login.connection.retry'}));
        expect(retry).toHaveBeenCalledTimes(1);
        expect(api.auth.login).not.toHaveBeenCalled();
        rerender(view({status: 'verified', retrying: false, retry}));
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getByLabelText('login.username')).toHaveValue('admin');
        expect(screen.getByLabelText('login.password')).toHaveValue('fixture-only');
        expect(screen.getByRole('button', {name: 'login.submit'})).toBeEnabled();
    });

    it('can sign in while an anonymous capability probe stays unverified', async () => {
        api.auth.login.mockResolvedValue({status: 200, data: {user_name: 'admin'}});
        api.config.getConfig.mockResolvedValue({status: 200, data: {
            auth_enabled: true, server_capabilities_verified: false,
        }});
        render(<MemoryRouter><ConfigConnectionContext.Provider value={{status: 'unverified'}}>
            <Login />
        </ConfigConnectionContext.Provider></MemoryRouter>);

        await userEvent.type(screen.getByLabelText('login.username'), 'admin');
        await userEvent.type(screen.getByLabelText('login.password'), 'fixture-only');
        await userEvent.click(screen.getByRole('button', {name: 'login.submit'}));

        await waitFor(() => expect(api.auth.login).toHaveBeenCalledWith({
            user_name: 'admin', user_password: 'fixture-only',
        }));
        await waitFor(() => expect(replaceBrowserLocation).toHaveBeenCalledWith('/navigation'));
        expect(userUtil.setUser).toHaveBeenCalledWith({user_name: 'admin'});
    });

    it('keeps an unsuccessful credential attempt on the unverified login page', async () => {
        api.auth.login.mockRejectedValueOnce(new Error('credentials rejected'));
        render(<MemoryRouter><ConfigConnectionContext.Provider value={{status: 'unverified'}}>
            <Login />
        </ConfigConnectionContext.Provider></MemoryRouter>);
        await userEvent.type(screen.getByLabelText('login.username'), 'admin');
        await userEvent.type(screen.getByLabelText('login.password'), 'fixture-only');
        await userEvent.click(screen.getByRole('button', {name: 'login.submit'}));

        await waitFor(() => expect(api.auth.login).toHaveBeenCalledTimes(1));
        expect(replaceBrowserLocation).not.toHaveBeenCalled();
        expect(userUtil.setUser).not.toHaveBeenCalled();
        expect(screen.getByLabelText('login.password')).toHaveValue('fixture-only');
        expect(screen.getByRole('status')).toHaveTextContent('login.connection.unverified_title');
    });

    it('blocks sign-in only when connection settings are unavailable', async () => {
        const {container} = render(<MemoryRouter>
            <ConfigConnectionContext.Provider value={{status: 'unavailable'}}>
                <Login />
            </ConfigConnectionContext.Provider>
        </MemoryRouter>);

        expect(screen.getByRole('status')).toHaveTextContent('login.connection.unavailable_title');
        expect(screen.getByRole('button', {name: 'login.submit'})).toBeDisabled();
        expect(screen.getByLabelText('login.username')).toBeDisabled();
        expect(screen.getByLabelText('login.password')).toBeDisabled();
        await act(async () => { fireEvent.submit(container.querySelector('form')); });
        expect(api.auth.login).not.toHaveBeenCalled();
    });

    it('lets users choose a language before authentication', async () => {
        render(
            <MemoryRouter future={{v7_relativeSplatPath: true, v7_startTransition: true}}>
                <Login />
            </MemoryRouter>
        );

        expect(screen.queryByText('login.language')).not.toBeInTheDocument();
        const languageToggle = screen.getByRole('button', {name: /language_switch/});
        expect(languageToggle).toHaveTextContent('EN');
        await userEvent.click(languageToggle);

        expect(localStorage.getItem('languageType')).toBe('zh-CN');
    });

    it('defaults a fresh login to English without overwriting storage', () => {
        render(
            <MemoryRouter future={{v7_relativeSplatPath: true, v7_startTransition: true}}>
                <Login />
            </MemoryRouter>
        );

        expect(screen.getByRole('button', {name: /language_switch/}))
            .toHaveTextContent('EN');
        expect(localStorage.getItem('languageType')).toBeNull();
    });

    it('keeps rejected login requests from escaping the submit handler', async () => {
        const loginError = new Error('login failed');
        api.auth.login.mockRejectedValue(loginError);

        await submitLoginForm();

        await waitFor(() => {
            expect(api.auth.login).toHaveBeenCalledWith({
                user_name: 'admin',
                user_password: 'bad-password',
            });
        });
        expect(localStorage.getItem('user')).toBeNull();
        expect(replaceBrowserLocation).not.toHaveBeenCalled();
    });

    it('keeps rejected config requests from escaping after a successful login', async () => {
        api.auth.login.mockResolvedValue({
            status: 200,
            data: {
                user_name: 'admin',
            },
        });
        api.config.getConfig.mockRejectedValue(new Error('config failed'));

        await submitLoginForm();

        await waitFor(() => {
            expect(api.config.getConfig).toHaveBeenCalledTimes(1);
        });
        expect(localStorage.getItem('user')).toBe('admin');
        expect(userUtil.setUser).toHaveBeenCalledWith({
            user_name: 'admin',
        });
        expect(configUtil.setConfig).not.toHaveBeenCalled();
        expect(replaceBrowserLocation).toHaveBeenCalledWith('/navigation');
    });

    it('restores the full query and hash location after login', async () => {
        api.auth.login.mockResolvedValue({
            status: 200,
            data: {
                user_name: 'admin',
            },
        });
        api.config.getConfig.mockResolvedValue({status: 200, data: {}});

        await submitLoginForm(
            '%2Fgremlin%2FDEFAULT%2Fhugegraph%3Fx%3D1%23result'
        );

        await waitFor(() => {
            expect(replaceBrowserLocation).toHaveBeenCalledWith(
                '/gremlin/DEFAULT/hugegraph?x=1#result'
            );
        });
        expect(api.auth.login).toHaveBeenCalledTimes(1);
        expect(api.config.getConfig).toHaveBeenCalledTimes(1);
    });

    it('uses navigation for a plain login instead of a stale stored redirect', async () => {
        sessionStorage.setItem('redirect', '/operations/overview');
        api.auth.login.mockResolvedValue({
            status: 200,
            data: {user_name: 'admin'},
        });
        api.config.getConfig.mockResolvedValue({status: 200, data: {}});

        render(
            <MemoryRouter
                initialEntries={['/login']}
                future={{v7_startTransition: true, v7_relativeSplatPath: true}}
            >
                <Login />
            </MemoryRouter>
        );
        await userEvent.type(screen.getByPlaceholderText('login.username'), 'admin');
        await userEvent.type(screen.getByPlaceholderText('login.password'), 'password');
        await userEvent.click(screen.getByRole('button', {name: 'login.submit'}));

        await waitFor(() => expect(replaceBrowserLocation)
            .toHaveBeenCalledWith('/navigation'));
        expect(sessionStorage.getItem('redirect')).toBeNull();
    });
});

test('shows and consumes the password-change relogin notice', async () => {
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
    }));
    const success = jest.spyOn(message, 'success').mockImplementation(() => {});
    const replaceState = jest.spyOn(window.history, 'replaceState')
        .mockImplementation(() => {});

    render(
        <MemoryRouter
            initialEntries={[
                '/login?notice=credential-updated&redirect=%2Fnavigation',
            ]}
            future={{
                v7_relativeSplatPath: true,
                v7_startTransition: true,
            }}
        >
            <Login />
        </MemoryRouter>
    );

    await waitFor(() => expect(success).toHaveBeenCalledWith(
        'my.edit.password_changed_relogin'
    ));
    expect(replaceState).toHaveBeenCalledWith(
        window.history.state,
        '',
        '/login?redirect=%2Fnavigation'
    );
    success.mockRestore();
    replaceState.mockRestore();
});
