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
 * @file 图算法 搜索
 */

import {useMemo} from 'react';
import {Input} from 'antd';
import _ from 'lodash';
import c from './index.module.scss';
import {useTranslation} from 'react-i18next';

const AlgorithmSearch = props => {
    const {t} = useTranslation();
    const {onSearch, disabled = false} = props;

    const debounceOnChange = useMemo(
        () => {
            return _.debounce(e => {
                const {value} = e.target;
                onSearch(value);
            }, 200);
        },
        [onSearch]
    );

    return (
        <div className={c.algorithmSearch}>
            <Input
                placeholder={t('analysis.algorithm.placeholder')}
                onChange={debounceOnChange}
                disabled={disabled}
                allowClear
            />
        </div>
    );
};

export default AlgorithmSearch;
