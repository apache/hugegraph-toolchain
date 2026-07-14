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

import NavigationHome from './index';
import {isPdEnabled} from '../../../utils/config';

let mockAuthContext;

jest.mock('../../../utils/config', () => ({
    isPdEnabled: jest.fn(),
}));
jest.mock('../../../auth/AuthContext', () => ({
    useAuthContext: () => mockAuthContext,
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({t: key => key}),
}));
jest.mock('../AdminItem', () => () => <div>admin-support</div>);
jest.mock('../ConsoleItem', () => () => <div>operations-support</div>);

const renderHome = () => render(
    <MemoryRouter
        future={{
            v7_relativeSplatPath: true,
            v7_startTransition: true,
        }}
    >
        <NavigationHome />
    </MemoryRouter>
);

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockAuthContext = {context: {capabilities: []}};
});

test('uses DEFAULT graph context and hides PD-only support in non-PD mode', () => {
    isPdEnabled.mockReturnValue(false);
    renderHome();

    expect(screen.getByRole('link', {
        name: /home\.workbench\.journeys\.understand\.primary/,
    })).toHaveAttribute('href', '/graphspace/DEFAULT');
    expect(screen.getByText('home.workbench.mode.non_pd')).toBeInTheDocument();
    expect(screen.getByRole('heading', {
        name: 'home.workbench.title',
    })).toBeInTheDocument();
    expect(screen.queryByAltText('Apache HugeGraph')).not.toBeInTheDocument();
    expect(screen.queryByText('admin-support')).not.toBeInTheDocument();
    expect(screen.queryByText('operations-support')).not.toBeInTheDocument();
});

test('ships every rendered secondary action in both languages', () => {
    const zh = require('../../../i18n/resources/zh-CN/modules/home.json');
    const en = require('../../../i18n/resources/en-US/modules/home.json');

    expect(zh.home.workbench.journeys.prepare.secondary_2).toBe('查看导入任务');
    expect(en.home.workbench.journeys.prepare.secondary_2).toBe('View import tasks');
    expect(zh.home.workbench.journeys.prepare.secondary_1).toBe('导入数据源');
    expect(en.home.workbench.journeys.prepare.secondary_1).toBe('Import data sources');
    expect(zh.home.workbench.journeys.query.secondary_2).toBe('查看异步任务');
    expect(en.home.workbench.journeys.query.secondary_2).toBe('View async tasks');
    expect(zh.home.workbench.intro).toBe('Hubble 面向图可视化人群');
    expect(en.home.workbench.intro).toBe(
        'Hubble is designed for graph visualization users'
    );
    expect(zh.home.workbench.mode.pd).toBe('PD / 集群模式');
    expect(en.home.workbench.mode.pd).toBe('PD / cluster mode');
    expect(zh.home.workbench.journeys.understand.primary)
        .toBe('查看图空间和图');
    expect(en.home.workbench.journeys.understand.primary)
        .toBe('View GraphSpaces and graphs');
});

test('uses the same journey names as the global navigation in both languages', () => {
    const zhHome = require('../../../i18n/resources/zh-CN/modules/home.json');
    const enHome = require('../../../i18n/resources/en-US/modules/home.json');
    const zhCommon = require('../../../i18n/resources/zh-CN/components/common.json');
    const enCommon = require('../../../i18n/resources/en-US/components/common.json');

    expect(zhHome.home.workbench.journeys.understand.title).toBe('图概览');
    expect(zhHome.home.workbench.journeys.prepare.title).toBe('图导入');
    expect(zhHome.home.workbench.journeys.query.title).toBe('图查询');
    expect(enHome.home.workbench.journeys.understand.title).toBe('Graph Overview');
    expect(enHome.home.workbench.journeys.prepare.title).toBe('Graph Import');
    expect(enHome.home.workbench.journeys.query.title).toBe('Graph Query');
    expect(zhCommon.workbench.nav.understand).toBe('图概览');
    expect(zhCommon.workbench.nav.prepare).toBe('图导入');
    expect(zhCommon.workbench.nav.query).toBe('图查询');
    expect(enCommon.workbench.nav.understand).toBe('Graph Overview');
    expect(enCommon.workbench.nav.prepare).toBe('Graph Import');
    expect(enCommon.workbench.nav.query).toBe('Graph Query');
    expect(zhCommon.workbench.nav.home).toBe('首页');
    expect(enCommon.workbench.nav.home).toBe('Home');
});

test('orders graph import before graph query in the main journey', () => {
    isPdEnabled.mockReturnValue(false);
    renderHome();

    const queryTitle = screen.getByText('home.workbench.journeys.query.title');
    const importTitle = screen.getByText('home.workbench.journeys.prepare.title');
    expect(importTitle.compareDocumentPosition(queryTitle)
        & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('keeps GraphSpace and support capabilities available to a PD superadmin', () => {
    isPdEnabled.mockReturnValue(true);
    mockAuthContext = {
        context: {
            capabilities: [
                'accounts_manage',
                'operations_health_read',
            ],
        },
    };
    renderHome();

    expect(screen.getByRole('link', {
        name: /home\.workbench\.journeys\.understand\.primary/,
    })).toHaveAttribute('href', '/graphspace');
    expect(screen.getByText('admin-support')).toBeInTheDocument();
    expect(screen.getByText('operations-support')).toBeInTheDocument();
});

test('renders only account support for scoped space administrators', () => {
    isPdEnabled.mockReturnValue(true);
    mockAuthContext = {
        context: {capabilities: ['graphspace_members_manage']},
    };

    renderHome();

    expect(screen.getByText('admin-support')).toBeInTheDocument();
    expect(screen.queryByText('operations-support')).not.toBeInTheDocument();
});

test('renders Operations support for non-PD admins from server capability', () => {
    isPdEnabled.mockReturnValue(false);
    mockAuthContext = {
        context: {capabilities: ['operations_health_read']},
    };

    renderHome();

    expect(screen.queryByText('admin-support')).not.toBeInTheDocument();
    expect(screen.getByText('operations-support')).toBeInTheDocument();
});

test('exposes every journey action as a real route link', () => {
    isPdEnabled.mockReturnValue(true);
    renderHome();

    const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining([
        '/graphspace',
        '/source',
        '/task',
        '/gremlin',
        '/algorithms',
        '/asyncTasks',
    ]));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('starts the preparation journey at the current PD Schema', () => {
    isPdEnabled.mockReturnValue(true);
    localStorage.setItem('hubble_workbench_graph_context', JSON.stringify({
        graphspace: 'space-a',
        graph: 'graph-a',
    }));

    renderHome();

    expect(screen.getByRole('link', {
        name: /home\.workbench\.journeys\.prepare\.primary/,
    })).toHaveAttribute('href', '/graphspace/space-a/schema');
});
