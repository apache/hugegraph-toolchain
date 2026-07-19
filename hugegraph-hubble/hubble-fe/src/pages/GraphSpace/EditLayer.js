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

import {
    Modal,
    Form,
    Input,
    Select,
    message,
    Switch,
    InputNumber,
    Space,
    Typography,
} from 'antd';
import {useState, useEffect, useMemo, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import * as api from '../../api/index';
import FormHelpLabel from '../../components/FormHelpLabel';
import {getResourceAlias} from '../../utils/displayName';

const {Option} = Select;
const PAGE_ERROR_CONFIG = {suppressBusinessErrorToast: true};
// Keep this validation aligned with Server GraphManager.checkNickname().
const GRAPHSPACE_NICKNAME_PATTERN = new RegExp(
    '^[a-zA-Z\\u4E00-\\u9FA5]'
    + '[a-zA-Z0-9\\u4E00-\\u9FA5~!@#$%^&*()_+|<>,.?/:;\'`"\\[\\]{}\\\\]{0,47}$'
);
const MyFormItem = ({label, help, unit, children}) => {
    return (
        <Form.Item label={<FormHelpLabel label={label} help={help} />} colon={false}>
            <Space>
                {children}
                <span className='spanFontSize'>{unit}</span>
            </Space>
        </Form.Item>
    );
};

const EditLayer = ({visible, detail, onCancel, refresh}) => {
    const [form] = Form.useForm();
    const [userList, setUserList] = useState([]);
    const [loading, setLoading] = useState(false);
    const {t} = useTranslation();

    const defaultValues = {
        auth: false,
        description: '',
        max_graph_number: 100,
        cpu_limit: 64,
        memory_limit: 128,
        compute_cpu_limit: 64,
        compute_memory_limit: 128,
        storage_limit: 1000000,
    };

    const isDisabled = useMemo(() => {
        if (Object.keys(detail).length !== 0) {
            return true;
        }
        return false;
    }, [detail]);

    const onFinish = useCallback(() => {
        form.validateFields().then(values => {
            setLoading(true);

            const thenCallBack = res => {
                setLoading(false);
                if (res && res.status === 200) {
                    message.success(t('common.msg.success'));
                    refresh();
                    onCancel();
                    return;
                }
                message.error(t('common.msg.operation_failed'));
            };
            const catchCallback = () => {
                setLoading(false);
                message.error(t('common.msg.operation_failed'));
            };

            if (isDisabled) {
                api.manage.updateGraphSpace(detail.name, values, PAGE_ERROR_CONFIG)
                    .then(thenCallBack).catch(catchCallback);
            }
            else {
                api.manage.addGraphSpace(values, PAGE_ERROR_CONFIG)
                    .then(thenCallBack).catch(catchCallback);
            }
        }).catch(error => {
            if (!error?.errorFields) {
                message.error(t('common.msg.operation_failed'));
            }
        });
    }, [detail.name, isDisabled, onCancel, refresh, form, t]);

    const serviceValidator = (_, value) => {
        if (value === 'DEFAULT') {
            return Promise.resolve();
        }
        let res = /^[a-z][a-z0-9_]{0,47}$/.test(value);
        if (!res) {
            return Promise.reject(t('graphspace.form.id_rule'));
        }

        return Promise.resolve();
    };

    const k8sValidator = (_, value) => {
        let res = /^[a-z][a-z0-9\-]{0,47}$/.test(value);
        if (value && !res) {
            return Promise.reject(t('graphspace.form.k8s_rule'));
        }

        return Promise.resolve();
    };

    const nicknameValidator = (_, value) => {
        if (!value) {
            return Promise.resolve();
        }
        const valid = GRAPHSPACE_NICKNAME_PATTERN.test(value);
        return valid
            ? Promise.resolve()
            : Promise.reject(t('graphspace.form.name_rule'));
    };

    const userSelect = useMemo(
        () => userList.map(item => (<Option key={item.id}>{item.user_name}</Option>)),
        [userList]
    );

    useEffect(() => {
        if (!visible) {
            return;
        }
        form.resetFields();

        api.auth.getUserList(undefined, PAGE_ERROR_CONFIG).then(res => {
            if (res && res.status === 200) {
                setUserList(res.data.users);
                return;
            }
            message.error(t('common.msg.load_failed'));
        }).catch(() => message.error(t('common.msg.load_failed')));

        if (detail.name) {
            api.manage.getGraphSpace(detail.name, PAGE_ERROR_CONFIG).then(res => {
                if (res.status === 200) {
                    form.setFieldsValue({
                        ...res.data,
                        nickname: getResourceAlias(res.data.name, res.data.nickname),
                        algorithm_image_url: res.data.algorithm_image_url
                                             || res.data['internal_'
                                                         + 'algorithm_image_url'],
                    });
                    return;
                }
                message.error(t('common.msg.load_failed'));
            }).catch(() => message.error(t('common.msg.load_failed')));
        }
    }, [visible, form, detail.name, t]);

    return (
        <Modal
            title={t(isDisabled ? 'graphspace.form.title_edit' : 'graphspace.form.title_create')}
            open={visible}
            onCancel={onCancel}
            okText={t(Object.keys(detail).length === 0
                ? 'common.action.create'
                : 'common.action.save')}
            loading={loading}
            onOk={onFinish}
            width={680}
            destroyOnClose
            maskClosable={false}
            // forceRender
        >
            <Form
                className="graphspace-edit-form"
                labelCol={{flex: '200px'}}
                wrapperCol={{flex: '1 1 0'}}
                labelWrap
                form={form}
                name="control-hooks"
                // onFinish={onFinish}
                // preserve={false}
                initialValues={defaultValues}
            >

                <Form.Item
                    name="name"
                    label={<FormHelpLabel
                        label={t('graphspace.form.id')}
                        help={t('graphspace.form.id_help')}
                    />}
                    rules={[
                        {required: true, message: t('common.form.required')},
                        {max: 48, message: t('common.form.max_48')},
                        {validator: serviceValidator},
                    ]}
                >
                    <Input
                        disabled={isDisabled}
                        placeholder={t('graphspace.form.id_placeholder')}
                    />
                </Form.Item>

                <Form.Item
                    name="nickname"
                    label={<FormHelpLabel
                        label={t('graphspace.form.name')}
                        help={t('graphspace.form.name_help')}
                    />}
                    rules={[
                        {max: 48, message: t('common.form.max_48')},
                        {validator: nicknameValidator},
                    ]}
                >
                    <Input placeholder={t('graphspace.form.name_placeholder')} />
                </Form.Item>

                <Form.Item
                    label={<FormHelpLabel
                        label={t('graphspace.form.auth')}
                        help={t('graphspace.form.auth_help')}
                    />}
                    name="auth"
                    valuePropName="checked"
                >
                    <Switch
                        aria-label={t('graphspace.form.auth')}
                        disabled={isDisabled}
                    />
                </Form.Item>

                <Form.Item
                    name="max_graph_number"
                    label={<FormHelpLabel
                        label={t('graphspace.form.max_graph')}
                        help={t('graphspace.form.max_graph_help')}
                    />}
                >
                    <InputNumber
                        precision={0}
                        min={1}
                        placeholder={t('graphspace.form.max_graph_placeholder')}
                    />
                </Form.Item>

                <details style={{marginBottom: 24}}>
                    <summary style={{cursor: 'pointer', marginBottom: 16}}>
                        <strong>{t('graphspace.form.advanced_title')}</strong>
                        <Typography.Text type='secondary' style={{marginLeft: 8}}>
                            {t('graphspace.form.advanced_help')}
                        </Typography.Text>
                    </summary>

                    <Typography.Title level={5}>
                        {t('graphspace.form.graph_service')}
                    </Typography.Title>
                    <MyFormItem
                        label={t('graphspace.form.cpu')}
                        help={t('graphspace.form.graph_cpu_help')}
                        unit={t('graphspace.unit.cpu')}
                    >
                        <Form.Item
                            name="cpu_limit"
                            noStyle
                        >
                            <InputNumber
                                placeholder={t('graphspace.form.cpu_placeholder')}
                                precision={0}
                                min={1}
                            />
                        </Form.Item>
                    </MyFormItem>

                    <MyFormItem
                        label={t('graphspace.form.memory')}
                        help={t('graphspace.form.graph_memory_help')}
                        unit={t('graphspace.unit.memory')}
                    >
                        <Form.Item
                            name="memory_limit"
                            noStyle
                        >
                            <InputNumber
                                placeholder={t('graphspace.form.memory_placeholder')}
                                precision={0}
                                min={1}
                            />
                        </Form.Item>
                    </MyFormItem>

                    <Form.Item
                        name="oltp_namespace"
                        label={<FormHelpLabel
                            label={t('graphspace.form.k8s_namespace')}
                            help={t('graphspace.form.oltp_namespace_help')}
                        />}
                        rules={
                            [
                                {validator: k8sValidator},
                            ]
                        }
                    >
                        <Input disabled={isDisabled} placeholder={t('graphspace.form.k8s_placeholder')} />
                    </Form.Item>

                    <Typography.Title level={5}>{t('graphspace.form.compute_task')}</Typography.Title>
                    <MyFormItem
                        label={t('graphspace.form.cpu')}
                        help={t('graphspace.form.compute_cpu_help')}
                        unit={t('graphspace.unit.cpu')}
                    >
                        <Form.Item
                            name="compute_cpu_limit"
                            noStyle
                        >
                            <InputNumber
                                placeholder={t('graphspace.form.cpu_placeholder')}
                                precision={0}
                                min={1}
                            />
                        </Form.Item>
                    </MyFormItem>

                    <MyFormItem
                        label={t('graphspace.form.memory')}
                        help={t('graphspace.form.compute_memory_help')}
                        unit={t('graphspace.unit.memory')}
                    >
                        <Form.Item
                            name="compute_memory_limit"
                            noStyle
                        >
                            <InputNumber
                                placeholder={t('graphspace.form.memory_placeholder')}
                                precision={0}
                                min={1}
                            />
                        </Form.Item>
                    </MyFormItem>

                    <Form.Item
                        name="olap_namespace"
                        label={<FormHelpLabel
                            label={t('graphspace.form.k8s_namespace')}
                            help={t('graphspace.form.olap_namespace_help')}
                        />}
                        rules={
                            [
                                {validator: k8sValidator},
                            ]
                        }
                    >
                        <Input disabled={isDisabled} placeholder={t('graphspace.form.k8s_placeholder')} />
                    </Form.Item>

                    <Form.Item
                        name="operator_image_path"
                        label={t('graphspace.form.operator_image')}
                        rules={[
                            {
                                pattern: /^[a-zA-Z0-9\-\.]+\/[a-zA-Z0-9\-_]+\/[a-zA-Z0-9\-_]+(\:[a-z0-9\.]+)*$/,
                                message: t('graphspace.form.image_format_error'),
                            },
                        ]}
                        extra={t('graphspace.form.image_example')}
                    >
                        <Input placeholder={t('graphspace.form.image_placeholder')} />
                    </Form.Item>

                    <Form.Item
                        name="algorithm_image_url"
                        label={t('graphspace.form.algorithm_image')}
                        extra={t('graphspace.form.image_example')}
                        rules={[
                            {
                                pattern: /^[a-zA-Z0-9\-\.]+\/[a-zA-Z0-9\-_]+\/[a-zA-Z0-9\-_]+(\:[a-z0-9\.]+)*$/,
                                message: t('graphspace.form.image_format_error'),
                            },
                        ]}
                    >
                        <Input placeholder={t('graphspace.form.image_placeholder')} />
                    </Form.Item>

                    <Typography.Title level={5}>{t('graphspace.form.storage')}</Typography.Title>
                    <MyFormItem
                        label={t('graphspace.form.storage_limit')}
                        help={t('graphspace.form.storage_limit_help')}
                        unit={t('graphspace.unit.memory')}
                    >
                        <Form.Item
                            name="storage_limit"
                            noStyle
                        >
                            <InputNumber
                                style={{width: 200}}
                                placeholder={t('graphspace.form.storage_placeholder')}
                                precision={0}
                                min={1}
                            />
                        </Form.Item>
                    </MyFormItem>

                </details>

                <hr />

                <Form.Item
                    name="graphspace_admin"
                    label={t('graphspace.form.admin')}
                >
                    <Select
                        mode="multiple"
                        allowClear
                        style={{width: '100%'}}
                        placeholder={t('graphspace.form.admin_placeholder')}
                    >
                        {userList.length ? userSelect : null}
                    </Select>
                </Form.Item>

                <Form.Item
                    name="description"
                    label={t('graphspace.form.description')}
                    rules={
                        [
                            {max: 128, message: t('common.form.max_128')},
                        ]
                    }
                >
                    <Input.TextArea placeholder={t('graphspace.form.description_placeholder')} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export {EditLayer};
