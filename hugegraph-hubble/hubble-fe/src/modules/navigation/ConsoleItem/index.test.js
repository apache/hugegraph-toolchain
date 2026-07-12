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

import {render, screen} from '@testing-library/react';
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
        data: {address: '127.0.0.1:8092', protocol: 'http'},
    });
});

test('keeps unimplemented operations visibly disabled without loading Dashboard', () => {
    render(
        <MemoryRouter
            future={{
                v7_relativeSplatPath: true,
                v7_startTransition: true,
            }}
        >
            <ConsoleItem />
        </MemoryRouter>
    );

    const buttons = [
        'navigation_page.cluster_manage',
        'navigation_page.monitor_manage',
        'navigation_page.node_manage',
        'navigation_page.alert_manage',
    ].map(name => screen.getByRole('button', {name}));

    buttons.forEach(button => {
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('title', 'navigation_page.coming_soon');
    });
    expect(api.auth.getDashboard).not.toHaveBeenCalled();
    expect(window.fetch).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
});
