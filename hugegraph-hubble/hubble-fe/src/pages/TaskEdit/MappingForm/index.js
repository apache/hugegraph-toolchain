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

import {Alert, Space, Button, Form, Typography, List, Input} from 'antd';
import {useState, useEffect, useCallback, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import * as api from '../../../api';
import VertexForm from './Vertex';
import EdgeForm from './Edge';

const MappingListItem = ({item, index, type, onEdit, onRemove, t}) => {
    const handleEdit = useCallback(() => {
        onEdit(index);
    }, [index, onEdit]);
    const handleRemove = useCallback(() => {
        onRemove(index);
    }, [index, onRemove]);

    return (
        <List.Item
            actions={[
                <Button key={'1'} type='link' onClick={handleEdit}>
                    {t('common.action.edit')}
                </Button>,
                <Button key={'2'} type='link' onClick={handleRemove}>
                    {t('common.action.delete')}
                </Button>,
            ]}
        >
            <Space>
                <span>{t('task.edit.type')}: {t(`task.edit.${type}`)}</span>
                <span>{t('task.edit.mapping_name')}: {item.label}</span>
            </Space>
        </List.Item>
    );
};

const fieldMapping = list => {
    const obj = {};
    if (!list) {
        return obj;
    }

    list.map(item => {
        if (!item || !item.key) {
            return;
        }

        obj[item.key] = item.val;
    });

    return obj;
};

const valueMapping = list => {
    const obj = {};
    if (!list) {
        return obj;
    }

    list.map(item => {
        if (!item || !item.key) {
            return;
        }

        if (!obj[item.key]) {
            obj[item.key] = {};
        }
        obj[item.key][item.origin] = item.replace;
    });

    return obj;
};

const formatVertex = item => {
    const {label, id, attr, value} = item;
    const field_mapping = fieldMapping(attr);
    const value_mapping = valueMapping(value);
    const selected = Object.keys(field_mapping);
    return {
        label, skip: false, id: id ?? null, unfold: false, field_mapping, value_mapping,
        selected: id ? selected.concat(id) : selected,
        ignored: [], null_values: [''], update_strategies: {},
    };
};

const formatEdge = item => {
    const {label, attr, value, source, target} = item;
    const field_mapping = fieldMapping(attr);
    return {
        label, skip: false, source: [source], unfold_source: false,
        target: [target], unfold_target: false, field_mapping,
        value_mapping: valueMapping(value),
        selected: Object.keys(field_mapping).concat(source, target),
        ignored: [], null_values: [''], update_strategies: {},
    };
};

const MappingForm = ({prev,
    visible,
    targetField,
    graphspace,
    graph,
    vertexList,
    changeVertexList,
    edgeList,
    changeEdgeList,
}) => {
    const {t} = useTranslation();
    const [mappingForm] = Form.useForm();
    const [type, setType] = useState('');
    const [vertex, setVertex] = useState([]);
    const [edge, setEdge] = useState([]);
    const [vertexIndex, setVertexIndex] = useState(-1);
    const [edgeIndex, setEdgeIndex] = useState(-1);
    const [submitEnable, setSubmitEnable] = useState(false);
    const [metaLoading, setMetaLoading] = useState(false);
    const [metaError, setMetaError] = useState(false);
    const [metaRetry, setMetaRetry] = useState(0);
    const metaRequest = useRef(null);

    const onFinish = useCallback(() => {
        const vertices = vertexList.map(item => formatVertex(item));
        const edges = edgeList.map(item => formatEdge(item));
        // console.log({vertices, edges});
        mappingForm.setFieldsValue({vertices, edges});
        mappingForm.submit();
    }, [edgeList, mappingForm, vertexList]);

    const removeVertex = useCallback(index => {
        vertexList.splice(index, 1);
        changeVertexList([...vertexList]);
    }, [changeVertexList, vertexList]);

    const removeEdge = useCallback(index => {
        edgeList.splice(index, 1);
        changeEdgeList([...edgeList]);
    }, [changeEdgeList, edgeList]);

    const editVertex = useCallback(index => {
        setVertexIndex(index);
        setType('vertex');
    }, []);

    const editEdge = useCallback(index => {
        setEdgeIndex(index);
        setType('edge');
    }, []);

    const createVertex = useCallback(() => editVertex(-1), [editVertex]);
    const createEdge = useCallback(() => editEdge(-1), [editEdge]);
    const closeEditor = useCallback(() => setType(''), []);
    const retryMeta = useCallback(() => setMetaRetry(value => value + 1), []);
    const renderVertex = useCallback((item, index) => (
        <MappingListItem
            item={item}
            index={index}
            type='vertex'
            onEdit={editVertex}
            onRemove={removeVertex}
            t={t}
        />
    ), [editVertex, removeVertex, t]);
    const renderEdge = useCallback((item, index) => (
        <MappingListItem
            item={item}
            index={index}
            type='edge'
            onEdit={editEdge}
            onRemove={removeEdge}
            t={t}
        />
    ), [editEdge, removeEdge, t]);

    useEffect(() => {
        setSubmitEnable(vertexList.length > 0 || edgeList.length > 0);
    }, [vertexList, edgeList]);

    useEffect(() => {
        if (!graphspace || !graph) {
            return;
        }
        const request = Symbol('mapping-meta');
        metaRequest.current = request;
        setMetaLoading(true);
        setMetaError(false);
        Promise.all([
            api.manage.getMetaVertexList(graphspace, graph),
            api.manage.getMetaEdgeList(graphspace, graph),
        ]).then(([vertexResponse, edgeResponse]) => {
            if (metaRequest.current !== request) {
                return;
            }
            if (vertexResponse.status !== 200 || edgeResponse.status !== 200) {
                throw new Error('mapping metadata unavailable');
            }
            setVertex(vertexResponse.data.records);
            setEdge(edgeResponse.data.records);
        }).catch(() => {
            if (metaRequest.current === request) {
                setVertex([]);
                setEdge([]);
                setMetaError(true);
            }
        }).finally(() => {
            if (metaRequest.current === request) {
                setMetaLoading(false);
            }
        });
        return () => {
            if (metaRequest.current === request) {
                metaRequest.current = null;
            }
        };
    }, [graphspace, graph, metaRetry]);

    return (
        <div style={{display: visible ? '' : 'none'}}>
            <Typography.Title level={5}>{t('task.edit.step_mapping_fields')}</Typography.Title>
            <Alert
                showIcon
                type='info'
                message={t('task.edit.mapping_help_title')}
                description={(
                    <Space direction='vertical' size={2}>
                        <Typography.Text>{t('task.edit.mapping_help')}</Typography.Text>
                        <Typography.Text strong>
                            {t('task.edit.mapping_example_title')}
                        </Typography.Text>
                        <Typography.Text>
                            {t('task.edit.mapping_example_vertex_source')}
                        </Typography.Text>
                        <Typography.Text>
                            {t('task.edit.mapping_example_vertex_target')}
                        </Typography.Text>
                        <Typography.Text>
                            {t('task.edit.mapping_example_edge_source')}
                        </Typography.Text>
                        <Typography.Text>
                            {t('task.edit.mapping_example_edge_target')}
                        </Typography.Text>
                    </Space>
                )}
            />
            {metaError && (
                <Alert
                    showIcon
                    type='error'
                    message={t('task.edit.mapping_meta_failed')}
                    action={(
                        <Button size='small' onClick={retryMeta}>
                            {t('task.edit.mapping_meta_retry')}
                        </Button>
                    )}
                />
            )}
            <Space className={'form_attr_button'}>
                <Button onClick={createVertex} disabled={metaLoading || metaError}>
                    {t('task.edit.add_vertex_mapping')}
                </Button>
                <Button onClick={createEdge} disabled={metaLoading || metaError}>
                    {t('task.edit.add_edge_mapping')}
                </Button>
            </Space>

            <VertexForm
                open={type === 'vertex'}
                onCancel={closeEditor}
                targetField={targetField}
                sourceField={vertex || []}
                index={vertexIndex}
                vertexList={vertexList}
            />

            <EdgeForm
                open={type === 'edge'}
                onCancel={closeEditor}
                targetField={targetField}
                sourceField={edge || []}
                index={edgeIndex}
                edgeList={edgeList}
            />

            {vertexList.length > 0 && (
                <List
                    className='form_attr_table'
                    itemLayout='horizontal'
                    dataSource={vertexList}
                    bordered
                    locale={{emptyText: <></>}}
                    renderItem={renderVertex}
                />
            )}

            {edgeList.length > 0 && (
                <List
                    className='form_attr_table'
                    itemLayout='horizontal'
                    dataSource={edgeList}
                    bordered
                    locale={{emptyText: <></>}}
                    renderItem={renderEdge}
                />
            )}

            <Form form={mappingForm} name='mapping_form'>
                <Form.Item name='vertices' hidden><Input /></Form.Item>
                <Form.Item name='edges' hidden><Input /></Form.Item>

                <Form.Item extra={!submitEnable ? t('task.edit.mapping_required_tip') : null}>
                    <Space>
                        <Button onClick={prev}>{t('common.action.back')}</Button>
                        <Button type='primary' onClick={onFinish} disabled={!submitEnable}>
                            {t('common.action.next')}
                        </Button>
                    </Space>
                </Form.Item>
            </Form>

        </div>
    );
};

export default MappingForm;
