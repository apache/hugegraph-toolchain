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
 * @file MaxDegreeItem
 */

import React from 'react';
import {InputNumber} from 'antd';
import Form from '../PersistentForm';
import {useTranslation} from 'react-i18next';

const MaxDegreeItem = props => {
    const {t} = useTranslation();
    const {isRequired, initialValue, validator} = props;

    return (
        <Form.Item
            label='max_degree'
            name='max_degree'
            initialValue={initialValue}
            rules={[{required: isRequired}, {validator: validator}]}
            tooltip={t('analysis.algorithm.max_degree_item.tooltip')}
        >
            <InputNumber />
        </Form.Item>
    );
};

export default MaxDegreeItem;
