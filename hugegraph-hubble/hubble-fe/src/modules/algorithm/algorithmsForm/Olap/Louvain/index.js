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
 * @file Louvain算法
 */

import React, {
    useState, useCallback, useContext, useEffect, useMemo, useRef,
} from 'react';
import {Input, Collapse, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {HomeOutlined} from '@ant-design/icons';
import GraphAnalysisContext from '../../../../Context';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import OlapComputerItem from '../OlapComputerItem';
import _ from 'lodash';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, TEXT_PATH, useTranslatedConstants} from '../../../../../utils/constants';
import {useTranslation} from 'react-i18next';




const Louvain = props => {
    const {ALGORITHM_NAME} = useTranslatedConstants();
    const {LOUVAIN} = ALGORITHM_NAME;
    const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

    const OWNED_TEXT_PATH = TEXT_PATH.OLAP + '.louvain';
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
        canRun,
    } = props;
    const {t} = useTranslation();
    const info = {
        name: 'Louvain',
        desc: t(OWNED_TEXT_PATH + '.desc'),
        icon: <HomeOutlined />,
    };
    const {graphSpace, graph} = useContext(GraphAnalysisContext);
    const [isEnableRun, setEnableRun] = useState(false);
    const [isRequiring, setRequiring] = useState(false);
    const validationVersion = useRef(0);

    const [form] = Form.useForm();

    const handleRunning = useCallback(
        e => {
            e.stopPropagation();
            if (!canRun) {
                return;
            }
            form.submit();
        },
        [canRun, form]
    );

    const handleSubmit = useCallback(
        async algorithmParams => {
            if (!canRun) {
                return;
            }
            setRequiring(true);
            updateCurrentAlgorithm(LOUVAIN);
            handleFormSubmit(LOADING);
            const args = {...algorithmParams};
            delete args.worker;
            const formParams = {
                algorithm: 'louvain',
                worker: 1,
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
        [FAILED, LOADING, LOUVAIN, SUCCESS, canRun, graph, graphSpace,
            handleFormSubmit, updateCurrentAlgorithm]
    );

    const onFormFinish = useCallback(
        value => {
            handleSubmit(value);
        },
        [handleSubmit]
    );

    const updateRunAvailability = useCallback(
        () => {
            const version = ++validationVersion.current;
            if (!canRun) {
                setEnableRun(false);
                return;
            }
            form.validateFields()
                .then(() => {
                    if (validationVersion.current === version && canRun) {
                        setEnableRun(true);
                    }
                })
                .catch(() => {
                    if (validationVersion.current === version) {
                        setEnableRun(false);
                    }
                });
        },
        [canRun, form]
    );

    const invalidateValidation = useCallback(() => {
        validationVersion.current++;
    }, []);

    useEffect(() => {
        updateRunAvailability();
        return invalidateValidation;
    }, [invalidateValidation, updateRunAvailability]);

    const debouncedRunAvailability = useMemo(
        () => _.debounce(updateRunAvailability, 300),
        [updateRunAvailability]
    );

    useEffect(() => () => {
        debouncedRunAvailability.cancel();
    }, [debouncedRunAvailability]);

    return (
        <Collapse.Panel
            isActive={props.isActive}
            onItemClick={props.onItemClick}
            panelKey={props.panelKey}
            header={
                <AlgorithmNameHeader
                    icon={info.icon}
                    name={LOUVAIN}
                    description={info.desc}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === LOUVAIN}
                />
            }
            forceRender
        >
            <Form
                form={form}
                onFinish={onFormFinish}
                onValuesChange={debouncedRunAvailability}
                layout="vertical"
            >
                <Form.Item
                    label='worker'
                    name='worker'
                    rules={[{required: true}]}
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.instance_num')}
                    initialValue={1}
                >
                    <InputNumber disabled />
                </Form.Item>
                <Form.Item
                    label='louvain.weightkey'
                    name='louvain.weightkey'
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.weight_property')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    label='k8s.workerRequestMemory'
                    name='k8s.workerRequestMemory'
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.request_memory')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    label='k8s.jvm_options'
                    name='k8s.jvm_options'
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.JVM_memory')}
                >
                    <Input />
                </Form.Item>
                <OlapComputerItem />
            </Form>
        </Collapse.Panel>
    );
};

export default Louvain;
