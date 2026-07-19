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

import {Link} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {getPreparationSchemaPath} from '../../utils/dataPreparationNavigation';
import {isPdEnabled} from '../../utils/config';
import style from './index.module.scss';

const DataPreparationNav = ({active, graphspace}) => {
    const {t} = useTranslation();
    const pdEnabled = isPdEnabled();
    const currentGraphspace = graphspace;
    const schemaTarget = currentGraphspace && pdEnabled
        ? `/graphspace/${encodeURIComponent(currentGraphspace)}/schema`
        : getPreparationSchemaPath(pdEnabled);
    const schemaLabel = t('data_preparation.schema');
    const items = [
        {
            key: 'schema',
            label: schemaLabel,
            to: schemaTarget,
            title: pdEnabled && !currentGraphspace
                ? t('data_preparation.choose_graphspace')
                : undefined,
        },
        {key: 'datasource', label: t('data_preparation.datasource'), to: '/source'},
        {key: 'task', label: t('data_preparation.import'), to: '/task'},
    ];

    return (
        <nav className={style.journeyNav} aria-label={t('data_preparation.journey')}>
            <ol className={style.steps}>
                {items.map((item, index) => (
                    <li key={item.key} className={style.step}>
                        <Link
                            className={item.key === active ? style.active : undefined}
                            to={item.to}
                            title={item.title}
                            aria-current={item.key === active ? 'page' : undefined}
                        >
                            <span className={style.number} aria-hidden='true'>{index + 1}</span>
                            {item.label}
                        </Link>
                    </li>
                ))}
            </ol>
        </nav>
    );
};

export default DataPreparationNav;
