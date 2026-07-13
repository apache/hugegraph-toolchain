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
 * @file FilterSubGraphMatching算法
 */

import React, {useState, useCallback, useContext} from 'react';
import {Collapse, InputNumber, Input} from 'antd';
import Form from '../../PersistentForm';
import {FunnelPlotOutlined} from '@ant-design/icons';
import GraphAnalysisContext from '../../../../Context';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import OlapComputerItem from '../OlapComputerItem';
import _ from 'lodash';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, TEXT_PATH, useTranslatedConstants} from '../../../../../utils/constants';
import {useTranslation} from 'react-i18next';



const OWNED_TEXT_PATH = TEXT_PATH.OLAP + '.filter_subgraph_matching';


// eslint-disable-next-line
const placeholder = '[{"id":"A","label":"person",},{"id":"B","label":"person","property_filter":"$element.x > 3"},{"id":"C","label":"person","edges":[{"targetId":"A","label":"knows","property_filter":"$element.x > 3"}]},{"id":"D","label":"person","property_filter":"$element.x > 3","edges":[{"targetId":"B","label":"knows",},{"targetId":"F","label":"knows","property_filter":"$element.x > 3"},{"targetId":"C","label":"knows",},{"targetId":"E","label":"knows",}]},{"id":"E","label":"person",},{"id":"F","label":"person","property_filter":"$element.x > 3","edges":[{"targetId":"B","label":"knows","property_filter":"$element.x > 3"},{"targetId":"C","label":"knows","property_filter":"$element.x > 3"}]}]';

const FilterSubGraphMatching = props => {
    const {ALGORITHM_NAME} = useTranslatedConstants();
    const {TextArea} = Input;
    const {FILTER_SUBGRAPH_MATCHING} = ALGORITHM_NAME;
    const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;
    const {t} = useTranslation();
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } = props;
    const info = {
        name: 'Filter SubGraph Matching',
        desc: t(OWNED_TEXT_PATH + '.desc'),
        icon: <FunnelPlotOutlined />,
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
            updateCurrentAlgorithm(FILTER_SUBGRAPH_MATCHING);
            handleFormSubmit(LOADING);
            const {worker, ...args} = algorithmParams;
            const formParams = {
                algorithm: 'subgraph-match',
                worker: worker,
                params: {...args},
            };
            const filteredParams = removeNilKeys(formParams);
            const response =  await api.analysis.postOlapInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, '', message);
            }
            else {
                handleFormSubmit(SUCCESS, data?.task_id, message);
            }
            setRequiring(false);
        },
        [FAILED, FILTER_SUBGRAPH_MATCHING, LOADING, SUCCESS, graph, graphSpace,
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
                    name={FILTER_SUBGRAPH_MATCHING}
                    description={info.desc}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === FILTER_SUBGRAPH_MATCHING}
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
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.instance_num')}
                >
                    <InputNumber min={1} precision={0} />
                </Form.Item>
                <Form.Item
                    label='subgraph.query_graph_config'
                    name='subgraph.query_graph_config'
                    tooltip={t(OWNED_TEXT_PATH + '.query_graph_config')}
                    initialValue={placeholder}
                    rules={[{required: true}]}
                >
                    <TextArea
                        placeholder={placeholder}
                        autoSize={{minRows: 15}}
                    />
                </Form.Item>
                <OlapComputerItem />
            </Form>
        </Collapse.Panel>
    );
};

export default FilterSubGraphMatching;
