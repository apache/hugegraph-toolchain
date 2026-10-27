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

/**
 * @file  点边属性编辑
 */

import {useState, useContext, useEffect, useRef} from 'react';
import {Drawer, Input, Button, message, Form, Tag, Alert} from 'antd';
import {UpOutlined, DownOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import {GraphContext} from '../Context';
import GraphAnalysisContext from '../../Context';
import {EDGELABEL_TYPE} from '../../../utils/constants';
import * as api from '../../../api/index';
import c from './index.module.scss';
import KeyboardAction from '../../../components/KeyboardAction';

const EditElement = ({show, cancel, drawerInfo, edgeMeta = [], onChange}) => {
    const {t} = useTranslation();
    const {controller, run} = useContext(GraphContext);
    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const {kind, renderingId, id, itemType, properties = {}, metaConfig = {}} = drawerInfo || {};
    const isEdge = kind === 'edge';
    const propertiesArePreview = drawerInfo?.raw?.['~hubble_properties_preview'] === true;
    const {edgelabel_type, parent_label} = metaConfig;
    const children = edgeMeta.find(entry => entry.name === parent_label)?.children || [];
    const [isExpanded, setExpanded] = useState(false);
    const [isEdit, setEdit] = useState(false);
    const [pending, setPending] = useState(false);
    const [propertyMeta, setPropertyMeta] = useState({nullableProps: [], nonNullableProps: [], primaryKeys: []});
    const [form] = Form.useForm();
    const generation = useRef(0);
    const submitting = useRef(false);
    const saved = useRef(false);
    useEffect(() => {
        generation.current += 1;
        submitting.current = false;
        saved.current = false;
        setEdit(false);
        setPending(false);
        setExpanded(false);
        setPropertyMeta({nullableProps: [], nonNullableProps: [], primaryKeys: []});
        if (show) form.resetFields();
        return () => { generation.current += 1; };
    }, [graphSpace, graph, renderingId, show, form, controller, propertiesArePreview]);
    const finishClose = () => {
        generation.current += 1;
        setEdit(false);
        submitting.current = false;
        setPending(false);
        form.resetFields();
        return cancel?.();
    };
    const close = () => {
        if (!submitting.current) return finishClose();
    };
    const beginEdit = () => run(async () => {
        if (!show || !renderingId || pending || saved.current || propertiesArePreview) return;
        const token = generation.current;
        setPending(true);
        try {
            const fetch = isEdge ? api.analysis.getEdgeProperties : api.analysis.getVertexProperties;
            const response = await fetch(graphSpace, graph, itemType);
            if (token !== generation.current) return;
            if (response.status === 200) {
                const {nullableProps = [], nonNullableProps = [], primaryKeys = []} = response.data || {};
                setPropertyMeta({nullableProps, nonNullableProps, primaryKeys});
                form.setFieldsValue(properties);
                setEdit(true);
            }
            else if (!response.message) {
                message.error(t(`analysis.canvas.edit_element.get_${isEdge ? 'edge' : 'vertex'}_property_failed`));
            }
        }
        catch (error) { if (token === generation.current) throw error; }
        finally { if (token === generation.current) setPending(false); }
    });
    const save = values => run(async () => {
        if (!show || !renderingId || pending || submitting.current || saved.current || propertiesArePreview) return;
        const token = generation.current;
        submitting.current = true;
        setPending(true);
        try {
            const params = {id, label: itemType, properties: values,
                ...(!isEdge && drawerInfo.raw?.id_type === 'NUMBER' ? {id_type: 'NUMBER'} : {}),
                ...(isEdge ? {source: drawerInfo.source, target: drawerInfo.target} : {})};
            const update = isEdge ? api.analysis.updateEdgeProperties : api.analysis.updateVertexProperties;
            const response = await update(graphSpace, graph, params);
            if (token !== generation.current) return;
            if (response.status === 200) {
                saved.current = true;
                let applied = false;
                try {
                    const result = await onChange?.(isEdge ? 'edges' : 'nodes', renderingId,
                        {...params, properties: {...properties, ...values}});
                    applied = result?.status === 'applied';
                }
                catch {
                    // The server write succeeded; a local draw failure must not invite another PUT.
                }
                if (token !== generation.current) return;
                if (applied) message.success(t('analysis.canvas.edit_element.save_success'));
                else message.warning(t('analysis.canvas.edit_element.sync_failed'));
                await finishClose();
            }
            else if (!response.message) message.error(t('analysis.canvas.edit_element.save_failed'));
        }
        catch (error) { if (token === generation.current) throw error; }
        finally {
            if (token === generation.current) {
                submitting.current = false;
                setPending(false);
            }
        }
    });
    const text = value => value == null ? '' : String(value);
    const typeLabel = t(`analysis.canvas.edit_element.${isEdge ? 'edge' : 'vertex'}`);
    const field = (label, value) => <div className={c.fields}><div>{label}:</div><div>{text(value)}</div></div>;
    const renderProperties = (names, nullable) => {
        const keys = names.filter(key => Object.hasOwn(properties, key));
        if (!keys.length) return null;
        return (
            <div>
                <div style={{margin: '8px 0'}}>
                    {t(`analysis.canvas.edit_element.${nullable ? 'nullable_property' : 'non_nullable_property'}`)}:
                </div>
                {keys.map(key => !isEdge && propertyMeta.primaryKeys.includes(key)
                    ? <div key={key}>{key}({t('analysis.canvas.edit_element.primary_key')}): {text(properties[key])}</div>
                    : <Form.Item key={key} name={key} label={key} labelCol={{span: 9}}
                        rules={[{required: !nullable, message: t('analysis.canvas.edit_element.required')}]}>
                        <Input maxLength={40} placeholder={t('analysis.canvas.edit_element.property_placeholder')} />
                    </Form.Item>)}
            </div>
        );
    };
    return (
        <Drawer title={t(`analysis.canvas.edit_element.${isEdit ? 'edit_details' : 'data_details'}`)}
            placement="right" open={show} onClose={() => run(close)}
            closable={{disabled: submitting.current}} mask={{closable: !submitting.current}}
            keyboard={!submitting.current}
            footer={[
                <Button type="primary" loading={pending} disabled={!onChange || !renderingId || pending || saved.current || propertiesArePreview}
                    onClick={() => isEdit ? form.submit() : beginEdit()} key="save">
                    {t(`analysis.canvas.edit_element.${isEdit ? 'save' : 'edit'}`)}
                </Button>,
                <Button onClick={() => run(close)} disabled={submitting.current} key="close">
                    {t('analysis.canvas.edit_element.close')}
                </Button>,
            ]}>
            {propertiesArePreview && <Alert showIcon type="info"
                title={t('analysis.query_result.properties_preview_read_only')} />}
            {drawerInfo && <>
                {field(`${typeLabel} ${t('analysis.canvas.edit_element.type')}`, itemType)}
                {edgelabel_type === EDGELABEL_TYPE.SUB && <>
                    <div className={c.fields}>
                        <div>{t('analysis.canvas.edit_element.edge_relation')}:</div>
                        <KeyboardAction onAction={() => setExpanded(value => !value)} aria-expanded={isExpanded}>
                            {children.length > 0 && (isExpanded ? <UpOutlined /> : <DownOutlined />)}
                            {parent_label}
                            <Tag color="blue">{t('analysis.canvas.edit_element.parent_edge')}</Tag>
                        </KeyboardAction>
                    </div>
                    {isExpanded && <div className={c.fieldWithoutName}>
                        {children.map(child => <div key={child}>{child}
                            <Tag color="gold">{t('analysis.canvas.edit_element.child_edge')}</Tag>
                        </div>)}
                    </div>}
                </>}
                {field(`${typeLabel} ${t('analysis.canvas.edit_element.id')}`, id)}
                {isEdge && <>
                    {field(t('analysis.canvas.edit_element.source'), drawerInfo.source)}
                    {field(t('analysis.canvas.edit_element.target'), drawerInfo.target)}
                </>}
                {!isEdit && Object.entries(properties).map(([key, value]) => <div key={key}>
                    {field(key, value)}
                </div>)}
            </>}
            <div className={c.graphNodeInfo}>
                <Form style={{display: isEdit ? undefined : 'none'}} form={form} onFinish={save}
                    disabled={pending || propertiesArePreview} labelAlign="left" labelWrap className={c.editForm}>
                    {isEdit && renderProperties(propertyMeta.nullableProps, true)}
                    {isEdit && renderProperties(propertyMeta.nonNullableProps, false)}
                </Form>
            </div>
        </Drawer>
    );
};

export default EditElement;
