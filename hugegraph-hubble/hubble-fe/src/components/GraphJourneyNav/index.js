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
import style from './index.module.scss';

const GraphJourneyNav = ({graphspace, graph, active}) => {
    const {t} = useTranslation();
    const tabs = [
        {
            key: 'overview',
            label: t('graph.detail.overview'),
            path: `/graphspace/${encodeURIComponent(graphspace)}`
                + `/graph/${encodeURIComponent(graph)}/detail`,
        },
        {
            key: 'schema',
            label: t('graph.detail.schema'),
            path: `/graphspace/${encodeURIComponent(graphspace)}`
                + `/graph/${encodeURIComponent(graph)}/meta`,
        },
    ];

    return (
        <nav className={style.journeyNav} aria-label={t('graph.detail.journey')}>
            <div className={style.tabs}>
                {tabs.map(tab => (
                    <Link
                        key={tab.key}
                        aria-current={active === tab.key ? 'page' : undefined}
                        className={active === tab.key ? style.activeTab : undefined}
                        to={tab.path}
                    >
                        {tab.label}
                    </Link>
                ))}
            </div>
        </nav>
    );
};

export default GraphJourneyNav;
