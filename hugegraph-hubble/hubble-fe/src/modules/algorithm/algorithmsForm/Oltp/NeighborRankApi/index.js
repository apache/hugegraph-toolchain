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
 * @file NeighborRankApi
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse, Select, InputNumber, Button, Tooltip} from 'antd';
import Form from '../../PersistentForm';
import {ScheduleOutlined, DownOutlined, RightOutlined, PlusOutlined, QuestionCircleOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import _ from 'lodash';
import GraphAnalysisContext from '../../../../Context';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../utils/constants';
import {integerValidator, topValidator, alphaValidator, positiveIntegerValidator} from '../../utils';
import classnames from 'classnames';
import s from '../OltpItem/index.module.scss';
import KeyboardAction from '../../../../../components/KeyboardAction';

const {NEIGHBOR_RANK_API} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const createActionHandler = handler => () => handler();
const createValueHandler = (handler, value) => () => handler(value);

const NeighborRankApi = props => {
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
            updateCurrentAlgorithm(NEIGHBOR_RANK_API);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[NEIGHBOR_RANK_API]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {graph_view, rankslist} = data || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                const options = {rankArray: rankslist || []};
                handleFormSubmit(SUCCESS, graph_view || {}, message, options);
            }
            setRequiring(false);
        },
        [graph, graphSpace, handleFormSubmit, updateCurrentAlgorithm]
    );

    const onFormFinish = useCallback(
        value => {
            const {steps} = value;
            const formatedSteps = steps.map(
                item => {
                    const {labels} = item;
                    return {
                        ...item,
                        labels: labels?.split(','),
                    };
                }
            );
            let sumbitValues = {
                ...value,
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

    const changeStepVisible = useCallback(
        () => {
            setStepVisible(pre => !pre);
        },
        []
    );

    const stepFormItems = item => {
        return (
            <>
                <Form.Item
                    name={[item.name, 'direction']}
                    label="direction"
                    initialValue='BOTH'
                    tooltip={t('analysis.algorithm.form.step.direction')}
                >
                    <Select options={directionOptions} allowClear />
                </Form.Item>
                <Form.Item
                    name={[item.name, 'labels']}
                    label="labels"
                    rules={[{required: true}]}
                    tooltip={t('analysis.algorithm.form.step.labels')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name={[item.name, 'max_degree']}
                    label="max_degree"
                    rules={[{validator: integerValidator}]}
                    tooltip={t('analysis.algorithm.max_degree_item.tooltip')}
                    initialValue={10000}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    name={[item.name, 'top']}
                    label="top"
                    tooltip={t('analysis.algorithm.oltp.neighbor_rank_api.top')}
                    rules={[{validator: topValidator}]}
                    initialValue={100}
                >
                    <InputNumber />
                </Form.Item>
            </>
        );
    };

    const renderStepsFormItems = () => {
        return (
            <Form.List
                name={['steps']}
                initialValue={[{}]}
            >
                {(lists, {add, remove}, {errors}) => (
                    <>
                        {
                            lists.map((item, index) => {
                                return (
                                    <div key={item.key}>
                                        {stepFormItems(item)}
                                        {lists.length > 1 ? (
                                            <Form.Item>
                                                <Button
                                                    block
                                                    danger
                                                    onClick={createValueHandler(remove, item.name)}
                                                >
                                                    {t('common.action.delete')}
                                                </Button>
                                            </Form.Item>
                                        ) : null}
                                    </div>
                                );
                            })
                        }
                        <Button
                            type="dashed"
                            onClick={createActionHandler(add)}
                            style={{width: '100%'}}
                            icon={<PlusOutlined />}
                        >
                            Add
                        </Button>
                    </>

                )}
            </Form.List>
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
                    {renderStepsFormItems()}
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
                    icon={<ScheduleOutlined />}
                    name={NEIGHBOR_RANK_API}
                    description={t('analysis.algorithm.oltp.neighbor_rank_api.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === NEIGHBOR_RANK_API}
                />
            }
        >
            <Form
                form={form}
                onFinish={onFormFinish}
                onValuesChange={_.debounce(onFormValuesChange, 300)}
                className={s.oltpForms}
                layout="vertical"
            >
                <Form.Item
                    label='source'
                    name='source'
                    rules={[{required: true}]}
                    tooltip={t('analysis.algorithm.oltp.common.source_vertex_id')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name='alpha'
                    label="alpha"
                    initialValue={0.85}
                    rules={[{validator: alphaValidator}]}
                    tooltip={t('analysis.algorithm.oltp.common.alpha')}
                >
                    <InputNumber style={{width: '100%'}} step={0.01} />
                </Form.Item>
                <Form.Item
                    name='capacity'
                    label="capacity"
                    initialValue={10000000}
                    rules={[{validator: positiveIntegerValidator}]}
                    tooltip={t('analysis.algorithm.capacity_item.tooltip')}
                >
                    <InputNumber />
                </Form.Item>
                {renderSteps()}
            </Form>
        </Collapse.Panel>
    );
};

export default NeighborRankApi;
