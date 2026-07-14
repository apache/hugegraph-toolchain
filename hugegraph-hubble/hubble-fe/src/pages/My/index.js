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

import {Alert, Avatar, PageHeader, Button, Form, Input, Space, Tag, message, Spin} from 'antd';
import {EditOutlined, LockOutlined, UserOutlined} from '@ant-design/icons';
import {useEffect, useRef, useState, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import style from './index.module.scss';
import EditLayer from './EditLayer';
import * as api from '../../api';
import * as rules from '../../utils/rules';

const My = () => {
    const {t} = useTranslation();
    const [editLayerVisible, setEditLayerVisible] = useState(false);
    const [changePass, setChangePass] = useState(false);
    const [refresh, setRefresh] = useState(false);
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(false);
    const [spinning, setSpinning] = useState(true);
    const [profileError, setProfileError] = useState(false);
    const [accessLevel, setAccessLevel] = useState();
    const profileRequest = useRef(null);
    const [form] = Form.useForm();
    const emptyValue = <span className={style.emptyValue}>{t('my.empty_value')}</span>;
    const displayValue = value => {
        if (Array.isArray(value)) {
            return value.length > 0 ? value.join(', ') : emptyValue;
        }
        if (value === null || value === undefined || String(value).trim() === '') {
            return emptyValue;
        }
        return value;
    };
    const displayOptionalValue = value => {
        const normalized = value === null || value === undefined
            ? ''
            : String(value).trim();
        if (!normalized || ['none', 'null', 'undefined'].includes(normalized.toLowerCase())) {
            return emptyValue;
        }
        return value;
    };
    const profileName = data.user_nickname || data.user_name;
    const avatarText = profileName ? String(profileName).trim().charAt(0).toUpperCase() : '';
    const accessLabel = accessLevel
        ? t(`my.level.${accessLevel}`)
        : (Array.isArray(data.adminSpaces) && data.adminSpaces.length > 0
            ? data.adminSpaces.join(', ')
            : '');

    const handleForm = useCallback(async () => {
        try {
            const values = await form.validateFields();
            const {old_password, user_password} = values;
            setLoading(true);
            const res = await api.auth.updatePwd(data.user_name, old_password, user_password);
            if (res.status === 200) {
                message.success(t('common.msg.update_success'));
                setChangePass(false);
                return;
            }

            message.error(res.message);
        }
        catch (error) {
            // Validation errors render inline; request errors are owned by the API layer.
        }
        finally {
            setLoading(false);
        }
    }, [data.user_name, form, t]);

    const handleChange = useCallback(() => {
        setChangePass(true);
        form.resetFields();
    }, [form]);

    const handleShowLayer = useCallback(() => {
        setEditLayerVisible(true);
    }, []);

    const handleHideLayer = useCallback(() => {
        setEditLayerVisible(false);
    }, []);

    const handleRefresh = useCallback(() => {
        setRefresh(value => !value);
    }, []);

    const handleShowAccount = useCallback(() => {
        setChangePass(false);
    }, []);

    const loadProfile = useCallback(async () => {
        const token = Symbol('my-profile');
        profileRequest.current = token;
        setSpinning(true);
        setProfileError(false);
        setData({});
        setAccessLevel();
        try {
            const [profileResult, statusResult] = await Promise.allSettled([
                api.auth.getPersonal({suppressBusinessErrorToast: true}),
                api.auth.status({suppressBusinessErrorToast: true}),
            ]);
            if (profileRequest.current !== token) {
                return;
            }
            const res = profileResult.status === 'fulfilled'
                ? profileResult.value : null;
            if (res?.status === 200) {
                setData(res.data);
                const status = statusResult.status === 'fulfilled'
                    ? statusResult.value : null;
                if (status?.status === 200 && status.data?.level) {
                    setAccessLevel(status.data.level);
                }
                return;
            }
            setProfileError(true);
        }
        catch (error) {
            if (profileRequest.current === token) {
                setProfileError(true);
            }
        }
        finally {
            if (profileRequest.current === token) {
                setSpinning(false);
            }
        }
    }, []);

    useEffect(() => {
        loadProfile();
        return () => {
            profileRequest.current = null;
        };
    }, [refresh, loadProfile]);

    return (
        <>
            <PageHeader
                ghost={false}
                onBack={false}
                title={t('my.title')}
            />

            <div className={style.pageCanvas}>
                {profileError && (
                    <Alert
                        type='error'
                        showIcon
                        message={t('my.load.unavailable')}
                        action={(
                            <Button size='small' onClick={loadProfile}>
                                {t('my.load.retry')}
                            </Button>
                        )}
                    />
                )}
                <section
                    className={style.profileSurface}
                    data-testid='profile-surface'
                    aria-label={t('my.title')}
                >
                    <header className={style.profileHero}>
                        <Avatar
                            className={style.avatar}
                            size={64}
                            icon={!avatarText ? <UserOutlined /> : undefined}
                        >
                            {avatarText}
                        </Avatar>
                        <div className={style.identity}>
                            <h2>{displayValue(profileName)}</h2>
                            <p>{displayValue(data.user_name)}</p>
                            {accessLabel
                                ? <Tag color='blue'>{accessLabel}</Tag>
                                : !spinning && emptyValue}
                        </div>
                        {!changePass && (
                            <Space className={style.profileActions} wrap>
                                <Button
                                    icon={<EditOutlined aria-hidden='true' />}
                                    onClick={handleShowLayer}
                                    disabled={spinning || profileError}
                                >
                                    {t('common.action.edit')}
                                </Button>
                                <Button
                                    icon={<LockOutlined aria-hidden='true' />}
                                    onClick={handleChange}
                                    disabled={spinning || profileError}
                                >
                                    {t('my.edit.title')}
                                </Button>
                            </Space>
                        )}
                    </header>
                    <Form
                        className={style.form}
                        labelCol={{span: 7}}
                        initialValues={{user_name: data.user_name}}
                        form={form}
                    >
                        {!profileError && changePass === false
                            ? (
                                <Spin spinning={spinning}>
                                    <dl className={style.detailGrid}>
                                        <div className={style.detailItem}>
                                            <dt>{t('my.col.id')}</dt>
                                            <dd>{displayValue(data.user_name)}</dd>
                                        </div>
                                        <div className={`${style.detailItem} ${style.detailWide}`}>
                                            <dt>{t('my.col.remark')}</dt>
                                            <dd>{displayOptionalValue(data.user_description)}</dd>
                                        </div>
                                        <div className={style.detailItem}>
                                            <dt>{t('my.col.create_time')}</dt>
                                            <dd>{displayValue(data.user_create)}</dd>
                                        </div>
                                    </dl>
                                </Spin>
                            )
                            : !profileError ? (
                                <>
                                    <Form.Item label={t('my.col.name')} name='user_name'>
                                        <Input disabled />
                                    </Form.Item>
                                    <Form.Item label={t('my.edit.old_password')} name='old_password'>
                                        <Input.Password
                                            autoComplete='new-password'
                                            placeholder={t('my.edit.old_password_placeholder')}
                                        />
                                    </Form.Item>
                                    <Form.Item
                                        label={t('my.edit.new_password')}
                                        name='user_password'
                                        rules={[rules.required(), {type: 'string', min: 5, max: 16}]}
                                    >
                                        <Input.Password placeholder={t('my.edit.new_password_placeholder')} />
                                    </Form.Item>
                                    <Form.Item
                                        label={t('my.edit.confirm_password')}
                                        name='repeat_password'
                                        dependencies={['user_password']}
                                        hasFeedback
                                        rules={[
                                            rules.required(),
                                            ({getFieldValue}) => ({
                                                validator(_, value) {
                                                    if (!value || getFieldValue('user_password') === value) {
                                                        return Promise.resolve();
                                                    }

                                                    return Promise.reject(new Error(t('my.edit.password_mismatch')));
                                                },
                                            }),
                                        ]}
                                    >
                                        <Input.Password placeholder={t('my.edit.confirm_password_placeholder')} />
                                    </Form.Item>
                                    <Form.Item wrapperCol={{offset: 7}}>
                                        <Space>
                                            <Button onClick={handleShowAccount}>{t('common.action.cancel')}</Button>
                                            <Button type='primary' onClick={handleForm} loading={loading}>
                                                {t('common.action.confirm')}
                                            </Button>
                                        </Space>
                                        {/* <div className={Style.desc}>上次更改密码时间：2022-06-24 10:44:22</div> */}
                                    </Form.Item>
                                </>
                            ) : null}
                    </Form>
                </section>
            </div>

            <EditLayer
                visible={editLayerVisible}
                onCancel={handleHideLayer}
                data={data}
                refresh={handleRefresh}
            />
        </>
    );
};

export default My;
