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
 * @file FusiformSimilarity算法
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {MonitorOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../utils/constants';
import {positiveIntegerValidator, groupPropertyValidator, maxDegreeValidator, includeZeroNumberValidator,
    alphaValidator, formatVerticesValue} from '../../utils';
import GraphAnalysisContext from '../../../../Context';
import VerticesItems from '../../VerticesItems';
import DirectionItem from '../../DirectionItem';
import BoolSelectItem from '../../BoolSelectItem';
import _ from 'lodash';

const {FUSIFORM_SIMILARITY} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const FusiformSimilarity = props => {
    const {t} = useTranslation();
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } = props;

    const [form] = Form.useForm();
    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const [isEnableRun, setEnableRun] = useState(false);
    const [isRequiring, setRequiring] = useState(false);

    const handleSubmit = useCallback(
        async algorithmParams => {
            setRequiring(true);
            updateCurrentAlgorithm(FUSIFORM_SIMILARITY);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[FUSIFORM_SIMILARITY]};
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
            const {sources} = value;
            delete value.steps;
            const sourcesValue = formatVerticesValue(sources);
            let sumbitValues = {
                ...value,
                sources: sourcesValue,
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
                    icon={<MonitorOutlined />}
                    name={FUSIFORM_SIMILARITY}
                    description={t('analysis.algorithm.oltp.fusiform_similarity.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === FUSIFORM_SIMILARITY}
                />
            }
        >
            <Form
                form={form}
                onFinish={onFormFinish}
                onValuesChange={_.debounce(onFormValuesChange, 300)}
                layout="vertical"
            >
                <VerticesItems name="sources" desc={t('analysis.algorithm.oltp.template_paths.sources')} />
                <Form.Item
                    label='label'
                    name='label'
                    tooltip={t('analysis.algorithm.label_item.tooltip')}
                >
                    <Input />
                </Form.Item>
                <DirectionItem
                    desc={t('analysis.algorithm.form.step.direction')}
                />
                <Form.Item
                    label='min_neighbors'
                    name='min_neighbors'
                    rules={[{required: true}, {validator: positiveIntegerValidator}]}
                    tooltip={t('analysis.algorithm.oltp.fusiform_similarity.min_neighbors')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='alpha'
                    name='alpha'
                    rules={[{required: true}, {validator: alphaValidator}]}
                    tooltip={t('analysis.algorithm.oltp.fusiform_similarity.alpha')}
                >
                    <InputNumber step={0.01} />
                </Form.Item>
                <Form.Item
                    label='min_similars'
                    name='min_similars'
                    initialValue='1'
                    rules={[{validator: positiveIntegerValidator}]}
                    tooltip={t('analysis.algorithm.oltp.fusiform_similarity.min_similars')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='top'
                    name='top'
                    rules={[{required: true, validator: includeZeroNumberValidator}]}
                    tooltip={t('analysis.algorithm.oltp.fusiform_similarity.top')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='group_property'
                    name='group_property'
                    rules={[{validator: groupPropertyValidator}]}
                    tooltip={t('analysis.algorithm.oltp.fusiform_similarity.group_property')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='min_groups'
                    name='min_groups'
                    rules={[{validator: positiveIntegerValidator}]}
                    tooltip={t('analysis.algorithm.oltp.fusiform_similarity.min_groups')}
                >
                    <InputNumber />
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
                <Form.Item
                    label='capacity'
                    name='capacity'
                    initialValue='10000000'
                    rules={[{validator: maxDegreeValidator}]}
                    tooltip={t('analysis.algorithm.capacity_item.tooltip')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='limit'
                    name='limit'
                    initialValue='10'
                    rules={[{validator: maxDegreeValidator}]}
                    tooltip={t('analysis.algorithm.oltp.fusiform_similarity.limit')}
                >
                    <InputNumber />
                </Form.Item>
                <BoolSelectItem
                    name='with_intermediary'
                    desc={t('analysis.algorithm.oltp.fusiform_similarity.with_intermediary')}
                />
            </Form>
        </Collapse.Panel>
    );
};

export default FusiformSimilarity;
