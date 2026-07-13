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
 * @file Rank API
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse, Select, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {DeleteColumnOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import _ from 'lodash';
import GraphAnalysisContext from '../../../../Context';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../utils/constants';
import {positiveIntegerValidator, maxDegreeValidator, alphaValidator,
    maxDepthForRankValidator, maxDiffValidator} from '../../utils';
import BoolSelectItem from '../../BoolSelectItem';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';

const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;
const {RANK_API} = ALGORITHM_NAME;

const initialValue = {
    alpha: 0.85,
    max_degree: 10000,
    max_depth: 5,
    limit: 100,
    max_diff: 0.0001,
    sorted: true,
    with_label: 'BOTH_LABEL',
};

const RankApi = props => {
    const {t} = useTranslation();
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } = props;

    const [form] = Form.useForm();
    const [isEnableRun, setEnableRun] = useState(false);
    const [isRequiring, setRequiring] = useState(false);
    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const withLabelOptions = [
        {label: t('analysis.algorithm.oltp.rank_api.same_label'), value: 'SAME_LABEL'},
        {label: t('analysis.algorithm.oltp.rank_api.other_label'), value: 'OTHER_LABEL'},
        {label: t('analysis.algorithm.oltp.rank_api.both_label'), value: 'BOTH_LABEL'},
    ];

    const handleSubmit = useCallback(
        async algorithmParams => {
            setRequiring(true);
            updateCurrentAlgorithm(RANK_API);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[RANK_API]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {ranks} = data || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                const options = {rankObj: ranks || {}};
                handleFormSubmit(SUCCESS, {}, message, options);
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
                    icon={<DeleteColumnOutlined />}
                    name={RANK_API}
                    description={t('analysis.algorithm.oltp.rank_api.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === RANK_API}
                />
            }
        >
            <Form
                form={form}
                onFinish={onFormFinish}
                onValuesChange={_.debounce(onFormValuesChange, 300)}
                layout="vertical"
                initialValues={initialValue}
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
                    name='label'
                    label="label"
                    rules={[{required: true}]}
                    tooltip={t('analysis.algorithm.oltp.rank_api.label')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name='alpha'
                    label="alpha"
                    rules={[{validator: alphaValidator}]}
                    tooltip={t('analysis.algorithm.oltp.common.alpha')}
                >
                    <InputNumber step={0.01} />
                </Form.Item>
                <Form.Item
                    name='max_degree'
                    label="max_degree"
                    rules={[{validator: positiveIntegerValidator}]}
                    tooltip={t('analysis.algorithm.max_degree_item.tooltip')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    name='max_depth'
                    label="max_depth"
                    rules={[{validator: maxDepthForRankValidator}]}
                    tooltip={t('analysis.algorithm.oltp.common.iterations')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    name='limit'
                    label="limit"
                    rules={[{validator: maxDegreeValidator}]}
                    tooltip={t('analysis.algorithm.oltp.common.limit_vertices')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    name='max_diff'
                    label="max_diff"
                    rules={[{validator: maxDiffValidator}]}
                    tooltip={t('analysis.algorithm.oltp.rank_api.max_diff')}
                >
                    <InputNumber step={0.0001} />
                </Form.Item>
                <BoolSelectItem
                    name={'sorted'}
                    desc={t('analysis.algorithm.oltp.rank_api.sorted')}
                />
                <Form.Item
                    name='with_label'
                    label="with_label"
                    tooltip={t('analysis.algorithm.oltp.rank_api.with_label')}
                >
                    <Select options={withLabelOptions} allowClear />
                </Form.Item>
            </Form>
        </Collapse.Panel>
    );
};

export default RankApi;
