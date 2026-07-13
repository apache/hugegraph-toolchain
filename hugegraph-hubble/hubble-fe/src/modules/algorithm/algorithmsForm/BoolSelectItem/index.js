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

import React from 'react';

import {Select} from 'antd';
import Form from '../PersistentForm';
import {useTranslation} from 'react-i18next';

const BoolSelectItem = props => {
    const {t} = useTranslation();
    const boolOptions = [
        {label: t('common.verify.yes'), value: true},
        {label: t('common.verify.no'), value: false},
    ];
    const {
        name,
        initialValue = false,
        isRequired = false,
        desc,
    } = props;

    return (
        <Form.Item
            label={name}
            name={name}
            initialValue={initialValue}
            tooltip={desc}
            rules={[{required: isRequired}]}
        >
            <Select options={boolOptions} allowClear={!isRequired} />
        </Form.Item>
    );
};

export default BoolSelectItem;
