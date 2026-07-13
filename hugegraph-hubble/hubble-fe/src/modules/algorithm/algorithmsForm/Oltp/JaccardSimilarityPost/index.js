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
 * @file JaccardSimilarityPost
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse, Select, Tooltip, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {CrownOutlined, DownOutlined, RightOutlined, QuestionCircleOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../utils/constants';
import {integerValidator, positiveIntegerValidator, maxDegreeValidator, propertiesValidator} from '../../utils';
import GraphAnalysisContext from '../../../../Context';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import _ from 'lodash';
import classnames from 'classnames';
import s from '../OltpItem/index.module.scss';
import KeyboardAction from '../../../../../components/KeyboardAction';

const {JACCARD_SIMILARITY_POST} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const initialValue = {
    top: 100,
    capacity: 10000000,
    step: {
        direction: 'BOTH',
        max_degree: 10000,
        skip_degree: 0,
    },
};

const JaccardSimilarityPost = props => {
    const {t} = useTranslation();
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } = props;

    const [form] = Form.useForm();
    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const [stepVisible, setStepVisible] = useState(false);
    const [isEnableRun, setEnableRun] = useState(false);
    const [isRequiring, setRequiring] = useState(false);
    const directionOptions = [
        {label: t('analysis.algorithm.form.direction_options.out'), value: 'OUT'},
        {label: t('analysis.algorithm.form.direction_options.in'), value: 'IN'},
        {label: t('analysis.algorithm.form.direction_options.both'), value: 'BOTH'},
    ];

    const stepContentClassName = classnames(
        s.stepContent,
        {[s.contentHidden]: !stepVisible}
    );

    const handleSubmit = useCallback(
        async algorithmParams => {
            setRequiring(true);
            updateCurrentAlgorithm(JACCARD_SIMILARITY_POST);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[JACCARD_SIMILARITY_POST]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {graph_view, jaccardsimilarity} = data || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                const options = {rankObj: jaccardsimilarity};
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

    const formatPropertiesValue = useCallback(
        properties => {
            if (!properties) {
                return undefined;
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
            let sumbitValues = {
                ...value,
                step: {
                    ...value.step,
                    properties: formatPropertiesValue(value.step.properties),
                },
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

    const stepFormItems = (
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
                    name={['step', 'direction']}
                    label="direction"
                    tooltip={t('analysis.algorithm.form.step.direction')}
                >
                    <Select
                        allowClear
                        options={directionOptions}
                    />
                </Form.Item>
                <Form.Item
                    name={['step', 'max_degree']}
                    label="max_degree"
                    rules={[{validator: integerValidator}]}
                    tooltip={t('analysis.algorithm.form.step.max_degree_compatible')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    name={['step', 'skip_degree']}
                    label="skip_degree"
                    rules={[{validator: integerValidator}]}
                    tooltip={t('analysis.algorithm.form.step.skip_degree')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label="label"
                    name={['step', 'label']}
                    tooltip={t('analysis.algorithm.form.edge_steps.label')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    label="properties"
                    name={['step', 'properties']}
                    tooltip={t('analysis.algorithm.form.edge_steps.properties')}
                    rules={[{validator: propertiesValidator}]}
                >
                    <Input.TextArea />
                </Form.Item>
            </div>
        </>
    );

    return (
        <Collapse.Panel
            isActive={props.isActive}
            onItemClick={props.onItemClick}
            panelKey={props.panelKey}
            header={
                <AlgorithmNameHeader
                    icon={<CrownOutlined />}
                    name={JACCARD_SIMILARITY_POST}
                    searchValue={searchValue}
                    description={t('analysis.algorithm.oltp.jaccard_similarity_post.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    highlightName={currentAlgorithm === JACCARD_SIMILARITY_POST}
                />
            }
        >
            <Form
                form={form}
                onFinish={onFormFinish}
                onValuesChange={_.debounce(onFormValuesChange, 300)}
                className={s.oltpForms}
                layout="vertical"
                initialValues={initialValue}
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
                    name='top'
                    label="top"
                    rules={[{required: true}, {validator: positiveIntegerValidator}]}
                    tooltip={t('analysis.algorithm.oltp.jaccard_similarity_post.top')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    name='capacity'
                    label="capacity"
                    rules={[{validator: maxDegreeValidator}]}
                    tooltip={t('analysis.algorithm.capacity_item.tooltip')}
                >
                    <InputNumber />
                </Form.Item>
                {stepFormItems}
            </Form>
        </Collapse.Panel>
    );
};

export default JaccardSimilarityPost;
