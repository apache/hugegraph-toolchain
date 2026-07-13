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
 * @file NearestItem
 */

import React from 'react';
import {Select} from 'antd';
import Form from '../PersistentForm';
import {useTranslation} from 'react-i18next';

const NearestItem = props => {
    const {t} = useTranslation();
    const boolOptions = [
        {label: t('common.verify.yes'), value: true},
        {label: t('common.verify.no'), value: false},
    ];
    return (
        <Form.Item
            label='nearest'
            name='nearest'
            initialValue
            tooltip={t('analysis.algorithm.nearest_item.tooltip')}
        >
            <Select placeholder={t('analysis.algorithm.nearest_item.placeholder')} allowClear options={boolOptions} />
        </Form.Item>
    );
};

export default NearestItem;
