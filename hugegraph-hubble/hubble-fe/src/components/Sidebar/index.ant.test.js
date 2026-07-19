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

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Sidebar from './index.ant';
import i18n from '../../i18n';
import {useOperationsCapabilities} from '../../pages/Operations/capabilities';

jest.mock('../../pages/Operations/capabilities');

beforeEach(() => {
    i18n.changeLanguage('zh-CN');
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('user_', JSON.stringify({
        id: 'admin',
        user_nickname: 'admin',
        is_superadmin: false,
    }));
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: false}));
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }));
    useOperationsCapabilities.mockReturnValue({
        loading: false,
        capabilities: ['operations_health_read', 'operations_topology_read'],
        error: null,
    });
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

afterEach(() => {
    delete window.HTMLElement.prototype.scrollIntoView;
});

test('hides PD-only operations links in standalone mode without topology access', async () => {
    useOperationsCapabilities.mockReturnValue({
        loading: false,
        capabilities: ['operations_health_read'],
        error: null,
    });

    render(
        <MemoryRouter
            initialEntries={['/operations/overview']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    expect(await screen.findByRole('link', {name: '个人中心'})).toBeInTheDocument();
    expect(screen.queryByRole('link', {name: '集群概览'})).not.toBeInTheDocument();
    expect(screen.queryByRole('link', {name: '节点详情'})).not.toBeInTheDocument();
});

test('keeps monitoring and account links in one operations section', async () => {
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));
    render(
        <MemoryRouter
            initialEntries={['/operations/overview']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    expect(await screen.findAllByText('系统与运维')).toHaveLength(1);
    expect(screen.getByRole('link', {name: '集群概览'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: '节点详情'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: '个人中心'})).toBeInTheDocument();
});

test('shows only Node details from operations navigation in standalone mode', async () => {
    render(
        <MemoryRouter
            initialEntries={['/operations/nodes']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    expect(await screen.findByRole('link', {name: '节点详情'}))
        .toHaveAttribute('href', '/operations/nodes');
    expect(screen.queryByRole('link', {name: '集群概览'})).not.toBeInTheDocument();
});

test('keeps the selected operations entry within the scrollable navigation', async () => {
    render(
        <MemoryRouter
            initialEntries={['/operations/nodes/server-1']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    expect((await screen.findByRole('link', {name: '节点详情'})).closest('li'))
        .toHaveClass('ant-menu-item-selected');
    await waitFor(() => expect(window.HTMLElement.prototype.scrollIntoView)
        .toHaveBeenCalledWith({block: 'nearest'}));
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
    const graphOverview = screen.getByRole('link', {name: '图概览'});
    expect(graphOverview).toHaveAttribute('href', '/graphspace/DEFAULT');
    const homeSection = graphOverview.closest('.ant-menu-submenu');
    expect(homeSection).toBeInTheDocument();
    expect(homeSection).toContainElement(screen.getByRole('link', {name: '首页'}));
    expect(screen.getByText('图导入')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', {name: 'database 图查询'})).toBeInTheDocument();
    expect(screen.getAllByText('系统与运维').length).toBeGreaterThan(0);
    expect(navigation).toContainElement(screen.getByRole('link', {name: 'GQL 图遍历'}));
    expect(navigation).toContainElement(screen.getByRole('link', {name: '异步任务'}));
    const menuSections = screen.getAllByRole('menuitem')
        .map(item => item.textContent);
    expect(menuSections.indexOf('图查询')).toBeLessThan(menuSections.indexOf('图导入'));
    expect(screen.getByRole('link', {name: 'Schema 模板'})).toHaveAttribute(
        'href', '/graphspace/DEFAULT/schema'
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
    expect(screen.getByRole('link', {name: '图概览'}).closest('li'))
        .not.toHaveClass('ant-menu-item-selected');
});

test('keeps graph metadata distinct from Schema templates in non-PD mode', async () => {
    render(
        <MemoryRouter
            initialEntries={['/graphspace/DEFAULT/graph/hugegraph/meta']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    expect((await screen.findByRole('link', {name: '图概览'})).closest('li'))
        .toHaveClass('ant-menu-item-selected');
    expect(screen.getByRole('link', {name: 'Schema 模板'}).closest('li'))
        .not.toHaveClass('ant-menu-item-selected');
});

test('starts collapsed on a narrow viewport and exposes an accessible toggle', async () => {
    window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(max-width: 900px)',
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }));

    render(
        <MemoryRouter
            initialEntries={['/navigation']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    const toggle = await screen.findByRole('button', {name: '打开主导航'});
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelectorAll('.ant-menu-submenu-open')).toHaveLength(0);

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('关闭主导航');
});

test('offers a second accessible collapse control beside Home', async () => {
    render(
        <MemoryRouter
            initialEntries={['/navigation']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    const navigation = await screen.findByRole('navigation', {name: '主导航'});
    const toggle = screen.getByRole('button', {name: '关闭主导航'});

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toBeVisible();
    fireEvent.click(toggle);
    expect(navigation.querySelector('.ant-layout-sider'))
        .toHaveClass('ant-layout-sider-collapsed');
    expect(toggle).toHaveAccessibleName('打开主导航');
    expect(toggle).toHaveStyle({width: '80px', minWidth: '80px'});
    const toggleSlot = toggle.closest('.workbench-navigation-toggle-slot');
    expect(toggleSlot).toBeInTheDocument();
    expect(toggleSlot.nextElementSibling).toHaveClass('ant-menu');
    expect(screen.getByRole('link', {name: '首页'}).closest('li'))
        .toHaveClass('ant-menu-submenu');
});

test('temporarily expands a user-collapsed sidebar and restores it after leaving', async () => {
    jest.useFakeTimers();
    try {
        render(
            <MemoryRouter
                initialEntries={['/navigation']}
                future={{v7_startTransition: true, v7_relativeSplatPath: true}}
            >
                <Sidebar />
            </MemoryRouter>
        );

        const navigation = await screen.findByRole('navigation', {name: '主导航'});
        fireEvent.click(screen.getByRole('button', {name: '关闭主导航'}));
        const sider = navigation.querySelector('.ant-layout-sider');
        expect(sider).toHaveClass('ant-layout-sider-collapsed');

        fireEvent.mouseEnter(navigation);
        expect(sider).not.toHaveClass('ant-layout-sider-collapsed');
        expect(screen.getByRole('link', {name: '图概览'})
            .closest('.ant-menu-submenu'))
            .toContainElement(screen.getByRole('link', {name: '首页'}));
        expect(screen.getByRole('button', {name: '固定展开主导航'}))
            .toHaveAttribute('aria-expanded', 'true');

        fireEvent.mouseLeave(navigation);
        act(() => jest.advanceTimersByTime(999));
        expect(sider).not.toHaveClass('ant-layout-sider-collapsed');
        act(() => jest.advanceTimersByTime(1));
        expect(sider).toHaveClass('ant-layout-sider-collapsed');
    }
    finally {
        jest.useRealTimers();
    }
});

test('keeps a temporarily expanded sidebar open when the user pins it', async () => {
    jest.useFakeTimers();
    try {
        render(
            <MemoryRouter
                initialEntries={['/navigation']}
                future={{v7_startTransition: true, v7_relativeSplatPath: true}}
            >
                <Sidebar />
            </MemoryRouter>
        );

        const navigation = await screen.findByRole('navigation', {name: '主导航'});
        fireEvent.click(screen.getByRole('button', {name: '关闭主导航'}));
        fireEvent.mouseEnter(navigation);
        fireEvent.click(screen.getByRole('button', {name: '固定展开主导航'}));
        fireEvent.mouseLeave(navigation);
        act(() => jest.advanceTimersByTime(1000));

        expect(navigation.querySelector('.ant-layout-sider'))
            .not.toHaveClass('ant-layout-sider-collapsed');
        expect(screen.getByRole('button', {name: '关闭主导航'}))
            .toHaveAttribute('aria-expanded', 'true');
    }
    finally {
        jest.useRealTimers();
    }
});

test.each([
    [true, '/gremlin/SPACE_NEW/GRAPH_NEW', 'Schema 模板',
        '/graphspace/SPACE_NEW/schema'],
    [false, '/gremlin/DEFAULT/GRAPH_NEW', 'Schema 模板',
        '/graphspace/DEFAULT/schema'],
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
    [false, 'Schema 模板', '/graphspace/DEFAULT/schema'],
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
    useOperationsCapabilities.mockReturnValue({
        loading: false,
        capabilities: ['graphspace_members_manage'],
        error: null,
    });
    sessionStorage.setItem('user_', JSON.stringify({
        id: 'space-admin',
        user_nickname: 'space-admin',
        is_superadmin: false,
        adminSpaces: [{name: 'SPACE'}],
    }));
    sessionStorage.setItem('hubble_config_', JSON.stringify({pd_enabled: true}));

    render(
        <MemoryRouter
            initialEntries={['/profile']}
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
            initialEntries={['/profile']}
            future={{v7_startTransition: true, v7_relativeSplatPath: true}}
        >
            <Sidebar />
        </MemoryRouter>
    );

    expect(await screen.findByRole('link', {name: 'GQL 图遍历'})).toBeInTheDocument();
    expect(screen.getByText('图导入')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: '数据导入'})).toBeInTheDocument();
    expect(screen.queryByRole('link', {name: '账号管理'})).not.toBeInTheDocument();
});
