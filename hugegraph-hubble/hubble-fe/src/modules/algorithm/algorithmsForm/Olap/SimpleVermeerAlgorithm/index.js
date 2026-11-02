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
 * @file Vermeer SCC and clustering coefficient forms
 */

import AlgorithmPanel from '../../AlgorithmPanel';
import useAlgorithmPending from '../../useAlgorithmPending';
import {useState, useCallback, useContext, useEffect} from 'react';
import {InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {SendOutlined} from '@ant-design/icons';
import GraphAnalysisContext from '../../../../Context';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import _ from 'lodash';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, ALGORITHM_NAME, GRAPH_LOAD_STATUS, TEXT_PATH} from '../../../../../utils/constants';
import {positiveIntegerValidator} from '../../utils';
import {useTranslation} from 'react-i18next';

const {STRONGLY_CONNECTED_COMPONENT, CLUSTER_COEFFICIENT} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;
const {LOADED} = GRAPH_LOAD_STATUS;


const SimpleVermeerAlgorithm = props => {
    const {kind} = props;
    const scc = kind === 'scc';
    const name = scc ? STRONGLY_CONNECTED_COMPONENT : CLUSTER_COEFFICIENT;
    const textPath = TEXT_PATH.OLAP + (scc ? '.strongly_connected_component' : '.cluster_coefficient');
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } = props;
    const {t} = useTranslation();
    const info = {
        desc: t(textPath + '.desc'),
        icon: <SendOutlined />,
    };
    const {graphSpace, graph, graphStatus} = useContext(GraphAnalysisContext);

    const [isEnableRun, setEnableRun] = useState(true);
    const [isRequiring, beginRequiring] = useAlgorithmPending();
    const [form] = Form.useForm();

    useEffect(
        () => {
            setEnableRun(graphStatus === LOADED);
        },
        [graphStatus]
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
        [graph, graphSpace, beginRequiring, handleFormSubmit, updateCurrentAlgorithm, kind, name]
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
                    label='compute.max_step'
                    name='compute.max_step'
                    initialValue={10}
                    tooltip={t(textPath + '.max_step')}
                    rules={[{validator: positiveIntegerValidator},
                        ...(!scc ? [{type: 'number', min: 2, message: t(textPath + '.min_step')}] : [])]}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='compute.parallel'
                    name='compute.parallel'
                    initialValue={1}
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.worker_num')}
                    rules={[{validator: positiveIntegerValidator}]}
                >
                    <InputNumber />
                </Form.Item>
            </Form>
        </AlgorithmPanel>
    );
};

export default SimpleVermeerAlgorithm;
