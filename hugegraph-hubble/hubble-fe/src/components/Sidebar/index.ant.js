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

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Button, Layout, Menu, Tooltip} from 'antd';
import {
    HomeOutlined,
    DatabaseOutlined,
    ApartmentOutlined,
    CloudUploadOutlined,
    MenuUnfoldOutlined,
    MenuFoldOutlined,
    MenuOutlined,
    DashboardOutlined,
    ClusterOutlined,
} from '@ant-design/icons';
import {Link, useLocation} from 'react-router-dom';
import {isPdEnabled} from '../../utils/config';
import {getGraphspacePath} from '../../utils/productMode';
import {getPreparationSchemaPath} from '../../utils/dataPreparationNavigation';
import {getSidebarMenuKey} from '../../utils/sidebarNavigation';
import {useTranslation} from 'react-i18next';
import {useOperationsCapabilities} from '../../pages/Operations/capabilities';
import styles from './index.module.scss';

const OPEN_SECTIONS = ['navigation', 'prepare', 'query', 'support'];

const items = (t, pathname, capabilities = []) => {
    const pdMode = isPdEnabled();
    const MY = {label: <Link to='/profile'>{t('home.my')}</Link>, key: 'my'};
    const ACCOUNT = {label: <Link to='/account'>{t('home.account')}</Link>, key: 'account'};

    // TODO temporary hided the resource and role modules
    let systemList = [MY];
    if (capabilities.includes('accounts_manage')
        || capabilities.includes('graphspace_members_manage')) {
        // systemList = [MY, RESOURCE, ROLE];
        systemList = [MY, ACCOUNT];
    }
    const operationsList = [
        ...(pdMode && capabilities.includes('operations_health_read') ? [{
            label: <Link to='/operations/overview'>{t('operations.overview')}</Link>,
            key: 'overview',
            icon: <ClusterOutlined />,
        }] : []),
        ...(capabilities.includes('operations_topology_read') ? [{
            label: <Link to='/operations/nodes'>{t('operations.nodes')}</Link>,
            key: 'nodes',
        }] : []),
    ];

    const menu = [
        {
            label: <Link to='/navigation'>{t('workbench.nav.home')}</Link>,
            key: 'navigation',
            icon: <HomeOutlined />,
            children: [{
                label: (
                    <Link to={getGraphspacePath(pdMode)}>
                        {t('workbench.nav.graph_overview')}
                    </Link>
                ),
                key: 'graphspace',
                icon: <ApartmentOutlined />,
            }],
        },
        {
            label: t('workbench.nav.query'),
            key: 'query',
            icon: <DatabaseOutlined />,
            children: [
                {
                    label: <Link to='/gremlin'>{t('analysis.query.name')}</Link>,
                    key: 'gremlin',
                },
                {
                    label: <Link to='/algorithms'>{t('analysis.algorithm.name')}</Link>,
                    key: 'algorithms',
                },
                {
                    label: <Link to='/asyncTasks'>{t('analysis.async_task.name')}</Link>,
                    key: 'asyncTasks',
                },
            ],
        },
        {
            label: t('workbench.nav.prepare'),
            key: 'prepare',
            icon: <CloudUploadOutlined />,
            children: [
                {
                    label: (
                        <Link to={getPreparationSchemaPath(pdMode, pathname)}>
                            {t('data_preparation.schema')}
                        </Link>
                    ),
                    key: 'schema',
                },
                {
                    label: (
                        <Link to='/source' title={t('manage.source')}>
                            {t('manage.source')}
                        </Link>
                    ),
                    key: 'source',
                },
                {
                    label: <Link to='/task'>{t('manage.task')}</Link>,
                    key: 'task',
                },
            ],
        },
        {
            label: t('operations.section'),
            key: 'support',
            icon: <DashboardOutlined />,
            children: [...operationsList, ...systemList],
        },
    ];

    return menu;
};

const Sidebar = () => {
    const navigationRef = useRef(null);
    const temporaryCollapseTimerRef = useRef(null);
    const mediaQuery = '(max-width: 900px)';
    const getNarrow = () => typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia(mediaQuery).matches;
    const [narrow, setNarrow] = useState(getNarrow);
    const [collapsed, setCollapsed] = useState(getNarrow);
    const [temporaryExpanded, setTemporaryExpanded] = useState(false);
    const [openKeys, setOpenKeys] = useState(() => (
        getNarrow() ? [] : OPEN_SECTIONS
    ));
    const href = useLocation();
    const {t} = useTranslation();
    const {capabilities} = useOperationsCapabilities();
    const menuKey = getSidebarMenuKey(href.pathname, isPdEnabled());

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') {
            return undefined;
        }
        const query = window.matchMedia(mediaQuery);
        const update = event => {
            setNarrow(event.matches);
            setCollapsed(event.matches);
            setOpenKeys(event.matches ? [] : OPEN_SECTIONS);
        };
        query.addEventListener?.('change', update);
        return () => query.removeEventListener?.('change', update);
    }, []);

    useEffect(() => {
        if (narrow) {
            setCollapsed(true);
            setTemporaryExpanded(false);
            setOpenKeys([]);
        }
    }, [href.pathname, narrow]);

    useEffect(() => () => {
        if (temporaryCollapseTimerRef.current) {
            window.clearTimeout(temporaryCollapseTimerRef.current);
        }
    }, []);

    useEffect(() => {
        const selected = navigationRef.current?.querySelector('.ant-menu-item-selected');
        const operationsNodes = href.pathname.startsWith('/operations')
            ? navigationRef.current?.querySelector('a[href="/operations/nodes"]')
                ?.closest('.ant-menu-item')
            : null;
        const target = operationsNodes ?? selected;
        if (typeof target?.scrollIntoView === 'function') {
            target.scrollIntoView({block: 'nearest'});
        }
    }, [capabilities, href.pathname, openKeys]);

    const clearTemporaryCollapseTimer = useCallback(() => {
        if (temporaryCollapseTimerRef.current) {
            window.clearTimeout(temporaryCollapseTimerRef.current);
            temporaryCollapseTimerRef.current = null;
        }
    }, []);
    const setNavigationCollapsed = useCallback(value => {
        clearTemporaryCollapseTimer();
        setTemporaryExpanded(false);
        setCollapsed(value);
        setOpenKeys(value ? [] : OPEN_SECTIONS);
    }, [clearTemporaryCollapseTimer]);
    const toggleNavigation = useCallback(
        () => setNavigationCollapsed(!collapsed),
        [collapsed, setNavigationCollapsed]
    );
    const handleNavigationMouseEnter = useCallback(() => {
        if (narrow || !collapsed) {
            return;
        }
        clearTemporaryCollapseTimer();
        setTemporaryExpanded(true);
        setOpenKeys(OPEN_SECTIONS);
    }, [clearTemporaryCollapseTimer, collapsed, narrow]);
    const handleNavigationMouseLeave = useCallback(() => {
        if (narrow || !collapsed || !temporaryExpanded) {
            return;
        }
        clearTemporaryCollapseTimer();
        temporaryCollapseTimerRef.current = window.setTimeout(() => {
            setTemporaryExpanded(false);
            setOpenKeys([]);
            temporaryCollapseTimerRef.current = null;
        }, 1000);
    }, [clearTemporaryCollapseTimer, collapsed, narrow, temporaryExpanded]);
    const renderedCollapsed = collapsed && !temporaryExpanded;
    const toggleLabel = temporaryExpanded && collapsed
        ? t('workbench.navigation_pin_open')
        : collapsed
            ? t('workbench.navigation_open')
            : t('workbench.navigation_close');

    return (
        <nav
            ref={navigationRef}
            className={`workbench-navigation ${narrow ? 'is-narrow' : ''}`}
            aria-label={t('workbench.navigation')}
            onMouseEnter={handleNavigationMouseEnter}
            onMouseLeave={handleNavigationMouseLeave}
        >
            {narrow && (
                <Button
                    className="workbench-mobile-navigation-toggle"
                    type="text"
                    icon={<MenuOutlined />}
                    aria-label={toggleLabel}
                    aria-expanded={!collapsed}
                    onClick={toggleNavigation}
                />
            )}
            <Layout.Sider
                collapsible
                collapsed={renderedCollapsed}
                collapsedWidth={narrow ? 0 : 80}
                width={248}
                onCollapse={setNavigationCollapsed}
                theme='light'
                className={narrow && !collapsed ? 'is-mobile-open' : ''}
                trigger={
                    narrow ? null
                        : renderedCollapsed
                            ? <MenuUnfoldOutlined />
                            : <MenuFoldOutlined />
                }
            >
                {!narrow && (
                    <div className={`workbench-navigation-toggle-slot ${styles.toggleSlot}`}>
                        <Tooltip title={toggleLabel} placement="right">
                            <Button
                                className="workbench-navigation-inline-toggle"
                                style={renderedCollapsed
                                    ? {width: 80, minWidth: 80} : undefined}
                                type="text"
                                size="small"
                                icon={collapsed
                                    ? <MenuUnfoldOutlined />
                                    : <MenuFoldOutlined />}
                                aria-label={toggleLabel}
                                aria-expanded={!renderedCollapsed}
                                onClick={toggleNavigation}
                            />
                        </Tooltip>
                    </div>
                )}
                <Menu
                    defaultSelectedKeys={['graphspace']}
                    openKeys={openKeys}
                    onOpenChange={setOpenKeys}
                    mode="inline"
                    items={items(t, href.pathname, capabilities)}
                    selectedKeys={[menuKey]}
                />
            </Layout.Sider>
        </nav>
    );
};

export default Sidebar;
