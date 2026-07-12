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
    PageHeader,
    Form,
    Steps,
    message,
    Modal,
    Alert,
    Button,
} from 'antd';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import Style from './index.module.scss';
import BaseForm from './BaseForm/index';
import FieldForm from './FieldForm/index';
import MappingForm from './MappingForm/index';
import ScheduleForm from './ScheduleForm/index';
import {useNavigate} from 'react-router-dom';
import * as api from '../../api';
import JSONbig from 'json-bigint';
import DataPreparationNav from '../../components/DataPreparationNav';
import {
    createTaskOnce,
    getTaskSubmissionError,
    loadTaskBaseContext,
} from './taskFlow';

const TaskEdit = () => {
    const {t} = useTranslation();
    const [current, setCurrent] = useState(0);
    const [targetField, setTargetField] = useState([]);
    // const [datasource, setDatasource] = useState({});
    // Preserve a null source header; otherwise user-customized headers replace the original header.
    const [header, setHeader] = useState(null);
    const [form] = Form.useForm();
    const [graphspace, setGraphspace] = useState('');
    const [graph, setGraph] = useState('');
    const [datasourceID, setDatasourceID] = useState('');
    const [datasource, setDatasource] = useState({});
    const [vertexList, setVertexList] = useState([]);
    const [edgeList, setEdgeList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [baseLoading, setBaseLoading] = useState(false);
    const [baseError, setBaseError] = useState(null);
    const [pendingBase, setPendingBase] = useState(null);
    const [submitError, setSubmitError] = useState(null);
    const baseRequest = useRef(null);
    const basePending = useRef(false);
    const submitPending = useRef(false);
    const mounted = useRef(true);
    const navigate = useNavigate();

    const cancel = useCallback(() => {
        navigate('/task');
    }, [navigate]);

    useEffect(() => {
        return () => {
            mounted.current = false;
            baseRequest.current = null;
        };
    }, []);

    const prev = useCallback(() => setCurrent(value => value - 1), []);

    // const addEdge = item => {
    //     edgeList.push(item);
    //     setEdgeList([...edgeList]);
    // };

    // const removeVertex = index => {
    //     //
    // };

    // const removeEdge = index => {
    //     //
    // };

    const submitBase = useCallback(async values => {
        if (basePending.current) {
            return;
        }
        basePending.current = true;
        const {ingestion_option, datasource_id} = values;
        const token = Symbol('task-base-context');
        baseRequest.current = token;
        setPendingBase(values);
        setBaseLoading(true);
        setBaseError(null);
        try {
            const context = await loadTaskBaseContext(api.manage, values);
            if (baseRequest.current !== token) {
                return;
            }
            if (context.graphspace.storage_percent >= 1) {
                Modal.error({
                    title: t('common.label.warning'),
                    content: t('task.edit.graphspace_full', {
                        graphspace: ingestion_option.graphspace,
                    }),
                });
                return;
            }
            setGraphspace(ingestion_option.graphspace);
            setGraph(ingestion_option.graph);
            setDatasourceID(datasource_id.toString());
            setDatasource(context.datasource);
            setCurrent(1);
        }
        catch (error) {
            if (baseRequest.current === token) {
                setBaseError(error.reason || 'request');
            }
        }
        finally {
            if (baseRequest.current === token) {
                setBaseLoading(false);
            }
            basePending.current = false;
        }
    }, [t]);

    const retryBase = useCallback(() => {
        if (pendingBase) {
            submitBase(pendingBase);
        }
    }, [pendingBase, submitBase]);

    const submitField = useCallback(values => {
        const {source_keys, target_keys} = values;
        setTargetField(target_keys);
        setHeader(source_keys.map(item => item.key));

        setCurrent(2);
    }, []);

    const submitMapping = useCallback(() => {
        setCurrent(3);
    }, []);

    const submitVertex = useCallback(values => {
        const {index} = values;

        if (index >= 0) {
            vertexList[index] = values;
        }
        else {
            vertexList.push(values);
        }

        setVertexList([...vertexList]);
    }, [vertexList]);

    const submitEdge = useCallback(values => {
        const {index} = values;

        if (index >= 0) {
            edgeList[index] = values;
        }
        else {
            edgeList.push(values);
        }

        setEdgeList([...edgeList]);
    }, [edgeList]);

    const submitForms = useCallback(async ({base_form, mapping_form, schedule_form}) => {
        const baseValues = base_form.getFieldsValue();
        const mappingValues = mapping_form.getFieldsValue();
        const scheduleValues = schedule_form.getFieldsValue();

        setLoading(true);
        setSubmitError(null);

        const values = {
            ...baseValues,
            ...scheduleValues,
            datasource_id: datasource.datasource_id,
            ingestion_mapping: {
                version: '2.0',
                structs: [
                    {
                        id: '1',
                        skip: false,
                        input: {
                            ...datasource.datasource_config,
                            header: header,
                        },
                        ...mappingValues,
                    },
                ],
            },
        };

        try {
            const result = await createTaskOnce(
                api.manage,
                JSONbig.stringify(values),
                submitPending
            );
            if (!result || result.skipped || !mounted.current) {
                return;
            }
            setLoading(false);
            message.success(t('common.msg.create_success'));
            navigate('/task');
        }
        catch (error) {
            if (mounted.current) {
                setLoading(false);
                setSubmitError(getTaskSubmissionError(error) || true);
            }
        }
    }, [datasource, header, navigate, t]);

    const handleFinish = useCallback((name, {values, forms}) => {
        // console.log(name, values, forms, JSONbig.stringify(values));
        if (name === 'base_form') {
            submitBase(values);
        }

        if (name === 'field_form') {
            submitField(values);
        }

        if (name === 'vertex_form') {
            submitVertex(values);
        }

        if (name === 'edge_form') {
            submitEdge(values);
        }

        if (name === 'mapping_form') {
            submitMapping();
        }

        if (name === 'schedule_form') {
            submitForms(forms);
        }
    }, [submitBase, submitEdge, submitField, submitForms, submitMapping, submitVertex]);

    // const onFinish = () => {
    //     form.validateFields().then(values => {
    //         const {vertices, edges} = values;
    //         values.datasource_id = datasource.datasource_id;
    //         values.ingestion_mapping = {
    //             version: '2.0',
    //             structs: [
    //                 {
    //                     id: '1',
    //                     skip: false,
    //                     input: {
    //                         ...datasource.datasource_config,
    //                         header: header,
    //                     },
    //                     vertices,
    //                     edges,
    //                 },
    //             ],
    //         };
    //         delete values.edge_form;
    //         delete values.vertex_form;
    //         api.manage.addTask(JSONbig.stringify(values)).then(res => {
    //             if (res.status === 200) {
    //                 message.success(t('common.msg.create_success'));
    //                 navigate('/task');
    //                 return;
    //             }

    //             message.error(res.message);
    //         });
    //     });
    // };

    return (
        <>
            <PageHeader
                ghost={false}
                onBack={false}
                title={t('task.title')}
            />

            <DataPreparationNav active='task' />

            <div className='container'>
                {baseError && current === 0 && (
                    <Alert
                        showIcon
                        type='error'
                        message={t(`task.edit.${baseError}_failed`)}
                        action={(
                            <Button size='small' onClick={retryBase} loading={baseLoading}>
                                {t('task.edit.retry_context')}
                            </Button>
                        )}
                    />
                )}
                {submitError && current === 3 && (
                    <Alert
                        showIcon
                        type='error'
                        message={t('task.edit.submit_failed')}
                        description={typeof submitError === 'string'
                            ? submitError : undefined}
                    />
                )}
                <Steps labelPlacement='vertical' current={current}>
                    <Steps.Step key="1" title={t('task.edit.step_basic')} />
                    <Steps.Step key="2" title={t('task.edit.step_source_fields')} />
                    <Steps.Step key="3" title={t('task.edit.step_mapping_fields')} />
                    <Steps.Step key="4" title={t('task.edit.step_schedule')} />
                </Steps>
                <br />

                <div className={Style.form}>
                    <Form.Provider
                        labelCol={{span: 4}}
                        onFormFinish={handleFinish}
                    >
                        <BaseForm
                            cancel={cancel}
                            visible={current === 0}
                            loading={baseLoading}
                        />
                        <FieldForm
                            datasourceID={datasourceID}
                            prev={prev}
                            visible={current === 1}
                            setTargetField={setTargetField}
                            setHeader={setHeader}
                        />
                        <MappingForm
                            targetField={targetField}
                            graphspace={graphspace}
                            graph={graph}
                            vertexList={vertexList}
                            changeVertexList={setVertexList}
                            edgeList={edgeList}
                            changeEdgeList={setEdgeList}
                            prev={prev}
                            visible={current === 2}
                        />
                        <ScheduleForm
                            form={form}
                            prev={prev}
                            datasource={datasource}
                            visible={current === 3}
                            loading={loading}
                        />
                    </Form.Provider>
                </div>
            </div>
        </>
    );
};

export default TaskEdit;
