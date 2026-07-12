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

import {Card, PageHeader, Space, Tag} from 'antd';
import {
    ApartmentOutlined,
    ArrowRightOutlined,
    DatabaseOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import {useTranslation} from 'react-i18next';
import AdminItem from '../AdminItem';
import ConsoleItem from '../ConsoleItem';
import * as user from '../../../utils/user';
import {isPdEnabled} from '../../../utils/config';
import {Link} from 'react-router-dom';
import {getWorkbenchJourneys} from './workbenchHome';
import BrandLockup from '../../../components/BrandLockup';

import style from './index.module.scss';


const NavigationHome = () => {
    const {t} = useTranslation();
    const userInfo = user.getUser();
    const pdMode = isPdEnabled();
    const journeys = getWorkbenchJourneys(pdMode);
    const icons = {
        understand: <ApartmentOutlined />,
        prepare: <DatabaseOutlined />,
        query: <SearchOutlined />,
    };

    return (
        <>
            <PageHeader
                ghost={false}
                title={t('home.workbench.title')}
                subTitle={t('home.workbench.subtitle')}
            />

            <div className={style.navigation}>
                <div className={style.header}>
                    <BrandLockup className={style.headerBrand} compact />
                    <p>{t('home.workbench.intro')}</p>
                    <Tag color={pdMode ? 'blue' : 'default'}>
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
                {pdMode && userInfo.is_superadmin && (
                    <section
                        className={style.support}
                        aria-labelledby="workbench-support-title"
                    >
                        <h2 id="workbench-support-title" className={style.sectionTitle}>
                            {t('home.workbench.support')}
                        </h2>
                        <div className={style.supportGrid}>
                            <AdminItem />
                            <ConsoleItem />
                        </div>
                    </section>
                )}
            </div>
        </>
    );
};

export default NavigationHome;
