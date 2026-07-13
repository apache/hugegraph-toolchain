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
 * @file AdamicAdar算法
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse, Select, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {ApiOutlined} from '@ant-design/icons';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import GraphAnalysisContext from '../../../../Context';
import _ from 'lodash';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {maxDegreeValidator} from '../../utils';
import {
    GRAPH_STATUS,
    Algorithm_Url,
    ALGORITHM_NAME,
    useTranslatedConstants,
    TEXT_PATH,
} from '../../../../../utils/constants';
import {useTranslation} from 'react-i18next';
1;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;
const {ADAMIC_ADAR} = ALGORITHM_NAME;

const OWNED_TEXT_PATH = TEXT_PATH.OLTP + '.adamic_adar';
const AdamicAdar = props => {
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } = props;
    const {t} = useTranslation();
    const {directionOptions} = useTranslatedConstants();
    const description = {
        vertex: t(OWNED_TEXT_PATH + '.vertex'),
        other: t(OWNED_TEXT_PATH + '.other'),
        direction: t(OWNED_TEXT_PATH + '.direction'),
        label: t(OWNED_TEXT_PATH + '.label'),
        max_degree: t(OWNED_TEXT_PATH + '.max_degree'),
    };

    const algorithmDescription = t(OWNED_TEXT_PATH + '.desc');

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
            updateCurrentAlgorithm(ADAMIC_ADAR);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[ADAMIC_ADAR]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {graph_view, adamic_adar} = data || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                const options = {jaccardsimilarity: adamic_adar};
                handleFormSubmit(SUCCESS, graph_view || {}, message, options);
            }
            setRequiring(false);
        },
        [graph, graphSpace, handleFormSubmit, updateCurrentAlgorithm]
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
                    icon={<ApiOutlined />}
                    name={ADAMIC_ADAR}
                    description={algorithmDescription}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === ADAMIC_ADAR}
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
                    label='vertex'
                    name='vertex'
                    rules={[{required: true}]}
                    tooltip={description.vertex}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name='other'
                    label="other"
                    rules={[{required: true}]}
                    tooltip={description.other}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    label='direction'
                    name='direction'
                    initialValue='BOTH'
                    tooltip={description.direction}
                >
                    <Select
                        placeholder={t(OWNED_TEXT_PATH + '.select_direction')}
                        allowClear
                        options={directionOptions}
                    />
                </Form.Item>
                <Form.Item
                    name='label'
                    label="label"
                    tooltip={description.label}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    label='max_degree'
                    name='max_degree'
                    initialValue='10000'
                    rules={[{validator: maxDegreeValidator}]}
                    tooltip={description.max_degree}
                >
                    <InputNumber />
                </Form.Item>
            </Form>
        </Collapse.Panel>
    );
};

export default AdamicAdar;
