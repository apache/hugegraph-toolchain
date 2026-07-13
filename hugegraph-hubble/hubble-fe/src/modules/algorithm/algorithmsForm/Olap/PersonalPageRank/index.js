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
 * @file PersonalPageRank算法
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse, Select, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {TeamOutlined} from '@ant-design/icons';
import GraphAnalysisContext from '../../../../Context';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import OlapComputerItem from '../OlapComputerItem';
import _ from 'lodash';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import {GRAPH_STATUS, ALGORITHM_NAME, TEXT_PATH} from '../../../../../utils/constants';
import {
    alphaValidator,
    greaterThanZeroAndLowerThanTwoThousandAndOneIntegerValidator,
} from '../../utils';
import {useTranslation} from 'react-i18next';

const {PERSONAL_PAGE_RANK} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const OWNED_TEXT_PATH = TEXT_PATH.OLAP + '.personal_page_bank';

const PersonalPageRank = props => {
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
        icon: <TeamOutlined />,
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
            updateCurrentAlgorithm(PERSONAL_PAGE_RANK);
            handleFormSubmit(LOADING);
            const {worker, ...args} = algorithmParams;
            const formParams = {
                algorithm: 'ppr',
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
        [graph, graphSpace, handleFormSubmit, updateCurrentAlgorithm]
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
                    name={PERSONAL_PAGE_RANK}
                    description={info.desc}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    searchValue={searchValue}
                    highlightName={currentAlgorithm === PERSONAL_PAGE_RANK}
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
                    labelCol={{span: 24}}
                    label='worker'
                    name='worker'
                    rules={[{required: true}]}
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.instance_num')}
                >
                    <InputNumber min={1} precision={0} />
                </Form.Item>
                <Form.Item
                    labelCol={{span: 24}}
                    label='ppr.source'
                    name='ppr.source'
                    initialValue='/'
                    tooltip={t(OWNED_TEXT_PATH + '.source')}
                    rules={[{required: true}]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    labelCol={{span: 24}}
                    label='ppr.alpha'
                    name='ppr.alpha'
                    initialValue={0.85}
                    tooltip={t(OWNED_TEXT_PATH + '.alpha')}
                    rules={[{validator: alphaValidator}]}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    labelCol={{span: 24}}
                    label='ppr.l1DiffThreshold'
                    name='ppr.l1DiffThreshold'
                    initialValue={0.00001}
                    tooltip={t(OWNED_TEXT_PATH + '.l1')}
                    rules={[{validator: alphaValidator}]}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    labelCol={{span: 24}}
                    label='input.use_id_fixlength'
                    name='input.use_id_fixlength'
                    initialValue
                    tooltip={t(OWNED_TEXT_PATH + '.use_id_fixlength')}
                >
                    <Select
                        placeholder={t(OWNED_TEXT_PATH + '.use_id_fixlength_query')}
                        allowClear
                    >
                        <Select.Option value>{t('common.verify.yes')}</Select.Option>
                        <Select.Option value={false}>{t('common.verify.no')}</Select.Option>
                    </Select>
                </Form.Item>
                <Form.Item
                    labelCol={{span: 24}}
                    label='bsp.max_super_step'
                    name='bsp.max_super_step'
                    initialValue={10}
                    tooltip={t(TEXT_PATH.ALGORITHM_COMMON + '.max_iter_step')}
                    rules={[{validator: greaterThanZeroAndLowerThanTwoThousandAndOneIntegerValidator}]}
                >
                    <InputNumber />
                </Form.Item>
                <OlapComputerItem />
            </Form>
        </Collapse.Panel>
    );
};

export default PersonalPageRank;
