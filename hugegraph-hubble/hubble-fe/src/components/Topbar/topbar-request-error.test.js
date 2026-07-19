/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Topbar from './index.ant';
import * as api from '../../api/index';

const mockUseAuthContext = jest.fn();

jest.mock('../../auth/AuthContext', () => ({
    useAuthContext: () => mockUseAuthContext(),
}));

jest.mock('../../api/index', () => ({
    auth: {
        status: jest.fn(),
        logout: jest.fn(),
    },
    manage: {
        getGraphList: jest.fn(() => Promise.resolve({status: 200, data: {records: []}})),
        getGraphSpaceList: jest.fn(() => Promise.resolve({status: 200, data: {records: []}})),
    },
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, values) => (values?.name ? `${key}: ${values.name}` : key),
        i18n: {changeLanguage: jest.fn()},
    }),
}));

jest.mock('@ant-design/icons', () => ({
    UserOutlined: () => <span>user icon</span>,
    QuestionCircleOutlined: () => <span>question icon</span>,
}));

jest.mock('antd', () => {
    const React = require('react');

    const Select = ({children, onChange, value}) => (
        <select value={value} onChange={event => onChange?.(event.target.value)}>
            {children}
        </select>
    );
    Select.Option = ({children, value}) => <option value={value}>{children}</option>;
    const Radio = {
        Group: ({options = [], onChange, value, 'aria-label': ariaLabel}) => (
            <div role='radiogroup' aria-label={ariaLabel}>
                {options.map(option => (
                    <label key={option.value}>
                        <input
                            type='radio'
                            value={option.value}
                            checked={value === option.value}
                            onChange={onChange}
                        />
                        {option.label}
                    </label>
                ))}
            </div>
        ),
    };

    return {
        Layout: {
            Header: ({children}) => <header>{children}</header>,
        },
        Space: ({children}) => <div>{children}</div>,
        Avatar: ({children, ...props}) => <span {...props}>{children}</span>,
        Button: ({children, icon, ...props}) => <button {...props}>{icon}{children}</button>,
        Dropdown: ({children, menu, trigger}) => (
            <div data-testid='user-dropdown' data-trigger={trigger?.join(',')}>
                {children}
                {menu?.items?.map(item => (
                    <button
                        key={item.key}
                        type='button'
                        onClick={() => menu.onClick({key: item.key})}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        ),
        Menu: ({items}) => (
            <div>
                {items?.map(item => (
                    <span key={item.key}>{item.label}</span>
                ))}
            </div>
        ),
        message: {
            success: jest.fn(),
        },
        Select,
        Radio,
    };
});

describe('Topbar request errors', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        api.manage.getGraphList.mockResolvedValue({
            status: 200,
            data: {records: [{name: 'hugegraph'}]},
        });
        api.manage.getGraphSpaceList.mockResolvedValue({
            status: 200,
            data: {records: [{name: 'DEFAULT'}]},
        });
        localStorage.clear();
        sessionStorage.clear();
        delete window.location;
        window.location = {
            href: 'http://localhost/navigation',
            replace: jest.fn(),
        };
        sessionStorage.setItem('user_', JSON.stringify({id: 'admin', user_nickname: 'admin'}));
        mockUseAuthContext.mockReturnValue({context: {role: 'SUPERADMIN'}});
    });

    it('catches rejected auth status checks from the request layer', async () => {
        const catchHandler = jest.fn();
        api.auth.status.mockReturnValue({
            then: jest.fn(() => ({
                catch: catchHandler,
            })),
        });

        render(
            <MemoryRouter
                initialEntries={['/navigation']}
                future={{
                    v7_relativeSplatPath: true,
                    v7_startTransition: true,
                }}
            >
                <Topbar />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(api.auth.status).toHaveBeenCalledTimes(1);
        });
        expect(catchHandler).toHaveBeenCalledTimes(1);
    });

    it('preserves query and hash when auth status expires', async () => {
        api.auth.status.mockResolvedValue({status: 401});
        localStorage.setItem('user', 'admin');
        localStorage.setItem(
            'hubble.algorithm.v1.admin.DEFAULT.hugegraph.K-out',
            '{"source":"1:marko"}'
        );

        render(
            <MemoryRouter
                initialEntries={['/gremlin/DEFAULT/hugegraph?tab=graph#result']}
                future={{
                    v7_relativeSplatPath: true,
                    v7_startTransition: true,
                }}
            >
                <Topbar />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(sessionStorage.getItem('redirect')).toBe(
                '/gremlin/DEFAULT/hugegraph?tab=graph#result'
            );
        });
        expect(localStorage.getItem(
            'hubble.algorithm.v1.admin.DEFAULT.hugegraph.K-out'
        )).toBeNull();
    });

    it('localizes the built-in admin nickname instead of leaking Chinese', async () => {
        sessionStorage.setItem('user_', JSON.stringify({
            id: 'admin',
            user_name: 'admin',
            user_nickname: '超级管理员',
        }));
        api.auth.status.mockResolvedValue({status: 200});

        render(
            <MemoryRouter
                initialEntries={['/navigation']}
                future={{v7_startTransition: true, v7_relativeSplatPath: true}}
            >
                <Topbar />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByRole('option', {
                name: 'DEFAULT',
            })).toBeInTheDocument();
        });

        expect(screen.queryByText('超级管理员')).not.toBeInTheDocument();
        expect(screen.getByLabelText('超级管理员')).toHaveTextContent('超员');
        expect(screen.getByRole('link', {name: 'workbench.back_home'}))
            .toHaveAttribute('href', '/navigation');
        expect(screen.queryByText('超级管理员')).not.toBeInTheDocument();
        expect(screen.getByRole('button', {name: /language_switch/}))
            .toHaveTextContent('EN');
        expect(screen.queryByText('中')).not.toBeInTheDocument();
        expect(screen.getByRole('button', {
            name: 'workbench.shortcuts.open_button',
        })).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /Topbar.user_menu/}))
            .toHaveAttribute('aria-haspopup', 'menu');
        expect(screen.getByRole('button', {name: /超级管理员/}))
            .toHaveAttribute('title', '超级管理员');
        expect(screen.getByTestId('user-dropdown'))
            .toHaveAttribute('data-trigger', 'click');
    });

    it('does not infer a superadmin label from the cached username', async () => {
        sessionStorage.setItem('user_', JSON.stringify({
            id: 'admin',
            user_name: 'admin',
            user_nickname: '超级管理员',
        }));
        mockUseAuthContext.mockReturnValue({context: {role: 'USER'}});
        api.auth.status.mockResolvedValue({status: 200});

        render(
            <MemoryRouter
                initialEntries={['/navigation']}
                future={{v7_startTransition: true, v7_relativeSplatPath: true}}
            >
                <Topbar />
            </MemoryRouter>
        );

        expect(await screen.findByLabelText('超级管理员')).toHaveTextContent('超员');
        expect(screen.queryByText('超级管理员')).not.toBeInTheDocument();
        expect(screen.queryByText('Topbar.super_admin')).not.toBeInTheDocument();
    });

    it('links the account menu to the real personal profile route', () => {
        api.auth.status.mockResolvedValue({status: 200});

        render(
            <MemoryRouter
                initialEntries={['/navigation']}
                future={{v7_startTransition: true, v7_relativeSplatPath: true}}
            >
                <Topbar />
            </MemoryRouter>
        );

        expect(screen.getByRole('link', {name: 'workbench.page.profile'}))
            .toHaveAttribute('href', '/profile');
    });

    it('logs out immediately without a confirmation dialog', async () => {
        api.auth.status.mockResolvedValue({status: 200});
        api.auth.logout.mockResolvedValue({status: 200});

        render(
            <MemoryRouter
                initialEntries={['/navigation']}
                future={{v7_startTransition: true, v7_relativeSplatPath: true}}
            >
                <Topbar />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', {name: 'Topbar.exit.name'}));

        await waitFor(() => expect(api.auth.logout).toHaveBeenCalledTimes(1));
        expect(window.location.replace).toHaveBeenCalledWith('/login');
    });
});
