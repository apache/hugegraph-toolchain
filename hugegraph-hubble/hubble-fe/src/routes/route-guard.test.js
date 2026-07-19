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

import {render, screen} from '@testing-library/react';
import {MemoryRouter, Outlet, useLocation} from 'react-router-dom';
import RouteList from './index';
import {isPdEnabled} from '../utils/config';

let mockCapabilities = new Set();

jest.mock('../pages/Datasource', () => () => <div>datasource page</div>);
jest.mock('../pages/Task', () => () => <div>task page</div>);
jest.mock('../pages/TaskEdit/index', () => () => <div>task edit page</div>);
jest.mock('../pages/TaskDetail', () => () => <div>task detail page</div>);
jest.mock('../pages/Schema', () => () => <div>schema page</div>);
jest.mock('../pages/Login', () => {
    const React = require('react');
    const {useLocation} = require('react-router-dom');

    return function MockLogin() {
        const location = useLocation();

        return React.createElement('div', null, `login:${location.pathname}${location.search}`);
    };
});
jest.mock('../pages/Graph', () => () => <div>graph page</div>);
jest.mock('../pages/GraphSpace', () => () => <div>graphspace page</div>);
jest.mock('../pages/Meta', () => () => <div>meta page</div>);
jest.mock('../pages/GraphDetail', () => () => <div>graph detail page</div>);
jest.mock('../pages/My', () => () => <div>my page</div>);
const mockAccountRender = jest.fn();
jest.mock('../pages/Account', () => () => {
    mockAccountRender();
    return <div>account page</div>;
});
jest.mock('../pages/Navigation', () => () => <div>navigation page</div>);
jest.mock('../pages/Error404', () => () => <div>not found page</div>);
jest.mock('../pages/Test', () => () => <div>test page</div>);
jest.mock('../pages/GraphAnalysis', () => () => <div>graph analysis page</div>);
jest.mock('../pages/AsyncTaskResult', () => () => <div>async task result page</div>);
jest.mock('../utils/config', () => ({
    isPdEnabled: jest.fn(() => false),
}));
jest.mock('../auth/AuthContext', () => ({
    useAuthContext: () => ({
        loading: false,
        hasCapability: capability => mockCapabilities.has(capability),
    }),
}));

const renderRoutes = initialEntry => {
    const TestLayout = () => {
        const location = useLocation();

        return (
            <div>
                <div>protected layout</div>
                <div data-testid='current-route'>
                    {location.pathname}{location.search}{location.hash}
                </div>
                <Outlet />
            </div>
        );
    };

    return render(
        <MemoryRouter
            initialEntries={[initialEntry]}
            future={{
                v7_relativeSplatPath: true,
                v7_startTransition: true,
            }}
        >
            <RouteList element={<TestLayout />} />
        </MemoryRouter>
    );
};

describe('route guard', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        mockAccountRender.mockClear();
        mockCapabilities = new Set();
        isPdEnabled.mockReturnValue(false);
    });

    it('redirects unauthenticated business route visits to login with the current URL', () => {
        renderRoutes('/task/edit?source=direct');

        expect(screen.getByText('login:/login?redirect=%2Ftask%2Fedit%3Fsource%3Ddirect'))
            .toBeTruthy();
        expect(screen.queryByText('task edit page')).toBeNull();
        expect(sessionStorage.getItem('redirect')).toBe('/task/edit?source=direct');
    });

    it('allows authenticated business route visits', () => {
        sessionStorage.setItem('user_', JSON.stringify({id: 'admin', user_nickname: 'admin'}));

        renderRoutes('/task/edit?source=direct');

        expect(screen.getByText('task edit page')).toBeTruthy();
        expect(screen.queryByText(/^login:/)).toBeNull();
    });

    it('keeps login route public', () => {
        renderRoutes('/login?redirect=%2Ftask%2Fedit');

        expect(screen.getByText('login:/login?redirect=%2Ftask%2Fedit')).toBeTruthy();
        expect(sessionStorage.getItem('redirect')).toBeNull();
    });

    it('renders the standard 404 surface for an unknown operations route', () => {
        sessionStorage.setItem('user_', JSON.stringify({
            id: 'admin',
            user_nickname: 'admin',
        }));

        renderRoutes('/operations/not-a-real-page');

        expect(screen.getByText('not found page')).toBeTruthy();
        expect(screen.queryByText('protected layout')).toBeTruthy();
    });

    it('redirects the legacy profile deep link to the semantic route', () => {
        sessionStorage.setItem('user_', JSON.stringify({id: 'admin'}));

        renderRoutes('/my?tab=security#password');

        expect(screen.getByText('my page')).toBeTruthy();
        expect(screen.getByTestId('current-route').textContent)
            .toBe('/profile?tab=security#password');
    });

    it.each(['/resource', '/role'])(
        'redirects unavailable legacy route %s to navigation',
        route => {
            sessionStorage.setItem('user_', JSON.stringify({
                id: 'admin',
                user_nickname: 'admin',
            }));

            renderRoutes(route);

            expect(screen.getByText('navigation page')).toBeTruthy();
            expect(screen.queryByText('not found page')).toBeNull();
        }
    );

    it('redirects the orphaned PD RoleAuth deep link to navigation', () => {
        isPdEnabled.mockReturnValue(true);
        sessionStorage.setItem('user_', JSON.stringify({
            id: 'admin',
            user_nickname: 'admin',
            is_superadmin: true,
        }));

        renderRoutes('/role/graphspace/DEFAULT/admin');

        expect(screen.getByText('navigation page')).toBeTruthy();
        expect(screen.queryByText('not found page')).toBeNull();
    });

    it('redirects an unprivileged PD account deep link before Account mounts', () => {
        isPdEnabled.mockReturnValue(true);
        sessionStorage.setItem('user_', JSON.stringify({
            id: 'viewer',
            user_nickname: 'viewer',
            is_superadmin: false,
            resSpaces: [{name: 'SPACE'}],
            adminSpaces: [],
        }));

        renderRoutes('/account');

        expect(screen.getByText('my page')).toBeTruthy();
        expect(screen.queryByText('account page')).toBeNull();
        expect(mockAccountRender).not.toHaveBeenCalled();
    });

    it('allows an authorized-space administrator to open the PD account route', () => {
        isPdEnabled.mockReturnValue(true);
        mockCapabilities.add('graphspace_members_manage');
        sessionStorage.setItem('user_', JSON.stringify({
            id: 'space-admin',
            user_nickname: 'space-admin',
            is_superadmin: false,
            adminSpaces: [{name: 'SPACE'}],
        }));

        renderRoutes('/account');

        expect(screen.getByText('account page')).toBeTruthy();
        expect(mockAccountRender).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['/graphspace', 'graphspace page'],
        ['/account', 'account page'],
        ['/graphspace/SPACE/schema', 'schema page'],
    ])('allows PD-only route %s when PD mode is enabled', (route, page) => {
        isPdEnabled.mockReturnValue(true);
        mockCapabilities.add('accounts_manage');
        mockCapabilities.add('graphspaces_read');
        sessionStorage.setItem('user_', JSON.stringify({
            id: 'admin',
            user_nickname: 'admin',
            is_superadmin: true,
        }));

        renderRoutes(route);

        expect(screen.getByText(page)).toBeTruthy();
        expect(screen.queryByText('not found page')).toBeNull();
    });

    it.each([
        ['/graphspace', 'graph page'],
        ['/account', 'my page'],
    ])('uses the non-PD fallback for %s', (route, page) => {
        sessionStorage.setItem('user_', JSON.stringify({
            id: 'admin',
            user_nickname: 'admin',
        }));

        renderRoutes(route);

        expect(screen.getByText(page)).toBeTruthy();
        expect(screen.queryByText('not found page')).toBeNull();
    });

    it('keeps the DEFAULT Schema template page available outside PD mode', () => {
        sessionStorage.setItem('user_', JSON.stringify({
            id: 'admin',
            user_nickname: 'admin',
        }));

        renderRoutes('/graphspace/DEFAULT/schema');

        expect(screen.getByText('schema page')).toBeTruthy();
        expect(screen.getByTestId('current-route').textContent)
            .toBe('/graphspace/DEFAULT/schema');
    });

    it('normalizes non-PD Schema template routes to DEFAULT', () => {
        sessionStorage.setItem('user_', JSON.stringify({
            id: 'admin',
            user_nickname: 'admin',
        }));

        renderRoutes('/graphspace/SPACE/schema');

        expect(screen.getByText('schema page')).toBeTruthy();
        expect(screen.getByTestId('current-route').textContent)
            .toBe('/graphspace/DEFAULT/schema');
    });

    it('ignores cached role fields when the context denies account access', () => {
        isPdEnabled.mockReturnValue(true);
        sessionStorage.setItem('user_', JSON.stringify({
            id: 'admin',
            is_superadmin: true,
            adminSpaces: ['SPACE'],
        }));

        renderRoutes('/account');

        expect(screen.getByText('my page')).toBeTruthy();
        expect(screen.queryByText('account page')).toBeNull();
    });

    it('allows non-PD account access only with the server capability', () => {
        mockCapabilities.add('accounts_manage');
        sessionStorage.setItem('user_', JSON.stringify({id: 'admin'}));

        renderRoutes('/account');

        expect(screen.getByText('account page')).toBeTruthy();
    });
});
