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
 * @file KoutGet算法
 */

import React, {useState, useCallback, useContext} from 'react';
import {useTranslation} from 'react-i18next';
import {Input, Collapse, Select} from 'antd';
import Form from '../../PersistentForm';
import {RadarChartOutlined} from '@ant-design/icons';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import DirectionItem from '../../DirectionItem';
import MaxDepthItem from '../../MaxDepthItem';
import LabelItem from '../../LabelItem';
import NearestItem from '../../NearestItem';
import MaxDegreeItem from '../../MaxDegreeItem';
import CapacityItem from '../../CapacityItem';
import LimitItem from '../../LimitItem';
import _ from 'lodash';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {maxDegreeValidator, positiveIntegerValidator} from '../../utils';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../utils/constants';
import GraphAnalysisContext from '../../../../Context';

const {K_OUT} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const KoutGet = props => {
    const {t} = useTranslation();
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } = props;

    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const [isEnableRun, setEnableRun] = useState(false);
    const [isRequiring, setRequiring] = useState(false);

    const [crosspointsForm] = Form.useForm();
    const algorithmOptions = [
        {label: t('analysis.algorithm.oltp.kout_post.breadth_first'), value: 'breadth_first'},
        {label: t('analysis.algorithm.oltp.kout_post.deep_first'), value: 'deep_first'},
    ];

    const handleSubmit = useCallback(
        async algorithmParams => {
            setRequiring(true);
            updateCurrentAlgorithm(K_OUT);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[K_OUT]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {graph_view} = data || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                const newOptions = {startId: algorithmParams.source};
                handleFormSubmit(SUCCESS, graph_view || {}, message, newOptions);
            }
            setRequiring(false);
        },
        [graph, graphSpace, handleFormSubmit, updateCurrentAlgorithm]
    );

    const handleRunning = useCallback(
        e => {
            e.stopPropagation();
            crosspointsForm.submit();
        },
        [crosspointsForm]
    );

    const onFormFinish = useCallback(
        value => {
            handleSubmit(value);
        },
        [handleSubmit]
    );

    const onFormValuesChange = useCallback(
        () => {
            crosspointsForm.validateFields()
                .then(() => {
                    setEnableRun(true);
                })
                .catch(() => {
                    setEnableRun(false);
                });
        },
        [crosspointsForm]
    );

    return (
        <Collapse.Panel
            isActive={props.isActive}
            onItemClick={props.onItemClick}
            panelKey={props.panelKey}
            header={
                <AlgorithmNameHeader
                    icon={<RadarChartOutlined />}
                    name={K_OUT}
                    searchValue={searchValue}
                    description={t('analysis.algorithm.oltp.kout_get.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    highlightName={currentAlgorithm === K_OUT}
                />
            }
        >
            <Form
                form={crosspointsForm}
                onFinish={onFormFinish}
                onValuesChange={_.debounce(onFormValuesChange, 300)}
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
                <DirectionItem desc={t('analysis.algorithm.form.step.direction')} />
                <MaxDepthItem validator={positiveIntegerValidator} />
                <LabelItem />
                <NearestItem />
                <MaxDegreeItem
                    isRequired={false}
                    initialValue={10000}
                    validator={maxDegreeValidator}
                />
                <CapacityItem />
                <LimitItem
                    initialValue={10000000}
                    desc={t('analysis.algorithm.oltp.kout_post.limit')}
                />
                <Form.Item
                    label='algorithm'
                    name='algorithm'
                    initialValue='breadth_first'
                    tooltip={t('analysis.algorithm.oltp.kout_post.algorithm')}
                >
                    <Select
                        placeholder={t('analysis.algorithm.oltp.kout_post.algorithm_placeholder')}
                        allowClear
                        options={algorithmOptions}
                    />
                </Form.Item>
            </Form>
        </Collapse.Panel>
    );
};

export default KoutGet;
