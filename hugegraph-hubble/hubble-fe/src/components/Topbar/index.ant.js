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

import {Layout, Space, Avatar, Dropdown, message, Modal, Select} from 'antd';
import {UserOutlined} from '@ant-design/icons';
import style from './index.module.scss';
import BrandLockup from '../BrandLockup';
import {useNavigate, useLocation} from 'react-router-dom';
import * as api from '../../api/index';
import * as user from '../../utils/user';
import {useCallback, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import GraphContextSwitcher from '../GraphContextSwitcher';
import {getCurrentLanguage} from '../../utils/language';

const {Option} = Select;

const Topbar = () => {
    const userInfo = user.getUser();
    const navigate = useNavigate();
    const location = useLocation();
    const {t} = useTranslation();
    const [languageType, setLanguageType] = useState(getCurrentLanguage);

    const redirectToLogin = useCallback(() => {
        const redirect = `${location.pathname}${location.search}${location.hash}`;
        user.clearLogin();
        sessionStorage.setItem('redirect', redirect);
        window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
    }, [location.hash, location.pathname, location.search]);

    useEffect(() => {
        let cancelled = false;

        if (!userInfo || !userInfo.id) {
            return undefined;
        }

        api.auth.status()
            .then(res => {
                if (!cancelled && res.status === 401) {
                    redirectToLogin();
                }
            })
            .catch(() => {
                // The request interceptor has already shown the error message.
            });

        return () => {
            cancelled = true;
        };
    }, [redirectToLogin, userInfo]);

    if (!userInfo || !userInfo.id) {
        redirectToLogin();
    }

    const i18Change = useCallback(e => {
        localStorage.setItem('languageType', e);
        setLanguageType(e);
        window.location.reload();
    }, []);

    const logout = useCallback(() => {

        api.auth.logout().then(res => {
            if (res.status === 200) {
                sessionStorage.removeItem('redirect');
                user.clearLogin();
                message.success(t('Topbar.exit.success'));
                navigate('/login');
            }
        });
    }, [navigate, t]);

    const confirm = useCallback(() => {
        Modal.confirm({
            title: t('Topbar.exit.confirm'),
            okText: t('common.verify.ok'),
            cancelText: t('common.verify.cancel'),
            onOk: logout,
        });
    }, [logout, t]);

    const userMenu = {
        items: [{
            key: 'logout',
            label: t('Topbar.exit.name'),
        }],
        onClick: confirm,
    };

    return (
        <Layout.Header className={`${style.header} workbench-topbar`}>
            <div className={style.logo}><BrandLockup compact /></div>
            <GraphContextSwitcher />
            <div className={style.rightContainer}>
                <Select
                    aria-label={t('login.language')}
                    data-testid="language-switcher"
                    value={languageType}
                    style={{width: 120}}
                    size="small"
                    onChange={i18Change}
                >
                    <Option value="zh-CN">中文</Option>
                    <Option value="en-US">English</Option>
                </Select>
                <Dropdown menu={userMenu}>
                    <Space className={style.right}>
                        <Avatar size={'small'} icon={<UserOutlined />} />
                        <span>{userInfo?.user_nickname ?? ''}</span>
                    </Space>
                </Dropdown>
            </div>
        </Layout.Header>
    );
};

export default Topbar;
