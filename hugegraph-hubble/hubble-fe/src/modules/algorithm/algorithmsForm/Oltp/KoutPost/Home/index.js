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
 * @file K-out API(POST，高级版)
 */

import React, {useState, useCallback, useContext} from 'react';
import {useTranslation} from 'react-i18next';
import {Input, Collapse, Select, InputNumber} from 'antd';
import Form from '../../../PersistentForm';
import {BranchesOutlined} from '@ant-design/icons';
import * as api from '../../../../../../api';
import AlgorithmNameHeader from '../../../AlgorithmNameHeader';
import BoolSelectItem from '../../../BoolSelectItem';
import StepFormItem from '../StepFormItem';
import GraphAnalysisContext from '../../../../../Context';
import removeNilKeys from '../../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, ALGORITHM_NAME, Algorithm_Url} from '../../../../../../utils/constants';
import {positiveIntegerValidator, maxDegreeValidator, formatPropertiesValue} from '../../../utils';
import _ from 'lodash';
import s from '../../OltpItem/index.module.scss';

const {KOUT_POST} = ALGORITHM_NAME;

const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const KoutPost = props => {
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
    const algorithmOptions = [
        {label: t('analysis.algorithm.oltp.kout_post.breadth_first'), value: 'breadth_first'},
        {label: t('analysis.algorithm.oltp.kout_post.deep_first'), value: 'deep_first'},
    ];

    const handleSubmit = useCallback(
        async algorithmParams => {
            setRequiring(true);
            updateCurrentAlgorithm(KOUT_POST);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[KOUT_POST]};
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

    const handleRunning = useCallback(
        e => {
            e.stopPropagation();
            form.submit();
        },
        [form]
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
        [handleSubmit]
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

    return (
        <Collapse.Panel
            isActive={props.isActive}
            onItemClick={props.onItemClick}
            panelKey={props.panelKey}
            header={
                <AlgorithmNameHeader
                    icon={<BranchesOutlined />}
                    name={KOUT_POST}
                    searchValue={searchValue}
                    description={t('analysis.algorithm.oltp.kout_post.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    highlightName={currentAlgorithm === KOUT_POST}
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
                    tooltip={t('analysis.algorithm.oltp.kout_post.source')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    label='max_depth'
                    name='max_depth'
                    rules={[{required: true}, {validator: positiveIntegerValidator}]}
                    tooltip={t('analysis.algorithm.form.step.max_depth')}
                >
                    <Input />
                </Form.Item>
                <BoolSelectItem
                    name={'nearest'}
                    desc={t('analysis.algorithm.nearest_item.tooltip')}
                    initialValue
                />
                <Form.Item
                    name='capacity'
                    label="capacity"
                    initialValue={10000000}
                    rules={[{validator: maxDegreeValidator}]}
                    tooltip={t('analysis.algorithm.oltp.kout_post.capacity')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    name='limit'
                    label="limit"
                    initialValue={10000000}
                    rules={[{validator: maxDegreeValidator}]}
                    tooltip={t('analysis.algorithm.oltp.kout_post.limit')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    name='algorithm'
                    label="algorithm"
                    initialValue={'breadth_first'}
                    tooltip={t('analysis.algorithm.oltp.kout_post.algorithm')}
                >
                    <Select options={algorithmOptions} allowClear />
                </Form.Item>
                <StepFormItem />
            </Form>
        </Collapse.Panel>
    );
};

export default KoutPost;
