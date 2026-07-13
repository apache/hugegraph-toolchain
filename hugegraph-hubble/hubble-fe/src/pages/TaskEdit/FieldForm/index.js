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
    Alert,
    Form,
    Input,
    Transfer,
    Space,
    Button,
    Typography,
    Tree,
    Popconfirm,
} from 'antd';
import {PlusOutlined, MinusSquareOutlined} from '@ant-design/icons';
import {useCallback, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import * as api from '../../../api';
import * as rules from '../../../utils/rules';
import style from '../index.module.scss';

const HiddenFormValue = () => null;

const FieldTitle = ({fieldKey, onDelete, confirmTitle, deleteLabel, okText, cancelText}) => {
    const handleConfirm = useCallback(() => onDelete(fieldKey), [fieldKey, onDelete]);
    return (
        <Space>
            {fieldKey}
            <Popconfirm
                title={confirmTitle}
                onConfirm={handleConfirm}
                okText={okText}
                cancelText={cancelText}
            >
                <Button
                    type='text'
                    size='small'
                    aria-label={deleteLabel}
                    title={deleteLabel}
                    icon={<MinusSquareOutlined />}
                />
            </Popconfirm>
        </Space>
    );
};

const FieldTree = ({checkedKeys, data, onItemSelect}) => {
    const handleCheck = useCallback((_, {node: {key}}) => {
        onItemSelect(key, !checkedKeys.includes(key));
    }, [checkedKeys, onItemSelect]);

    return (
        <Tree
            blockNode
            checkable
            checkStrictly
            defaultExpandAll
            checkedKeys={checkedKeys}
            treeData={data}
            onCheck={handleCheck}
        />
    );
};

// const formatData = field => {
//     const {vertex, edge} = field;
//     const data = [];

//     for (let item of vertex) {
//         data.push({})
//     }

// }

const FieldForm = ({visible, prev, datasourceID}) => {
    const {t} = useTranslation();
    const [targetKeys, setTargetKeys] = useState([]);
    const [data, setData] = useState([]);
    const [inputData, setInputData] = useState('');
    const [status, setStatus] = useState('');
    const [transferStatus, setTransferStatus] = useState('');
    const [loadError, setLoadError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [fieldForm] = Form.useForm();

    const setSourceData = useCallback(data => {
        setData(data);
        fieldForm.setFieldValue('source_keys', data);
    }, [fieldForm]);

    const setKey = useCallback(val => {
        setTargetKeys(val);
        fieldForm.setFieldValue('target_keys', val);
        if (val.length > 0) {
            setTransferStatus('');
        }
    }, [fieldForm]);

    const addField = useCallback(() => {
        if (inputData && status !== 'error') {
            setSourceData([...data, {key: inputData}]);
            setInputData('');
        }
    }, [data, inputData, setSourceData, status]);

    const handleDelete = useCallback(key => {
        const index = data.findIndex(item => item.key === key);
        const tmp = [...data];
        tmp.splice(index, 1);

        setSourceData(tmp);
    }, [data, setSourceData]);

    const handleInputData = useCallback(e => {
        const value = e.target.value;
        if (/[^a-zA-Z0-9\-\_]/.test(value)) {
            setStatus('error');
        }
        else {
            setStatus('');
        }

        setInputData(value);
    }, []);

    const generateTree = useCallback((treeNodes = [], checkedKeys = []) =>
        treeNodes.map(({children, ...props}) => ({
            ...props,
            title: <FieldTitle
                fieldKey={props.key}
                onDelete={handleDelete}
                confirmTitle={t('task.edit.delete_field_confirm')}
                deleteLabel={t('task.edit.delete_field', {field: props.key})}
                okText={t('common.action.confirm')}
                cancelText={t('common.action.cancel')}
            />,
            disabled: checkedKeys.includes(props.key),
        })), [handleDelete, t]);

    const footer = useCallback((_, {direction}) => {
        return (
            direction === 'left'
            && (
                <div style={{margin: 5}}>
                    <Input
                        value={inputData}
                        addonAfter={(
                            <Button
                                type='text'
                                size='small'
                                aria-label={t('task.edit.add_field')}
                                title={t('task.edit.add_field')}
                                icon={<PlusOutlined />}
                                disabled={!inputData || status === 'error'}
                                onClick={addField}
                            />
                        )}
                        placeholder={t('task.edit.add_field_placeholder')}
                        onChange={handleInputData}
                        status={status}
                    />
                </div>
            )
        );
    }, [addField, handleInputData, inputData, status, t]);

    const renderField = useCallback(item => item.key, []);
    const retryFields = useCallback(() => setRetry(value => value + 1), []);

    useEffect(() => {
        if (!datasourceID) {
            return;
        }

        let active = true;
        setSourceData([]);
        setTargetKeys([]);
        fieldForm.setFieldValue('target_keys', []);
        setLoadError(false);
        api.manage.getDatasourceSchema(datasourceID).then(res => {
            if (!active) {
                return;
            }
            if (res.status === 200) {
                setSourceData(res.data.map(item => ({key: item})));
                return;
            }

            setLoadError(true);
        }).catch(() => active && setLoadError(true));

        return () => {
            active = false;
        };
    }, [datasourceID, fieldForm, retry, setSourceData]);

    return (
        <div style={{display: visible ? '' : 'none'}} className={style.transfer}>
            <Form form={fieldForm} name='field_form'>
                <Typography.Title level={5}>{t('task.edit.step_source_fields')}</Typography.Title>
                <Alert
                    showIcon
                    type='info'
                    message={t('task.edit.fields_help_title')}
                    description={t('task.edit.fields_help')}
                />
                {loadError && (
                    <Alert
                        showIcon
                        type='error'
                        message={t('task.edit.load_fields_failed')}
                        action={(
                            <Button size='small' onClick={retryFields}>
                                {t('task.edit.retry_fields')}
                            </Button>
                        )}
                    />
                )}
                <Form.Item>
                    <Transfer
                        dataSource={data}
                        titles={[
                            t('task.edit.source_available_fields'),
                            t('task.edit.selected_fields'),
                        ]}
                        listStyle={{width: 400, height: 400}}
                        render={renderField}
                        targetKeys={targetKeys}
                        status={transferStatus}
                        onChange={setKey}
                        footer={footer}
                        oneWay
                    >
                        {({direction, onItemSelect, selectedKeys}) => {
                            if (direction === 'left') {
                                const checkedKeys = [...selectedKeys, ...targetKeys];
                                return (
                                    <FieldTree
                                        checkedKeys={checkedKeys}
                                        data={generateTree(data, targetKeys)}
                                        onItemSelect={onItemSelect}
                                    />
                                );
                            }
                        }}
                    </Transfer>
                </Form.Item>
                <Form.Item
                    name='target_keys'
                    rules={[rules.required(t('task.edit.select_source_fields'))]}
                    hidden
                >
                    <HiddenFormValue />
                </Form.Item>
                <Form.Item name='source_keys' hidden>
                    <HiddenFormValue />
                </Form.Item>
                <Form.Item>
                    <Space>
                        <Button onClick={prev}>{t('common.action.back')}</Button>
                        <Button type='primary' htmlType='submit'>{t('common.action.next')}</Button>
                    </Space>
                </Form.Item>
            </Form>
        </div>
    );
};

export default FieldForm;
