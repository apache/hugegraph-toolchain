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

import {Alert, Button, Modal, Form, Input, Radio, Select, Spin, message} from 'antd';
import {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import * as api from '../../api/index';
import * as rules from '../../utils/rules';
import {BUILTIN_SCHEMA_TEMPLATES} from '../Schema/builtinSchemaTemplates';
import {toGraphSchemaGroovy} from '../Schema/schemaGroovy';
import {getResourceAlias} from '../../utils/displayName';
import {isPdEnabled} from '../../utils/config';

const PAGE_ERROR_CONFIG = {suppressBusinessErrorToast: true};
const DUPLICATE_SCHEMA_TEMPLATE
    = 'Cannot create schema template since it has been created';

const normalizeSchema = schema => String(schema ?? '').replace(/\s+/g, ' ').trim();

const isEquivalentBuiltinSchema = (actual, expected) => (
    normalizeSchema(toGraphSchemaGroovy(actual)) === normalizeSchema(toGraphSchemaGroovy(expected))
);

const errorMessage = error => (
    error?.response?.data?.message || error?.data?.message || error?.message
);

const isDuplicateSchemaError = error => (
    (error?.message || error?.response?.data?.message) === DUPLICATE_SCHEMA_TEMPLATE
);

export const validateGraphFields = async form => {
    try {
        return await form.validateFields();
    }
    catch (error) {
        if (Array.isArray(error?.errorFields)) {
            return null;
        }
        throw error;
    }
};

const EditLayer = ({
    visible,
    onCancel,
    refresh,
    graphspace,
    graph,
    validateForm = validateGraphFields,
}) => {
    const [schemaList, setSchemaList] = useState([]);
    const [schemaLoading, setSchemaLoading] = useState(false);
    const [schemaError, setSchemaError] = useState(false);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const {t} = useTranslation();
    const pdMode = isPdEnabled();
    const schemaOptions = useMemo(() => {
        const savedNames = new Set(pdMode ? schemaList.map(item => item.name) : []);
        const builtins = Object.keys(BUILTIN_SCHEMA_TEMPLATES)
            .filter(name => !savedNames.has(name))
            .map(name => ({label: t(`schema_template.builtin.${name}`), value: name}));
        const saved = pdMode
            ? schemaList
                .map(item => ({label: item.name, value: item.name}))
            : [];

        return [...builtins, ...saved];
    }, [pdMode, schemaList, t]);

    const confirmBuiltinTemplate = useCallback(async (name, expectedSchema) => {
        const res = await api.manage.getSchema(graphspace, name, PAGE_ERROR_CONFIG);
        if (res.status !== 200) {
            throw new Error(res.message || t('graph.form.schema_verify_failed'));
        }
        if (!isEquivalentBuiltinSchema(res.data?.schema, expectedSchema)) {
            throw new Error(t('graph.form.schema_conflict', {name}));
        }
    }, [graphspace, t]);

    const ensureBuiltinTemplate = useCallback(async (name, expectedSchema) => {
        const listedTemplate = schemaList.find(item => item.name === name);
        if (listedTemplate) {
            if (listedTemplate.schema !== undefined) {
                if (!isEquivalentBuiltinSchema(listedTemplate.schema, expectedSchema)) {
                    throw new Error(t('graph.form.schema_conflict', {name}));
                }
                return;
            }
            await confirmBuiltinTemplate(name, expectedSchema);
            return;
        }

        let result;
        try {
            result = await api.manage.addSchema(graphspace, {
                name,
                schema: expectedSchema,
            }, PAGE_ERROR_CONFIG);
        }
        catch (error) {
            if (isDuplicateSchemaError(error)) {
                await confirmBuiltinTemplate(name, expectedSchema);
                return;
            }
            throw new Error(errorMessage(error) || t('graph.form.schema_create_failed'), {cause: error});
        }

        if (result.status === 200) {
            return;
        }
        if (isDuplicateSchemaError(result)) {
            await confirmBuiltinTemplate(name, expectedSchema);
            return;
        }
        throw new Error(result.message || t('graph.form.schema_create_failed'));
    }, [confirmBuiltinTemplate, graphspace, schemaList, t]);

    const loadSchemaTemplates = useCallback(() => {
        setSchemaList([]);
        setSchemaError(false);
        if (!pdMode) {
            setSchemaLoading(false);
            return;
        }
        setSchemaLoading(true);
        api.manage.getSchemaList(graphspace, {page_size: -1}).then(res => {
            if (res.status === 200) {
                setSchemaList(res.data.records);
                return;
            }
            setSchemaError(true);
        }).catch(() => setSchemaError(true))
            .finally(() => setSchemaLoading(false));
    }, [graphspace, pdMode]);
    const chooseSchema = useCallback(() => {
        form.setFieldValue('sample', undefined);
    }, [form]);
    const chooseSample = useCallback(() => {
        form.setFieldValue('schema', undefined);
    }, [form]);

    const onFinish = useCallback(async () => {
        let values;
        try {
            values = await validateForm(form);
        }
        catch {
            message.error(t('common.msg.operation_failed'));
            return;
        }
        if (!values) {
            return;
        }
        setLoading(true);

        if (graph) {
            api.manage.updateGraph(
                graphspace,
                graph,
                {nickname: values.nickname},
                PAGE_ERROR_CONFIG
            ).then(res => {
                setLoading(false);
                if (res.status === 200) {
                    message.success(t('graph.form.update_success'));
                    onCancel();
                    refresh();
                    return;
                }
                message.error(res.message);
            }).catch(() => {
                setLoading(false);
                message.error(t('common.msg.operation_failed'));
            });
            return;
        }

        const sample = values.sample === 'none' ? undefined : values.sample;
        const savedTemplate = pdMode && schemaList.some(item => item.name === values.schema);
        const builtinSchema = savedTemplate ? undefined : BUILTIN_SCHEMA_TEMPLATES[values.schema];
        const ensureTemplate = pdMode && builtinSchema
            ? ensureBuiltinTemplate(values.schema, builtinSchema)
            : Promise.resolve();

        ensureTemplate.then(async () => {
            const graphRequest = {...values, auth: false, graphspace};
            delete graphRequest.sample;
            if (!pdMode) {
                delete graphRequest.schema;
            }
            const result = await api.manage.addGraph(graphspace, graphRequest);
            if (result.status === 200 && sample) {
                try {
                    const sampleResult = await api.manage.loadSampleGraph(
                        graphspace,
                        values.graph,
                        sample,
                        PAGE_ERROR_CONFIG
                    );
                    if (sampleResult.status !== 200) {
                        throw new Error(sampleResult.message
                            || t('graph.form.sample_apply_failed'));
                    }
                    result.sampleResult = sampleResult;
                }
                catch (error) {
                    const partialError = error instanceof Error
                        ? error
                        : new Error(errorMessage(error) || t('graph.form.sample_apply_failed'));
                    partialError.graphCreated = true;
                    throw partialError;
                }
            }
            if (result.status !== 200 || pdMode || !builtinSchema) {
                return result;
            }
            try {
                const schemaResult = await api.manage.addGraphSchema(
                    graphspace,
                    values.graph,
                    {'schema-groovy': toGraphSchemaGroovy(builtinSchema)},
                    PAGE_ERROR_CONFIG
                );
                if (schemaResult.status !== 200) {
                    throw new Error(schemaResult.message
                                    || t('graph.form.schema_apply_failed'));
                }
            }
            catch (error) {
                const messageText = errorMessage(error)
                    || t('graph.form.schema_apply_failed');
                const partialError = error instanceof Error
                    ? error
                    : new Error(messageText);
                if (!partialError.message) {
                    partialError.message = messageText;
                }
                partialError.graphCreated = true;
                throw partialError;
            }
            return result;
        }).then(res => {
            setLoading(false);
            if (res.status === 200) {
                if (res.sampleResult?.data) {
                    message.success(t('graph.sample.success', {
                        vertices: res.sampleResult.data.vertices,
                        edges: res.sampleResult.data.edges,
                    }));
                }
                else {
                    message.success(t('graph.form.create_success'));
                }
                onCancel();
                refresh();
                return;
            }
            message.error(res.message);
        }).catch(error => {
            setLoading(false);
            if (error.graphCreated) {
                onCancel();
                refresh();
            }
            message.error(error.message || t('common.msg.operation_failed'));
        });
    }, [
        ensureBuiltinTemplate,
        form,
        graph,
        graphspace,
        onCancel,
        pdMode,
        refresh,
        schemaList,
        t,
        validateForm,
    ]);

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
                    form.setFieldsValue({
                        ...res.data,
                        graph: res.data.name,
                        nickname: getResourceAlias(res.data.name, res.data.nickname),
                    });
                }
            });
        }
    }, [visible, graph, form, graphspace, loadSchemaTemplates]);

    return (
        <Modal
            open={visible}
            onCancel={onCancel}
            title={graph ? t('graph.form.title_edit') : t('graph.form.title_create')}
            destroyOnHidden
            width={600}
            onOk={onFinish}
            confirmLoading={loading}
            mask={{closable: false}}
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
                    // Keep this validation aligned with Server GraphManager.checkNickname().
                    rules={[rules.isPropertyName(), {type: 'string', max: 48}]}
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
                                title={t('graph.form.schema_load_failed')}
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
                            extra={(
                                <span>
                                    {t('graph.form.schema_optional_hint')}{' '}
                                    <a href={`/graphspace/${graphspace}/schema?create=true`}>
                                        {t('graph.form.schema_create')}
                                    </a>
                                </span>
                            )}
                        >
                            <Select
                                loading={schemaLoading}
                                disabled={schemaLoading || schemaError}
                                allowClear
                                placeholder={t('graph.form.schema_placeholder')}
                                options={schemaOptions}
                                onChange={chooseSchema}
                            />
                        </Form.Item>
                        <Form.Item
                            label={t('graph.form.sample')}
                            name='sample'
                            extra={t('graph.form.sample_hint')}
                        >
                            <Radio.Group
                                onChange={chooseSample}
                            >
                                <Radio value='hlm'>{t('graph.form.sample_hlm')}</Radio>
                                <Radio value='rank'>{t('graph.form.sample_rank')}</Radio>
                                <Radio value='loader'>{t('graph.form.sample_loader')}</Radio>
                                <Radio value='none'>{t('graph.form.sample_none')}</Radio>
                            </Radio.Group>
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
            mask={{closable: false}}
        >
            {loadError && (
                <Alert
                    type='error'
                    showIcon
                    title={t('graph.schema_view.load_failed')}
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
                    title={t('graph.schema_view.export_failed')}
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
    const [loading, setLoading] = useState(false);
    const generation = useRef(0);
    const {t} = useTranslation();

    useEffect(() => {
        generation.current += 1;
        setLoading(false);
        if (!open) return;
        form.resetFields();
        let active = true;
        api.manage.getGraph(graphspace, graph).then(res => {
            if (active && res.status === 200) {
                form.setFieldsValue({
                    nickname: t('graph.clone.nickname', {nickname: res.data.nickname || graph}),
                });
            }
        }).catch(() => {});
        return () => { active = false; generation.current += 1; };
    }, [open, graphspace, graph, form, t]);

    const handleClone = async () => {
        const requestGeneration = generation.current;
        let values;
        try {
            values = await form.validateFields();
        }
        catch {
            return;
        }
        if (requestGeneration !== generation.current) return;
        setLoading(true);
        try {
            const res = await api.manage.cloneGraph(graphspace, graph, {
                graphspace, name: values.name, nickname: values.nickname, load_data: 0,
            }, {suppressBusinessErrorToast: true});
            if (requestGeneration !== generation.current) return;
            if (res.status !== 200) {
                message.error(res.message || t('graph.clone.failed'));
                return;
            }
            message.success(t('graph.clone.success'));
            onCancel();
            refresh();
        }
        catch (error) {
            if (requestGeneration === generation.current) {
                message.error(error?.response?.data?.message || t('graph.clone.failed'));
            }
        }
        finally {
            if (requestGeneration === generation.current) setLoading(false);
        }
    };

    return (
        <Modal open={open} onCancel={onCancel} title={t('graph.clone.title')}
            width={600} onOk={handleClone} confirmLoading={loading} destroyOnHidden>
            <Alert type='info' showIcon title={t('graph.clone.schema_only')} />
            <Form form={form} labelCol={{span: 6}} preserve={false}>
                <Form.Item label={t('graph.clone.name')} name='name'
                    rules={[rules.required(), rules.isName, {type: 'string', max: 48}, {
                        validator: (_, value) => value !== graph ? Promise.resolve()
                            : Promise.reject(new Error(t('graph.clone.name_duplicate'))),
                    }]}>
                    <Input placeholder={t('graph.clone.name_duplicate')} />
                </Form.Item>
                <Form.Item label={t('graph.clone.nickname_label')} name='nickname'
                    rules={[rules.required(), rules.isPropertyName, {type: 'string', max: 48}]}>
                    <Input />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export {EditLayer, ViewLayer, CloneLayer};
