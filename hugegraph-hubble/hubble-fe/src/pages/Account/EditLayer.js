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

import {Modal, Input, Form, Select, message, Spin, Switch} from 'antd';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import * as api from '../../api';
import * as rules from '../../utils/rules';
import style from './index.module.scss';
import FormHelpLabel from '../../components/FormHelpLabel';
import {getAccountLevel} from './level';

const PAGE_ERROR_CONFIG = {suppressBusinessErrorToast: true};
const DEFAULT_ALLOWED_OPERATIONS = {create: true, edit: true, auth: true};

const HelpLabel = ({t, labelKey}) => (
    <FormHelpLabel
        label={t(labelKey)}
        help={t(`${labelKey}_help`)}
    />
);

const EditLayer = ({
    visible,
    onCancel,
    data,
    op,
    refresh,
    allowedOperations = DEFAULT_ALLOWED_OPERATIONS,
}) => {
    const {t} = useTranslation();
    const [form] = Form.useForm();
    const [graphspaceList, setGraphspaceList] = useState([]);
    const [detail, setDetail] = useState({});
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const submitPending = useRef(false);
    const detailRequest = useRef(0);

    const title = {
        'detail': t('account.form.title_detail'),
        'edit': t('account.form.title_edit'),
        'auth': t('account.form.title_auth'),
        'create': t('account.form.title_create'),
    };

    const createUser = useCallback(values => {
        return api.auth.addUser(values, PAGE_ERROR_CONFIG).then(res => {
            if (res.status === 200) {
                message.success(t('common.msg.create_success'));
                onCancel();
                refresh();
                return;
            }
            message.error(t('common.msg.operation_failed'));
        }).catch(() => message.error(t('common.msg.operation_failed')));
    }, [onCancel, refresh, t]);
    const updateUser = useCallback(values => {
        return api.auth.updateUser(data.id, values, PAGE_ERROR_CONFIG).then(res => {
            if (res.status === 200) {
                message.success(t('common.msg.update_success'));
                onCancel();
                refresh();

                return;
            }

            message.error(t('common.msg.operation_failed'));
        }).catch(() => message.error(t('common.msg.operation_failed')));
    }, [onCancel, refresh, data.id, t]);

    const updateUserAuth = useCallback(values => {
        return api.auth.updateAdminspace(data.id, values.adminSpaces, PAGE_ERROR_CONFIG).then(res => {
            if (res.status === 200) {
                message.success(t('common.msg.set_success'));
                onCancel();
                refresh();

                return;
            }

            message.error(t('common.msg.operation_failed'));
        }).catch(() => message.error(t('common.msg.operation_failed')));
    }, [data.id, onCancel, refresh, t]);

    const onFinish = useCallback(async () => {
        if (submitPending.current || loading) {
            return;
        }

        submitPending.current = true;
        setSubmitting(true);
        try {
            const values = await form.validateFields();
            if (op === 'create') {
                await createUser(values);
            }

            if (op === 'edit') {
                await updateUser(values);
            }

            if (op === 'auth') {
                await updateUserAuth(values);
            }
        }
        catch (error) {
            if (!error || !error.errorFields) {
                message.error(t('common.msg.operation_failed'));
            }
        }
        finally {
            submitPending.current = false;
            setSubmitting(false);
        }
    }, [createUser, form, loading, op, t, updateUser, updateUserAuth]);

    useEffect(() => {
        if (!visible) {
            detailRequest.current += 1;
            setDetail({});
            setGraphspaceList([]);
            form.resetFields();
            setLoading(false);
            return;
        }

        const request = detailRequest.current + 1;
        detailRequest.current = request;
        setGraphspaceList([]);
        if (op !== 'detail') {
            api.manage.getGraphSpaceList(undefined, PAGE_ERROR_CONFIG).then(res => {
                if (detailRequest.current !== request) {
                    return;
                }

                if (res.status === 200) {
                    setGraphspaceList(res.data.records.map(item => ({
                        label: item.name,
                        value: item.name,
                    })));
                    return;
                }

                message.error(t('common.msg.load_failed'));
            }).catch(() => {
                if (detailRequest.current === request) {
                    message.error(t('common.msg.load_failed'));
                }
            });
        }

        if (data.id) {
            setLoading(true);
            setDetail({});
            form.resetFields();
            api.auth.getUserInfo(data.id, PAGE_ERROR_CONFIG).then(res => {
                if (detailRequest.current !== request) {
                    return;
                }

                if (res.status === 200) {
                    if (op !== 'detail') {
                        form.setFieldsValue(res.data);
                    }
                    setDetail(res.data);
                    return;
                }

                form.resetFields();
                setDetail({});
                message.error(t('common.msg.load_failed'));
            }).catch(() => {
                if (detailRequest.current !== request) {
                    return;
                }

                form.resetFields();
                setDetail({});
                message.error(t('common.msg.load_failed'));
            }).finally(() => {
                if (detailRequest.current === request) {
                    setLoading(false);
                }
            });
        }
        else {
            setDetail({});
            form.resetFields();
            setLoading(false);
        }
    }, [visible, data.id, form, op, t]);

    if (op !== 'detail' && !allowedOperations[op]) {
        return null;
    }

    return (
        op === 'detail'
            ? (
                <Modal
                    title={t('account.form.title_detail')}
                    onCancel={onCancel}
                    open={visible}
                    footer={null}
                    width={600}
                    maskClosable={false}
                >
                    <Spin spinning={loading}>
                        <Form
                            labelCol={{span: 6}}
                            form={form}
                            preserve={false}
                        >
                            <Form.Item label={t('account.form.id')} className={style.item}>
                                {detail.user_name}
                            </Form.Item>
                            <Form.Item label={t('account.form.name')} className={style.item}>
                                {detail.user_nickname}
                            </Form.Item>
                            <Form.Item label={t('account.form.is_superadmin')} className={style.item}>
                                {detail.is_superadmin ? t('common.yes') : t('common.no')}
                            </Form.Item>
                            <Form.Item label={t('account.form.level')} className={style.item}>
                                {t(`account.level.${getAccountLevel(detail)}`)}
                            </Form.Item>
                            <Form.Item label={t('account.form.remark')} className={style.item}>
                                {detail.user_description}
                            </Form.Item>
                            <Form.Item label={t('account.form.permission')} className={style.item}>
                                {detail.adminSpaces ? detail.adminSpaces.join(',') : ''}
                            </Form.Item>
                            <Form.Item label={t('account.col.create_time')} className={style.item}>
                                {detail.user_create}
                            </Form.Item>
                        </Form>
                    </Spin>
                </Modal>
            )
            : (
                <Modal
                    title={title[op] ?? t('account.form.title_create')}
                    onCancel={onCancel}
                    open={visible}
                    onOk={onFinish}
                    confirmLoading={submitting}
                    okButtonProps={{disabled: loading}}
                    width={600}
                >
                    <Spin spinning={loading}>
                        <Form
                            labelCol={{span: 6}}
                            // initialValues={data}
                            form={form}
                            preserve={false}
                        >
                            {(op === 'create' || op === 'edit') && (
                                <>
                                    <Form.Item
                                        label={<HelpLabel t={t} labelKey='account.form.id' />}
                                        name="user_name"
                                        validateFirst
                                        rules={[{type: 'string', min: 5, max: 16}, rules.isName, rules.required()]}
                                    >
                                        <Input
                                            placeholder={t('account.form.id_placeholder')}
                                            disabled={op === 'edit'}
                                        />
                                    </Form.Item>
                                    <Form.Item
                                        label={<HelpLabel t={t} labelKey='account.form.name' />}
                                        name="user_nickname"
                                        rules={[rules.required(), rules.isAccountName]}
                                        validateFirst
                                    >
                                        <Input placeholder={t('account.form.name_placeholder')} />
                                    </Form.Item>
                                    <Form.Item
                                        label={<HelpLabel t={t} labelKey='account.form.is_superadmin' />}
                                        name="is_superadmin"
                                        valuePropName="checked"
                                    >
                                        <Switch />
                                    </Form.Item>
                                    <Form.Item
                                        label={<HelpLabel t={t} labelKey='account.form.remark' />}
                                        name="user_description"
                                    >
                                        <Input placeholder={t('account.form.remark_placeholder')} />
                                    </Form.Item>
                                    <Form.Item
                                        label={<HelpLabel t={t} labelKey='account.form.default_password' />}
                                        name="user_password"
                                        rules={op === 'create'
                                            ? [rules.required(), {type: 'string', min: 5, max: 16}]
                                            : [{type: 'string', min: 5, max: 16}]}
                                    >
                                        <Input.Password
                                            placeholder={t('account.form.default_password_placeholder')}
                                            autoComplete="new-password"
                                        />
                                    </Form.Item>
                                    <Form.Item
                                        label={<HelpLabel t={t} labelKey='account.form.permission' />}
                                        name="adminSpaces"
                                    >
                                        <Select options={graphspaceList} mode="multiple" />
                                    </Form.Item>
                                </>
                            )}
                            {op === 'auth' && (
                                <Form.Item
                                    label={<HelpLabel t={t} labelKey='account.form.permission' />}
                                    name="adminSpaces"
                                >
                                    <Select options={graphspaceList} mode="multiple" />
                                </Form.Item>
                            )}
                        </Form>
                    </Spin>
                </Modal>
            )
    );
};

export default EditLayer;
