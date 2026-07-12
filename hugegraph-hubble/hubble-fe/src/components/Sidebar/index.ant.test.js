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
import {MemoryRouter} from 'react-router-dom';
import Sidebar from './index.ant';
import '../../i18n';

beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('user_', JSON.stringify({
        id: 'admin',
        user_nickname: 'admin',
        is_superadmin: false,
    }));
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));
});

test('exposes the application menu as named primary navigation', async () => {
    render(
        <MemoryRouter
            initialEntries={['/gremlin/DEFAULT/hugegraph']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    const navigation = await screen.findByRole('navigation', {name: '主导航'});
    expect(screen.getByText('理解图')).toBeInTheDocument();
    expect(screen.getByText('准备数据')).toBeInTheDocument();
    expect(screen.getByText('查询与分析')).toBeInTheDocument();
    expect(screen.getByText('系统与运维')).toBeInTheDocument();
    expect(navigation).toContainElement(screen.getByRole('link', {name: '图语言分析'}));
    expect(screen.getByRole('link', {name: '图 Schema'})).toHaveAttribute(
        'href', '/graphspace/DEFAULT/graph/hugegraph/meta'
    );
    expect(screen.queryByRole('link', {name: '账号管理'})).not.toBeInTheDocument();
    await waitFor(() => expect(navigation).toBeVisible());
});

test('highlights the dedicated Schema entry on its PD route', async () => {
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));

    render(
        <MemoryRouter
            initialEntries={['/graphspace/SPACE/schema']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    expect((await screen.findByRole('link', {name: 'Schema 模板'})).closest('li'))
        .toHaveClass('ant-menu-item-selected');
    expect(screen.getByRole('link', {name: '图管理'}).closest('li'))
        .not.toHaveClass('ant-menu-item-selected');
});

test('keeps graph metadata under Understand graph in non-PD mode', async () => {
    render(
        <MemoryRouter
            initialEntries={['/graphspace/DEFAULT/graph/hugegraph/meta']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    expect((await screen.findByRole('link', {name: '图管理'})).closest('li'))
        .toHaveClass('ant-menu-item-selected');
    expect(screen.getByRole('link', {name: '图 Schema'}).closest('li'))
        .not.toHaveClass('ant-menu-item-selected');
});

test.each([
    [true, '/gremlin/SPACE_NEW/GRAPH_NEW', 'Schema 模板',
        '/graphspace/SPACE_NEW/schema'],
    [false, '/gremlin/DEFAULT/GRAPH_NEW', '图 Schema',
        '/graphspace/DEFAULT/graph/GRAPH_NEW/meta'],
])('prefers route context for the preparation Schema entry', async (
    pdEnabled, route, name, expected
) => {
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: pdEnabled}));
    localStorage.setItem('hubble_workbench_graph_context', JSON.stringify({
        graphspace: pdEnabled ? 'SPACE_OLD' : 'DEFAULT',
        graph: 'GRAPH_OLD',
    }));

    render(
        <MemoryRouter
            initialEntries={[route]}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    expect(await screen.findByRole('link', {name})).toHaveAttribute('href', expected);
});

test.each([
    [true, 'Schema 模板', '/graphspace'],
    [false, '图 Schema', '/graphspace/DEFAULT'],
])('uses a safe Schema fallback without graph context', async (
    pdEnabled, name, expected
) => {
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: pdEnabled}));

    render(
        <MemoryRouter
            initialEntries={['/navigation']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    expect(await screen.findByRole('link', {name})).toHaveAttribute('href', expected);
});

test('shows Account for the same authorized-space user accepted by its route', async () => {
    sessionStorage.setItem('user_', JSON.stringify({
        id: 'space-admin',
        user_nickname: 'space-admin',
        is_superadmin: false,
        adminSpaces: [{name: 'SPACE'}],
    }));
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));

    render(
        <MemoryRouter
            initialEntries={['/my']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    expect(await screen.findByRole('link', {name: '账号管理'})).toBeInTheDocument();
});

test('hides Account from an analyst who can read a space but cannot administer it', async () => {
    sessionStorage.setItem('user_', JSON.stringify({
        id: 'analyst',
        user_nickname: 'analyst',
        is_superadmin: false,
        resSpaces: [{name: 'SPACE'}],
        adminSpaces: [],
    }));
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));

    render(
        <MemoryRouter
            initialEntries={['/my']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    expect(screen.queryByRole('link', {name: '账号管理'})).not.toBeInTheDocument();
});
