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
    const [errorList, setErrorList] = useState({});
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

    const checkDuplicate = () => ({
        validator(_, value) {
            const existName = [];
            if (value === undefined) {
                return Promise.resolve();
            }

            for (let item of value) {
                if (item === undefined || !item.key) {
                    return Promise.resolve();
                }

                if (existName.includes(item.key)) {
                    return Promise.reject(new Error(t('task.edit.duplicate_property')));
                }

                existName.push(item.key);
            }

            return Promise.resolve();
        },
    });

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
                            placeholder={t('task.edit.select_schema_field')}
                        />
                    </Form.Item>
                    <span className={'form_attr_split'}>-</span>
                    <Form.Item
                        className="form_attr_select"
                        name={[field.name, 'val']}
                    >
                        <Select
                            options={propertyOptions}
                            placeholder={t('task.edit.select_mapping_field')}
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

    const valueFormList = (fields, {add, remove}) => (
        <>
            {fields.map((field, index) => (
                <div key={field.key}>
                    <Form.Item
                        className="form_attr_select"
                        name={[field.name, 'key']}
                    >
                        <Select
                            options={targetOptions}
                        />
                    </Form.Item>
                    <span className={'form_attr_split'}>:</span>
                    <Form.Item
                        className="form_attr_val"
                        name={[field.name, 'origin']}
                    >
                        <Input />
                    </Form.Item>
                    <span className={'form_attr_split'}>{'->'}</span>
                    <Form.Item
                        className="form_attr_val"
                        name={[field.name, 'replace']}
                    >
                        <Input />
                    </Form.Item>
                    <ListAction type='link' action={remove} index={index}>
                        {t('common.action.delete')}
                    </ListAction>
                </div>
            )

            )}
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
        setErrorList({...errorList, label: ''});
    }, [errorList, vertexForm]);

    const handleCancel = useCallback(() => {
        setErrorList({});
        setSelectLabel({});
        vertexForm.resetFields();
        onCancel();
    }, [onCancel, vertexForm]);

    const onFinish = useCallback(() => {

        vertexForm.validateFields().then(() => {
            vertexForm.submit();
            onCancel();
        });
    }, [onCancel, vertexForm]);

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
            <Form form={vertexForm} labelCol={{span: 4}} name='vertex_form'>
                <Form.Item
                    label={t('task.edit.vertex_type')}
                    required
                    name={'label'}
                    rules={[rules.required()]}
                >
                    <Select
                        options={labelOptions}
                        onChange={handleLabel}
                    />
                </Form.Item>
                <Form.Item
                    // required={selectLabel.id_strategy !== 'PRIMARY_KEY'}
                    label={t('task.edit.id_column')}
                    name={'id'}
                    extra={t('task.edit.id_column_help', {
                        strategy: selectLabel.id_strategy || '-',
                    })}
                    rules={[!['PRIMARY_KEY', 'AUTOMATIC'].includes(selectLabel.id_strategy) ? rules.required() : null]}
                >
                    <Select
                        disabled={['PRIMARY_KEY', 'AUTOMATIC'].includes(selectLabel.id_strategy)
                        || !selectLabel.id_strategy}
                        options={targetOptions}
                    />
                </Form.Item>
                <Form.Item
                    label={t('task.edit.property_mapping')}
                    extra={t('task.edit.property_mapping_help')}
                >
                    <Form.List name={'attr'} rules={[checkDuplicate]}>
                        {attrFormList}
                    </Form.List>
                </Form.Item>
                <Form.Item
                    label={t('task.edit.value_mapping')}
                    extra={t('task.edit.value_mapping_help')}
                >
                    <Form.List name={'value'}>
                        {valueFormList}
                    </Form.List>
                </Form.Item>
                <Form.Item name='index' hidden />
                <Form.Item wrapperCol={{offset: 4}}>
                    <Space>
                        <Button type='primary' onClick={onFinish}>
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
