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

import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import Login from './index';
import * as api from '../../api';
import enPages from '../../i18n/resources/en-US/modules/pages.json';
import zhPages from '../../i18n/resources/zh-CN/modules/pages.json';

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
        delete window.location;
        window.location = {
            origin: 'http://localhost',
            replace: jest.fn(),
        };
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
        expect(window.location.replace).not.toHaveBeenCalled();
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
        expect(window.location.replace).toHaveBeenCalledWith('/navigation');
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
            expect(window.location.replace).toHaveBeenCalledWith(
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

        await waitFor(() => expect(window.location.replace)
            .toHaveBeenCalledWith('/navigation'));
        expect(sessionStorage.getItem('redirect')).toBeNull();
    });
});
