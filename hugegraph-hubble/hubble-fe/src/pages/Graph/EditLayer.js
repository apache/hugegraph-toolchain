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

import {Alert, Button, Modal, Form, Input, Select, Spin, message} from 'antd';
import {useState, useEffect, useCallback, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import * as api from '../../api/index';
import * as rules from '../../utils/rules';
import {byteConvert, timeConvert} from '../../utils/format';
import style from './index.module.scss';

const EditLayer = ({visible, onCancel, refresh, graphspace, graph}) => {
    const [schemaList, setSchemaList] = useState([]);
    const [schemaLoading, setSchemaLoading] = useState(false);
    const [schemaError, setSchemaError] = useState(false);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const {t} = useTranslation();

    const loadSchemaTemplates = useCallback(() => {
        setSchemaList([]);
        setSchemaError(false);
        setSchemaLoading(true);
        api.manage.getSchemaList(graphspace).then(res => {
            if (res.status === 200) {
                setSchemaList(res.data.records);
                return;
            }
            setSchemaError(true);
        }).catch(() => setSchemaError(true))
            .finally(() => setSchemaLoading(false));
    }, [graphspace]);

    const onFinish = useCallback(() => {
        form.validateFields().then(values => {
            setLoading(true);

            if (graph) {
                api.manage.updateGraph(graphspace, graph, {nickname: values.nickname}).then(res => {
                    setLoading(false);
                    if (res.status === 200) {
                        message.success(t('graph.form.update_success'));
                        onCancel();
                        refresh();
                        return;
                    }
                    message.error(res.message);
                });
                return;
            }

            api.manage.addGraph(graphspace, {...values, auth: false, graphspace}).then(res => {
                setLoading(false);
                if (res.status === 200) {
                    message.success(t('graph.form.create_success'));
                    onCancel();
                    refresh();
                    return;
                }
                message.error(res.message);
            });
        });
    }, [form, graphspace, graph, refresh, onCancel, t]);

    useEffect(() => {
        if (!visible) {
            return;
        }

        if (!graph) {
            loadSchemaTemplates();
        }

        if (graph) {
            api.manage.getGraph(graphspace, graph).then(res => {
                if (res.status === 200) {
                    form.setFieldsValue({...res.data, graph: res.data.name});
                }
            });
        }
    }, [visible, graph, form, graphspace, loadSchemaTemplates]);

    return (
        <Modal
            open={visible}
            onCancel={onCancel}
            title={graph ? t('graph.form.title_edit') : t('graph.form.title_create')}
            destroyOnClose
            width={600}
            onOk={onFinish}
            confirmLoading={loading}
            maskClosable={false}
        >
            <Form
                form={form}
                labelCol={{span: 6}}
                preserve={false}
            >
                <Form.Item
                    label={t('graph.form.name')}
                    extra={t('graph.form.name_help')}
                    rules={[rules.required(), rules.isName, {type: 'string', max: 48}]}
                    name='graph'
                >
                    <Input placeholder={t('graph.form.name_placeholder')} disabled={graph} />
                </Form.Item>
                <Form.Item
                    label={t('graph.form.nickname')}
                    extra={t('graph.form.nickname_help')}
                    rules={[rules.required(), rules.isPropertyName, {type: 'string', max: 48}]}
                    name='nickname'
                >
                    <Input placeholder={t('graph.form.nickname_placeholder')} />
                </Form.Item>
                {!graph && (
                    <>
                        {schemaError && (
                            <Alert
                                type='error'
                                showIcon
                                message={t('graph.form.schema_load_failed')}
                                description={t('graph.form.schema_optional_hint')}
                                action={(
                                    <Button size='small' onClick={loadSchemaTemplates}>
                                        {t('graph.form.schema_retry')}
                                    </Button>
                                )}
                            />
                        )}
                        <Form.Item
                            label={t('graph.form.schema')}
                            name='schema'
                            extra={t('graph.form.schema_optional_hint')}
                        >
                            <Select
                                loading={schemaLoading}
                                disabled={schemaLoading || schemaError}
                                placeholder={t('graph.form.schema_placeholder')}
                                options={schemaList.map(item => ({
                                    label: item.name,
                                    value: item.name,
                                }))}
                            />
                        </Form.Item>
                    </>
                )}
            </Form>
        </Modal>
    );
};

const ViewLayer = ({visible, onCancel, graphspace, graph}) => {
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(false);
    const requestToken = useRef(null);
    const exportRequest = useRef(null);
    const {t} = useTranslation();

    const loadSchema = useCallback(() => {
        const token = Symbol('graph-schema');
        requestToken.current = token;
        setInfo('');
        setLoadError(false);
        setLoading(true);
        api.manage.getGraphSchema(graphspace, graph).then(res => {
            if (requestToken.current !== token) {
                return;
            }
            if (res.status === 200) {
                setInfo(res.data.schema);
                return;
            }
            setLoadError(true);
        }).catch(() => {
            if (requestToken.current === token) {
                setLoadError(true);
            }
        }).finally(() => {
            if (requestToken.current === token) {
                setLoading(false);
            }
        });
    }, [graphspace, graph]);

    const exportSchema = useCallback(() => {
        const token = Symbol('graph-schema-export');
        exportRequest.current = token;
        setExportError(false);
        setExporting(true);
        api.manage.exportSchema(graphspace, graph).then(content => {
            if (exportRequest.current !== token) {
                return;
            }
            const blob = new Blob([content], {type: 'text/plain;charset=utf-8'});
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${graphspace}-${graph}-schema.groovy`;
            anchor.click();
            URL.revokeObjectURL(url);
        }).catch(() => {
            if (exportRequest.current === token) {
                setExportError(true);
            }
        }).finally(() => {
            if (exportRequest.current === token) {
                setExporting(false);
            }
        });
    }, [graphspace, graph]);

    useEffect(() => {
        if (!visible) {
            return;
        }
        exportRequest.current = null;
        setExporting(false);
        setExportError(false);
        loadSchema();
        return () => {
            requestToken.current = null;
            exportRequest.current = null;
        };
    }, [visible, loadSchema]);

    return (
        <Modal
            open={visible}
            onCancel={onCancel}
            title={t('graph.menu.view_schema')}
            width={600}
            onOk={onCancel}
            footer={null}
            maskClosable={false}
        >
            {loadError && (
                <Alert
                    type='error'
                    showIcon
                    message={t('graph.schema_view.load_failed')}
                    action={(
                        <Button size='small' onClick={loadSchema}>
                            {t('graph.schema_view.retry')}
                        </Button>
                    )}
                />
            )}
            {exportError && (
                <Alert
                    type='error'
                    showIcon
                    message={t('graph.schema_view.export_failed')}
                />
            )}
            <Spin spinning={loading}>
                <pre>{info}</pre>
            </Spin>
            <Button
                onClick={exportSchema}
                loading={exporting}
                disabled={loading || loadError || !info}
            >
                {t('graph.schema_view.export')}
            </Button>
        </Modal>
    );
};

const CloneLayer = ({open, onCancel, refresh, graphspace, graph}) => {
    const [form] = Form.useForm();
    const [graphspaceList, setGraphspaceList] = useState([]);
    const [detail, setDetail] = useState({});
    const [loading, setLoading] = useState(false);
    const {t} = useTranslation();

    const notEq = (str, msg) => ({
        validator(_, value) {
            if (value !== str) {
                return Promise.resolve();
            }

            return Promise.reject(new Error(msg));
        },
    });

    const handleClone = useCallback(() => {
        form.validateFields().then(res => {
            setLoading(true);
            api.manage.cloneGraph(graphspace, graph, {
                graphspace: res.graphspace,
                nickname: res.nickname,
                name: res.name,
                load_data: res.load_data,
            }).then(res => {
                setLoading(false);
                if (res.status === 200) {
                    message.success(t('graph.clone.success'));
                    onCancel();
                    refresh();
                    return;
                }

                message.error(res.message);
            });
        });
    }, [form, graphspace, graph, onCancel, refresh, t]);

    useEffect(() => {
        if (!open) {
            return;
        }

        api.manage.getGraph(graphspace, graph).then(res => {
            if (res.status === 200) {
                setDetail(res.data);
                form.setFieldsValue({
                    name: res.data.name,
                    nickname: t('graph.clone.nickname', {nickname: res.data.nickname}),
                });
            }
        });

        api.manage.getGraphSpaceList({page_size: -1}).then(res => {
            if (res.status === 200) {
                setGraphspaceList(res.data.records);
                return;
            }
            message.error(res.message);
        });
    }, [open, graphspace, graph, form, t]);

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            title={t('graph.clone.title')}
            width={600}
            onOk={handleClone}
            maskClosable={false}
            confirmLoading={loading}
            destroyOnClose
        >
            <Form
                form={form}
                labelCol={{span: 6}}
                preserve={false}
                initialValues={{
                    graphspace,
                    load_data: 0,
                }}
            >
                <Form.Item
                    label={t('graph.clone.name')}
                    rules={[
                        rules.required(),
                        rules.isName,
                        {type: 'string', max: 48},
                        notEq(graph, t('graph.clone.name_duplicate')),
                    ]}
                    name='name'
                >
                    <Input placeholder={t('graph.clone.name_duplicate')} />
                </Form.Item>
                <Form.Item
                    label={t('graph.clone.nickname_label')}
                    rules={[
                        rules.required(),
                        rules.isPropertyName,
                        {type: 'string', max: 48},
                        notEq(detail.nickname, t('graph.clone.nickname_duplicate')),
                    ]}
                    name='nickname'
                >
                    <Input placeholder={t('graph.clone.nickname_duplicate')} />
                </Form.Item>
                <Form.Item
                    label={t('graph.clone.graphspace')}
                    rules={[rules.required()]}
                    name='graphspace'
                >
                    <Select options={graphspaceList.map(item => ({label: item.nickname, value: item.name}))} />
                </Form.Item>
                <Form.Item
                    label={t('graph.clone.content')}
                    name='load_data'
                    required
                >
                    <Select
                        options={[
                            {label: t('graph.clone.schema'), value: 0},
                            {label: t('graph.clone.schema_data'), value: 1},
                        ]}
                    />
                </Form.Item>
                <Form.Item label={t('graph.clone.required_disk')} className={style.form_item}>
                    {byteConvert(detail.storage)}
                </Form.Item>
                <Form.Item label={t('graph.clone.estimated_time')} className={style.form_item}>
                    {timeConvert(detail.storage * 3600 / (4 * 1024 * 1024))}
                </Form.Item>
            </Form>
        </Modal>
    );
};

export {EditLayer, ViewLayer, CloneLayer};
