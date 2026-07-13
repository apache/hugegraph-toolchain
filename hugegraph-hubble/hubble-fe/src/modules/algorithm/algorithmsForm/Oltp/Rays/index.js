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
 * @file Rays算法
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse, Select, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {NodeExpandOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import GraphAnalysisContext from '../../../../Context';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../utils/constants';
import {positiveIntegerValidator} from '../../utils';
import _ from 'lodash';

const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;
const {RAYS} = ALGORITHM_NAME;

const Rays = props => {
    const {t} = useTranslation();
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } = props;

    const [isEnableRun, setEnableRun] = useState(false);
    const [isRequiring, setRequiring] = useState(false);
    const {graphSpace, graph} = useContext(GraphAnalysisContext);

    const [form] = Form.useForm();
    const directionOptions = [
        {label: t('analysis.algorithm.form.direction_options.out'), value: 'OUT'},
        {label: t('analysis.algorithm.form.direction_options.in'), value: 'IN'},
        {label: t('analysis.algorithm.form.direction_options.both'), value: 'BOTH'},
    ];

    const handleSubmit = useCallback(
        async algorithmParams => {
            setRequiring(true);
            updateCurrentAlgorithm(RAYS);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[RAYS]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {graph_view} = data || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                const options = {endPointsId: {startNodes: [algorithmParams.source], endNodes: []}};
                handleFormSubmit(SUCCESS, graph_view || {}, message, options);
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
            handleSubmit(value);
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
                    icon={<NodeExpandOutlined />}
                    name={RAYS}
                    description={t('analysis.algorithm.oltp.rays.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === RAYS}
                />
            }
        >
            <Form
                form={form}
                onFinish={onFormFinish}
                onValuesChange={_.debounce(onFormValuesChange, 300)}
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
                    label='direction'
                    name='direction'
                    initialValue='BOTH'
                    tooltip={t('analysis.algorithm.oltp.common.direction_source_target')}
                >
                    <Select
                        placeholder={t('analysis.algorithm.direction_item.tooltip')}
                        allowClear
                        options={directionOptions}
                    />
                </Form.Item>
                <Form.Item
                    name='label'
                    label="label"
                    tooltip={t('analysis.algorithm.label_item.tooltip')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    label='max_depth'
                    name='max_depth'
                    rules={[{required: true}, {validator: positiveIntegerValidator}]}
                    tooltip={t('analysis.algorithm.max_depth_item.tooltip')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='max_degree'
                    name='max_degree'
                    initialValue='10000'
                    rules={[{validator: positiveIntegerValidator}]}
                    tooltip={t('analysis.algorithm.max_degree_item.tooltip')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='capacity'
                    name='capacity'
                    initialValue='10000000'
                    rules={[{validator: positiveIntegerValidator}]}
                    tooltip={t('analysis.algorithm.capacity_item.tooltip')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='limit'
                    name='limit'
                    initialValue='10'
                    rules={[{validator: positiveIntegerValidator}]}
                    tooltip={t('analysis.algorithm.oltp.common.limit_crosspoints')}
                >
                    <InputNumber />
                </Form.Item>
            </Form>
        </Collapse.Panel>
    );
};

export default Rays;
