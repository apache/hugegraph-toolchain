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
 * @file JaccardSimilarityGet算法
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse} from 'antd';
import Form from '../../PersistentForm';
import {AppstoreAddOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import DirectionItem from '../../DirectionItem';
import LabelItem from '../../LabelItem';
import MaxDegreeItem from '../../MaxDegreeItem';
import _ from 'lodash';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {maxDegreeValidator} from '../../utils';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../utils/constants';
import GraphAnalysisContext from '../../../../Context';

const {JACCARD_SIMILARITY} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const JaccardSimilarityGet = props => {
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

    const handleSubmit = useCallback(
        async algorithmParams => {
            setRequiring(true);
            updateCurrentAlgorithm(JACCARD_SIMILARITY);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[JACCARD_SIMILARITY]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {graph_view, jaccardsimilarity} = data || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                const options = {jaccardsimilarity: jaccardsimilarity};
                handleFormSubmit(SUCCESS, graph_view || {}, message, options);
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
                    icon={<AppstoreAddOutlined />}
                    name={JACCARD_SIMILARITY}
                    searchValue={searchValue}
                    description={t('analysis.algorithm.oltp.jaccard_similarity_get.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    highlightName={currentAlgorithm === JACCARD_SIMILARITY}
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
                    label='vertex'
                    name='vertex'
                    rules={[{required: true}]}
                    tooltip={t('analysis.algorithm.oltp.common.vertex_id')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    label='other'
                    name='other'
                    rules={[{required: true}]}
                    tooltip={t('analysis.algorithm.oltp.common.other_vertex_id')}
                >
                    <Input />
                </Form.Item>
                <DirectionItem desc={t('analysis.algorithm.form.step.direction')} />
                <LabelItem />
                <MaxDegreeItem isRequired={false} initialValue={10000} validator={maxDegreeValidator} />
            </Form>
        </Collapse.Panel>
    );
};

export default JaccardSimilarityGet;
