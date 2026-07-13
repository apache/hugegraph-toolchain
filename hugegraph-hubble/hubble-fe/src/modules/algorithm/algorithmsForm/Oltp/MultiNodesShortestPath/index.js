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
 * @file MultiNodesShortestPath
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse, Select, Tooltip, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {DownOutlined, RightOutlined, SubnodeOutlined, QuestionCircleOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import VerticesItems from '../../VerticesItems';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import GraphAnalysisContext from '../../../../Context';
import * as api from '../../../../../api';
import getNodesFromParams from '../../../../../utils/getNodesFromParams';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../utils/constants';
import {integerValidator, positiveIntegerValidator, maxDegreeValidator, skipDegreeValidator,
    formatVerticesValue} from '../../utils';
import _ from 'lodash';
import s from '../OltpItem/index.module.scss';
import KeyboardAction from '../../../../../components/KeyboardAction';
import classnames from 'classnames';

const {MULTINODESSHORTESTPATH} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const initialValue = {
    step: {
        direction: 'BOTH',
        max_degree: 10000,
        skip_degree: 0,
    },
    capacity: 10000000,
};

const MultiNodesShortestPath = props => {
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
    const [stepVisible, setStepVisible] = useState(false);
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
            updateCurrentAlgorithm(MULTINODESSHORTESTPATH);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[MULTINODESSHORTESTPATH]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {graph_view} = data || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                const multiVertices = getNodesFromParams(algorithmParams.vertices, algorithmParams.vertices);
                const options = {endPointsId: {startNodes: [...multiVertices], endNodes: []}};
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
            const {vertices, step = {}} = value;
            const {label} = step;
            const verticesValue = formatVerticesValue(vertices);
            const sumbitValues = {
                ...value,
                vertices: verticesValue,
                step: {...step, label: label && label.split(',')},
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

    const changeStepVisible = useCallback(
        () => {
            setStepVisible(pre => !pre);
        },
        []
    );

    const stepFormItems = () => {
        return (
            <>
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
                    name={['step', 'label']}
                    label="label"
                    tooltip={t('analysis.algorithm.label_item.tooltip')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name={['step', 'max_degree']}
                    label="max_degree"
                    tooltip={t('analysis.algorithm.max_degree_item.tooltip')}
                    rules={[{validator: integerValidator}]}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    name={['step', 'skip_degree']}
                    label="skip_degree"
                    rules={[{validator: skipDegreeValidator}]}
                    tooltip={t('analysis.algorithm.form.step.skip_degree')}
                >
                    <InputNumber />
                </Form.Item>
            </>
        );
    };

    const renderSteps = () => {
        return (
            <div>
                <KeyboardAction
                    className={s.stepHeader}
                    onAction={changeStepVisible}
                    aria-expanded={stepVisible}
                >
                    <div className={s.stepIcon}>
                        {stepVisible ? <DownOutlined /> : <RightOutlined />}
                    </div>
                    <div className={s.stepTitle}>step:</div>
                    <div className={s.tooltip}>
                        <Tooltip
                            placement="rightTop"
                            title={t('analysis.algorithm.oltp.common.source_target_path')}
                        >
                            <QuestionCircleOutlined />
                        </Tooltip>
                    </div>
                </KeyboardAction>
                <div className={stepContentClassName}>
                    {stepFormItems()}
                </div>
            </div>
        );
    };

    return (
        <Collapse.Panel
            isActive={props.isActive}
            onItemClick={props.onItemClick}
            panelKey={props.panelKey}
            header={
                <AlgorithmNameHeader
                    icon={<SubnodeOutlined />}
                    name={MULTINODESSHORTESTPATH}
                    searchValue={searchValue}
                    description={t('analysis.algorithm.oltp.multi_nodes_shortest_path.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    highlightName={currentAlgorithm === MULTINODESSHORTESTPATH}
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
                <VerticesItems name='vertices' desc={t('analysis.algorithm.oltp.multi_nodes_shortest_path.vertices')} />
                {renderSteps()}
                <Form.Item
                    name='max_depth'
                    label="max_depth"
                    tooltip={t('analysis.algorithm.max_depth_item.tooltip')}
                    rules={[{required: true}, {validator: positiveIntegerValidator}]}
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
            </Form>
        </Collapse.Panel>
    );
};

export default MultiNodesShortestPath;
