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

import {Layout, Space, Avatar, Button, Dropdown, message, Radio} from 'antd';
import {QuestionCircleOutlined, UserOutlined} from '@ant-design/icons';
import style from './index.module.scss';
import BrandLockup from '../BrandLockup';
import {Link, useLocation} from 'react-router-dom';
import * as api from '../../api/index';
import * as user from '../../utils/user';
import {useCallback, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import GraphContextSwitcher from '../GraphContextSwitcher';
import {getCurrentLanguage} from '../../utils/language';
import {
    clearPersistedAlgorithmFormsForUser,
} from '../../modules/algorithm/algorithmsForm/algorithmFormPersistence';

const Topbar = () => {
    const userInfo = user.getUser();
    const location = useLocation();
    const {t} = useTranslation();
    const [languageType, setLanguageType] = useState(getCurrentLanguage);

    const redirectToLogin = useCallback(() => {
        const redirect = `${location.pathname}${location.search}${location.hash}`;
        clearPersistedAlgorithmFormsForUser();
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
    const handleLanguageChange = useCallback(
        event => i18Change(event.target.value),
        [i18Change]
    );
    const showShortcutHelp = useCallback(() => {
        window.dispatchEvent(new CustomEvent('hubble:shortcut-help'));
    }, []);

    const logout = useCallback(() => {

        api.auth.logout().then(res => {
            if (res.status === 200) {
                sessionStorage.removeItem('redirect');
                clearPersistedAlgorithmFormsForUser();
                user.clearLogin();
                message.success(t('Topbar.exit.success'));
                window.location.replace('/login');
            }
        });
    }, [t]);

    const userMenu = {
        items: [{
            key: 'logout',
            label: t('Topbar.exit.name'),
        }],
        onClick: logout,
    };
    const userLabel = userInfo?.user_name === 'admin'
        && (!userInfo.user_nickname || userInfo.user_nickname === '超级管理员')
        ? t('Topbar.super_admin')
        : userInfo?.user_nickname ?? userInfo?.user_name ?? '';

    return (
        <Layout.Header className={`${style.header} workbench-topbar`}>
            <Link
                className={style.logo}
                to='/navigation'
                aria-label={t('workbench.back_home')}
            >
                <BrandLockup compact />
            </Link>
            <GraphContextSwitcher />
            <div className={style.rightContainer}>
                <Radio.Group
                    className={style.languageSwitch}
                    aria-label={t('login.language')}
                    data-testid="language-switcher"
                    value={languageType}
                    size="small"
                    optionType='button'
                    buttonStyle='solid'
                    onChange={handleLanguageChange}
                    options={[
                        {label: '中', value: 'zh-CN'},
                        {label: 'EN', value: 'en-US'},
                    ]}
                />
                <Button
                    type='text'
                    className={style.shortcutHelp}
                    icon={<QuestionCircleOutlined />}
                    aria-label={t('workbench.shortcuts.open_button')}
                    title={t('workbench.shortcuts.open_button')}
                    onClick={showShortcutHelp}
                />
                <Dropdown menu={userMenu}>
                    <Space className={style.right}>
                        <Avatar size={'small'} icon={<UserOutlined />} />
                        <span>{userLabel}</span>
                    </Space>
                </Dropdown>
            </div>
        </Layout.Header>
    );
};

export default Topbar;
