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

import {Modal, Form, Input, Select, message} from 'antd';
import {useCallback, useState} from 'react';
import * as api from '../../../api';
import * as rules from '../../../utils/rules';
import FormHelpLabel from '../../../components/FormHelpLabel';
import {sanitizePublicError} from '../../../utils/publicError';
import {
    dataTypeOptions,
    cardinalityOptions,
} from '../common/config';
import {useTranslation} from 'react-i18next';

const EditPropertyLayer = ({visible, onCancle, graphspace, graph, refresh}) => {
    const {t} = useTranslation();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const onFinish = useCallback(async () => {
        let values;
        try {
            values = await form.validateFields();
        }
        catch (error) {
            // Ant Design rejects for field validation; the form already owns
            // the inline feedback, so this is not a request failure.
            return;
        }

        setLoading(true);
        try {
            const res = await api.manage.addMetaProperty(
                graphspace,
                graph,
                values,
                {suppressBusinessErrorToast: true}
            );
            if (res.status === 200) {
                refresh();
                onCancle();
                message.success(t('schema.common.add_success'));
                return;
            }

            message.error(res.message || t('common.msg.operation_failed'));
        }
        catch (error) {
            const fallbackError = t('common.msg.operation_failed');
            const errorMessage = error?.response?.data?.message || error?.message;
            message.error(sanitizePublicError(errorMessage, fallbackError));
        }
        finally {
            setLoading(false);
        }
    }, [form, graph, graphspace, onCancle, refresh, t]);

    return (
        <Modal
            title={t('schema.property.create')}
            open={visible}
            onCancel={onCancle}
            onOk={onFinish}
            confirmLoading={loading}
            okText={t('schema.property.create')}
            cancelText={t('common.action.cancel')}
            cancelButtonProps={{disabled: loading}}
            closable={!loading}
            maskClosable={false}
            destroyOnClose
            width={560}
        >
            <Form
                form={form}
                className='property-create-form'
                layout='vertical'
                preserve={false}
                initialValues={{data_type: 'TEXT', cardinality: 'SINGLE'}}
            >
                <Form.Item
                    className='property-create-form__name'
                    label={<FormHelpLabel
                        label={t('schema.property.form.name')}
                        help={t('schema.property.form.name_help')}
                    />}
                    name='name'
                    rules={[rules.required(), rules.isPropertyName, {type: 'string', max: 128}]}
                >
                    <Input
                        placeholder={t('schema.property.form.name_placeholder')}
                        maxLength={128}
                    />
                </Form.Item>
                <div className='property-create-form__select-row'>
                    <Form.Item
                        label={<FormHelpLabel
                            label={t('schema.property.form.type')}
                            help={t('schema.property.form.type_help')}
                        />}
                        name='data_type'
                        rules={[rules.required()]}
                    >
                        <Select options={dataTypeOptions} />
                    </Form.Item>
                    <Form.Item
                        label={<FormHelpLabel
                            label={t('schema.property.form.cardinality')}
                            help={t('schema.property.form.cardinality_help')}
                        />}
                        name='cardinality'
                        rules={[rules.required()]}
                    >
                        <Select options={cardinalityOptions} />
                    </Form.Item>
                </div>
            </Form>
        </Modal>
    );
};


export {EditPropertyLayer};
