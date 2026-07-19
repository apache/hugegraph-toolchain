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
    Typography,
    Select,
    Space,
    Button,
    Modal,
    message,
} from 'antd';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import * as api from '../../../api';
import * as rules from '../../../utils/rules';
import {isPdEnabled} from '../../../utils/config';
import {
    DEFAULT_GRAPHSPACE,
    getTaskGraphspaceOptions,
} from '../../../utils/productMode';
import {readWorkbenchGraphContext} from '../../../utils/workbenchGraphContext';
import FormHelpLabel from '../../../components/FormHelpLabel';
import {getResourceDisplayName} from '../../../utils/displayName';
import {scopedStorageKey} from '../../../utils/user';

const DATASOURCE_STORAGE_KEY = 'hubble_task_datasource';

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
    const [demoLoading, setDemoLoading] = useState('');
    const [demoError, setDemoError] = useState('');
    const [lastDemo, setLastDemo] = useState('');
    const [baseForm] = Form.useForm();
    const demoRequest = useRef(null);
    const mounted = useRef(true);
    const selectedGraphspace = Form.useWatch(
        ['ingestion_option', 'graphspace'], baseForm
    );
    const selectedGraph = Form.useWatch(['ingestion_option', 'graph'], baseForm);

    useEffect(() => {
        return () => {
            mounted.current = false;
            demoRequest.current = null;
        };
    }, []);

    useEffect(() => {
        demoRequest.current = null;
        setDemoLoading('');
        setDemoError('');
        setLastDemo('');
    }, [selectedGraph, selectedGraphspace]);

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
    const handleDatasourceChange = useCallback(value => {
        try {
            window.localStorage.setItem(
                scopedStorageKey(DATASOURCE_STORAGE_KEY), value.toString()
            );
        }
        catch {
            // The selected value remains valid even when storage is unavailable.
        }
    }, []);
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
                const options = res.data.records.map(item => ({
                    label: getResourceDisplayName(item.name, item.nickname),
                    value: item.name,
                    schemaReady: !item.schemaview
                        || item.schemaview.vertices.length > 0
                        || item.schemaview.edges.length > 0,
                }));
                setGraphOptions(options);

                const current = readWorkbenchGraphContext();
                const currentOption = options.find(option => option.value === current.graph);
                if (current.graphspace === selectGraphspace
                    && currentOption
                    && !baseForm.getFieldValue(['ingestion_option', 'graph'])) {
                    baseForm.setFieldsValue({
                        ingestion_option: {graph: current.graph},
                    });
                }

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
                const options = res.data.records.map(item => ({
                    label: item.datasource_name,
                    value: BigInt(item.datasource_id.toString()),
                    info: item,
                }));
                setDatasourceOptions(options);
                if (options.length > 0 && !baseForm.getFieldValue('datasource_id')) {
                    let saved;
                    try {
                        saved = window.localStorage.getItem(
                            scopedStorageKey(DATASOURCE_STORAGE_KEY)
                        );
                    }
                    catch {
                        saved = null;
                    }
                    const selected = options.find(option => option.value.toString() === saved)
                        || options[0];
                    baseForm.setFieldValue('datasource_id', selected.value);
                }

                return;
            }
            setDatasourceError(true);
        }).catch(() => active && setDatasourceError(true));

        return () => {
            active = false;
        };
    }, [baseForm, datasourceRetry]);

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
                const options = getTaskGraphspaceOptions(pdMode, res.data.records);
                setGraphsapceOptions(options);
                const current = readWorkbenchGraphContext();
                const currentOption = options.find(option => option.value === current.graphspace);
                if (currentOption
                    && !baseForm.getFieldValue(['ingestion_option', 'graphspace'])) {
                    setSelectGraphspace(currentOption.value);
                    baseForm.setFieldsValue({
                        ingestion_option: {graphspace: currentOption.value},
                    });
                }

                return;
            }
            setGraphspaceError(true);
        }).catch(() => active && setGraphspaceError(true));

        return () => {
            active = false;
        };
    }, [baseForm, graphspaceRetry, pdMode]);

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

    const prepareDemo = useCallback(async dataset => {
        if (!selectedGraphspace || !selectedGraph) {
            return;
        }
        const token = Symbol('task-demo');
        const target = {graphspace: selectedGraphspace, graph: selectedGraph};
        demoRequest.current = token;
        setDemoLoading(dataset);
        setDemoError('');
        setLastDemo(dataset);
        try {
            const res = await api.manage.loadSampleGraph(
                target.graphspace,
                target.graph,
                dataset,
                {suppressBusinessErrorToast: true}
            );
            const currentTarget = baseForm.getFieldValue('ingestion_option') || {};
            if (!mounted.current || demoRequest.current !== token
                || currentTarget.graphspace !== target.graphspace
                || currentTarget.graph !== target.graph) {
                return;
            }
            if (res.status !== 200) {
                throw new Error(res.message || t('graph.sample.failed'));
            }
            setGraphOptions(options => options.map(option => {
                return option.value === selectedGraph
                    ? {...option, schemaReady: true} : option;
            }));
            setDemoError('');
            message.success(t('graph.sample.success', {
                vertices: res.data.vertices,
                edges: res.data.edges,
            }));
        }
        catch (error) {
            if (mounted.current && demoRequest.current === token) {
                setDemoError(error.message || t('task.edit.demo_failed'));
            }
        }
        finally {
            if (mounted.current && demoRequest.current === token) {
                demoRequest.current = null;
                setDemoLoading('');
            }
        }
    }, [baseForm, selectedGraph, selectedGraphspace, t]);

    const confirmDemo = useCallback(dataset => {
        if (!selectedGraphspace || !selectedGraph) {
            return;
        }
        Modal.confirm({
            title: t(`graph.sample.${dataset}_title`),
            content: t(`graph.sample.${dataset}_description`, {graph: selectedGraph}),
            okText: t('graph.sample.confirm'),
            cancelText: t('common.action.cancel'),
            onOk: () => prepareDemo(dataset),
        });
    }, [prepareDemo, selectedGraph, selectedGraphspace, t]);

    const loadHlmDemo = useCallback(() => confirmDemo('hlm'), [confirmDemo]);
    const loadLoaderDemo = useCallback(() => confirmDemo('loader'), [confirmDemo]);
    const retryDemo = useCallback(() => prepareDemo(lastDemo), [lastDemo, prepareDemo]);

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
                    label={(
                        <FormHelpLabel
                            label={t('task.edit.name')}
                            help={t('task.edit.name_help')}
                        />
                    )}
                    name='task_name'
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
                    label={(
                        <FormHelpLabel
                            label={t('task.edit.source')}
                            help={t('task.edit.source_help')}
                        />
                    )}
                    wrapperCol={{span: 6}}
                    name='datasource_id'
                    rules={[rules.required()]}
                >
                    <Select
                        options={datasourceOptions}
                        onChange={handleDatasourceChange}
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
                <Form.Item
                    label={(
                        <FormHelpLabel
                            label={t('task.edit.target')}
                            help={t('task.edit.target_help')}
                        />
                    )}
                    required
                >
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
                            rules={[
                                rules.required(t('task.edit.select_graph')),
                                {
                                    validator: (_, value) => {
                                        const selected = graphOptions.find(
                                            option => option.value === value
                                        );
                                        if (selected && !selected.schemaReady) {
                                            return Promise.reject(
                                                t('task.edit.prepare_schema_first')
                                            );
                                        }
                                        return Promise.resolve();
                                    },
                                },
                            ]}
                        >
                            <Select
                                placeholder={t('task.edit.select_graph')}
                                options={graphOptions}
                                style={{width: 200}}
                            />
                        </Form.Item>
                    </Space>
                </Form.Item>
                <Alert
                    showIcon
                    type='info'
                    message={t('task.edit.demo_title')}
                    description={selectedGraph
                        ? t('task.edit.demo_target', {
                            graphspace: selectedGraphspace,
                            graph: selectedGraph,
                        })
                        : t('task.edit.demo_choose_graph')}
                    action={(
                        <Space wrap>
                            <Button
                                loading={demoLoading === 'hlm'}
                                disabled={!selectedGraph || Boolean(demoLoading)}
                                onClick={loadHlmDemo}
                            >
                                {t('graph.menu.load_hlm_sample')}
                            </Button>
                            <Button
                                loading={demoLoading === 'loader'}
                                disabled={!selectedGraph || Boolean(demoLoading)}
                                onClick={loadLoaderDemo}
                            >
                                {t('graph.menu.load_loader_sample')}
                            </Button>
                        </Space>
                    )}
                />
                {demoError && (
                    <Alert
                        showIcon
                        type='error'
                        message={t('task.edit.demo_failed')}
                        description={demoError}
                        action={(
                            <Button size='small' onClick={retryDemo} loading={Boolean(demoLoading)}>
                                {t('task.edit.retry_demo')}
                            </Button>
                        )}
                    />
                )}
                <Typography.Paragraph type="secondary" style={{marginLeft: '12.5%'}}>
                    {t('task.edit.loader_docs_intro')}{' '}
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
