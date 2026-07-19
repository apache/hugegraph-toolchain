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

import {LockOutlined, UserOutlined} from '@ant-design/icons';
import {Button, Form, Input} from 'antd';
import BrandLockup from '../../components/BrandLockup';
import LanguageToggle from '../../components/LanguageToggle';
import style from './index.module.scss';
import * as api from '../../api';
import {useLocation} from 'react-router-dom';
import * as user from '../../utils/user';
import * as configUtil from '../../utils/config';
import {useCallback, useEffect} from 'react';
import {useTranslation} from 'react-i18next';

const LOGIN_PATH = '/login';
const DEFAULT_AFTER_LOGIN = '/navigation';
const UNSAFE_REDIRECT_RE = /[\x00-\x1F\x7F\\]/;

const getSafeRedirect = redirect => {
    if (!redirect || !redirect.startsWith('/') || UNSAFE_REDIRECT_RE.test(redirect)) {
        return DEFAULT_AFTER_LOGIN;
    }

    try {
        const target = new URL(redirect, window.location.origin);
        if (target.origin !== window.location.origin || target.pathname === LOGIN_PATH) {
            return DEFAULT_AFTER_LOGIN;
        }
        return `${target.pathname}${target.search}${target.hash}`;
    }
    catch {
        return DEFAULT_AFTER_LOGIN;
    }
};

const Login = () => {
    const [form] = Form.useForm();
    const location = useLocation();
    const {t} = useTranslation();

    useEffect(() => {
        const queryRedirect = new URLSearchParams(location.search).get('redirect');
        if (getSafeRedirect(queryRedirect) === queryRedirect) {
            sessionStorage.setItem('redirect', queryRedirect);
        }
    }, [location.search]);

    const navigateAfterLogin = useCallback(() => {
        const queryRedirect = new URLSearchParams(location.search).get('redirect');
        const safeRedirect = getSafeRedirect(queryRedirect);

        sessionStorage.removeItem('redirect');
        window.location.replace(safeRedirect);
    }, [location.search]);

    const onFinish = useCallback(async value => {
        let res;
        try {
            res = await api.auth.login(value);
        }
        catch {
            return;
        }
        if (res.status !== 200) {
            return;
        }

        localStorage.setItem('user', value.user_name);
        user.setUser(res.data);
        try {
            const configRes = await api.config.getConfig();
            if (configRes.status === 200) {
                configUtil.setConfig(configRes.data);
            }
        }
        catch {
            // The request interceptor has already shown the error message.
        }
        finally {
            navigateAfterLogin();
        }
    }, [navigateAfterLogin]);

    return (
        <div className={`${style.loginContainer} workbench-login`}>
            <main className={style.loginShell}>
                <section
                    className={style.brandPanel}
                    aria-label={t('login.brand_label')}
                >
                    <BrandLockup className={style.brandLockup} />
                    <div className={style.brandCopy}>
                        <span className={style.eyebrow}>Hubble Desktop Workbench</span>
                        <p>{t('login.subtitle')}</p>
                    </div>
                </section>
                <Form
                    name="normal_login"
                    className={style.loginForm}
                    onFinish={onFinish}
                    form={form}
                >
                    <div className={style.formTools}>
                        <LanguageToggle />
                    </div>
                    <header className={style.formHeader}>
                        <span className={style.formEyebrow}>Apache HugeGraph</span>
                        <h1 className={style.title}>{t('login.title')}</h1>
                        <p>{t('login.form_hint')}</p>
                    </header>
                    <Form.Item
                        name="user_name"
                        rules={[{required: true, message: t('login.username_required')}]}
                    >
                        <Input
                            prefix={<UserOutlined className="site-form-item-icon" />}
                            aria-label={t('login.username')}
                            placeholder={t('login.username')}
                        />
                    </Form.Item>
                    <Form.Item
                        name="user_password"
                        rules={[{required: true, message: t('login.password_required')}]}
                    >
                        <Input
                            prefix={<LockOutlined className="site-form-item-icon" />}
                            aria-label={t('login.password')}
                            type="password"
                            placeholder={t('login.password')}
                        />
                    </Form.Item>

                    <Form.Item className={style.submitItem}>
                        <Button type="primary" htmlType="submit" block size='large'>
                            {t('login.submit')}
                        </Button>
                    </Form.Item>
                </Form>
            </main>
        </div>
    );
};

export default Login;
