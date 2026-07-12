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

import React, {useState} from 'react';
import {Layout, Menu} from 'antd';
import {
    HomeOutlined,
    DatabaseOutlined,
    AlertOutlined,
    ApartmentOutlined,
    CloudUploadOutlined,
    MenuUnfoldOutlined,
    MenuFoldOutlined,
} from '@ant-design/icons';
import {Link, useLocation} from 'react-router-dom';
import * as user from '../../utils/user';
import {isPdEnabled} from '../../utils/config';
import {getGraphspacePath} from '../../utils/productMode';
import {getPreparationSchemaPath} from '../../utils/dataPreparationNavigation';
import {useTranslation} from 'react-i18next';

const items = (t, pathname) => {
    const userInfo = user.getUser();
    const pdMode = isPdEnabled();
    const MY = {label: <Link to='/my'>{t('home.my')}</Link>, key: 'my'};
    const ACCOUNT = {label: <Link to='/account'>{t('home.account')}</Link>, key: 'account'};

    // TODO temporary hided the resource and role modules
    let systemList = [MY];
    if (!pdMode) {
        systemList = [MY];
    }
    else if (user.canAccessAccount(pdMode, userInfo)) {
        // systemList = [MY, RESOURCE, ROLE];
        systemList = [MY, ACCOUNT];
    }

    const menu = [
        {
            label: <Link to='/navigation'>{t('workbench.nav.home')}</Link>,
            key: 'navigation',
            icon: <HomeOutlined />,
        },
        {
            label: t('workbench.nav.understand'),
            key: 'understand',
            icon: <ApartmentOutlined />,
            children: [{
                label: (
                    <Link to={getGraphspacePath(pdMode)}>
                        {t('manage.graphspace')}
                    </Link>
                ),
                key: 'graphspace',
            }],
        },
        {
            label: t('workbench.nav.prepare'),
            key: 'prepare',
            icon: <CloudUploadOutlined />,
            children: [
                {
                    label: (
                        <Link to={getPreparationSchemaPath(pdMode, pathname)}>
                            {t(pdMode
                                ? 'data_preparation.schema'
                                : 'data_preparation.graph_schema')}
                        </Link>
                    ),
                    key: 'schema',
                },
                {
                    label: <Link to='/source'>{t('manage.source')}</Link>,
                    key: 'source',
                },
                {
                    label: <Link to='/task'>{t('manage.task')}</Link>,
                    key: 'task',
                },
            ],
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
            label: t('workbench.nav.support'),
            key: 'support',
            icon: <AlertOutlined />,
            children: [...systemList],
        },
    ];

    return menu;
};

const Sidebar = () => {
    const [collapsed, setCollapsed] = useState(false);
    const href = useLocation();
    const {t} = useTranslation();
    const menuKey = href.pathname.split('/')[1] || 'navigation';

    return (
        <nav className="workbench-navigation" aria-label={t('workbench.navigation')}>
            <Layout.Sider
                collapsible
                collapsed={collapsed}
                onCollapse={setCollapsed}
                theme='light'
                trigger={
                    collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />
                }
            >
                <Menu
                    defaultSelectedKeys={['graphspace']}
                    defaultOpenKeys={['understand', 'prepare', 'query', 'support']}
                    mode="inline"
                    items={items(t, href.pathname)}
                    selectedKeys={[menuKey]}
                />
            </Layout.Sider>
        </nav>
    );
};

export default Sidebar;
