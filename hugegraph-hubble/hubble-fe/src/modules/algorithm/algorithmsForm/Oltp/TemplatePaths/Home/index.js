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
 * @file TemplatePaths
 */

import React, {useState, useCallback, useContext} from 'react';
import {useTranslation} from 'react-i18next';
import {Collapse, InputNumber} from 'antd';
import Form from '../../../PersistentForm';
import {ReconciliationOutlined} from '@ant-design/icons';
import GraphAnalysisContext from '../../../../../Context';
import * as api from '../../../../../../api';
import removeNilKeys from '../../../../../../utils/removeNilKeys';
import AlgorithmNameHeader from '../../../AlgorithmNameHeader';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../../utils/constants';
import {maxDegreeValidator, formatPropertiesValue, formatVerticesValue} from '../../../utils';
import getNodesFromParams from '../../../../../../utils/getNodesFromParams';
import VerticesItems from '../../../VerticesItems';
import StepFormItem from '../StepFormItem';
import BoolSelectItem from '../../../BoolSelectItem';
import _ from 'lodash';
import s from '../../OltpItem/index.module.scss';

const {TEMPLATEPATHS} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const TemplatePaths = props => {
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
            updateCurrentAlgorithm(TEMPLATEPATHS);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[TEMPLATEPATHS]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {graph_view} = data || {};
            const {vertices} = graph_view || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                const sources = getNodesFromParams(algorithmParams.sources, vertices);
                const targets = getNodesFromParams(algorithmParams.targets, vertices);
                const options = {endPointsId: {startNodes: [...sources, ...targets], endNodes: []}};
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
            const {sources, targets, steps} = value;
            const sourcesValue = formatVerticesValue(sources);
            const targetsValue = formatVerticesValue(targets);
            const formatedSteps = steps.map(
                item => {
                    const {labels, properties} = item;
                    return {
                        ...item,
                        labels: labels && labels.split(','),
                        properties: formatPropertiesValue(properties),
                    };
                }
            );
            let sumbitValues = {
                ...value,
                sources: sourcesValue,
                targets: targetsValue,
                steps: [...formatedSteps],
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
                    icon={<ReconciliationOutlined />}
                    name={TEMPLATEPATHS}
                    description={t('analysis.algorithm.oltp.template_paths.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === TEMPLATEPATHS}
                />
            }
        >
            <Form
                form={form}
                onFinish={onFormFinish}
                className={s.oltpForms}
                onValuesChange={_.debounce(onFormValuesChange, 300)}
                layout="vertical"
            >
                <VerticesItems
                    name="sources"
                    desc={t('analysis.algorithm.oltp.template_paths.sources')}
                />
                <VerticesItems
                    name="targets"
                    desc={t('analysis.algorithm.oltp.template_paths.targets')}
                />
                <StepFormItem />
                <BoolSelectItem
                    name={'with_ring'}
                    desc={t('analysis.algorithm.oltp.template_paths.with_ring')}
                />
                <Form.Item
                    label='capacity'
                    name='capacity'
                    initialValue={10000000}
                    rules={[{validator: maxDegreeValidator}]}
                    tooltip={t('analysis.algorithm.oltp.template_paths.capacity')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='limit'
                    name='limit'
                    initialValue={10}
                    rules={[{validator: maxDegreeValidator}]}
                    tooltip={t('analysis.algorithm.oltp.template_paths.limit')}
                >
                    <InputNumber />
                </Form.Item>
            </Form>
        </Collapse.Panel>
    );
};

export default TemplatePaths;
