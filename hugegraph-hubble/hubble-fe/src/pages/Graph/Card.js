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

import {useCallback} from 'react';
import {Button, Card, Dropdown, Space, Typography, Tooltip} from 'antd';
import {UnorderedListOutlined, EyeOutlined} from '@ant-design/icons';
import {useNavigate} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import GraphView from '../../components/GraphinView';
import moment from 'moment';
import _ from 'lodash';
import {formatToGraphInData} from '../../utils/formatGraphInData';
import {isPdEnabled} from '../../utils/config';
import style from './index.module.scss';
import {byteConvert} from '../../utils/format';

const TitleField = ({item, onClick, onKeyDown, schemaTypeCounts}) => {
    const {t} = useTranslation();
    const pdMode = isPdEnabled();
    const graphName = item.nickname || item.name;
    const displayName = pdMode
        ? `${_.truncate(item.graphspace_nickname, {length: 12})}-${_.truncate(graphName, {length: 12})}`
        : graphName;
    const fullTitle = pdMode
        ? `${item.graphspace_nickname}-${graphName}`
        : graphName;

    return (
        <>
            <Typography.Text
                style={{maxWidth: 244}}
                ellipsis={{ellipsis: true}}
                title={fullTitle}
                onClick={onClick}
                onKeyDown={onKeyDown}
                role='button'
                tabIndex={0}
            >
                {displayName}
            </Typography.Text>
            {item.default && <span className={style.default}>{t('common.label.default')}</span>}
            <div className={style.subtitle}>
                {t('graph.card.storage')}: {item.storage >= 0 ? byteConvert(item.storage) : '--'}
                {' · '}
                {t('graph.card.schema_types', schemaTypeCounts)}
            </div>
        </>
    );
};

const GraphCard = ({item, menus}) => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const graphName = item.nickname || item.name;
    const schemaView = item.schemaview || {vertices: [], edges: []};
    const graphinData = formatToGraphInData(schemaView, false);
    const schemaIsEmpty = graphinData.nodes.length === 0 && graphinData.edges.length === 0;

    const handleGotoAnalysis = useCallback(() => {
        navigate(`/gremlin/${item.graphspace || 'DEFAULT'}/${item.name}`);
    }, [item, navigate]);

    const handleGotoDetail = useCallback(() => {
        navigate(`/graphspace/${item.graphspace || 'DEFAULT'}/graph/${item.name}/detail`);
    }, [item, navigate]);

    const handleGotoSchema = useCallback(() => {
        navigate(`/graphspace/${item.graphspace || 'DEFAULT'}/graph/${item.name}/meta`);
    }, [item, navigate]);

    const handleAnalysisKeyDown = useCallback(event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleGotoAnalysis();
        }
    }, [handleGotoAnalysis]);

    const handleDetailKeyDown = useCallback(event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleGotoDetail();
        }
    }, [handleGotoDetail]);

    return (
        <Card
            className={style.card}
            title={(
                <TitleField
                    item={item}
                    onClick={handleGotoAnalysis}
                    onKeyDown={handleAnalysisKeyDown}
                    schemaTypeCounts={{
                        vertices: schemaView.vertices?.length || 0,
                        edges: schemaView.edges?.length || 0,
                    }}
                />
            )}
            headStyle={{
                paddingLeft: 20,
            }}
            extra={(
                <Dropdown
                    menu={{items: menus}}
                    trigger={['click']}
                >
                    <Button
                        type='text'
                        icon={<UnorderedListOutlined />}
                        aria-label={t('graph.card.more_actions', {graph: graphName})}
                    />
                </Dropdown>
            )}
            actions={[
                <span
                    key='created'
                    className={style.created}
                >
                    {t('graph.col.create_time')}: {moment(item.create_time).format('YYYY-MM-DD')}
                </span>,
                <span
                    key='statistic'
                    onClick={handleGotoDetail}
                    onKeyDown={handleDetailKeyDown}
                    role='button'
                    tabIndex={0}
                >
                    <Tooltip title={t('graph.card.detail_tooltip')}>
                        <EyeOutlined />{t('graph.detail.title')}
                    </Tooltip>
                </span>,
            ]}
        >
            {schemaIsEmpty ? (
                <div className={style.empty_schema}>
                    <strong>{t('graph.card.empty_schema')}</strong>
                    <span>{t('graph.card.empty_schema_help')}</span>
                    <Space>
                        <Button type='primary' size='small' onClick={handleGotoSchema}>
                            {t('graph.card.open_schema')}
                        </Button>
                        <Button size='small' onClick={handleGotoAnalysis}>
                            {t('graph.card.query_graph')}
                        </Button>
                    </Space>
                </div>
            ) : (
                <div
                    className={style.card_content}
                    onClick={handleGotoAnalysis}
                    onKeyDown={handleAnalysisKeyDown}
                    role='button'
                    tabIndex={0}
                >
                    <GraphView
                        data={graphinData}
                        style={{minHeight: '153px'}}
                        layout={{
                            type: 'gForce',
                            // center: [200, 200],
                            linkDistance: 100,
                            coulombDisScale: 0.01,
                        // preventOverlap: true,
                        // begin: item.schemaview.vertices.length > 1
                        //     ? [0, 0] : [200, 100],
                        }}
                        height={147}
                        config={{
                        // minZoom: 0.6,
                        // maxZoom: 0.6,
                            fitView: false,
                            fitCenter: true,
                        // handleZoomIn: false,
                        }}
                        behaviors={{
                            zoomCanvas: {disabled: true},
                            dragNode: {disabled: true},
                            dragCanvas: {disabled: true},
                            clickSelect: {disabled: true},
                            hoverable: {disabled: true},
                        }}
                    />
                </div>
            )}
        </Card>
    );
};

export default GraphCard;
