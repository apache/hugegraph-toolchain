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
 * @file K-out API(POST，高级版) StepForm
 */

import React, {useState, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {Select, Tooltip, InputNumber} from 'antd';
import Form from '../../../PersistentForm';
import {DownOutlined, RightOutlined, QuestionCircleOutlined} from '@ant-design/icons';
import StepsItems from '../../../StepsItems';
import {integerValidator} from '../../../utils';
import classnames from 'classnames';
import s from '../../OltpItem/index.module.scss';
import KeyboardAction from '../../../../../../components/KeyboardAction';

const StepFormItem = () => {
    const {t} = useTranslation();
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


    const changeStepVisible = useCallback(() => {
        setStepVisible(pre => !pre);
    }, []
    );

    return (
        <>
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
                <Form.Item
                    name={['steps', 'direction']}
                    label="direction"
                    initialValue={'BOTH'}
                    tooltip={t('analysis.algorithm.form.step.direction')}
                >
                    <Select
                        allowClear
                        options={directionOptions}
                    />
                </Form.Item>
                <Form.Item
                    name={['steps', 'max_degree']}
                    label="max_degree"
                    initialValue={10000}
                    tooltip={t('analysis.algorithm.form.step.max_degree_compatible')}
                    rules={[{validator: integerValidator}]}
                >
                    <InputNumber />
                </Form.Item>
                <Form.Item
                    name={['steps', 'skip_degree']}
                    label="skip_degree"
                    initialValue={0}
                    tooltip={t('analysis.algorithm.form.step.skip_degree')}
                    rules={[{validator: integerValidator}]}
                >
                    <InputNumber />
                </Form.Item>
                <StepsItems
                    param={'steps'}
                    type={'edge_steps'}
                    desc={t('analysis.algorithm.form.step.edge_steps')}
                />
                <StepsItems
                    param={'steps'}
                    type={'vertex_steps'}
                    desc={t('analysis.algorithm.form.step.vertex_steps')}
                />
            </div>
        </>
    );
};

export default StepFormItem;
