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
 * @file CustomizedCrosspoints PathPatter
 */

import React, {useState, useCallback} from 'react';
import {Input, Button, Select, Tooltip, InputNumber} from 'antd';
import Form from '../../../PersistentForm';
import {DownOutlined, RightOutlined, PlusOutlined, QuestionCircleOutlined} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import {propertiesValidator, maxDegreeValidator} from '../../../utils';
import classnames from 'classnames';
import s from '../../OltpItem/index.module.scss';
import KeyboardAction from '../../../../../../components/KeyboardAction';

const createActionHandler = handler => () => handler();
const createValueHandler = (handler, value) => () => handler(value);

const PathPatternsFormItems = () => {
    const {t} = useTranslation();

    const [patternVisible, setPatternVisible] = useState(false);
    const patternContentClassName = classnames({[s.contentHidden]: !patternVisible});
    const directionOptions = [
        {label: t('analysis.algorithm.form.direction_options.out'), value: 'OUT'},
        {label: t('analysis.algorithm.form.direction_options.in'), value: 'IN'},
        {label: t('analysis.algorithm.form.direction_options.both'), value: 'BOTH'},
    ];

    const changePatternsVisible = useCallback(() => {
        setPatternVisible(pre => !pre);
    }, []);

    const stepFormItems = item => {
        return (
            <>
                <Form.Item
                    name={[item.name, 'direction']}
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
                    name={[item.name, 'max_degree']}
                    label='max_degree'
                    initialValue='10000'
                    rules={[{validator: maxDegreeValidator}]}
                    tooltip={t('analysis.algorithm.form.step.max_degree_compatible')}
                >
                    <InputNumber />
                </Form.Item>
            </>
        );
    };

    const renderPathPatterns = param => {
        return (
            <Form.List
                name={[param, 'steps']}
                initialValue={[{}]}
            >
                {(lists, {add, remove}, {errors}) => (
                    <div className={s.stepsItemsContent}>
                        {
                            lists.map((item, index) => {
                                return (
                                    <div key={item.key} className={s.stepContent}>
                                        {stepFormItems(item)}
                                        {lists.length > 1 ? (
                                            <Form.Item>
                                                <Button
                                                    block
                                                    danger
                                                    onClick={createValueHandler(remove, item.name)}
                                                >
                                                    Delete
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
                    </div>

                )}
            </Form.List>
        );
    };

    return (
        <>
            <KeyboardAction
                className={s.stepHeader}
                onAction={changePatternsVisible}
                aria-expanded={patternVisible}
            >
                <div className={s.stepIcon}>
                    {patternVisible ? <DownOutlined /> : <RightOutlined />}
                </div>
                <div className={s.stepTitle}>path_patterns:</div>
                <div className={s.tooltip}>
                    <Tooltip
                        placement="rightTop"
                        title={t('analysis.algorithm.oltp.customized_crosspoints.path_patterns')}
                    >
                        <QuestionCircleOutlined />
                    </Tooltip>
                </div>
            </KeyboardAction>
            <div className={patternContentClassName}>
                {renderPathPatterns('path_patterns')}
            </div>
        </>
    );
};

export default PathPatternsFormItems;
