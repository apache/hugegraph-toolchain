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
import {useCallback, useMemo, useState, useEffect} from 'react';
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

const EdgeForm = ({open, index, onCancel, sourceField, targetField, edgeList}) => {
    const {t} = useTranslation();
    const [selectLabel, setSelectLabel] = useState({});
    const [errorList, setErrorList] = useState({});
    const [edgeForm] = Form.useForm();
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
        const list = edgeForm.getFieldValue('attr') ?? [];
        const existKeys = list.map(item => item?.key);
        const enableKeys = selectLabel.properties ? selectLabel.properties.map(item => item.name) : [];

        const addRows = [];
        targetField.map(item => {
            if (!existKeys.includes(item) && enableKeys.includes(item)) {
                addRows.push({key: item, val: item});
            }
        });
        edgeForm.setFieldValue('attr', [...list, ...addRows]);
        // const list = edgeForm.getFieldValue('attr');
        // const row = list[index];

        // if (row && selectLabel.properties && selectLabel.properties.find(item => item.name === row.key)) {
        //     edgeForm.setFieldValue(['attr', index, 'val'], row.key);
        // }
    }, [edgeForm, selectLabel, targetField]);

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
                        className={'form_attr_select'}
                        name={[field.name, 'key']}
                    >
                        <Select
                            options={targetOptions}
                            placeholder={t('task.edit.select_schema_field')}
                        />
                    </Form.Item>
                    <span className={'form_attr_split'}>-</span>
                    <Form.Item
                        className={'form_attr_select'}
                        name={[field.name, 'val']}
                    >
                        <Select
                            options={propertyOptions}
                            placeholder={t('task.edit.select_mapping_field')}
                        />
                    </Form.Item>
                    <ListAction type='link' action={remove} index={index}>
                        {t('common.action.delete')}
                    </ListAction>
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
                        className={'form_attr_select'}
                        name={[field.name, 'key']}
                    >
                        <Select options={targetOptions} />
                    </Form.Item>
                    <span className={'form_attr_split'}>:</span>
                    <Form.Item
                        className={'form_attr_val'}
                        name={[field.name, 'origin']}
                    >
                        <Input />
                    </Form.Item>
                    <span className={'form_attr_split'}>{'->'}</span>
                    <Form.Item
                        className={'form_attr_val'}
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
        setErrorList({...errorList, label: ''});
    }, [errorList]);

    const handleSource = useCallback(() => {
        setErrorList({...errorList, source: ''});
    }, [errorList]);

    const handleTarget = useCallback(() => {
        setErrorList({...errorList, target: ''});
    }, [errorList]);

    const handleCancel = useCallback(() => {
        setErrorList({});
        setSelectLabel({});
        onCancel();
    }, [onCancel]);

    const addEdge = useCallback(() => {
        // const info = form.getFieldValue('edge_form') || {};
        // const edges = form.getFieldValue('edges') || [];
        // const error = {};
        // let flag = true;
        // if (!info.label) {
        //     error.label = 'error';
        //     flag = false;
        // }

        // if (!info.source) {
        //     error.source = 'error';
        //     flag = false;
        // }

        // if (!info.target) {
        //     error.target = 'error';
        //     flag = false;
        // }

        // if (!flag) {
        //     setErrorList({...errorList, ...error});
        //     return;
        // }
        // setErrorList({});

        // const field_mapping = fieldMapping(info.attr);
        // const value_mapping = valueMapping(info.value);

        // edges.push({
        //     label: info.label,
        //     skip: false,
        //     source: [info.source],
        //     unfold_source: false,
        //     target: [info.target],
        //     unfold_target: false,
        //     field_mapping,
        //     value_mapping,
        //     selected: Object.keys(field_mapping).concat(info.source, info.target),
        //     ignored: [],
        //     null_values: [''],
        //     update_strategies: {},
        // });

        // form.setFieldsValue({edges: edges});
        // form.resetFields(['edge_form']);
        // onCancel();
        edgeForm.validateFields().then(() => {
            edgeForm.submit();
            onCancel();
        });
    }, [edgeForm, onCancel]);

    useEffect(() => {
        if (!open) {
            return;
        }

        edgeForm.resetFields();
        setSelectLabel({});

        if (index >= 0) {
            (new Promise(resolve => resolve())).then(() => {
                edgeForm.setFieldsValue({...edgeList[index], index});
                setSelectLabel(sourceField.find(item => item.name === edgeList[index].label));
            });
        }
    }, [edgeForm, edgeList, index, open, sourceField]);

    return (
        <Drawer
            title={index >= 0 ? t('task.edit.edit_edge') : t('task.edit.create_edge')}
            placement="right"
            onClose={onCancel}
            width={580}
            open={open}
        >
            <Form form={edgeForm} name='edge_form' labelCol={{span: 4}}>
                <Form.Item
                    required
                    label={t('task.edit.edge_type')}
                    name={['label']}
                    rules={[rules.required()]}
                >
                    <Select
                        options={labelOptions}
                        onChange={handleLabel}
                    />
                </Form.Item>
                <Form.Item
                    required
                    label={t('task.edit.source_id')}
                    name='source'
                    extra={t('task.edit.edge_id_help')}
                    rules={[rules.required()]}
                >
                    <Select
                        options={targetOptions}
                        onChange={handleSource}
                    />
                </Form.Item>
                <Form.Item
                    required
                    label={t('task.edit.target_id')}
                    name='target'
                    extra={t('task.edit.edge_id_help')}
                    rules={[rules.required()]}
                >
                    <Select
                        options={targetOptions}
                        onChange={handleTarget}
                    />
                </Form.Item>
                <Form.Item label={t('task.edit.property_mapping')}>
                    <Form.List name='attr' rules={[checkDuplicate]}>
                        {attrFormList}
                    </Form.List>
                </Form.Item>
                <Form.Item label={t('task.edit.value_mapping')}>
                    <Form.List name='value'>
                        {valueFormList}
                    </Form.List>
                </Form.Item>
                <Form.Item name='index' hidden />
                <Form.Item wrapperCol={{offset: 4}}>
                    <Space>
                        <Button type='primary' onClick={addEdge}>
                            {t('common.action.confirm')}
                        </Button>
                        <Button onClick={handleCancel}>{t('common.action.cancel')}</Button>
                    </Space>
                </Form.Item>
            </Form>
        </Drawer>
    );
};

export default EdgeForm;
