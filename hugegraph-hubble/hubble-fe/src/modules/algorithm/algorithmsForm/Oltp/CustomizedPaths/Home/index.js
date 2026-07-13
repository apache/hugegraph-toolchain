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
 * @file CustomizedPaths
 */

import React, {useState, useCallback, useContext} from 'react';
import {Collapse, Select, InputNumber} from 'antd';
import Form from '../../../PersistentForm';
import {ProfileOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import * as api from '../../../../../../api';
import getNodesFromParams from '../../../../../../utils/getNodesFromParams';
import removeNilKeys from '../../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../../utils/constants';
import {integerValidator, maxDegreeValidator, formatPropertiesValue, formatVerticesValue} from '../../../utils';
import GraphAnalysisContext from '../../../../../Context';
import VerticesItems from '../../../VerticesItems';
import StepItem from '../StepItem';
import AlgorithmNameHeader from '../../../AlgorithmNameHeader';
import _ from 'lodash';
import s from '../../OltpItem/index.module.scss';

const {CUSTOMIZEDPATHS} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const CustomizedPaths = props => {
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
    const [form] = Form.useForm();
    const sortByOptions = [
        {label: t('analysis.algorithm.oltp.customized_paths.sort_none'), value: 'NONE'},
        {label: t('analysis.algorithm.oltp.customized_paths.sort_incr'), value: 'INCR'},
        {label: t('analysis.algorithm.oltp.customized_paths.sort_decr'), value: 'DECR'},
    ];

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
            updateCurrentAlgorithm(CUSTOMIZEDPATHS);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[CUSTOMIZEDPATHS]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {graph_view} = data || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                const vertexs = getNodesFromParams(algorithmParams.sources, algorithmParams.vertices);
                const options = {endPointsId: {startNodes: [...vertexs], endNodes: []}};
                handleFormSubmit(SUCCESS, graph_view || {}, message, options);
            }
            setRequiring(false);
        },
        [graph, graphSpace, handleFormSubmit, updateCurrentAlgorithm]
    );

    const onFormFinish = useCallback(
        value => {
            const {sources, steps} = value;
            const sourcesValue = formatVerticesValue(sources);
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
                    icon={<ProfileOutlined />}
                    name={CUSTOMIZEDPATHS}
                    description={t('analysis.algorithm.oltp.customized_paths.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === CUSTOMIZEDPATHS}
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
                <VerticesItems name="sources" desc={t('analysis.algorithm.oltp.template_paths.sources')} />
                <StepItem />
                <Form.Item
                    label='max_depth'
                    name='max_depth'
                    rules={[{required: true}, {validator: integerValidator}]}
                    tooltip={t('analysis.algorithm.max_depth_item.tooltip')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='sort_by'
                    name='sort_by'
                    initialValue={'NONE'}
                    tooltip={t('analysis.algorithm.oltp.customized_paths.sort_by')}
                >
                    <Select options={sortByOptions} allowClear />
                </Form.Item>
                <Form.Item
                    label='capacity'
                    name='capacity'
                    initialValue={10000000}
                    rules={[{validator: maxDegreeValidator}]}
                    tooltip={t('analysis.algorithm.capacity_item.tooltip')}
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

export default CustomizedPaths;
