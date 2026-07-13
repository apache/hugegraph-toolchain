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
 * @file CustomizedPaths StepsItems
 */

import React, {useState, useCallback} from 'react';
import {Input, Select, Button, Tooltip, InputNumber} from 'antd';
import Form from '../../../PersistentForm';
import {DownOutlined, RightOutlined, PlusOutlined, QuestionCircleOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import {integerValidator, propertiesValidator} from '../../../utils';
import classnames from 'classnames';
import s from '../../OltpItem/index.module.scss';
import KeyboardAction from '../../../../../../components/KeyboardAction';

const createActionHandler = handler => () => handler();
const createValueHandler = (handler, value) => () => handler(value);

const StepItem = () => {
    const {t} = useTranslation();

    const [stepVisible, setStepVisible] = useState(true);
    const directionOptions = [
        {label: t('analysis.algorithm.form.direction_options.out'), value: 'OUT'},
        {label: t('analysis.algorithm.form.direction_options.in'), value: 'IN'},
        {label: t('analysis.algorithm.form.direction_options.both'), value: 'BOTH'},
    ];

    const stepContentClassName = classnames(
        s.stepContent,
        {[s.contentHidden]: !stepVisible}
    );

    const changeStepVisible = useCallback(() => {
        setStepVisible(pre => !pre);
    }, []);

    const stepFormItems = item => {
        return (
            <>
                <Form.Item
                    name={[item.name, 'direction']}
                    label="direction"
                    initialValue={'BOTH'}
                    tooltip={t('analysis.algorithm.form.step.direction')}
                >
                    <Select options={directionOptions} allowClear />
                </Form.Item>
                <Form.Item
                    name={[item.name, 'labels']}
                    label="labels"
                    tooltip={t('analysis.algorithm.form.step.labels')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name={[item.name, 'properties']}
                    label="properties"
                    tooltip={t('analysis.algorithm.form.step.edge_properties')}
                    rules={[{validator: propertiesValidator}]}
                >
                    <Input.TextArea />
                </Form.Item>
                <Form.Item
                    name={[item.name, 'weight_by']}
                    label='weight_by'
                    tooltip={t('analysis.algorithm.oltp.customized_paths.weight_by')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name={[item.name, 'default_weight']}
                    label='default_weight'
                    tooltip={t('analysis.algorithm.oltp.customized_paths.default_weight')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    name={[item.name, 'max_degree']}
                    label='max_degree'
                    initialValue={10000}
                    tooltip={t('analysis.algorithm.max_degree_item.tooltip')}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name={[item.name, 'skip_degree']}
                    label='skip_degree'
                    initialValue={0}
                    rules={[{validator: integerValidator}]}
                    tooltip={t('analysis.algorithm.form.step.skip_degree')}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    name={[item.name, 'sample']}
                    label='sample'
                    initialValue={100}
                    rules={[{validator: integerValidator}]}
                    tooltip={t('analysis.algorithm.oltp.customized_paths.sample')}
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

export default StepItem;
