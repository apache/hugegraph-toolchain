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

import {Alert, Form, Input, Typography, Select, Space, Button} from 'antd';
import {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import * as api from '../../../api';
import * as rules from '../../../utils/rules';
import {isPdEnabled} from '../../../utils/config';
import {
    DEFAULT_GRAPHSPACE,
    getTaskGraphspaceOptions,
} from '../../../utils/productMode';

const BaseForm = ({cancel, visible, loading}) => {
    const {t} = useTranslation();
    const pdMode = isPdEnabled();
    const [datasourceOptions, setDatasourceOptions] = useState([]);
    const [graphspaceOptions, setGraphsapceOptions] = useState([]);
    const [graphOptions, setGraphOptions] = useState([]);
    const [selectGraphspace, setSelectGraphspace] = useState('');
    const [datasourceError, setDatasourceError] = useState(false);
    const [graphspaceError, setGraphspaceError] = useState(false);
    const [graphError, setGraphError] = useState(false);
    const [datasourceRetry, setDatasourceRetry] = useState(0);
    const [graphspaceRetry, setGraphspaceRetry] = useState(0);
    const [graphRetry, setGraphRetry] = useState(0);
    const [baseForm] = Form.useForm();

    const checkExistName = () => ({
        validator: async (_, value) => {
            const res = await api.manage.getTaskList({query: value}).then(res => {
                if (res.status !== 200) {
                    return t('task.edit.duplicate_check_failed');
                }

                if (res.data.total > 0) {
                    return t('task.edit.duplicate_name');
                }

                return '';
            }).catch(() => t('task.edit.duplicate_check_failed'));

            if (res) {
                return Promise.reject(res);
            }

            return Promise.resolve();
        },
        validateTrigger: ['onBlur'],
    });

    const handleChange = useCallback(val => setSelectGraphspace(val), []);
    const retryDatasources = useCallback(() => setDatasourceRetry(v => v + 1), []);
    const retryGraphspaces = useCallback(() => setGraphspaceRetry(v => v + 1), []);
    const retryGraphs = useCallback(() => setGraphRetry(v => v + 1), []);

    useEffect(() => {
        if (!selectGraphspace) {
            return;
        }

        let active = true;
        setGraphOptions([]);
        setGraphError(false);
        api.manage.getGraphList(selectGraphspace, {page_size: -1}).then(res => {
            if (!active) {
                return;
            }
            if (res.status === 200) {
                setGraphOptions(res.data.records.map(item => ({
                    label: item.nickname,
                    value: item.name,
                    disabled: (item.schemaview && item.schemaview.vertices.length === 0
                        && item.schemaview.edges.length === 0),
                })));

                return;
            }

            setGraphError(true);
        }).catch(() => active && setGraphError(true));

        // setVertex([]);
        // setEdge([]);
        baseForm.resetFields([['ingestion_option', 'graph']]);
        return () => {
            active = false;
        };
    }, [selectGraphspace, baseForm, graphRetry]);

    useEffect(() => {
        let active = true;
        setDatasourceOptions([]);
        setDatasourceError(false);
        api.manage.getDatasourceList({page_size: -1}).then(res => {
            if (!active) {
                return;
            }
            if (res.status === 200) {
                setDatasourceOptions(res.data.records.map(item => ({
                    label: item.datasource_name,
                    value: BigInt(item.datasource_id.toString()),
                    info: item,
                })));

                return;
            }
            setDatasourceError(true);
        }).catch(() => active && setDatasourceError(true));

        return () => {
            active = false;
        };
    }, [datasourceRetry]);

    useEffect(() => {
        if (!pdMode) {
            return;
        }

        let active = true;
        setGraphsapceOptions([]);
        setGraphspaceError(false);
        api.manage.getGraphSpaceList({page_size: -1}).then(res => {
            if (!active) {
                return;
            }
            if (res.status === 200) {
                setGraphsapceOptions(getTaskGraphspaceOptions(pdMode, res.data.records));

                return;
            }
            setGraphspaceError(true);
        }).catch(() => active && setGraphspaceError(true));

        return () => {
            active = false;
        };
    }, [graphspaceRetry, pdMode]);

    useEffect(() => {
        if (pdMode) {
            return;
        }

        setGraphsapceOptions(getTaskGraphspaceOptions(false));
        setSelectGraphspace(DEFAULT_GRAPHSPACE);
        baseForm.setFieldsValue({
            ingestion_option: {
                graphspace: DEFAULT_GRAPHSPACE,
            },
        });
    }, [baseForm, pdMode]);

    return (
        <div style={{display: visible ? '' : 'none'}}>
            <Form
                form={baseForm}
                name='base_form'
                labelCol={{span: 3}}
            >
                <Typography.Title level={5}>{t('task.edit.basic_info')}</Typography.Title>
                <Alert
                    showIcon
                    type='info'
                    message={t('task.edit.workflow_title')}
                    description={t('task.edit.workflow_description')}
                />
                {datasourceError && (
                    <Alert
                        showIcon
                        type='error'
                        message={t('task.edit.load_datasources_failed')}
                        action={(
                            <Button size='small' onClick={retryDatasources}>
                                {t('task.edit.retry_datasources')}
                            </Button>
                        )}
                    />
                )}
                {graphspaceError && (
                    <Alert
                        showIcon
                        type='error'
                        message={t('task.edit.load_graphspaces_failed')}
                        action={(
                            <Button size='small' onClick={retryGraphspaces}>
                                {t('task.edit.retry_graphspaces')}
                            </Button>
                        )}
                    />
                )}
                {graphError && (
                    <Alert
                        showIcon
                        type='error'
                        message={t('task.edit.load_graphs_failed')}
                        action={(
                            <Button size='small' onClick={retryGraphs}>
                                {t('task.edit.retry_graphs')}
                            </Button>
                        )}
                    />
                )}
                <Form.Item
                    label={t('task.edit.name')}
                    name='task_name'
                    extra={t('task.edit.name_help')}
                    validateTrigger={['onBlur', 'onChange']}
                    rules={[
                        rules.required(),
                        rules.isNoramlName(t('task.edit.name_rule')),
                        checkExistName,
                    ]}
                >
                    <Input placeholder={t('task.edit.name_placeholder')} showCount maxLength={48} />
                </Form.Item>
                <Form.Item
                    label={t('task.edit.source')}
                    wrapperCol={{span: 6}}
                    name='datasource_id'
                    extra={t('task.edit.source_help')}
                    rules={[rules.required()]}
                >
                    <Select
                        options={datasourceOptions}
                        placeholder={t('task.edit.select_source')}
                        notFoundContent={
                            <div style={{textAlign: 'center', padding: '4px 0'}}>
                                <span>{t('task.edit.no_datasource')}</span>
                                <Link to="/source" style={{marginLeft: 8}}>
                                    {t('task.edit.go_create_datasource')}
                                </Link>
                            </div>
                        }
                    />
                </Form.Item>
                <Form.Item label={t('task.edit.target')} required>
                    <Space>
                        <Form.Item
                            name={['ingestion_option', 'graphspace']}
                            rules={[rules.required(t('task.edit.select_graphspace'))]}
                        >
                            <Select
                                placeholder={t('task.edit.select_graphspace')}
                                options={graphspaceOptions}
                                style={{width: 200}}
                                onChange={handleChange}
                                disabled={!pdMode}
                            />
                        </Form.Item>
                        <Form.Item
                            name={['ingestion_option', 'graph']}
                            rules={[rules.required(t('task.edit.select_graph'))]}
                        >
                            <Select
                                placeholder={t('task.edit.select_graph')}
                                options={graphOptions}
                                style={{width: 200}}
                            />
                        </Form.Item>
                    </Space>
                </Form.Item>
                <Typography.Paragraph type="secondary" style={{marginLeft: '12.5%'}}>
                    {t('task.edit.target_help')}{' '}
                    <a
                        href="https://hugegraph.apache.org/docs/quickstart/toolchain/hugegraph-loader/"
                        target="_blank"
                        rel="noreferrer"
                    >
                        {t('task.edit.loader_docs')}
                    </a>
                </Typography.Paragraph>
                <Form.Item wrapperCol={{offset: 3}}>
                    <Space>
                        <Button onClick={cancel}>{t('common.action.cancel')}</Button>
                        <Button type='primary' htmlType='submit' loading={loading}>
                            {t('common.action.next')}
                        </Button>
                    </Space>
                </Form.Item>
            </Form>
        </div>
    );
};

export default BaseForm;
