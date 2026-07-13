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
 * @file AllPaths算法
 */

import React, {useState, useCallback, useContext} from 'react';
import {Input, Collapse, Select, Tooltip, InputNumber} from 'antd';
import Form from '../../PersistentForm';
import {ClusterOutlined, QuestionCircleOutlined, DownOutlined, RightOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import AlgorithmNameHeader from '../../AlgorithmNameHeader';
import VerticesItems from '../../VerticesItems';
import MaxDepthItem from '../../MaxDepthItem';
import NearestItem from '../../NearestItem';
import MaxDegreeItem from '../../MaxDegreeItem';
import CapacityItem from '../../CapacityItem';
import KeyboardAction from '../../../../../components/KeyboardAction';
import LimitItem from '../../LimitItem';
import _ from 'lodash';
import * as api from '../../../../../api';
import removeNilKeys from '../../../../../utils/removeNilKeys';
import getNodesFromParams from '../../../../../utils/getNodesFromParams';
import {maxDepthValidator, integerValidator, propertiesValidator,
    formatPropertiesValue, formatVerticesValue} from '../../utils';
import {GRAPH_STATUS, Algorithm_Url, ALGORITHM_NAME} from '../../../../../utils/constants';
import GraphAnalysisContext from '../../../../Context';
import classnames from 'classnames';
import s from '../OltpItem/index.module.scss';

const {ALLPATHS} = ALGORITHM_NAME;
const {LOADING, SUCCESS, FAILED} = GRAPH_STATUS;

const AllPaths = props => {
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

    const [crosspointsForm] = Form.useForm();

    const changeStepVisibleState = useCallback(() => {
        setStepVisible(pre => !pre);
    }, []);

    const handleSubmit = useCallback(
        async algorithmParams => {
            setRequiring(true);
            updateCurrentAlgorithm(ALLPATHS);
            handleFormSubmit(LOADING);
            algorithmParams = {...algorithmParams, 'algorithmName': Algorithm_Url[ALLPATHS]};
            const filteredParams = removeNilKeys(algorithmParams);
            const response =  await api.analysis.runOltpInfo(graphSpace, graph, filteredParams);
            const {data, status, message} = response || {};
            const {graph_view, pathnum} = data || {};
            const {vertices} = graph_view || {};
            if (status !== 200) {
                handleFormSubmit(FAILED, {}, message);
            }
            else {
                const sourceIds = getNodesFromParams(algorithmParams.sources, vertices);
                const targetIds = getNodesFromParams(algorithmParams.targets, vertices);
                const options = {
                    endPointsId: {startNodes: [...sourceIds], endNodes: [...targetIds]},
                    pathNum: pathnum,
                };
                handleFormSubmit(SUCCESS, graph_view || {}, message, options);
            }
            setRequiring(false);
        },
        [graph, graphSpace, handleFormSubmit, updateCurrentAlgorithm]
    );

    const handleRunning = useCallback(
        e => {
            e.stopPropagation();
            crosspointsForm.submit();
        },
        [crosspointsForm]
    );

    const onFormFinish = useCallback(
        value => {
            const {sources, targets, step} = value;
            const sourcesValue = formatVerticesValue(sources);
            const targetsValue = formatVerticesValue(targets);
            const {properties} = step;
            const sumbitValues = {
                ...value,
                sources: sourcesValue,
                targets: targetsValue,
                step: {...step, properties: formatPropertiesValue(properties)},
            };
            handleSubmit(sumbitValues);
        },
        [handleSubmit]
    );

    const onFormValuesChange = useCallback(
        () => {
            crosspointsForm.validateFields()
                .then(() => {
                    setEnableRun(true);
                })
                .catch(() => {
                    setEnableRun(false);
                });
        },
        [crosspointsForm]
    );

    const stepFormItems = (
        <div>
            <KeyboardAction
                className={s.stepHeader}
                onAction={changeStepVisibleState}
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
                <Form.Item
                    name={['step', 'direction']}
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
                    name={['step', 'label']}
                    label="label"
                    tooltip={t('analysis.algorithm.label_item.tooltip')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name={['step', 'properties']}
                    label="properties"
                    tooltip={t('analysis.algorithm.form.step.edge_properties')}
                    rules={[{validator: propertiesValidator}]}
                >
                    <Input.TextArea />
                </Form.Item>
                <MaxDegreeItem isRequired={false} initialValue={10000} validator={integerValidator} />
                <Form.Item
                    name={['step', 'skip_degree']}
                    label="skip_degree"
                    initialValue={0}
                    rules={[{validator: integerValidator}]}
                    tooltip={t('analysis.algorithm.form.step.skip_degree')}
                >
                    <InputNumber />
                </Form.Item>
            </div>
        </div>
    );

    return (
        <Collapse.Panel
            isActive={props.isActive}
            onItemClick={props.onItemClick}
            panelKey={props.panelKey}
            header={
                <AlgorithmNameHeader
                    icon={<ClusterOutlined />}
                    name={ALLPATHS}
                    searchValue={searchValue}
                    description={t('analysis.algorithm.oltp.all_paths.desc')}
                    isRunning={isRequiring}
                    isDisabled={!isEnableRun}
                    handleRunning={handleRunning}
                    highlightName={currentAlgorithm === ALLPATHS}
                />
            }
        >
            <Form
                form={crosspointsForm}
                onFinish={onFormFinish}
                onValuesChange={_.debounce(onFormValuesChange, 300)}
                layout="vertical"
                className={s.oltpForms}
            >
                <VerticesItems name="sources" desc={t('analysis.algorithm.oltp.template_paths.sources')} />
                <VerticesItems name="targets" desc={t('analysis.algorithm.oltp.template_paths.targets')} />
                {stepFormItems}
                <MaxDepthItem validator={maxDepthValidator} />
                <NearestItem />
                <CapacityItem />
                <LimitItem initialValue={10} desc={t('analysis.algorithm.oltp.template_paths.limit')} />
            </Form>
        </Collapse.Panel>
    );
};

export default AllPaths;
