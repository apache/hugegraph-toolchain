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

import {Space, Button, Form, Select, Input, Drawer} from 'antd';
import {useState, useEffect, useCallback, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import * as rules from '../../../utils/rules';
import FormHelpLabel from '../../../components/FormHelpLabel';
import {completeRowsRule, duplicateSourceRule} from './mappingRules';

const ListAction = ({index, action, children, ...props}) => {
    const handleClick = useCallback(() => action(index), [action, index]);
    return <Button {...props} onClick={handleClick}>{children}</Button>;
};

const AddAction = ({action, children, ...props}) => {
    const handleClick = useCallback(() => action(), [action]);
    return <Button {...props} onClick={handleClick}>{children}</Button>;
};

const VertexForm = ({open, onCancel, sourceField, targetField, vertexList, index}) => {
    const {t} = useTranslation();
    const [selectLabel, setSelectLabel] = useState({});
    const [vertexForm] = Form.useForm();
    const targetOptions = useMemo(() => targetField.map(item => ({label: item, value: item})),
        [targetField]);
    const labelOptions = useMemo(() => sourceField.map(item => ({
        label: item.name,
        value: item.name,
        info: item,
    })), [sourceField]);
    const propertyOptions = useMemo(() => (selectLabel?.properties ?? []).map(item => ({
        label: item.name,
        value: item.name,
    })), [selectLabel]);

    const autoSelect = useCallback(() => {
        const list = vertexForm.getFieldValue('attr') ?? [];
        const existKeys = list.map(item => item?.key);
        const enableKeys = selectLabel.properties ? selectLabel.properties.map(item => item.name) : [];

        const addRows = [];
        targetField.map(item => {
            if (!existKeys.includes(item) && enableKeys.includes(item)) {
                addRows.push({key: item, val: item});
            }
        });
        vertexForm.setFieldValue('attr', [...list, ...addRows]);
    }, [selectLabel, targetField, vertexForm]);

    const attrFormList = (fields, {add, remove}, {errors}) => (
        <>
            {fields.map((field, index) => (
                <div key={field.key}>
                    <Form.Item
                        className="form_attr_select"
                        name={[field.name, 'key']}
                    >
                        <Select
                            options={targetOptions}
                            placeholder={t('task.edit.select_source_field')}
                        />
                    </Form.Item>
                    <span className={'form_attr_split'}>-</span>
                    <Form.Item
                        className="form_attr_select"
                        name={[field.name, 'val']}
                    >
                        <Select
                            options={propertyOptions}
                            placeholder={t('task.edit.select_schema_property')}
                        />
                    </Form.Item>
                    <Space>
                        <ListAction type='link' action={remove} index={index}>
                            {t('common.action.delete')}
                        </ListAction>
                    </Space>
                </div>
            ))}
            <Form.ErrorList errors={errors} />
            <AddAction action={autoSelect} block style={{marginBottom: 8}}>
                {t('task.edit.auto_match')}
            </AddAction>
            <AddAction type='dashed' action={add} block>
                +{t('common.action.add')}
            </AddAction>
        </>
    );

    const valueFormList = (fields, {add, remove}, {errors}) => (
        <>
            {fields.map((field, index) => (
                <div key={field.key}>
                    <Form.Item
                        className="form_attr_select"
                        name={[field.name, 'key']}
                    >
                        <Select
                            options={targetOptions}
                            placeholder={t('task.edit.select_source_field')}
                        />
                    </Form.Item>
                    <span className={'form_attr_split'}>:</span>
                    <Form.Item
                        className="form_attr_val"
                        name={[field.name, 'origin']}
                    >
                        <Input placeholder={t('task.edit.original_value_placeholder')} />
                    </Form.Item>
                    <span className={'form_attr_split'}>{'->'}</span>
                    <Form.Item
                        className="form_attr_val"
                        name={[field.name, 'replace']}
                    >
                        <Input placeholder={t('task.edit.replacement_value_placeholder')} />
                    </Form.Item>
                    <ListAction type='link' action={remove} index={index}>
                        {t('common.action.delete')}
                    </ListAction>
                </div>
            )

            )}
            <Form.ErrorList errors={errors} />
            <AddAction type='link' className='form_attr_add' action={add}>
                +{t('common.action.add')}
            </AddAction>
        </>
    );

    const handleLabel = useCallback((_, option) => {
        setSelectLabel(option.info);
        if (['PRIMARY_KEY', 'AUTOMATIC'].includes(option.info.id_strategy)) {
            vertexForm.resetFields(['id']);
        }
    }, [vertexForm]);

    const handleCancel = useCallback(() => {
        setSelectLabel({});
        vertexForm.resetFields();
        onCancel();
    }, [onCancel, vertexForm]);

    const onFinish = useCallback(() => onCancel(), [onCancel]);

    useEffect(() => {
        if (!open) {
            return;
        }

        vertexForm.resetFields();
        setSelectLabel({});

        if (index >= 0) {
            (new Promise(resolve => resolve())).then(() => {
                vertexForm.setFieldsValue({...vertexList[index], index});
                setSelectLabel(sourceField.find(item => item.name === vertexList[index].label));
            });
        }
    }, [index, open, sourceField, vertexForm, vertexList]);

    return (
        <Drawer
            title={index >= 0 ? t('task.edit.edit_vertex') : t('task.edit.create_vertex')}
            placement="right"
            onClose={onCancel}
            width={580}
            open={open}
        >
            <Form
                form={vertexForm}
                labelCol={{span: 4}}
                name='vertex_form'
                onFinish={onFinish}
            >
                <Form.Item
                    label={(
                        <FormHelpLabel
                            label={t('task.edit.vertex_type')}
                            help={t('task.edit.vertex_type_help')}
                        />
                    )}
                    required
                    name={'label'}
                    rules={[rules.required()]}
                >
                    <Select
                        options={labelOptions}
                        onChange={handleLabel}
                        placeholder={t('task.edit.select_vertex_label')}
                    />
                </Form.Item>
                <Form.Item
                    // required={selectLabel.id_strategy !== 'PRIMARY_KEY'}
                    label={(
                        <FormHelpLabel
                            label={t('task.edit.id_column')}
                            help={t('task.edit.id_column_help', {
                                strategy: selectLabel.id_strategy || '-',
                            })}
                        />
                    )}
                    name={'id'}
                    rules={[!['PRIMARY_KEY', 'AUTOMATIC'].includes(selectLabel.id_strategy) ? rules.required() : null]}
                >
                    <Select
                        disabled={['PRIMARY_KEY', 'AUTOMATIC'].includes(selectLabel.id_strategy)
                        || !selectLabel.id_strategy}
                        options={targetOptions}
                        placeholder={t('task.edit.select_id_field')}
                    />
                </Form.Item>
                <Form.Item
                    label={(
                        <FormHelpLabel
                            label={t('task.edit.property_mapping')}
                            help={t('task.edit.property_mapping_help')}
                        />
                    )}
                >
                    <Form.List
                        name={'attr'}
                        rules={[
                            completeRowsRule(t, ['key', 'val'],
                                'task.edit.incomplete_property_mapping'),
                            duplicateSourceRule(t),
                        ]}
                    >
                        {attrFormList}
                    </Form.List>
                </Form.Item>
                <Form.Item
                    label={(
                        <FormHelpLabel
                            label={t('task.edit.value_mapping')}
                            help={t('task.edit.value_mapping_help')}
                        />
                    )}
                >
                    <Form.List
                        name={'value'}
                        rules={[
                            completeRowsRule(t, ['key', 'origin', 'replace'],
                                'task.edit.incomplete_value_mapping'),
                        ]}
                    >
                        {valueFormList}
                    </Form.List>
                </Form.Item>
                <Form.Item name='index' hidden><Input type='hidden' /></Form.Item>
                <Form.Item wrapperCol={{offset: 4}}>
                    <Space>
                        <Button type='primary' htmlType='submit'>
                            {t('common.action.confirm')}
                        </Button>
                        <Button onClick={handleCancel}>{t('common.action.cancel')}</Button>
                    </Space>
                </Form.Item>
            </Form>
        </Drawer>
    );
};

export default VertexForm;
