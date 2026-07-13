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
 * @file Egonet算法
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse, Select, Tooltip, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {GatewayOutlined, DownOutlined, RightOutlined, QuestionCircleOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import StepsItems from '../../StepsItems';
import MaxDegreeItem from '../../MaxDegreeItem';
import LimitItem from '../../LimitItem';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../utils/constants';
import {positiveIntegerValidator, skipDegreeValidator, integerValidator, formatPropertiesValue} from '../../utils';
import GraphAnalysisContext from '../../../../Context';
import classnames from 'classnames';
import _ from 'lodash';
import s from '../OltpItem/index.module.scss';
import KeyboardAction from '../../../../../components/KeyboardAction';

const {EGONET} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const Egonet = props => {
    const {t} = useTranslation();
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } = props;

    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const [isEnableRun, setEnableRun] = useState(false);
    const [stepVisible, setStepVisible] = useState(true);
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

    const [egonetForm] = Form.useForm();
    const handleRunning = useCallback(
        e => {
            e.stopPropagation();
            egonetForm.submit();
        },
        [egonetForm]
    );

    const changeStepVisibleState = useCallback(() => {
        setStepVisible(pre => !pre);
    }, []
    );

    const handleSubmit = useCallback(
        async algorithmParams => {
            setRequiring(true);
            updateCurrentAlgorithm(EGONET);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[EGONET]};
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

    const onFormFinish = useCallback(
        value => {
            const {sources, steps} = value;
            const {edge_steps, vertex_steps} = steps;
            const edgesSteps = _.cloneDeep(edge_steps);
            const vertexSteps = _.cloneDeep(vertex_steps);
            edgesSteps.forEach(item => {
                const {properties} = item;
                item.properties = formatPropertiesValue(properties);
            });
            vertexSteps.forEach(item => {
                const {properties} = item;
                item.properties = formatPropertiesValue(properties);
            });
            let sumbitValues = {
                ...value,
                steps: {
                    ...steps,
                    edge_steps: edgesSteps,
                    vertex_steps: vertexSteps,
                },
                sources: sources.split(','),
            };
            handleSubmit(sumbitValues);
        },
        [handleSubmit]
    );

    const onFormValuesChange = useCallback(
        () => {
            egonetForm.validateFields()
                .then(() => {
                    setEnableRun(true);
                })
                .catch(() => {
                    setEnableRun(false);
                });
        },
        [egonetForm]
    );


    const renderStepItems = param => {
        return (
            <div>
                <KeyboardAction
                    className={s.stepHeader}
                    onAction={changeStepVisibleState}
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
                        name={[param, 'direction']}
                        label="direction"
                        initialValue='BOTH'
                        tooltip={t('analysis.algorithm.form.step.direction')}
                    >
                        <Select
                            placeholder={t('analysis.algorithm.direction_item.tooltip')}
                            allowClear
                            options={directionOptions}
                        />
                    </Form.Item>
                    <Form.Item
                        name={[param, 'max_degree']}
                        label="max_degree"
                        initialValue='10000'
                        rules={[{validator: integerValidator}]}
                        tooltip={t('analysis.algorithm.form.step.max_degree_compatible')}
                    >
                        <InputNumber />
                    </Form.Item>
                    <Form.Item
                        name={[param, 'skip_degree']}
                        label="skip_degree"
                        initialValue={0}
                        tooltip={t('analysis.algorithm.form.step.skip_degree')}
                        rules={[{validator: skipDegreeValidator}]}
                    >
                        <InputNumber />
                    </Form.Item>
                    <StepsItems
                        param={param}
                        type='edge_steps'
                        desc={t('analysis.algorithm.form.step.edge_steps')}
                    />
                    <StepsItems
                        param={param}
                        type='vertex_steps'
                        desc={t('analysis.algorithm.form.step.vertex_steps')}
                    />
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
                    icon={<GatewayOutlined />}
                    name={EGONET}
                    description={t('analysis.algorithm.oltp.egonet.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === EGONET}
                />
            }
        >
            <Form
                form={egonetForm}
                onFinish={onFormFinish}
                onValuesChange={_.debounce(onFormValuesChange, 300)}
                className={s.oltpForms}
                layout="vertical"
            >
                <Form.Item
                    label='sources'
                    name='sources'
                    rules={[{required: true}]}
                    tooltip={t('analysis.algorithm.oltp.egonet.sources')}
                >
                    <Input />
                </Form.Item>
                {renderStepItems('steps')}
                <MaxDegreeItem
                    isRequired
                    initialValue={10000}
                    validator={integerValidator}
                />
                <Form.Item
                    label='skip_degree'
                    name='skip_degree'
                    initialValue='0'
                    rules={[{validator: skipDegreeValidator}]}
                    tooltip={t('analysis.algorithm.form.step.skip_degree')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='max_depth'
                    name='max_depth'
                    rules={[{required: true}, {validator: positiveIntegerValidator}]}
                    tooltip={t('analysis.algorithm.max_depth_item.tooltip')}
                >
                    <InputNumber />
                </Form.Item>
                <LimitItem
                    initialValue='10000000'
                    desc={t('analysis.algorithm.oltp.common.limit_crosspoints')}
                />
            </Form>
        </Collapse.Panel>
    );
};

export default Egonet;
