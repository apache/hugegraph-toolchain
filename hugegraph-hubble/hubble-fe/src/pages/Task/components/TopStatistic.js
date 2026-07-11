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

import {Row, Col} from 'antd';
import style from './index.module.scss';
import {useTranslation} from 'react-i18next';

const CardBox = ({title, listItems, available}) => {

    return (
        <div className={style.cardbox}>
            <div className={style.title}>{title}</div>
            <Row justify='space-around'>
                {listItems.map(item => {
                    return (
                        <Col key={item.label}>
                            <div className={style.value}>
                                {available ? (item.value ?? 0) : '--'}
                            </div>
                            <div className={style.label}>{item.label}</div>
                        </Col>
                    );
                })}
            </Row>
        </div>
    );
};

const TopStatistic = ({data, available = true}) => {
    const {t} = useTranslation();

    return (
        <Row className={style.row}>
            <Col span={5}>
                <CardBox
                    title={t('task.statistic.realtime')}
                    available={available}
                    listItems={[
                        {
                            label: t('task.statistic.max_concurrency'),
                            value: data.total_realtime_size,
                        },
                    ]}
                />
            </Col>
            <Col span={5}>
                <CardBox
                    title={t('task.statistic.offline')}
                    available={available}
                    listItems={[
                        {
                            label: t('task.statistic.max_concurrency'),
                            value: data.total_other_size,
                        },
                    ]}
                />
            </Col>
            <Col span={7}>
                <CardBox
                    title={t('task.statistic.pending')}
                    available={available}
                    listItems={[
                        {label: t('task.statistic.once'), value: data?.todo?.ONCE},
                        {label: t('task.statistic.cron'), value: data?.todo?.CRON},
                        {
                            label: t('task.statistic.realtime_task'),
                            value: data?.todo?.REALTIME,
                        },
                    ]}
                />
            </Col>
            <Col span={7} className={style.last}>
                <CardBox
                    title={t('task.statistic.executing')}
                    available={available}
                    listItems={[
                        {label: t('task.statistic.once'), value: data?.running?.ONCE},
                        {label: t('task.statistic.cron'), value: data?.running?.CRON},
                        {
                            label: t('task.statistic.realtime_task'),
                            value: data?.running?.REALTIME,
                        },
                    ]}
                />
            </Col>
        </Row>
    );
};

export default TopStatistic;
