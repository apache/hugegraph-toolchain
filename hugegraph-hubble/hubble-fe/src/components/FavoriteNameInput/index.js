/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Input} from 'antd';
import {useTranslation} from 'react-i18next';

import {isValidFavoriteName} from '../../utils/rules';

const FavoriteNameInput = props => {
    const {t} = useTranslation();
    const {value, ...inputProps} = props;
    const invalid = value && !isValidFavoriteName(value);

    return (
        <>
            <Input
                {...inputProps}
                value={value}
                showCount
                maxLength={48}
                status={invalid ? 'error' : undefined}
            />
            {invalid && (
                <div role='alert' style={{color: '#ff4d4f', fontSize: '12px'}}>
                    {t('common.validation.favorite_name_rule')}
                </div>
            )}
        </>
    );
};

export default FavoriteNameInput;
