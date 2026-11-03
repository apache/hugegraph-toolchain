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
 * @file Vermeer Depth and SLPA forms
 */

import AlgorithmPanel from '../../AlgorithmPanel';
import useAlgorithmPending from '../../useAlgorithmPending';
import {useState, useCallback, useContext, useEffect} from 'react';
import {InputNumber, Select} from 'antd';
import Form from '../../PersistentForm';
import {TagsOutlined} from '@ant-design/icons';
import _ from 'lodash';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {positiveIntegerValidator} from '../../utils';
import {
    GRAPH_STATUS,
    GRAPH_LOAD_STATUS,
    TEXT_PATH,
    useTranslatedConstants,
} from '../../../../../utils/constants';
import GraphAnalysisContext from '../../../../Context';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import {useTranslation} from 'react-i18next';




const DepthSlpaVermeer = props => {
    const {kind} = props;
    const isSlpa = kind === 'slpa';
    const OWNED_TEXT_PATH = TEXT_PATH.OLAP + (isSlpa ? '.slpa_vermeer' : '.depth_vermeer');
    const {ALGORITHM_NAME} = useTranslatedConstants();
    const name = isSlpa ? ALGORITHM_NAME.SLPA : ALGORITHM_NAME.DEPTH;
    const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;
    const {LOADED} = GRAPH_LOAD_STATUS;
    const {t} = useTranslation();
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } = props;
    const info = {
        desc: t(OWNED_TEXT_PATH + '.desc'),
        icon: <TagsOutlined />,
    };
    const {graphSpace, graph, graphStatus} = useContext(GraphAnalysisContext);

    const [isEnableRun, setEnableRun] = useState(true);
    const [isRequiring, beginRequiring] = useAlgorithmPending();

    const [form] = Form.useForm();

    useEffect(
        () => {
            setEnableRun(graphStatus === LOADED);
        },
        [LOADED, graphStatus]
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
            const finishRequiring = beginRequiring();
            updateCurrentAlgorithm(name);
            const complete = handleFormSubmit(LOADING);
            const formParams = {'compute.algorithm': kind, ...algorithmParams};
            const filteredParams = removeNilKeys(formParams);
            try {
                const response = await api.analysis.runOlapVermeer(
                    graphSpace, graph, filteredParams);
                const {data, status, message} = response || {};
                if (status !== 200) {
                    complete(FAILED, '', message);
                }
                else {
                    complete(SUCCESS, data?.task_id, message);
                }
            }
            catch (error) {
                complete(FAILED, '', error?.message);
            }
            finally {
                finishRequiring();
            }
        },
        [FAILED, name, kind, LOADING, SUCCESS, graph, graphSpace,
            beginRequiring, handleFormSubmit, updateCurrentAlgorithm]
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
        <AlgorithmPanel
            title={
                <AlgorithmNameHeader
                    icon={info.icon}
                    name={name}
                    description={info.desc}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === name}
                />
            }
            forceRender
        >
            <Form
                isDisabled={!isEnableRun}
                isRunning={isRequiring}
                form={form}
                disabled={graphStatus !== LOADED}
                onFinish={onFormFinish}
                onValuesChange={_.debounce(onFormValuesChange, 300)}
                layout="vertical"
            >
                <Form.Item
                    label='compute.parallel'
                    name='compute.parallel'
                    initialValue={1}
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.worker_num')}
                    rules={[{validator: positiveIntegerValidator}]}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='compute.max_step'
                    name='compute.max_step'
                    initialValue={10}
                    tooltip={t(OWNED_TEXT_PATH + '.max_step')}
                    rules={[{required: true}, {validator: positiveIntegerValidator},
                        ...(isSlpa ? [{type: 'number', max: 1000}] : [])]}
                >
                    <InputNumber min={1} max={isSlpa ? 1000 : undefined} />
                </Form.Item>
                {isSlpa && <>
                    <Form.Item label='slpa.k' name='slpa.k' initialValue={10}
                        tooltip={t(OWNED_TEXT_PATH + '.k')}
                        rules={[{required: true}, {validator: (_, value) =>
                            Number.isInteger(value) && (value === -1 || value >= 1)
                                ? Promise.resolve() : Promise.reject(new Error(t(OWNED_TEXT_PATH + '.k_invalid')))}]}>
                        <InputNumber min={-1} />
                    </Form.Item>
                    <Form.Item label='slpa.select_method' name='slpa.select_method' initialValue='max'
                        tooltip={t(OWNED_TEXT_PATH + '.select_method')} rules={[{required: true}]}>
                        <Select options={[{value: 'max', label: 'max'}, {value: 'random', label: 'random'}]} />
                    </Form.Item>
                </>}
            </Form>
        </AlgorithmPanel>
    );
};

export default DepthSlpaVermeer;
