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
 * @file CustomizedCrosspoints算法
 */

import React, {useState, useCallback, useContext} from 'react';
import {Collapse, InputNumber} from 'antd';
import Form from '../../../PersistentForm';
import {NodeIndexOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import VerticesItems from '../../../VerticesItems';
import AlgorithmNameHeader from '../../../AlgorithmNameHeader';
import PathPatternsFormItems from '../PathPatternForm';
import * as api from '../../../../../../api';
import getNodesFromParams from '../../../../../../utils/getNodesFromParams';
import removeNilKeys from '../../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../../utils/constants';
import {maxDegreeValidator, formatPropertiesValue, formatVerticesValue} from '../../../utils';
import GraphAnalysisContext from '../../../../../Context';
import _ from 'lodash';
import s from '../../OltpItem/index.module.scss';

const {CUSTOMIZED_CROSSPOINTS} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const CustomizedCrosspoints = props => {
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
            updateCurrentAlgorithm(CUSTOMIZED_CROSSPOINTS);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[CUSTOMIZED_CROSSPOINTS]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {graph_view} = data || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                const graphNode = graph_view.vertices;
                const newVertexs = getNodesFromParams(algorithmParams.sources, graphNode);
                const options = {endPointsId: {startNodes: [...newVertexs], endNodes: []}};
                handleFormSubmit(SUCCESS, graph_view || {}, message, options);
            }
            setRequiring(false);
        },
        [graph, graphSpace, handleFormSubmit, updateCurrentAlgorithm]
    );

    const onFormFinish = useCallback(
        value => {
            const {sources, path_patterns} = value;
            const sourcesValue = formatVerticesValue(sources);
            const {steps} = path_patterns;
            const copySteps = _.cloneDeep(steps);
            copySteps.forEach(item => {
                const {labels, properties} = item;
                item.labels = labels?.split(','),
                item.properties = formatPropertiesValue(properties);
            });
            let sumbitValues = {
                ...value,
                sources: sourcesValue,
                path_patterns: [{steps: copySteps}],
            };
            handleSubmit(sumbitValues);
        },
        [handleSubmit]
    );

    const onFormValuesChange = useCallback(() => {
        form.validateFields()
            .then(() => {
                setEnableRun(true);
            })
            .catch(() => {
                setEnableRun(false);
            });
    }, [form]);


    return (
        <Collapse.Panel
            isActive={props.isActive}
            onItemClick={props.onItemClick}
            panelKey={props.panelKey}
            header={
                <AlgorithmNameHeader
                    icon={<NodeIndexOutlined />}
                    name={CUSTOMIZED_CROSSPOINTS}
                    description={t('analysis.algorithm.oltp.customized_crosspoints.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === CUSTOMIZED_CROSSPOINTS}
                />
            }
        >
            <Form
                form={form}
                onFinish={onFormFinish}
                onValuesChange={_.debounce(onFormValuesChange, 300)}
                layout="vertical"
                className={s.oltpForms}
            >
                <VerticesItems name="sources" desc={t('analysis.algorithm.oltp.template_paths.sources')} />
                <PathPatternsFormItems />
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
                    tooltip={t('analysis.algorithm.oltp.customized_crosspoints.limit')}
                >
                    <InputNumber />
                </Form.Item>
            </Form>
        </Collapse.Panel>
    );
};

export default CustomizedCrosspoints;
