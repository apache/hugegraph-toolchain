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

import {render, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Topbar from './index.ant';
import * as api from '../../api/index';

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
        t: key => key,
    }),
}));

jest.mock('@ant-design/icons', () => ({
    UserOutlined: () => <span>user icon</span>,
}));

jest.mock('antd', () => {
    const React = require('react');

    const Select = ({children, onChange, value}) => (
        <select
            value={value}
            onChange={event => onChange?.(event.target.value)}
        >
            {children}
        </select>
    );
    Select.Option = ({children, value}) => (
        <option value={value}>{children}</option>
    );

    return {
        Layout: {
            Header: ({children}) => <header>{children}</header>,
        },
        Space: ({children}) => <div>{children}</div>,
        Avatar: () => <span>avatar</span>,
        Dropdown: ({children}) => <div>{children}</div>,
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
        Modal: {
            confirm: jest.fn(),
        },
        Select,
    };
});

describe('Topbar request errors', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        api.manage.getGraphList.mockResolvedValue({status: 200, data: {records: []}});
        api.manage.getGraphSpaceList.mockResolvedValue({status: 200, data: {records: []}});
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('user_', JSON.stringify({id: 'admin', user_nickname: 'admin'}));
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
});
