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
 * @file K-neighbor API(POST，高级版)
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse, Select, Tooltip, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {DownOutlined, RightOutlined, DeleteRowOutlined, QuestionCircleOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../utils/constants';
import {integerValidator, positiveIntegerValidator, maxDegreeValidator} from '../../utils';
import StepsItems from '../../StepsItems';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import GraphAnalysisContext from '../../../../Context';
import _ from 'lodash';
import classnames from 'classnames';
import s from '../OltpItem/index.module.scss';
import KeyboardAction from '../../../../../components/KeyboardAction';

const {KNEIGHBOR_POST} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const KneighborPost = props => {
    const {t} = useTranslation();
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } = props;

    const [form] = Form.useForm();
    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const [isRequiring, setRequiring] = useState(false);
    const [isEnableRun, setEnableRun] = useState(false);
    const [stepVisible, setStepVisible] = useState(false);
    const directionOptions = [
        {label: t('analysis.algorithm.form.direction_options.out'), value: 'OUT'},
        {label: t('analysis.algorithm.form.direction_options.in'), value: 'IN'},
        {label: t('analysis.algorithm.form.direction_options.both'), value: 'BOTH'},
    ];

    const stepContentClassName = classnames(
        s.stepContent,
        {[s.contentHidden]: !stepVisible}
    );

    const handleRunning = useCallback(
        e => {
            e.stopPropagation();
            form.submit();
        },
        [form]
    );

    const handleSubmit = useCallback(
        async algorithmParams => {
            setRequiring(true);
            updateCurrentAlgorithm(KNEIGHBOR_POST);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[KNEIGHBOR_POST]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {graph_view} = data || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                handleFormSubmit(SUCCESS, graph_view || {}, message, {});
            }
            setRequiring(false);
        },
        [graph, graphSpace, handleFormSubmit, updateCurrentAlgorithm]
    );

    const formatPropertiesValue = useCallback(
        properties => {
            if (!properties) {
                return;
            }
            const propertiesArr = properties.trim().split('\n') || [];
            const propertiesValue = {};
            for (const item of propertiesArr) {
                const [key, value] = item?.split('=');
                if (key && value) {
                    const valueLength = value.length;
                    if (valueLength > 2 && value[0] === '\'' && value[valueLength - 1] === '\'') {
                        propertiesValue[key] = value.slice(1, valueLength - 1);
                    }
                    else if (!isNaN(+value)) {
                        propertiesValue[key] = +value;
                    }
                }
            }
            return propertiesValue;
        },
        []
    );

    const onFormFinish = useCallback(
        value => {
            const {steps} = value;
            const {edge_steps = [], vertex_steps = []} = steps;
            const formatedEdgeSteps = edge_steps.map(
                item => {
                    const {properties} = item;
                    return {
                        ...item,
                        properties: formatPropertiesValue(properties),
                    };
                }
            );
            const formatedNodeSteps = vertex_steps.map(
                item => {
                    const {properties} = item;
                    return {
                        ...item,
                        properties: formatPropertiesValue(properties),
                    };
                }
            );
            const formatedSteps = {
                ...steps,
                edge_steps: [...formatedEdgeSteps],
                vertex_steps: [...formatedNodeSteps],
            };
            const sumbitValues = {
                ...value,
                steps: {...formatedSteps},
            };
            handleSubmit(sumbitValues);
        },
        [formatPropertiesValue, handleSubmit]
    );

    const onFormValuesChange = useCallback(
        () => {
            form.validateFields()
                .then(() => {
                    setEnableRun(true);
                })
                .catch(() => {
                    setEnableRun(false);
                });
        },
        [form]
    );

    const changeStepVisible = useCallback(() => {
        setStepVisible(pre => !pre);
    }, []
    );

    const stepFormItems = () => {
        return (
            <>
                <KeyboardAction
                    className={s.stepHeader}
                    onAction={changeStepVisible}
                    aria-expanded={stepVisible}
                >
                    <div className={s.stepIcon}>
                        {stepVisible ? <DownOutlined /> : <RightOutlined />}
                    </div>
                    <div className={s.stepTitle}>steps:</div>
                    <div className={s.tooltip}>
                        <Tooltip
                            placement="rightTop"
                            title={t('analysis.algorithm.form.step.steps')}
                        >
                            <QuestionCircleOutlined />
                        </Tooltip>
                    </div>
                </KeyboardAction>
                <div className={stepContentClassName}>
                    <Form.Item
                        name={['steps', 'direction']}
                        label="direction"
                        initialValue={'BOTH'}
                        tooltip={t('analysis.algorithm.form.step.direction')}
                    >
                        <Select
                            allowClear
                            options={directionOptions}
                        />
                    </Form.Item>
                    <Form.Item
                        name={['steps', 'max_degree']}
                        label="max_degree"
                        initialValue={10000}
                        tooltip={t('analysis.algorithm.form.step.max_degree_compatible')}
                        rules={[{validator: integerValidator}]}
                    >
                        <InputNumber />
                    </Form.Item>
                    <Form.Item
                        name={['steps', 'skip_degree']}
                        label="skip_degree"
                        initialValue={0}
                        tooltip={t('analysis.algorithm.form.step.skip_degree')}
                        rules={[{validator: integerValidator}]}
                    >
                        <InputNumber />
                    </Form.Item>
                    <StepsItems
                        param={'steps'}
                        type={'edge_steps'}
                        desc={t('analysis.algorithm.form.step.edge_steps')}
                    />
                    <StepsItems
                        param={'steps'}
                        type={'vertex_steps'}
                        desc={t('analysis.algorithm.form.step.vertex_steps')}
                    />
                </div>
            </>
        );
    };

    return (
        <Collapse.Panel
            isActive={props.isActive}
            onItemClick={props.onItemClick}
            panelKey={props.panelKey}
            header={
                <AlgorithmNameHeader
                    icon={<DeleteRowOutlined />}
                    name={KNEIGHBOR_POST}
                    searchValue={searchValue}
                    description={t('analysis.algorithm.oltp.kneighbor_post.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    highlightName={currentAlgorithm === KNEIGHBOR_POST}
                />
            }
        >
            <Form
                form={form}
                onFinish={onFormFinish}
                onValuesChange={_.debounce(onFormValuesChange, 300)}
                className={s.oltpForms}
                layout="vertical"
            >
                <Form.Item
                    label='source'
                    name='source'
                    rules={[{required: true}]}
                    tooltip={t('analysis.algorithm.oltp.common.source_vertex_id')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    label='max_depth'
                    name='max_depth'
                    rules={[{required: true}, {validator: positiveIntegerValidator}]}
                    tooltip={t('analysis.algorithm.max_depth_item.tooltip')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name='limit'
                    label="limit"
                    initialValue={10000000}
                    rules={[{validator: maxDegreeValidator}]}
                    tooltip={t('analysis.algorithm.oltp.common.limit_vertices')}
                >
                    <InputNumber />
                </Form.Item>
                {stepFormItems()}
            </Form>
        </Collapse.Panel>
    );
};

export default KneighborPost;
