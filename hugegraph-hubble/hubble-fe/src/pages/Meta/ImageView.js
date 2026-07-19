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

import {useEffect, useCallback, useRef, useState} from 'react';
import {useParams} from 'react-router-dom';
import * as api from '../../api';
import GraphView from '../../components/GraphinView';
import {EditPropertyLayer} from './Property/EditLayer';
import {EditVertexLayer} from './Vertex/EditLayer';
import {EditEdgeLayer} from './Edge/EditLayer';
import PropertyTable from './Property';
import {
    Alert, Button, Row, Space, Col, Drawer, Spin, Modal, Select, Typography, message,
} from 'antd';
import {formatToGraphInData} from '../../utils/formatGraphInData';
import {useTranslation} from 'react-i18next';
import styles from './ImageView.module.scss';
import {BUILTIN_SCHEMA_TEMPLATES} from '../Schema/builtinSchemaTemplates';
import {toGraphSchemaGroovy} from '../Schema/schemaGroovy';

const SCHEMA_LABEL_DOCS_URL
    = 'https://hugegraph.apache.org/docs/clients/hugegraph-client/';
const PAGE_ERROR_CONFIG = {suppressBusinessErrorToast: true};
const BUILTIN_TEMPLATE_SOURCE = 'builtin:';
const SAVED_TEMPLATE_SOURCE = 'saved:';

const enlargeSmallSchema = data => {
    if (!data.nodes?.length || data.nodes.length >= 10) {
        return data;
    }
    return {
        nodes: data.nodes.map(node => ({
            ...node,
            style: {
                ...node.style,
                label: {...node.style?.label, fontSize: 18},
                keyshape: {...node.style?.keyshape, size: 72},
                icon: {...node.style?.icon, fontSize: 20},
            },
        })),
        edges: data.edges.map(edge => ({
            ...edge,
            style: {
                ...edge.style,
                label: {...edge.style?.label, fontSize: 16},
                keyshape: {...edge.style?.keyshape, lineWidth: 2.5},
            },
        })),
    };
};

const formatProperties = properties => {
    if (Array.isArray(properties)) {
        return properties.join(', ');
    }
    return Object.entries(properties || {})
        .map(([name, type]) => `${name} (${String(type).toLowerCase()})`)
        .join(', ');
};

const formatKeys = keys => {
    return Array.isArray(keys) ? keys.join(', ') : '';
};

const SchemaTooltip = ({model, type, t}) => {
    const schema = model?.data || {};
    const properties = formatProperties(schema.properties);
    const isVertex = type === 'vertex';
    const details = isVertex ? [
        [t('schema.image_view.hover.properties'), properties],
        [t('schema.image_view.hover.primary_keys'), formatKeys(schema.primary_keys)],
    ] : [
        [t('schema.image_view.hover.source'), schema.source],
        [t('schema.image_view.hover.target'), schema.target],
        [t('schema.image_view.hover.properties'), properties],
        [t('schema.image_view.hover.sort_keys'), formatKeys(schema.sort_keys)],
    ];
    return (
        <section className={styles.tooltip}>
            <strong>{schema.label || schema.id}</strong>
            <span className={styles.tooltipType}>
                {t(`schema.image_view.hover.${isVertex ? 'vertex' : 'edge'}`)}
            </span>
            <dl>
                {details.map(([label, value]) => (
                    <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value || t('schema.image_view.hover.none')}</dd>
                    </div>
                ))}
            </dl>
            <span className={styles.tooltipHint}>
                {t('schema.image_view.hover.edit_hint')}
            </span>
        </section>
    );
};

const ImageView = () => {
    const {t} = useTranslation();
    // const graphRef = useRef(null);
    const {graphspace, graph} = useParams();
    const [data, setData] = useState({vertices: [], edges: []});
    const [propertyVisible, setPropertyVisible] = useState(false);
    const [vertexVisible, setVertexVisible] = useState(false);
    const [edgeVisible, setEdgeVisible] = useState(false);
    const [propertyListVisible, setPropertyListVisible] = useState(false);
    const [vertexName, setVertexName] = useState('');
    const [edgeName, setEdgeName] = useState('');
    const [propertyList, setPropertyList] = useState([]);
    const [vertexList, setVertexList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const requestToken = useRef(null);
    const templateRequestToken = useRef(null);
    const templateApplyToken = useRef(null);
    const [refresh, setRefresh] = useState(false);
    const [templateVisible, setTemplateVisible] = useState(false);
    const [templateLoading, setTemplateLoading] = useState(false);
    const [templateLoadError, setTemplateLoadError] = useState(false);
    const [templateApplying, setTemplateApplying] = useState(false);
    const [savedTemplates, setSavedTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState();

    const handleRefresh = useCallback(() => {
        setRefresh(!refresh);
    }, [refresh]);

    const hideVertexLayer = useCallback(() => {
        setVertexVisible(false);
    }, []);

    const hideEdgeLayer = useCallback(() => {
        setEdgeVisible(false);
    }, []);

    const hidePropertyLayer = useCallback(() => {
        setPropertyVisible(false);
    }, []);

    const hidePropertyListLayer = useCallback(() => {
        setPropertyListVisible(false);
    }, []);

    const createProperty = useCallback(() => {
        setPropertyVisible(true);
    }, []);

    const createVertex = useCallback(() => {
        setVertexName('');
        setVertexVisible(true);
    }, []);

    const createEdge = useCallback(() => {
        setEdgeName('');
        setEdgeVisible(true);
    }, []);

    const showPropertyList = useCallback(() => {
        setPropertyListVisible(true);
    }, []);

    const loadSchemaTemplates = useCallback(() => {
        const token = Symbol('schema-templates');
        templateRequestToken.current = token;
        setTemplateLoading(true);
        setTemplateLoadError(false);
        api.manage.getSchemaList(
            graphspace,
            {page_size: -1},
            PAGE_ERROR_CONFIG
        ).then(res => {
            if (templateRequestToken.current !== token) {
                return;
            }
            if (res.status !== 200) {
                setSavedTemplates([]);
                setTemplateLoadError(true);
                return;
            }
            setSavedTemplates(res.data?.records || []);
        }).catch(() => {
            if (templateRequestToken.current === token) {
                setSavedTemplates([]);
                setTemplateLoadError(true);
            }
        }).finally(() => {
            if (templateRequestToken.current === token) {
                setTemplateLoading(false);
            }
        });
    }, [graphspace]);

    const openTemplatePicker = useCallback(() => {
        setSelectedTemplate(undefined);
        setTemplateVisible(true);
        loadSchemaTemplates();
    }, [loadSchemaTemplates]);

    const closeTemplatePicker = useCallback(() => {
        if (!templateApplying) {
            templateRequestToken.current = null;
            setTemplateLoading(false);
            setTemplateVisible(false);
        }
    }, [templateApplying]);

    const applySchemaTemplate = useCallback(async () => {
        if (!selectedTemplate) {
            return;
        }
        const token = Symbol('apply-schema-template');
        templateApplyToken.current = token;
        setTemplateApplying(true);
        try {
            const isBuiltin = selectedTemplate.startsWith(BUILTIN_TEMPLATE_SOURCE);
            const isSaved = selectedTemplate.startsWith(SAVED_TEMPLATE_SOURCE);
            const templateName = selectedTemplate.slice(
                (isBuiltin ? BUILTIN_TEMPLATE_SOURCE : SAVED_TEMPLATE_SOURCE).length
            );
            let schema;
            if (isBuiltin) {
                schema = BUILTIN_SCHEMA_TEMPLATES[templateName];
            }
            else if (isSaved) {
                const detail = await api.manage.getSchema(
                    graphspace,
                    templateName,
                    PAGE_ERROR_CONFIG
                );
                if (templateApplyToken.current !== token) {
                    return;
                }
                if (detail.status !== 200 || !detail.data?.schema) {
                    throw new Error(detail.message || 'template detail unavailable');
                }
                schema = detail.data.schema;
            }
            if (!schema) {
                throw new Error('template source unavailable');
            }
            const result = await api.manage.addGraphSchema(
                graphspace,
                graph,
                {'schema-groovy': toGraphSchemaGroovy(schema)},
                PAGE_ERROR_CONFIG
            );
            if (templateApplyToken.current !== token) {
                return;
            }
            if (result.status !== 200) {
                throw new Error(result.message || 'schema apply failed');
            }
            message.success(t('schema.image_view.template_apply_success'));
            setTemplateVisible(false);
            handleRefresh();
        }
        catch (error) {
            if (templateApplyToken.current !== token) {
                return;
            }
            message.error(t('schema.image_view.template_apply_failed'));
            setTemplateVisible(false);
            handleRefresh();
        }
        finally {
            if (templateApplyToken.current === token) {
                templateApplyToken.current = null;
                setTemplateApplying(false);
            }
        }
    }, [graph, graphspace, handleRefresh, selectedTemplate, t]);

    const handleDoubleClick = useCallback((id, type, data) => {
        if (type === 'node') {
            setVertexVisible(true);
            setEdgeVisible(false);
            setVertexName(data.label);
        }

        if (type === 'edge') {
            setVertexVisible(false);
            setEdgeVisible(true);
            setEdgeName(data.label);
        }
    }, []);

    const renderVertexTooltip = useCallback(({model}) => (
        <SchemaTooltip model={model} type='vertex' t={t} />
    ), [t]);

    const renderEdgeTooltip = useCallback(({model}) => (
        <SchemaTooltip model={model} type='edge' t={t} />
    ), [t]);

    const loadSchemaView = useCallback(() => {
        const token = Symbol('schema-image');
        requestToken.current = token;
        setData({nodes: [], edges: []});
        setVertexList([]);
        setPropertyList([]);
        setLoadError(false);
        setLoading(true);
        Promise.allSettled([
            api.manage.getGraphView(graphspace, graph),
            api.manage.getMetaVertexList(graphspace, graph, {page_size: -1}),
            api.manage.getMetaPropertyList(graphspace, graph, {page_size: -1}),
        ]).then(results => {
            if (requestToken.current !== token) {
                return;
            }
            const [view, vertices, properties] = results;
            const successful = results.every(result => result.status === 'fulfilled'
                && result.value.status === 200);
            if (!successful) {
                setLoadError(true);
                return;
            }
            setData(enlargeSmallSchema(formatToGraphInData(view.value.data)));
            setVertexList(vertices.value.data.records.map(item => ({
                label: item.name, value: item.name,
            })));
            setPropertyList(properties.value.data.records.map(item => ({
                label: item.name,
                value: item.name,
                data_type: item.data_type,
            })));
        }).finally(() => {
            if (requestToken.current === token) {
                setLoading(false);
            }
        });
    }, [graph, graphspace]);

    useEffect(() => {
        loadSchemaView();
        return () => {
            requestToken.current = null;
        };
    }, [refresh, loadSchemaView]);

    useEffect(() => () => {
        templateRequestToken.current = null;
        templateApplyToken.current = null;
    }, []);

    useEffect(() => {
        templateRequestToken.current = null;
        templateApplyToken.current = null;
        setSavedTemplates([]);
        setSelectedTemplate(undefined);
        setTemplateLoading(false);
        setTemplateLoadError(false);
        setTemplateVisible(false);
        setTemplateApplying(false);
    }, [graphspace, graph]);

    const schemaIsEmpty = !loading && !loadError
        && !data.nodes?.length && !data.edges?.length
        && !vertexList.length && !propertyList.length;
    const smallSchema = Boolean(data.nodes?.length && data.nodes.length < 10);
    const builtinNames = Object.keys(BUILTIN_SCHEMA_TEMPLATES);
    const savedOptions = savedTemplates
        .map(item => ({
            label: builtinNames.includes(item.name)
                ? `${item.name} (${t('schema.image_view.saved_templates')})`
                : item.name,
            value: `${SAVED_TEMPLATE_SOURCE}${item.name}`,
        }));
    const templateOptions = [
        {
            label: t('schema.image_view.builtin_templates'),
            options: builtinNames.map(name => ({
                label: t(`schema_template.builtin.${name}`),
                value: `${BUILTIN_TEMPLATE_SOURCE}${name}`,
            })),
        },
        {
            label: t('schema.image_view.saved_templates'),
            options: savedOptions,
        },
    ];

    const schemaActions = (
        <Space wrap>
            <Button
                disabled={loading || loadError}
                onClick={createProperty}
            >
                {t('schema.property.create')}
            </Button>
            <Button disabled={loading || loadError} onClick={createVertex}>
                {t('schema.vertex.create')}
            </Button>
            <Button
                disabled={loading || loadError || vertexList.length === 0}
                onClick={createEdge}
            >
                {t('schema.edge.form.title_create')}
            </Button>
            <Button disabled={loading || loadError} onClick={showPropertyList}>
                {t('schema.image_view.view_properties')}
            </Button>
        </Space>
    );

    return (
        <div style={{textAlign: 'center'}}>
            {loadError && (
                <Alert
                    type='error'
                    showIcon
                    message={t('schema.image_view.load_failed')}
                    action={(
                        <Button size='small' onClick={loadSchemaView}>
                            {t('schema.retry')}
                        </Button>
                    )}
                />
            )}
            {/* <div ref={graphRef} style={{display: 'inline-block', width: 1000, height: 600}} /> */}
            <Row justify='space-between' align='middle' className={styles.toolbar}>
                <Col>
                    {!schemaIsEmpty && schemaActions}
                </Col>
                <Col>
                    <a
                        href={SCHEMA_LABEL_DOCS_URL}
                        target='_blank'
                        rel='noopener noreferrer'
                    >
                        {t('schema.image_view.docs_link')}
                    </a>
                </Col>
            </Row>
            <Spin spinning={loading}>
                {schemaIsEmpty ? (
                    <section className={styles.empty} aria-labelledby='schema-empty-title'>
                        <h2 id='schema-empty-title'>
                            {t('schema.image_view.create_from_template')}
                        </h2>
                        <p>{t('schema.image_view.template_description')}</p>
                        <Button type='primary' onClick={openTemplatePicker}>
                            {t('schema.image_view.create_from_template')}
                        </Button>
                        <Typography.Title level={5} className={styles.manualTitle}>
                            {t('schema.image_view.manual_title')}
                        </Typography.Title>
                        <ol className={styles.steps}>
                            <li>{t('schema.image_view.step_property')}</li>
                            <li>{t('schema.image_view.step_vertex')}</li>
                            <li>{t('schema.image_view.step_edge')}</li>
                        </ol>
                        {schemaActions}
                        <p className={styles.edgeHint}>
                            {t('schema.image_view.edge_prerequisite')}
                        </p>
                        <div className={styles.startGuide}>
                            <p>{t('schema.image_view.start_description')}</p>
                            <Button type='link' onClick={createProperty}>
                                {t('schema.image_view.start_with_property')}
                            </Button>
                        </div>
                    </section>
                ) : (
                    <GraphView
                        data={data}
                        config={{
                            minZoom: 0.5,
                            maxZoom: 2,
                            fitCenter: true,
                        }}
                        layout={{
                            type: 'gForce',
                            gravity: 10,
                            linkDistance: smallSchema ? 240 : 150,
                        }}
                        onDoubleClick={handleDoubleClick}
                        nodeTooltip={renderVertexTooltip}
                        edgeTooltip={renderEdgeTooltip}
                        height={600}
                    />
                )}
            </Spin>

            <Modal
                open={templateVisible}
                title={t('schema.image_view.create_from_template')}
                okText={t('schema.image_view.apply_template')}
                cancelText={t('common.action.cancel')}
                confirmLoading={templateApplying}
                okButtonProps={{
                    disabled: templateLoading || templateLoadError || !selectedTemplate,
                }}
                onOk={applySchemaTemplate}
                onCancel={closeTemplatePicker}
                destroyOnClose
            >
                <Spin spinning={templateLoading}>
                    {templateLoadError ? (
                        <Alert
                            type='error'
                            showIcon
                            message={t('schema.image_view.template_load_failed')}
                            action={(
                                <Button size='small' onClick={loadSchemaTemplates}>
                                    {t('schema.image_view.retry_templates')}
                                </Button>
                            )}
                        />
                    ) : (
                        <Space direction='vertical' size='middle' style={{width: '100%'}}>
                            <Typography.Text>
                                {t('schema.image_view.template_picker_help')}
                            </Typography.Text>
                            <Select
                                aria-label={t('schema.image_view.template_select')}
                                placeholder={t('schema.image_view.template_placeholder')}
                                value={selectedTemplate}
                                options={templateOptions}
                                onChange={setSelectedTemplate}
                                style={{width: '100%'}}
                            />
                            {!savedOptions.length && (
                                <Typography.Text type='secondary'>
                                    {t('schema.image_view.no_saved_templates')}
                                </Typography.Text>
                            )}
                        </Space>
                    )}
                </Spin>
            </Modal>

            <EditVertexLayer
                visible={vertexVisible}
                onCancle={hideVertexLayer}
                graph={graph}
                graphspace={graphspace}
                refresh={handleRefresh}
                name={vertexName}
                propertyList={propertyList}
            />

            <EditEdgeLayer
                visible={edgeVisible}
                graphspace={graphspace}
                graph={graph}
                onCancle={hideEdgeLayer}
                refresh={handleRefresh}
                name={edgeName}
                propertyList={propertyList}
                vertexList={vertexList}
            />

            <EditPropertyLayer
                visible={propertyVisible}
                onCancle={hidePropertyLayer}
                graphspace={graphspace}
                graph={graph}
                refresh={handleRefresh}
            />

            <Drawer
                open={propertyListVisible}
                onClose={hidePropertyListLayer}
                width={600}
                mask={false}
                title={t('schema.image_view.view_properties')}
            >
                <PropertyTable noHeader forceRefresh={refresh} />
            </Drawer>
        </div>
    );
};

export default ImageView;
