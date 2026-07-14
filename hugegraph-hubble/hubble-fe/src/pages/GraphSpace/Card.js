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

import {InfoCircleOutlined, InfoOutlined} from '@ant-design/icons';
import {Typography, Dropdown, Row, Col, Space, Progress, Card, Tooltip} from 'antd';
import {Link, useNavigate} from 'react-router-dom';
import moment from 'moment';
import style from './index.module.scss';
import React, {useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {getResourceDisplayName} from '../../utils/displayName';

const showText = (val, suffix, unlimited, empty) => (
    val > 99999 ? (empty === undefined ? unlimited : empty) : `${val}${suffix}`
);

const formatPercent = percent => {
    return percent >= 100 ? <InfoOutlined /> : `${percent}%`;
};

const TitleField = ({item, onClick, onKeyDown}) => {
    const {t} = useTranslation();
    const displayName = item.name === 'DEFAULT'
        ? t('graphspace.default_name')
        : getResourceDisplayName(item.name, item.nickname);

    return (
        <>
            <Typography.Text
                style={{maxWidth: 244}}
                ellipsis={{ellipsis: true}}
                title={`${displayName}`}
                onClick={onClick}
                onKeyDown={onKeyDown}
                role='button'
                tabIndex={0}
            >{displayName}
            </Typography.Text>
            <div className={style.subtitle}>
                {item.default && (
                    <span className={style.default}>{t('graphspace.card.set_default')}</span>
                )}
                {moment(item.create_time).format('YYYY-MM-DD')} {t('graphspace.card.created')}
            </div>
        </>
    );
};

const GraphSpaceCard = ({
    item,
    editGraphspace,
    deleteGraphspace,
    handleInit,
    canUpdate = true,
    canDelete = true,
    canInit = true,
}) => {
    const navigate = useNavigate();
    const {t} = useTranslation();

    const handleGotoGraph = useCallback(() => {
        navigate(`/graphspace/${item.name}`);
    }, [item, navigate]);

    const handleEdit = useCallback(() => {
        editGraphspace(item);
    }, [item, editGraphspace]);

    const handleDelete = useCallback(() => {
        deleteGraphspace(item.name);
    }, [deleteGraphspace, item]);

    const handleGotoGraphKeyDown = useCallback(event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleGotoGraph();
        }
    }, [handleGotoGraph]);

    const getMenu = item => {
        const schema = {
            key: 'schema',
            label: (
                <Link to={`/graphspace/${item.name}/schema`}>
                    {t('common.action.schema_manage')}
                </Link>
            ),
        };
        if (item.name === 'neizhianli') {
            return {
                items: [schema, ...(canInit ? [{
                    key: 'init',
                    label: t('common.action.init'),
                    onClick: handleInit,
                }] : [])],
            };
        }
        return {
            items: [
                schema,
                ...(canUpdate ? [{
                    key: 'edit',
                    label: t('common.action.edit'),
                    onClick: handleEdit,
                }] : []),
                ...(canDelete ? [{
                    key: 'delete',
                    disabled: item.default,
                    label: (item.default)
                        ? <span className={style.disable}>{t('common.action.delete')}</span>
                        : t('common.action.delete'),
                    onClick: item.default ? undefined : handleDelete,
                }] : []),
            ],
        };
    };

    const unlimited = t('graphspace.unit.unlimited');
    const cpu = showText(item.cpu_limit, t('graphspace.unit.cpu'), unlimited);
    const memory = showText(item.memory_limit, t('graphspace.unit.memory'), unlimited);
    const storage = showText(item.storage_limit, t('graphspace.unit.memory'), unlimited);
    const statisticDate = item.statistic?.date;

    return (
        <Card
            className={style.card}
            title={(
                <TitleField
                    item={item}
                    onClick={handleGotoGraph}
                    onKeyDown={handleGotoGraphKeyDown}
                />
            )}
            headStyle={{
                backgroundImage: 'linear-gradient(180deg, '
                    + 'rgba(51,136,255,0.10) 0%, rgba(51,136,255,0.00) 100%)',
                borderBottom: 0,
                height: 93,
                paddingLeft: 20,
            }}
            bodyStyle={{
                padding: '0 24px 24px 20px',
            }}
            extra={(
                <Dropdown.Button
                    menu={getMenu(item)}
                    trigger={['click']}
                >
                    <Link to={`/graphspace/${item.name}`}>{t('graphspace.card.enter')}</Link>
                </Dropdown.Button>
            )}
            actions={
                [
                    <Space key="1" size={8} wrap>
                        <span>{t('graphspace.card.vertex')}: {item.statistic?.vertex ?? '-'}</span>
                        <span>{t('graphspace.card.edge')}: {item.statistic?.edge ?? '-'}</span>
                        <Typography.Text type='secondary'>
                            {statisticDate
                                ? t('graphspace.card.daily_snapshot', {date: statisticDate})
                                : t('graphspace.card.daily_update')}
                        </Typography.Text>
                        <span aria-label={t('graphspace.card.statistic_help')}>
                            <Tooltip title={(
                                <>
                                    <div>{t('graphspace.card.daily_update')}</div>
                                    {statisticDate && (
                                        <div>{t('graphspace.card.last_update', {
                                            date: statisticDate,
                                        })}
                                        </div>
                                    )}
                                </>
                            )}
                            >
                                <InfoCircleOutlined />
                            </Tooltip>
                        </span>
                    </Space>,
                ]
            }
        >
            <div
                className={style.card_content}
                onClick={handleGotoGraph}
                onKeyDown={handleGotoGraphKeyDown}
                role='button'
                tabIndex={0}
            >
                <Row justify='space-between'>
                    <Col span={14}>
                        <ul className={style.list}>
                            <li>{t('graphspace.card.graph_id', {name: item.name})}</li>
                            <li>
                                {t('graphspace.card.auth_label')}
                                {t(item.auth ? 'graphspace.auth_yes' : 'graphspace.auth_no')}
                            </li>
                            <li>
                                {t('graphspace.card.max_graph')}
                                {showText(item.max_graph_number, '', t('graphspace.unit.unlimited'))}
                            </li>
                            <li>{t('graphspace.card.cpu', {val: cpu})}</li>
                            <li>{t('graphspace.card.memory', {val: memory})}</li>
                            <li>{t('graphspace.card.storage')}
                                {storage}
                            </li>
                        </ul>
                    </Col>
                    <Col span={8}>
                        <Space direction='vertical'>
                            <Progress
                                type='circle'
                                width={96}
                                percent={item.storage_percent * 100}
                                format={formatPercent}
                                status={item.storage_percent >= 1
                                    ? 'exception' : 'normal'}
                            />
                            <div
                                style={{textAlign: 'center', fontSize: '12px'}}
                            >
                                <div>{t('graphspace.card.used')}</div>
                                <div>
                                    {item.storage_used}{t('graphspace.unit.memory')}
                                    {' / '}
                                    {showText(
                                        item.storage_limit,
                                        t('graphspace.unit.memory'),
                                        t('graphspace.unit.unlimited'),
                                        '--'
                                    )}
                                </div>
                            </div>
                        </Space>
                    </Col>
                </Row>
            </div>
        </Card>
    );
};

export default GraphSpaceCard;
