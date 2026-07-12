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
    FundViewOutlined,
    MenuUnfoldOutlined,
    MenuFoldOutlined,
} from '@ant-design/icons';
import {Link, useLocation} from 'react-router-dom';
import * as user from '../../utils/user';
import {isPdEnabled} from '../../utils/config';
import {getManageNavItems} from '../../utils/productMode';
import {useTranslation} from 'react-i18next';

const items = t => {
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

    // Dynamic manage menu based on deployment mode
    const manageChildren = getManageNavItems(pdMode).map(item => ({
        label: <Link to={item.url}>{t(`manage.${item.key}`)}</Link>,
        key: item.key,
    }));

    const menu = [
        {
            label: <Link to='/navigation'>{t('navigation.name')}</Link>,
            key: 'navigation',
            icon: <HomeOutlined />,
        },
        {
            label: t('manage.name'),
            key: 'manage',
            icon: <FundViewOutlined />,
            children: manageChildren,
        },
        {
            label: t('analysis.name'),
            key: 'analysis',
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
            label: t('home.name'),
            key: 'system',
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
                defaultOpenKeys={['manage', 'analysis', 'system']}
                mode="inline"
                items={items(t)}
                selectedKeys={[menuKey]}
            />
        </Layout.Sider>
    );
};

export default Sidebar;
