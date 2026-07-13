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
 * @file ClosenessCentrality算法
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {DeleteColumnOutlined} from '@ant-design/icons';
import GraphAnalysisContext from '../../../../Context';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import OlapComputerItem from '../OlapComputerItem';
import _ from 'lodash';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, TEXT_PATH, useTranslatedConstants} from '../../../../../utils/constants';
import {alphaValidator, greaterThanZeroAndLowerThanTwoThousandAndOneIntegerValidator} from '../../utils';
import {useTranslation} from 'react-i18next';



const ClosenessCentrality = props => {
    const {ALGORITHM_NAME} = useTranslatedConstants();
    const {CLOSENESS_CENTRALITY} = ALGORITHM_NAME;
    const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;
    const OWNED_TEXT_PATH = TEXT_PATH.OLAP + '.closeness_centrality';
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } = props;
    const {t} = useTranslation();
    const info = {
        name: 'Closeness Centrality',
        desc: t(OWNED_TEXT_PATH + '.desc'),
        icon: <DeleteColumnOutlined />,
    };
    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const [isEnableRun, setEnableRun] = useState(false);
    const [isRequiring, setRequiring] = useState(false);

    const [form] = Form.useForm();

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
            updateCurrentAlgorithm(CLOSENESS_CENTRALITY);
            handleFormSubmit(LOADING);
            const {worker, ...args} = algorithmParams;
            const formParams = {
                algorithm: 'closeness-centrality',
                worker: worker,
                params: {...args},
            };
            const filteredParams = removeNilKeys(formParams);
            const response = await api.analysis.postOlapInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, '', message);
            }
            else {
                handleFormSubmit(SUCCESS, data?.task_id, message);
            }
            setRequiring(false);
        },
        [CLOSENESS_CENTRALITY, FAILED, LOADING, SUCCESS, graph, graphSpace,
            handleFormSubmit, updateCurrentAlgorithm]
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
                    icon={info.icon}
                    name={CLOSENESS_CENTRALITY}
                    description={info.desc}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === CLOSENESS_CENTRALITY}
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
                    label='worker'
                    name='worker'
                    rules={[{required: true}]}
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.worker_num')}
                >
                    <InputNumber min={1} precision={0} />
                </Form.Item>
                <Form.Item
                    label='closeness_centrality.weight_property'
                    name='closeness_centrality.weight_property'
                    tooltip={t(OWNED_TEXT_PATH + '.weight_property')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    label='closeness_centrality.sample_rate'
                    name='closeness_centrality.sample_rate'
                    initialValue={1.0}
                    tooltip={t(OWNED_TEXT_PATH + '.sample_rate')}
                    rules={[{validator: alphaValidator}]}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='input.limit_edges_in_one_vertex'
                    name='input.limit_edges_in_one_vertex'
                    initialValue={-1}
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.input_limit_edges_per_vertex')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='bsp.max_super_step'
                    name='bsp.max_super_step'
                    initialValue={10}
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.max_iter_step')}
                    rules={[{validator: greaterThanZeroAndLowerThanTwoThousandAndOneIntegerValidator}]}
                >
                    <InputNumber />
                </Form.Item>
                <OlapComputerItem />
            </Form>
        </Collapse.Panel>
    );
};

export default ClosenessCentrality;
