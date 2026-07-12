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

import {Modal, Form, Input, Select, message, Space, Tooltip} from 'antd';
import {QuestionCircleOutlined} from '@ant-design/icons';
import {useCallback, useState} from 'react';
import * as api from '../../../api';
import * as rules from '../../../utils/rules';
import {
    dataTypeOptions,
    cardinalityOptions,
} from '../common/config';
import {useTranslation} from 'react-i18next';

const FieldLabel = ({label, help}) => (
    <Space size={4}>
        <span>{label}</span>
        <Tooltip title={help}>
            <QuestionCircleOutlined aria-label={help} />
        </Tooltip>
    </Space>
);

const EditPropertyLayer = ({visible, onCancle, graphspace, graph, refresh}) => {
    const {t} = useTranslation();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const onFinish = useCallback(() => {
        form.validateFields().then(values => {
            setLoading(true);

            api.manage.addMetaProperty(graphspace, graph, values).then(res => {
                setLoading(false);
                if (res.status === 200) {
                    refresh();
                    onCancle();
                    message.success(t('schema.common.add_success'));
                    return;
                }

                message.error(res.message);
            });
        });
    }, [form, graph, graphspace, onCancle, refresh, t]);

    return (
        <Modal
            title={t('schema.property.create')}
            open={visible}
            onCancel={onCancle}
            onOk={onFinish}
            confirmLoading={loading}
            destroyOnClose
            width={600}
        >
            <Form
                form={form}
                labelCol={{span: 6}}
                preserve={false}
                initialValues={{data_type: 'TEXT', cardinality: 'SINGLE'}}
            >
                <Form.Item
                    label={<FieldLabel
                        label={t('schema.property.form.name')}
                        help={t('schema.property.form.name_help')}
                    />}
                    name='name'
                    rules={[rules.required(), rules.isPropertyName, {type: 'string', max: 128}]}
                >
                    <Input placeholder={t('schema.property.form.name_placeholder')} max={128} />
                </Form.Item>
                <Form.Item
                    label={<FieldLabel
                        label={t('schema.property.form.type')}
                        help={t('schema.property.form.type_help')}
                    />}
                    name='data_type'
                    rules={[rules.required()]}
                    wrapperCol={{span: 6}}
                >
                    <Select options={dataTypeOptions} />
                </Form.Item>
                <Form.Item
                    label={<FieldLabel
                        label={t('schema.property.form.cardinality')}
                        help={t('schema.property.form.cardinality_help')}
                    />}
                    name='cardinality'
                    rules={[rules.required()]}
                    wrapperCol={{span: 6}}
                >
                    <Select options={cardinalityOptions} />
                </Form.Item>
            </Form>
        </Modal>
    );
};


export {EditPropertyLayer};
