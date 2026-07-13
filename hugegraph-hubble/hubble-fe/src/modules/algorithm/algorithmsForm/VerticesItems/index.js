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
 * @file VerticesItem封装
 */

import React, {useState, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {Input, Tooltip} from 'antd';
import Form from '../PersistentForm';
import {RightOutlined, DownOutlined, QuestionCircleOutlined} from '@ant-design/icons';
import {propertiesValidator} from '../utils';
import classnames from 'classnames';
import c from './index.module.scss';
import KeyboardAction from '../../../../components/KeyboardAction';

const VerticesItems = props => {
    const {t} = useTranslation();
    const {name, desc} = props;

    const [itemVisible, setItemVisible] = useState(false);

    const verticesContentClassName = classnames(
        c.verticesItemsContent,
        {[c.contentHidden]: !itemVisible}
    );

    const changeItemVisibleState = useCallback(() => {
        setItemVisible(pre => !pre);
    }, []
    );

    return (
        <div className={c.verticesItems}>
            <KeyboardAction
                className={c.stepHeader}
                onAction={changeItemVisibleState}
                aria-expanded={itemVisible}
            >
                <div className={c.stepIcon}>
                    {itemVisible ? <DownOutlined /> : <RightOutlined />}
                </div>
                <div className={c.verticesItemsTitle}>{name}:</div>
                <div className={c.tooltip}>
                    <Tooltip
                        placement="rightTop"
                        title={desc}
                    >
                        <QuestionCircleOutlined />
                    </Tooltip>
                </div>
            </KeyboardAction>
            <div className={verticesContentClassName}>
                <Form.Item
                    label="ids"
                    name={[name, 'ids']}
                    rules={[
                        formInstance => ({
                            validator(_, value) {
                                const label = formInstance.getFieldValue([name, 'label']);
                                const properties = formInstance.getFieldValue([name, 'properties']);
                                if (value) {
                                    return Promise.resolve();
                                }
                                else if (label && properties) {
                                    return Promise.resolve();
                                }
                                return Promise.reject(new Error(
                                    t('analysis.algorithm.form.vertices_required')
                                ));
                            },
                        }),
                    ]}
                    tooltip={t('analysis.algorithm.form.vertices_ids_tooltip')}
                >
                    <Input placeholder={t('analysis.algorithm.form.vertices_ids_placeholder')} />
                </Form.Item>
                <Form.Item
                    label="label"
                    name={[name, 'label']}
                    tooltip={t('analysis.algorithm.form.vertices_label_tooltip')}
                >
                    <Input placeholder={t('analysis.algorithm.form.vertices_label_placeholder')} />
                </Form.Item>
                <Form.Item
                    label="properties"
                    name={[name, 'properties']}
                    tooltip={t('analysis.algorithm.form.vertices_properties_tooltip')}
                    rules={[{validator: propertiesValidator}]}
                >
                    <Input.TextArea
                        placeholder={t('analysis.algorithm.form.vertices_properties_placeholder')}
                    />
                </Form.Item>
            </div>
        </div>
    );
};

export default VerticesItems;
