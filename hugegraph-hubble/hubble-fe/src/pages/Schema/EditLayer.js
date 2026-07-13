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
import {useState, useEffect, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import * as api from '../../api/index';
import * as rules from '../../utils/rules';

const PAGE_ERROR_CONFIG = {suppressBusinessErrorToast: true};
const DUPLICATE_SCHEMA_TEMPLATE
    = 'Cannot create schema template since it has been created';
const SCHEMA_EXAMPLE_URL = 'https://hugegraph.apache.org/docs/language/hugegraph-example/';

export const BUILTIN_SCHEMA_TEMPLATES = {
    people_network: [
        'schema.propertyKey("name").asText().ifNotExist().create()',
        'schema.propertyKey("since").asInt().ifNotExist().create()',
        'schema.vertexLabel("person").properties("name").primaryKeys("name")',
        '      .ifNotExist().create()',
        'schema.edgeLabel("knows").sourceLabel("person").targetLabel("person")',
        '      .properties("since").ifNotExist().create()',
        'schema.indexLabel("personByName").onV("person").by("name")',
        '      .secondary().ifNotExist().create()',
    ].join('\n'),
    product_catalog: [
        'schema.propertyKey("sku").asText().ifNotExist().create()',
        'schema.propertyKey("name").asText().ifNotExist().create()',
        'schema.propertyKey("price").asDouble().ifNotExist().create()',
        'schema.vertexLabel("product").properties("sku", "name", "price")',
        '      .primaryKeys("sku").ifNotExist().create()',
        'schema.edgeLabel("related").sourceLabel("product").targetLabel("product")',
        '      .ifNotExist().create()',
        'schema.indexLabel("productByPrice").onV("product").by("price")',
        '      .range().ifNotExist().create()',
    ].join('\n'),
};

const SchemaHelp = ({t}) => (
    <span>
        {t('schema_template.form.schema_help')}{' '}
        <a href={SCHEMA_EXAMPLE_URL} target="_blank" rel="noreferrer">
            {t('schema_template.form.schema_docs')}
        </a>
    </span>
);

export const schemaTemplateBusinessError = (res, t, action, name) => {
    if (action === 'create' && res?.message === DUPLICATE_SCHEMA_TEMPLATE) {
        return t('schema_template.create_duplicate', {name});
    }

    return t(`schema_template.${action}_failed`);
};

const EditLayer = ({visible, onCancel, graphspace, refresh, mode, detail}) => {
    const {t} = useTranslation();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const schemaDraft = Form.useWatch('schema', form);

    const applyBuiltinTemplate = useCallback(key => {
        form.setFieldsValue({
            name: key,
            schema: BUILTIN_SCHEMA_TEMPLATES[key],
        });
    }, [form]);

    const updateSchema = useCallback((name, data) => {
        api.manage.updateSchema(graphspace, name, data, PAGE_ERROR_CONFIG).then(res => {
            setLoading(false);
            if (res.status === 200) {
                message.success(t('schema_template.update_success'));
                onCancel();
                refresh();

                return;
            }

            message.error(schemaTemplateBusinessError(res, t, 'update', name));
        }).catch(() => {
            setLoading(false);
            message.error(t('common.msg.operation_failed'));
        });
    }, [graphspace, onCancel, refresh, t]);

    const addSchema = useCallback(data => {
        api.manage.addSchema(graphspace, data, PAGE_ERROR_CONFIG).then(res => {
            setLoading(false);
            if (res.status === 200) {
                message.success(t('schema_template.create_success'));
                onCancel();
                refresh();

                return;
            }

            message.error(schemaTemplateBusinessError(res, t, 'create', data.name));
        }).catch(() => {
            setLoading(false);
            message.error(t('common.msg.operation_failed'));
        });
    }, [graphspace, onCancel, refresh, t]);

    const onFinish = useCallback(() => {
        // form.resetFields();
        if (mode === 'view') {
            onCancel();
            return;
        }

        form.validateFields().then(values => {
            setLoading(true);
            if (mode === 'create') {
                addSchema(values);
                return;
            }

            updateSchema(detail.name, values);
        });
    }, [addSchema, detail.name, form, mode, onCancel, updateSchema]);

    useEffect(() => {
        if (!visible) {
            return;
        }

        if (mode === 'create') {
            // form.setFieldsValue({name: '', schema: ''});
            form.resetFields();
        }
        else {
            form.setFieldsValue(detail);
        }
    }, [visible, detail.name, mode, form, detail]);

    return (
        mode === 'view'
            ? (
                <Modal
                    open={visible}
                    onCancel={onCancel}
                    title={t('schema_template.action.view')}
                    width={600}
                    footer={null}
                >
                    <Form
                        form={form}
                        labelCol={{span: 6}}
                        preserve={false}
                    >
                        <Form.Item
                            label={t('schema_template.form.name')}
                        >
                            {detail.name}
                        </Form.Item>
                        <Form.Item label={t('schema_template.form.schema')}>
                            <pre style={{whiteSpace: 'pre-wrap'}}>{detail.schema}</pre>
                        </Form.Item>
                    </Form>
                </Modal>
            ) : (
                <Modal
                    open={visible}
                    onCancel={onCancel}
                    title={mode === 'edit'
                        ? t('schema_template.action.edit')
                        : t('schema_template.action.create')}
                    width={600}
                    onOk={onFinish}
                    confirmLoading={loading}
                    destroyOnClose
                >
                    <Form
                        form={form}
                        labelCol={{span: 6}}
                        validateTrigger='onBlur'
                        preserve={false}
                    >
                        {mode === 'create' && (
                            <Form.Item
                                label={t('schema_template.form.starting_point')}
                                extra={t('schema_template.form.starting_point_help')}
                            >
                                <Select
                                    disabled={Boolean(schemaDraft)}
                                    placeholder={t('schema_template.form.starting_point_placeholder')}
                                    onSelect={applyBuiltinTemplate}
                                    options={Object.keys(BUILTIN_SCHEMA_TEMPLATES).map(key => ({
                                        value: key,
                                        label: t(`schema_template.builtin.${key}`),
                                    }))}
                                />
                            </Form.Item>
                        )}
                        <Form.Item
                            label={t('schema_template.form.name')}
                            rules={[rules.required(), rules.isName, {type: 'string', max: 48}]}
                            name='name'
                        >
                            <Input
                                placeholder={t('schema_template.form.name_placeholder')}
                                disabled={mode === 'edit'}
                            />
                        </Form.Item>
                        <Form.Item
                            label={t('schema_template.form.schema')}
                            extra={<SchemaHelp t={t} />}
                            rules={[rules.required()]}
                            name='schema'
                        >
                            <Input.TextArea
                                autoSize={{minRows: 12, maxRows: 22}}
                                style={{fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'}}
                                placeholder={t('schema_template.form.schema_placeholder')}
                            />
                        </Form.Item>
                    </Form>
                </Modal>
            )
    );
};

export default EditLayer;
