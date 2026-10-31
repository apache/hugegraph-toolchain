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
 * @file PersonalPageRank_Vermeer算法
 */

import AlgorithmPanel from '../../AlgorithmPanel';
import useAlgorithmPending from '../../useAlgorithmPending';
import {useState, useCallback, useContext, useEffect} from 'react';
import {InputNumber, Input} from 'antd';
import Form from '../../PersistentForm';
import {NodeIndexOutlined} from '@ant-design/icons';
import GraphAnalysisContext from '../../../../Context';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import _ from 'lodash';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {greaterThanZeroAndLowerThanOneValidator, positiveIntegerValidator} from '../../utils';
import {GRAPH_STATUS, ALGORITHM_NAME, GRAPH_LOAD_STATUS, TEXT_PATH} from '../../../../../utils/constants';
import {useTranslation} from 'react-i18next';

const {PERSONAL_PAGE_RANK} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;
const {LOADED} = GRAPH_LOAD_STATUS;


const OWNED_TEXT_PATH = TEXT_PATH.OLAP + '.personal_page_bank';
const PersonalPageRankVermeer = props => {
    const {
        handleFormSubmit,
        searchValue,
        currentAlgorithm,
        updateCurrentAlgorithm,
    } = props;
    const {t} = useTranslation();
    const info = {
        name: 'PersonalPageRank',
        desc: t(OWNED_TEXT_PATH + '.desc'),
        icon: <NodeIndexOutlined />,
    };
    const {graphSpace, graph, graphStatus} = useContext(GraphAnalysisContext);

    const [isEnableRun, setEnableRun] = useState(false);
    const [isRequiring, beginRequiring] = useAlgorithmPending();
    const [form] = Form.useForm();

    useEffect(
        () => {
            const sourceValue = form.getFieldValue('ppr.source');
            setEnableRun(graphStatus === LOADED && Boolean(sourceValue));
        },
        [form, graphStatus]
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
            updateCurrentAlgorithm(PERSONAL_PAGE_RANK);
            const complete = handleFormSubmit(LOADING);
            const formParams =  {'compute.algorithm': 'ppr', ...algorithmParams};
            const filteredParams = removeNilKeys(formParams);
            const response =  await api.analysis.runOlapVermeer(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            if (status !== 200) {
                complete(FAILED, '', message);
            }
            else {
                complete(SUCCESS, data?.task_id, message);
            }
            finishRequiring();
        },
        [graph, graphSpace, beginRequiring, handleFormSubmit, updateCurrentAlgorithm]
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
                    setEnableRun(graphStatus === LOADED);
                })
                .catch(() => {
                    setEnableRun(false);
                });
        },
        [form, graphStatus]
    );

    return (
        <AlgorithmPanel
            title={
                <AlgorithmNameHeader
                    icon={info.icon}
                    name={PERSONAL_PAGE_RANK}
                    description={info.desc}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === PERSONAL_PAGE_RANK}
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
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.max_iter_step')}
                    rules={[{validator: positiveIntegerValidator}]}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='ppr.damping'
                    name='ppr.damping'
                    initialValue={0.85}
                    tooltip={t(TEXT_PATH.OLAP + '.page_rank.damping')}
                    rules={[{validator: greaterThanZeroAndLowerThanOneValidator}]}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='ppr.diff_threshold'
                    name='ppr.diff_threshold'
                    initialValue={0.00001}
                    tooltip={t(TEXT_PATH.OLAP + '.page_rank.diff')}
                    rules={[{validator: greaterThanZeroAndLowerThanOneValidator}]}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    label='ppr.source'
                    name='ppr.source'
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.source')}
                    rules={[{required: true}]}
                >
                    <Input />
                </Form.Item>
            </Form>
        </AlgorithmPanel>
    );
};

export default PersonalPageRankVermeer;
