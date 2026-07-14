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
 * @file 导航首页
 */

import {Card, Space, Tag} from 'antd';
import {
    ApartmentOutlined,
    ArrowRightOutlined,
    DatabaseOutlined,
    HddOutlined,
    SearchOutlined,
    ToolOutlined,
} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import AdminItem from '../AdminItem';
import ConsoleItem from '../ConsoleItem';
import {isPdEnabled} from '../../../utils/config';
import {Link} from 'react-router-dom';
import {useAuthContext} from '../../../auth/AuthContext';
import {getWorkbenchJourneys} from './workbenchHome';

import style from './index.module.scss';


const NavigationHome = () => {
    const {t} = useTranslation();
    const {context} = useAuthContext();
    const capabilities = context?.capabilities ?? [];
    const canManageAccounts = capabilities.includes('accounts_manage')
        || capabilities.includes('graphspace_members_manage');
    const canReadOperations = capabilities.includes('operations_health_read');
    const hasSupport = canManageAccounts || canReadOperations;
    const pdMode = isPdEnabled();
    const journeys = getWorkbenchJourneys(pdMode);
    const icons = {
        understand: <ApartmentOutlined />,
        prepare: <DatabaseOutlined />,
        query: <SearchOutlined />,
    };

    return (
        <div className={style.navigation}>
            <div className={style.header}>
                <div className={style.headerCopy}>
                    <h2>{t('home.workbench.title')}</h2>
                    <p className={style.subtitle}>{t('home.workbench.subtitle')}</p>
                    <p>{t('home.workbench.intro')}</p>
                </div>
                <Tag
                    className={style.modeTag}
                    color={pdMode ? 'blue' : 'default'}
                    icon={pdMode ? <ApartmentOutlined /> : <HddOutlined />}
                >
                    {t(`home.workbench.mode.${pdMode ? 'pd' : 'non_pd'}`)}
                </Tag>
            </div>
            <section aria-labelledby="workbench-journeys-title">
                <h2 id="workbench-journeys-title" className={style.sectionTitle}>
                    {t('home.workbench.journeys.title')}
                </h2>
                <div className={style.journeyGrid}>
                    {journeys.map((journey, index) => (
                        <Card
                            key={journey.key}
                            className={style.journeyCard}
                            title={(
                                <Space>
                                    <span className={style.step}>{index + 1}</span>
                                    {icons[journey.key]}
                                    {t(`home.workbench.journeys.${journey.key}.title`)}
                                </Space>
                            )}
                        >
                            <p className={style.description}>
                                {t(`home.workbench.journeys.${journey.key}.description`)}
                            </p>
                            <Link
                                className={style.primaryAction}
                                to={journey.primaryPath}
                            >
                                {t(`home.workbench.journeys.${journey.key}.primary`)}
                                <ArrowRightOutlined />
                            </Link>
                            {journey.secondaryPaths.length > 0 && (
                                <div className={style.secondaryActions}>
                                    {journey.secondaryPaths.map((path, actionIndex) => (
                                        <Link key={path} to={path}>
                                            {t(
                                                `home.workbench.journeys.${journey.key}`
                                                + `.secondary_${actionIndex + 1}`
                                            )}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            </section>
            {hasSupport && (
                <section
                    className={style.support}
                    aria-labelledby="workbench-support-title"
                >
                    <Card
                        className={`${style.journeyCard} ${style.supportCard}`}
                        title={(
                            <Space>
                                <span className={style.step}>4</span>
                                <ToolOutlined />
                                <span id="workbench-support-title">
                                    {t('home.workbench.support')}
                                </span>
                            </Space>
                        )}
                    >
                        <div className={style.supportGrid}>
                            {canManageAccounts && <AdminItem embedded />}
                            {canReadOperations && <ConsoleItem embedded />}
                        </div>
                    </Card>
                </section>
            )}
        </div>
    );
};

export default NavigationHome;
