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
 * @file SameNeighborsBatch算法
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {ForkOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import GraphAnalysisContext from '../../../../Context';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../utils/constants';
import {maxDegreeValidator} from '../../utils';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import LimitItem from '../../LimitItem';
import DirectionItem from '../../DirectionItem';
import _ from 'lodash';

const {SAME_NEIGHBORS_BATCH} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const SameNeighborsBatch = props => {
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

    const handleSubmit = useCallback(
        async algorithmParams => {
            setRequiring(true);
            updateCurrentAlgorithm(SAME_NEIGHBORS_BATCH);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[SAME_NEIGHBORS_BATCH]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {graph_view} = data || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                handleFormSubmit(SUCCESS, graph_view || {}, message);
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
            const vertexArr = value.vertex_list.split(',');
            let sumbitValues = {
                ...value,
                vertex_list: _.chunk(vertexArr, 2),
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
                    icon={<ForkOutlined />}
                    name={SAME_NEIGHBORS_BATCH}
                    description={t('analysis.algorithm.oltp.same_neighbors_batch.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === SAME_NEIGHBORS_BATCH}
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
                    label='vertex_list'
                    name='vertex_list'
                    tooltip={t('analysis.algorithm.oltp.same_neighbors_batch.vertex_list')}
                    rules={[{required: true}]}

                >
                    <Input />
                </Form.Item>
                <DirectionItem
                    desc={t('analysis.algorithm.oltp.common.direction_source_target')}
                />
                <Form.Item
                    name='label'
                    label="label"
                    tooltip={t('analysis.algorithm.label_item.tooltip')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    label='max_degree'
                    name='max_degree'
                    initialValue='10000'
                    rules={[{validator: maxDegreeValidator}]}
                    tooltip={t('analysis.algorithm.max_degree_item.tooltip')}
                >
                    <InputNumber />
                </Form.Item>
                <LimitItem
                    initialValue='10000000'
                    desc={t('analysis.algorithm.oltp.common.limit_crosspoints')}
                />
            </Form>
        </Collapse.Panel>
    );
};

export default SameNeighborsBatch;
